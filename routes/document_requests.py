from fastapi import APIRouter, Depends, HTTPException, status, Body, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import func
from typing import Optional, List
from datetime import datetime, timedelta
import traceback
import requests

from database import get_db
from models import DocumentRequestDB, UserDB, NotificationDB
from schemas import (
    DocumentRequest, DocumentRequestUpdate, DocumentRequestResponse,
    UserInfoResponse, StatusUpdate
)
from routes.users import send_sms_semaphore # SMS helper from users.py
from fastapi import Body

router = APIRouter(prefix="/document-requests", tags=["document-requests"])

# ---------------- Helper Functions ----------------
def normalize_contact(contact: str) -> str:
    """Standardize contact format (e.g., +63 -> 0)."""
    contact = (contact or "").strip()
    if contact.startswith("+63"):
        return "0" + contact[3:]
    elif contact.startswith("63"):
        return "0" + contact[2:]
    return contact

def safe_user_response(user: Optional[UserDB]) -> Optional[UserInfoResponse]:
    """Convert UserDB to safe response format."""
    if not user:
        return None
    return UserInfoResponse(
        firstName=user.first_name or "",
        middleName=user.middle_name,
        lastName=user.last_name or "",
        photo=user.photo,
        purok=user.purok,
        gender=user.gender
    )


def document_request_response(db_request: DocumentRequestDB) -> DocumentRequestResponse:
    """Convert DB model into API-safe schema."""
    return DocumentRequestResponse(
        id=db_request.id,
        documentType=db_request.document_type or "Unknown",
        purpose=db_request.purpose or "",
        copies=db_request.copies or 1,
        requirements=db_request.requirements or "",
        photo=db_request.photo or None,
        requirePhotoUpdate=db_request.require_photo_update or None,
        authorizationPhoto=db_request.authorization_photo or None,
        contact=db_request.contact or "",
        notes=db_request.notes or "",
        status=db_request.status or "Pending",
        action=db_request.action or "Review",
        user_id=db_request.user_id,
        pickup_date=db_request.pickup_date,
        created_at=db_request.created_at,
        updated_at=db_request.updated_at,
        user=safe_user_response(getattr(db_request, "user", None)),
    )


def get_request_by_id(db: Session, request_id: int, include_deleted: bool = False) -> DocumentRequestDB:
    """Fetch request by ID, raise 404 if not found."""
    query = db.query(DocumentRequestDB).options(joinedload(DocumentRequestDB.user)).filter(DocumentRequestDB.id == request_id)
    if not include_deleted:
        query = query.filter(DocumentRequestDB.is_deleted == False)
    db_request = query.first()
    if not db_request:
        raise HTTPException(status_code=404, detail="Request not found")
    return db_request

def create_notification(
    db: Session,
    user_id: int,
    title: str,
    message: str,
    type: str = "",
    send_sms: bool = False,
    phone: str = None,
    status: str = ""
):
    """Create notification and optionally send SMS."""
    try:
        notif = NotificationDB(
            user_id=user_id,
            title=title.strip(),
            message=message.strip(),
            type=type.strip(),
            is_read=False,
            created_at=datetime.utcnow()
        )
        db.add(notif)
        db.commit()
        db.refresh(notif)

        # ✅ Send SMS only for specified statuses
        if send_sms and phone and phone.strip() and status in {"For Pickup", "Completed"}:
            try:
                formatted = normalize_contact(phone)
                result = send_sms_semaphore(formatted, message)
                print(f"📩 SMS sent to {formatted}: {result}")
            except Exception as e:
                print(f"⚠️ Failed to send SMS to {phone}: {e}")

       
        return notif
    except Exception:
        db.rollback()
        traceback.print_exc()
        return None

def expire_old_requests(db: Session):
    """Automatically expire requests older than 6 months."""
    six_months_ago = datetime.utcnow() - timedelta(days=180)
    old_requests = db.query(DocumentRequestDB).filter(
        DocumentRequestDB.created_at <= six_months_ago,
        DocumentRequestDB.status.notin_(["Completed", "Cancelled"]),
        DocumentRequestDB.is_deleted == False
    ).all()
    for req in old_requests:
        req.status = "Cancelled"
        req.notes = "Automatically expired after 6 months"
        req.is_deleted = True
        req.deleted_at = datetime.utcnow()
        db.commit()
        create_notification(
            db,
            req.user_id,
            "Request Expired",
            f"Your {req.document_type} request has expired after 6 months.",
            type="cancel",
            send_sms=False
        )
# ---------------- Create Request ----------------
@router.post("/", response_model=DocumentRequestResponse, status_code=status.HTTP_201_CREATED)
def create_request(request: DocumentRequest, db: Session = Depends(get_db)):
    try:
        contact = normalize_contact(request.contact)
        user = db.query(UserDB).filter(
            UserDB.contact == contact,
            func.lower(UserDB.status) == "approved"
        ).first()
        if not user:
            raise HTTPException(status_code=400, detail=f"User with contact '{contact}' not found or not approved.")

        db_request = DocumentRequestDB(
            document_type=(request.documentType or "Unknown").strip(),
            purpose=(request.purpose or "").strip(),
            copies=request.copies or 1,
            requirements=(request.requirements or "").strip() if request.requirements else "",
            authorization_photo=request.authorizationPhoto or user.authorization_photo,
            contact=contact,
            notes=(request.notes or "").strip() if request.notes else "",
            status="Pending",
            action="Review",
            user_id=user.id,
            is_deleted=False,
            created_at=datetime.utcnow()
        )

        db.add(db_request)
        db.commit()
        db.refresh(db_request)

        # Notify resident
        create_notification(
            db,
            user.id,
            "Document Request Submitted",
            f"Your request for {db_request.document_type} has been submitted and is now under review.",
            type="user_request"
        )

        # Notify staff
        for staff in db.query(UserDB).filter(func.lower(UserDB.role).in_(["secretary", "captain"])).all():
            create_notification(
                db,
                staff.id,
                "New Document Request Received",
                f"A new {db_request.document_type} request was submitted by {user.first_name} {user.last_name}.",
                type="staff_action"
            )

        return document_request_response(db_request)

    except HTTPException:
        raise
    except Exception:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to create document request")

# ---------------- Get Requests ----------------
@router.get("/", response_model=List[DocumentRequestResponse], status_code=status.HTTP_200_OK)
def get_requests(
    contact: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    include_deleted: bool = Query(False, description="Include soft-deleted requests"),
    db: Session = Depends(get_db)
):
    try:
        query = db.query(DocumentRequestDB).options(joinedload(DocumentRequestDB.user))
        if not include_deleted:
            query = query.filter(DocumentRequestDB.is_deleted == False)

        if contact:
            query = query.filter(DocumentRequestDB.contact == normalize_contact(contact))

        if status:
            query = query.filter(func.lower(DocumentRequestDB.status) == status.strip().lower())

        requests = query.order_by(DocumentRequestDB.created_at.desc()).all()
        return [document_request_response(r) for r in requests]

    except SQLAlchemyError:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Database error occurred")
    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch document requests")


# ---------------- Helper for Personalized Messages ----------------
def build_status_message(status: str, full_name: str, document_type: str) -> str:
    match status:
        case "Approved":
            return (
                f"Hi {full_name}, your {document_type} request has been approved by Barangay Tilhaong Office. "
                "You can now log in to BarangayConnect."
            )

        case "For Pickup":
            return f"Hi {full_name}, your {document_type} is now ready for pickup at Barangay Tilhaong Office. Please bring a valid ID."
        case "Completed":
            return f"Hi {full_name}, your {document_type} request has been completed. Thank you for using BrgyConnect!"
        case "Returned":
            return f"Hi {full_name}, your {document_type} request has been returned for correction. Please review and resubmit."
        case "Rejected":
            return f"Hi {full_name}, unfortunately, your {document_type} request has been rejected. Please contact the Barangay Office for details."
        case "Pending":
            return f"Hi {full_name}, your {document_type} request has been resubmitted and is now under review."
        case _:
            return f"Hi {full_name}, the status of your {document_type} request is now '{status}'. Thank you!"

# ---------------- Update Request Status ----------------
@router.post("/status", response_model=DocumentRequestResponse)
def update_request_status(payload: StatusUpdate = Body(...), performed_by_id: int = Body(...), db: Session = Depends(get_db)):
    try:
        db_request = get_request_by_id(db, payload.id)
        old_status = db_request.status
        # Validate the staff user performing the action
        staff_user = db.query(UserDB).filter(UserDB.id == performed_by_id).first()
        if not staff_user:
            raise HTTPException(status_code=400, detail="Invalid staff user ID.")


        match payload.status:
            case "Returned":
                db_request.status, db_request.notes, db_request.action = "Returned", payload.notes or "Request returned for correction", "Update Request"
            case "Rejected":
                db_request.status, db_request.notes, db_request.action = "Rejected", payload.notes or "Request rejected", "Reject"
            case "Approved" | "For Print" | "Completed":
                db_request.status = payload.status
                db_request.action = payload.action or "Review"
                db_request.notes = ""
            case "For Pickup":
                db_request.status = "For Pickup"
                db_request.action = payload.action or "Ready for Pickup"
                db_request.notes = ""
                db_request.pickup_date = datetime.utcnow()
            case "Pending":
                if old_status != "Returned":
                    raise HTTPException(status_code=400, detail="Only Returned requests can be resubmitted.")
                db_request.status = "Pending"
                db_request.action = payload.action or "Resubmitted"
                db_request.notes = ""
            case _:
                raise HTTPException(status_code=400, detail=f"Invalid status: {payload.status}")


        db_request.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(db_request)

        full_name = f"{db_request.user.first_name} {db_request.user.last_name}".strip()
        message_for_user = build_status_message(payload.status, full_name, db_request.document_type)
        send_sms_flag = payload.status in ["For Pickup", "Completed"]

        # Notify resident
        create_notification(
            db,
            db_request.user_id,
            f"Request {db_request.status}",
            message_for_user,
            type="status_update",
            send_sms=send_sms_flag,
            phone=db_request.contact,
            status=db_request.status
        )

        # Notify staff who performed action
        create_notification(
            db,
            performed_by_id,
            f"Request {db_request.status} Updated",
            f"You updated {db_request.document_type} request for {full_name}.",
            type="staff_action"
        )

        return document_request_response(db_request)

    except HTTPException:
        raise
    except Exception:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to update request status")

# ---------------- Update Request Details (User Resubmit) ----------------
@router.post("/{request_id}/update", response_model=DocumentRequestResponse)
def update_request_details(request_id: int, payload: DocumentRequestUpdate = Body(...), db: Session = Depends(get_db)):
    try:
        db_request = get_request_by_id(db, request_id)
        if db_request.status != "Returned":
            raise HTTPException(status_code=400, detail="Only Returned requests can be updated by user.")

        for field in ["documentType", "purpose", "copies", "requirements", "photo", "notes"]:
            value = getattr(payload, field, None)
            if value is not None:
                setattr(
                    db_request,
                    field.lower() if field != "documentType" else "document_type",
                    value.strip() if isinstance(value, str) else value
                )

        db_request.status, db_request.action, db_request.updated_at = "Pending", "Resubmitted", datetime.utcnow()

        db.commit()
        db.refresh(db_request)

        for staff in db.query(UserDB).filter(func.lower(UserDB.role).in_(["secretary", "captain"])).all():
            create_notification(
                db,
                staff.id,
                "Request Resubmitted",
                f"{db_request.document_type} request has been resubmitted by {db_request.user.first_name} {db_request.user.last_name}.",
                type="staff_action"
            )

        create_notification(
            db,
            db_request.user_id,
            "Request Resubmitted",
            f"Your {db_request.document_type} request has been successfully resubmitted and is now under review.",
            type="user_request"
        )

        return document_request_response(db_request)

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to update request: {str(e)}")

# ---------------- Soft Delete Request ----------------
@router.delete("/{request_id}", status_code=status.HTTP_200_OK)
def soft_delete_request(request_id: int, db: Session = Depends(get_db)):
    try:
        db_request = get_request_by_id(db, request_id)

        if db_request.is_deleted:
            raise HTTPException(status_code=400, detail="Request already deleted.")

        db_request.is_deleted = True
        db_request.deleted_at = datetime.utcnow()
        db_request.status = "Cancelled"

        db.commit()
        db.refresh(db_request)

        # 🔔 Notify user of deletion (with SMS)
        create_notification(
            db,
            db_request.user_id,
            "Request Cancelled",
            f"Your request for {db_request.document_type} has been cancelled.",
            type="cancel",
            send_sms=False,
            phone=db_request.contact
        )

        return {"message": f"Request {request_id} soft deleted successfully"}

    except HTTPException:
        raise
    except SQLAlchemyError:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Database error occurred")
    except Exception as e:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")