# routes/secretary.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from models import ResidentMasterlistDB, UserDB
from schemas import ResidentResponse
from .users import safe_dob  # optional helper to format DOB
from datetime import date

router = APIRouter(
    prefix="/secretary",
    tags=["Secretary"]
)

# ======================================================
# 🔐 Dependency: Only secretaries can access
# ======================================================
def get_current_secretary(user_id: int, db: Session = Depends(get_db)) -> UserDB:
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role != "secretary":
        raise HTTPException(status_code=403, detail="Not authorized")
    return user

# ======================================================
# 🔍 Search Residents
# ======================================================
@router.get("/residents", response_model=List[ResidentResponse])
def search_residents(
    query: Optional[str] = Query(None, description="Search by first, middle, last name"),
    purok: Optional[str] = Query(None),
    barangay: Optional[str] = Query(None),
    current_user: UserDB = Depends(get_current_secretary),
    db: Session = Depends(get_db)
):
    """
    Secretaries can search residents by name, purok, or barangay.
    """
    residents_query = db.query(ResidentMasterlistDB)

    if query:
        query_lower = f"%{query.lower()}%"
        residents_query = residents_query.filter(
            (ResidentMasterlistDB.first_name.ilike(query_lower)) |
            (ResidentMasterlistDB.middle_name.ilike(query_lower)) |
            (ResidentMasterlistDB.last_name.ilike(query_lower))
        )

    if purok:
        residents_query = residents_query.filter(ResidentMasterlistDB.purok.ilike(f"%{purok}%"))

    if barangay:
        residents_query = residents_query.filter(ResidentMasterlistDB.barangay.ilike(f"%{barangay}%"))

    residents = residents_query.all()

    # Optional: Format DOB for response
    for r in residents:
        r.dob = safe_dob(r.dob)

    return [ResidentResponse.from_orm(r) for r in residents]


def calculate_years(dob: datetime) -> int:
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))

# Example when adding a resident
resident.number_of_years = calculate_years(resident.dob)