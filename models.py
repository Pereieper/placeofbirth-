from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base

# ---------------- User Table ----------------
class UserDB(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String, nullable=False)
    middle_name = Column(String, nullable=True)
    last_name = Column(String, nullable=False)
    dob = Column(DateTime, nullable=False)
    gender = Column(String, nullable=False)
    civil_status = Column(String, nullable=False)
    contact = Column(String, unique=True, index=True, nullable=False)
    purok = Column(String, nullable=False)
    barangay = Column(String, nullable=False)
    city = Column(String, nullable=False)
    province = Column(String, nullable=False)
    postal_code = Column(String, nullable=False)
    place_of_birth = Column(String, nullable=True)
    password = Column(String, nullable=False)
    photo = Column(Text, nullable=True)  # ✅ make nullable=True for flexibility
    role = Column(String, nullable=False, default="Resident")  # ✅ default role
    status = Column(String, default="Pending", nullable=False)
    pending_updates = Column(JSON, nullable=True)
    new_contact_temp = Column(String, nullable=True)
    new_contact_otp = Column(String, nullable=True)
    new_contact_otp_created_at = Column(DateTime, nullable=True)
    reset_otp = Column(String, nullable=True)
    reset_otp_created_at = Column(DateTime, nullable=True)

    document_requests = relationship(
        "DocumentRequestDB",
        back_populates="user",
        cascade="all, delete-orphan"
    )
    notifications = relationship(
        "NotificationDB",
        back_populates="user",
        cascade="all, delete-orphan"
    )


# ---------------- Document Requests Table ----------------
class DocumentRequestDB(Base):
    __tablename__ = "document_requests"

    id = Column(Integer, primary_key=True, index=True)
    document_type = Column(String, nullable=False)
    purpose = Column(String, nullable=False)
    copies = Column(Integer, nullable=False, default=1)
    requirements = Column(Text, nullable=True)
    photo = Column(Text, nullable=True)
    authorization_photo = Column(Text, nullable=True)  # ✅ photo for purok leader approval
    require_photo_update = Column(Text, nullable=True)  
    status = Column(String, default="Pending", nullable=False)
    action = Column(String, default="Review", nullable=False)
    notes = Column(Text, nullable=True)
    contact = Column(String, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    pickup_date = Column(DateTime(timezone=True), nullable=True)
    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("UserDB", back_populates="document_requests")


# ---------------- Notifications Table ----------------
class NotificationDB(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(50), default="info", nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    user = relationship("UserDB", back_populates="notifications")

# ---------------- Resident Masterlist Table ----------------
class ResidentMasterlistDB(Base):
    __tablename__ = "resident_masterlist"

    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String, nullable=False, index=True)
    middle_name = Column(String, nullable=True)
    last_name = Column(String, nullable=False, index=True)
    dob = Column(DateTime, nullable=False)
    gender = Column(String, nullable=False)
    purok = Column(String, nullable=True)
    barangay = Column(String, nullable=True)
    city = Column(String, nullable=True)
    province = Column(String, nullable=True)
    number_of_years = Column(Integer, nullable=True)
