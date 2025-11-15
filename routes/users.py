from fastapi import APIRouter, HTTPException, Depends, Body
from sqlalchemy.orm import Session
from typing import List
import hashlib
from datetime import datetime, timedelta
from database import get_db
from models import UserDB, NotificationDB
from schemas import UserCreate, UserResponse, UserLogin, UserUpdate
from sqlalchemy import func
import secrets
import requests
import json
import re

router = APIRouter(
    prefix="/users",
    tags=["Users"]
)

# ======================================================
# 🔐 PASSWORD HANDLING
# ======================================================
def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(plain: str, hashed: str) -> bool:
    return hash_password(plain) == hashed


# ======================================================
# ☎️ CONTACT NORMALIZATION
# ======================================================
def normalize_contact(contact: str) -> str:
    contact = contact.replace(" ", "").replace("-", "").strip()
    if len(contact) not in [10, 11, 12, 13]:
        raise ValueError("Invalid contact number length")
    if contact.startswith("+63"):
        contact = "0" + contact[3:]
    elif contact.startswith("63"):
        contact = "0" + contact[2:]
    elif contact.startswith("0"):
        pass
    else:
        raise ValueError("Invalid contact number format")
    if len(contact) != 11 or not contact.startswith("09"):
        raise ValueError("Invalid contact number format")
    return contact


# ======================================================
# 🎂 SAFE DOB PARSER
# ======================================================
def safe_dob(dob_value) -> datetime:
    if isinstance(dob_value, datetime):
        return dob_value
    if isinstance(dob_value, str):
        try:
            return datetime.fromisoformat(dob_value)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid DOB format")
    raise HTTPException(status_code=400, detail="Invalid DOB type")

# ---------------- Name Validation ----------------
def validate_name(name: str, field_name: str):
    """
    Validates that a name only contains letters, spaces, or hyphens.
    Raises HTTPException if invalid.
    """
    if not name or name.strip() == "":
        raise HTTPException(status_code=400, detail=f"{field_name} cannot be empty")

    # Only allow letters, spaces, hyphens, and apostrophes
    if not re.fullmatch(r"[A-Za-z\s'-]+", name.strip()):
        raise HTTPException(
            status_code=400,
            detail=f"{field_name} contains invalid characters. Only letters, spaces, hyphens, and apostrophes are allowed."
        )
    
# ======================================================
# 🧍 REGISTER NEW USER
# ======================================================
@router.post("/", response_model=UserResponse)
def register(user: UserCreate, db: Session = Depends(get_db)):
    # ---------------- Name Validation ----------------
    validate_name(user.firstName, "First name")
    validate_name(user.lastName, "Last name")
    if user.middleName:
        validate_name(user.middleName, "Middle name")

    # ---------------- Normalize Contact ----------------
    try:
        normalized_contact = normalize_contact(user.contact)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # ---------------- Check Duplicate Contact ----------------
    if db.query(UserDB).filter(UserDB.contact == normalized_contact).first():
        raise HTTPException(status_code=400, detail="Contact already registered")

    # ---------------- Check Duplicate Full Name ----------------
    first = user.firstName.strip().lower()
    last = user.lastName.strip().lower()
    existing_user = db.query(UserDB).filter(
        func.lower(func.trim(UserDB.first_name)) == first,
        func.lower(func.trim(UserDB.last_name)) == last
    ).first()

    if existing_user:
        middle = (user.middleName or "").strip()
        if middle:
            raise HTTPException(
                status_code=400,
                detail=f"A user named '{user.firstName} {middle} {user.lastName}' already exists."
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"A user named '{user.firstName} {user.lastName}' already exists."
            )

    # ---------------- Photo Required ----------------
    if not user.photo or user.photo.strip() == "":
        raise HTTPException(status_code=400, detail="Photo is required")

    # ---------------- Create UserDB Object ----------------
    db_user = UserDB(
        first_name=user.firstName.strip(),
        middle_name=user.middleName.strip() if user.middleName else None,
        last_name=user.lastName.strip(),
        dob=safe_dob(user.dob),
        gender=user.gender.strip(),
        civil_status=user.civilStatus.strip(),
        contact=normalized_contact,
        purok=user.purok.strip(),
        barangay=user.barangay.strip(),
        city=user.city.strip(),
        province=user.province.strip(),
        postal_code=str(user.postalCode).strip(),
        place_of_birth=user.placeOfBirth.strip() if user.placeOfBirth else None,  # ✅ Added
        password=hash_password(user.password.strip()),
        photo=user.photo,
        role=user.role.strip() if user.role else "resident",
        status="Pending"
    )

    db.add(db_user)
    db.flush()  # Flush to get db_user.id before notifications

    # ---------------- Notify Officials ----------------
    officials = db.query(UserDB).filter(UserDB.role.in_(["captain", "secretary"])).all()
    for o in officials:
        db.add(NotificationDB(
            title="New User Registration",
            message=f"{db_user.first_name} {db_user.last_name} registered.",
            type="registration",
            user_id=o.id,
            created_at=datetime.utcnow()
        ))

    db.commit()
    db.refresh(db_user)
    db_user.dob = safe_dob(db_user.dob)

    return UserResponse.from_orm(db_user)

# ======================================================
# 🔑 LOGIN
# ======================================================
@router.post("/login")
def login(user: UserLogin, db: Session = Depends(get_db)):
    try:
        normalized_contact = normalize_contact(user.contact)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    db_user = db.query(UserDB).filter(UserDB.contact == normalized_contact).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    if not verify_password(user.password, db_user.password):
        raise HTTPException(status_code=401, detail="Incorrect password")

    if db_user.role == "resident" and db_user.status != "Approved":
        raise HTTPException(
            status_code=403,
            detail=f"Resident account not approved. Current status: {db_user.status}"
        )

    db_user.dob = safe_dob(db_user.dob)
    return {
        "user": UserResponse.from_orm(db_user),
        "message": "Login successful — user synced for offline use.",
        "can_offline": True
    }


# ======================================================
# 🔍 VERIFY USER STATUS
# ======================================================
@router.get("/verify/{contact}")
def verify_user_status(contact: str, db: Session = Depends(get_db)):
    try:
        normalized_contact = normalize_contact(contact)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid contact number")

    user = db.query(UserDB).filter(UserDB.contact == normalized_contact).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {"contact": normalized_contact, "status": user.status, "role": user.role}


# ======================================================
# 📋 GET ALL USERS
# ======================================================
@router.get("/", response_model=List[UserResponse])
def get_users(db: Session = Depends(get_db)):
    users = db.query(UserDB).all()
    valid_users = []

    for u in users:
        try:
            u.dob = safe_dob(u.dob)
            valid_users.append(UserResponse.from_orm(u))
        except Exception as e:
            print(f"⚠️ Skipping user {u.id}: {e}")

    return valid_users


# ======================================================
# 🔍 GET USER BY ID
# ======================================================
@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: int, db: Session = Depends(get_db)):
    db_user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    db_user.dob = safe_dob(db_user.dob)
    return UserResponse.from_orm(db_user)


# ======================================================
# 💬 SEND SMS VIA SEMAPHORE
# ======================================================
def send_sms_semaphore(ph_number: str, message: str):
    api_key = "76f4aac64d6c90951c475dcbc0766719"
    sender_name = "SEMAPHORE"
    url = "https://api.semaphore.co/api/v4/messages"

    if not (ph_number.startswith("09") and len(ph_number) == 11):
        return {"error": f"Invalid PH number: {ph_number}"}

    payload = {
        "apikey": api_key,
        "number": ph_number,
        "message": message,
        "sendername": sender_name
    }

    print("\n=== 📤 Sending SMS via SEMAPHORE ===")
    print("To:", ph_number)
    print("Message:", message)
    print("=====================\n")

    try:
        resp = requests.post(url, data=payload, timeout=15)
        print("HTTP Status:", resp.status_code)
        print("Raw Response:", resp.text)

        try:
            result = resp.json()
        except json.JSONDecodeError:
            result = {"error": "Invalid JSON response from Semaphore", "raw": resp.text}

        return result

    except Exception as e:
        print("💥 Error sending SMS:", e)
        return {"error": str(e)}

# ======================================================
# ✅ APPROVE OR REJECT PENDING UPDATES (BY SECRETARY)
# ======================================================
@router.put("/approve/{user_id}")
def approve_pending_update(
    user_id: int,
    action: dict = Body(...),
    db: Session = Depends(get_db)
):
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.pending_updates:
        raise HTTPException(status_code=400, detail="No pending updates to approve")

    decision = action.get("action")
    if decision == "approve":
        # Apply all pending updates
        for field, value in user.pending_updates.items():
            setattr(user, field, value)
        user.pending_updates = None
        user.status = "Approved"

        # Create notification
        notif = NotificationDB(
            title="Profile Update Approved",
            message="Your profile update has been approved.",
            type="approval",
            user_id=user.id,
            created_at=datetime.utcnow()
        )
        db.add(notif)
        db.commit()

        # Send SMS to user
        try:
            send_sms_semaphore(user.contact, "Hi, your profile update has been approved. - BarangayConnect")
        except Exception as e:
            print("Failed to send approval SMS:", e)

        return {"message": "Pending updates approved."}

    elif decision == "reject":
        # Clear pending updates
        user.pending_updates = None
        user.status = "Rejected"

        # Create notification
        notif = NotificationDB(
            title="Profile Update Rejected",
            message="Your requested profile changes were rejected.",
            type="rejection",
            user_id=user.id,
            created_at=datetime.utcnow()
        )
        db.add(notif)
        db.commit()

        # Send SMS to user
        try:
            send_sms_semaphore(user.contact, "Hi, your profile update was not approved. Please visit the barangay office for details. - BarangayConnect")
        except Exception as e:
            print("Failed to send rejection SMS:", e)

        return {"message": "Pending updates rejected."}

    raise HTTPException(status_code=400, detail="Invalid action parameter.")

# ======================================================
# ✅ VERIFY NEWLY REGISTERED USER (Approve or Reject)
# ======================================================
@router.put("/verify/{user_id}")
def verify_registration(
    user_id: int,
    action: dict = Body(...),  # expects {"action": "approve"} or {"action": "reject"}
    db: Session = Depends(get_db)
):
    # 🔍 Fetch user
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    decision = action.get("action")
    if decision not in ["approve", "reject"]:
        raise HTTPException(
            status_code=400,
            detail="Invalid action parameter. Use 'approve' or 'reject'."
        )

    full_name = f"{user.first_name} {user.last_name}".strip()

    # ✅ APPROVE
    if decision == "approve":
        user.status = "Approved"

        notif = NotificationDB(
            title="Account Approved",
            message=(
                f"Hi {full_name}, your registration has been approved. "
                "You can now log in to the BarangayConnect system."
            ),
            type="registration_approval",
            user_id=user.id,
            created_at=datetime.utcnow()
        )
        db.add(notif)
        db.commit()
        db.refresh(user)

        # ✉️ Concise SMS (<150 chars)
        sms_message = (
            f"Hi {full_name}, your registration is approved by Barangay Tilhaong. "
            "You may now log in to BarangayConnect."
        )

        try:
            send_sms_semaphore(user.contact, sms_message)
            print(f"SMS sent to {user.contact}: {sms_message}")
        except Exception as e:
            print("Failed to send approval SMS:", e)

        return {"message": "User registration approved and SMS sent."}

    # ❌ REJECT
    elif decision == "reject":
        user.status = "Rejected"

        notif = NotificationDB(
            title="Registration Rejected",
            message=(
                f"Hi {full_name}, your registration has been rejected. "
                "Please contact the Barangay Tilhaong Office for more information."
            ),
            type="registration_rejection",
            user_id=user.id,
            created_at=datetime.utcnow()
        )
        db.add(notif)
        db.commit()
        db.refresh(user)

        # ✉️ Concise rejection SMS (<150 chars)
        sms_message = (
            f"Hi {full_name}, your registration was not approved. "
            "Please visit the Barangay Tilhaong office for assistance."
        )

        try:
            send_sms_semaphore(user.contact, sms_message)
            print(f"SMS sent to {user.contact}: {sms_message}")
        except Exception as e:
            print("Failed to send rejection SMS:", e)

        return {"message": "User registration rejected and SMS sent."}

@router.post("/verify-contact/{user_id}")
def verify_contact_change(user_id: int, data: dict = Body(...), db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    otp_provided = data.get("otp")
    if not otp_provided:
        raise HTTPException(status_code=400, detail="OTP is required")

    # Check OTP match
    if user.new_contact_otp != otp_provided:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    # Check OTP expiration
    from datetime import datetime, timedelta
    if not user.new_contact_otp_created_at or datetime.utcnow() > user.new_contact_otp_created_at + timedelta(minutes=5):
        user.new_contact_temp = None
        user.new_contact_otp = None
        user.new_contact_otp_created_at = None
        db.commit()
        raise HTTPException(status_code=400, detail="OTP expired. Request a new one.")

    # Normalize new contact
    try:
        normalized_contact = normalize_contact(user.new_contact_temp)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid new contact number format")

    # Check for duplicates
    if db.query(UserDB).filter(UserDB.contact == normalized_contact).first():
        raise HTTPException(status_code=400, detail="Contact number already in use")

    # Apply new contact
    user.contact = normalized_contact
    user.new_contact_temp = None
    user.new_contact_otp = None
    user.new_contact_otp_created_at = None
    user.status = "Approved"
    db.add(NotificationDB(
        user_id=user.id,
        title="Contact Updated",
        message="Your contact number has been successfully updated.",
        type="update",
        created_at=datetime.utcnow()
    ))

    db.commit()

    # SMS confirmation
    try:
        send_sms_semaphore(user.contact, "Your contact number has been updated successfully.")
    except Exception as e:
        print("SMS sending failed:", e)

    return {"message": "Contact number updated successfully."}

@router.post("/forgot-password/send-otp")
def forgot_password_send_otp(data: dict = Body(...), db: Session = Depends(get_db)):
    contact = data.get("contact")
    if not contact:
        raise HTTPException(status_code=400, detail="Contact number is required")

    try:
        normalized_contact = normalize_contact(contact)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid contact number format")

    user = db.query(UserDB).filter(UserDB.contact == normalized_contact).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Generate OTP
    import random
    import secrets
    otp = str(secrets.randbelow(900000) + 100000)


    from datetime import datetime
    user.reset_otp = otp
    user.reset_otp_created_at = datetime.utcnow()

    db.commit()

    try:
        send_sms_semaphore(
            normalized_contact,
            f"BarangayConnect: Your password reset code is {otp}. It expires in 5 minutes."
        )
    except Exception as e:
        print("Failed to send reset OTP SMS:", e)

    return {"message": "Verification code sent. It is valid for 5 minutes."}

@router.post("/forgot-password/verify")
def forgot_password_verify(data: dict = Body(...), db: Session = Depends(get_db)):
    contact = data.get("contact")
    otp = data.get("otp")
    new_password = data.get("new_password")

    if not contact or not otp or not new_password:
        raise HTTPException(status_code=400, detail="contact, otp, and new_password are required")

    try:
        normalized_contact = normalize_contact(contact)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid contact number format")

    user = db.query(UserDB).filter(UserDB.contact == normalized_contact).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check OTP match
    if user.reset_otp != otp:
        raise HTTPException(status_code=400, detail="Incorrect OTP")

    # Check OTP expiration
    from datetime import datetime, timedelta
    if datetime.utcnow() > user.reset_otp_created_at + timedelta(minutes=5):
        user.reset_otp = None
        user.reset_otp_created_at = None
        db.commit()
        raise HTTPException(status_code=400, detail="OTP expired. Request a new one.")

    # Update password
    user.password = hash_password(new_password)
    user.reset_otp = None
    user.reset_otp_created_at = None

    db.commit()

    try:
        send_sms_semaphore(
            normalized_contact,
            "Your password has been successfully reset. - BarangayConnect"
        )
    except Exception as e:
        print("Failed to send password reset confirmation SMS:", e)

    return {"message": "Password reset successful."}

# ======================================================
# 🗑️ DELETE USER
# ======================================================
@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    db_user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(db_user)
    db.commit()
    return {"message": "User deleted successfully"}


