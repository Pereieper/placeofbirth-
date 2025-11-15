from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional, List

# ---------------- User Schemas ----------------
class UserCreate(BaseModel):
    firstName: str = Field(..., alias="first_name")
    middleName: Optional[str] = Field(None, alias="middle_name")
    lastName: str = Field(..., alias="last_name")
    dob: datetime
    gender: str
    civilStatus: str = Field(..., alias="civil_status")
    contact: str
    purok: str
    barangay: str
    city: str
    province: str
    postalCode: str = Field(..., alias="postal_code")
    placeOfBirth: Optional[str] = Field(None, alias="place_of_birth")  # ✅ added here
    password: str
    photo: str
    role: Optional[str] = "resident"

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class UserLogin(BaseModel):
    contact: str
    password: str


class UserUpdate(BaseModel):
    firstName: Optional[str] = Field(None, alias="first_name")
    middleName: Optional[str] = Field(None, alias="middle_name")
    lastName: Optional[str] = Field(None, alias="last_name")
    dob: Optional[datetime] = None
    gender: Optional[str] = None
    civilStatus: Optional[str] = Field(None, alias="civil_status")
    contact: Optional[str] = None
    purok: Optional[str] = None
    barangay: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    postalCode: Optional[str] = Field(None, alias="postal_code")
    placeOfBirth: Optional[str] = Field(None, alias="place_of_birth")
    photo: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    password: Optional[str] = None  # ✅ optional during update

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class UserInfoResponse(BaseModel):
    firstName: str = Field(..., alias="first_name")
    middleName: Optional[str] = Field(None, alias="middle_name")
    lastName: str = Field(..., alias="last_name")
    photo: Optional[str] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class UserResponse(BaseModel):
    id: int
    firstName: str = Field(..., alias="first_name")
    middleName: Optional[str] = Field(None, alias="middle_name")
    lastName: str = Field(..., alias="last_name")
    dob: datetime
    gender: str
    civilStatus: str = Field(..., alias="civil_status")
    contact: str
    purok: str
    barangay: str
    city: str
    province: str
    postalCode: str = Field(..., alias="postal_code")
    placeOfBirth: Optional[str] = Field(None, alias="place_of_birth")
    photo: Optional[str] = None
    role: str
    status: str

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


# ---------------- Document Request Schemas ----------------
class DocumentRequest(BaseModel):
    documentType: str
    purpose: str
    copies: int = 1
    requirements: Optional[str] = None
    authorizationPhoto: Optional[str] = None
    contact: str
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class DocumentRequestUpdate(BaseModel):
    documentType: Optional[str] = None
    purpose: Optional[str] = None
    copies: Optional[int] = None
    requirements: Optional[str] = None
    photo: Optional[str] = None
    notes: Optional[str] = None
    requirePhotoUpdate: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class DocumentRequestResponse(BaseModel):
    id: int
    documentType: str
    purpose: str
    copies: int
    requirements: Optional[str] = None
    photo: Optional[str] = None
    authorizationPhoto: Optional[str] = None
    requirePhotoUpdate: Optional[str] = None
    contact: str
    notes: Optional[str] = None
    status: str
    action: Optional[str] = None
    user_id: Optional[int] = None
    pickup_date: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    user: Optional[UserInfoResponse]

    model_config = ConfigDict(from_attributes=True)


# ---------------- Status Update Schema ----------------
class StatusUpdate(BaseModel):
    id: int
    status: str
    action: Optional[str] = None
    notes: Optional[str] = None


# ---------------- Notification Schema ----------------
class NotificationResponse(BaseModel):
    id: int
    title: str
    message: str
    type: str
    is_read: bool
    created_at: datetime
    user_id: Optional[int]

    model_config = ConfigDict(from_attributes=True)

# ---------------- Seed Residents Schemas ----------------
class ResidentBase(BaseModel):
    first_name: str
    middle_name: Optional[str] = None
    last_name: str
    dob: datetime
    gender: str
    purok: Optional[str] = None
    barangay: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    number_of_years: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)

class ResidentResponse(ResidentBase):
    id: int

    model_config = ConfigDict(from_attributes=True)

