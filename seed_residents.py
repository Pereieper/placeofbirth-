# seed_residents.py
from datetime import datetime
from sqlalchemy.orm import Session
from database import engine, Base, SessionLocal
from models import ResidentMasterlistDB

# ===========================
# Step 1: Create Tables (if not exist)
# ===========================
Base.metadata.create_all(bind=engine)

# ===========================
# Step 2: Prepare Seed Data
# ===========================
residents_data = [
    {"first_name": "Allan", "middle_name": None, "last_name": "Lanit",
     "dob": datetime.strptime("1969-12-03", "%Y-%m-%d"), "gender": "Male",
     "purok": "Mangga", "barangay": "Tilhaong", "city": None, "province": None},

    {"first_name": "John", "middle_name": None, "last_name": "Gamboa",
     "dob": datetime.strptime("2003-12-08", "%Y-%m-%d"), "gender": "Male",
     "purok": "Tambis", "barangay": "Tilhaong", "city": None, "province": None},

    {"first_name": "Christy", "middle_name": None, "last_name": "Batulan",
     "dob": datetime.strptime("1999-08-18", "%Y-%m-%d"), "gender": "Female",
     "purok": None, "barangay": "Tilhaong", "city": None, "province": None},

    {"first_name": "Wilma", "middle_name": None, "last_name": "Catimpohan",
     "dob": datetime.strptime("2001-11-14", "%Y-%m-%d"), "gender": "Female",
     "purok": "Tagaytay", "barangay": "Tilhaong", "city": None, "province": None},

    {"first_name": "Kent", "middle_name": None, "last_name": "Niez",
     "dob": datetime.strptime("2000-01-05", "%Y-%m-%d"), "gender": "Male",
     "purok": "Sapa", "barangay": "Tilhaong", "city": None, "province": None},

    {"first_name": "Rhashyn", "middle_name": None, "last_name": "Arceo",
     "dob": datetime.strptime("2004-10-16", "%Y-%m-%d"), "gender": "Female",
     "purok": "Centro", "barangay": "Tilhaong", "city": None, "province": None},

    {"first_name": "Rhianna Lheez", "middle_name": None, "last_name": "Arceo",
     "dob": datetime.strptime("2007-05-13", "%Y-%m-%d"), "gender": "Female",
     "purok": "Centro", "barangay": "Tilhaong", "city": None, "province": None},

    {"first_name": "Rryan", "middle_name": None, "last_name": "Arceo",
     "dob": datetime.strptime("1988-10-01", "%Y-%m-%d"), "gender": "Male",
     "purok": "Centro", "barangay": "Tilhaong", "city": None, "province": None},

    {"first_name": "Liezl", "middle_name": None, "last_name": "Arceo",
     "dob": datetime.strptime("1989-09-17", "%Y-%m-%d"), "gender": "Female",
     "purok": "Centro", "barangay": "Tilhaong", "city": None, "province": None},

    {"first_name": "Judith", "middle_name": None, "last_name": "Batiancila",
     "dob": datetime.strptime("1968-02-14", "%Y-%m-%d"), "gender": "Female",
     "purok": "Sapa", "barangay": "Tilhaong", "city": None, "province": None},

    {"first_name": "Francisco", "middle_name": None, "last_name": "Batiancila",
     "dob": datetime.strptime("1966-10-07", "%Y-%m-%d"), "gender": "Male",
     "purok": "Sapa", "barangay": "Tilhaong", "city": None, "province": None},

    {"first_name": "Ferlyn Jane", "middle_name": None, "last_name": "Batiancila",
     "dob": datetime.strptime("2004-05-24", "%Y-%m-%d"), "gender": "Female",
     "purok": "Sapa", "barangay": "Tilhaong", "city": None, "province": None},

    {"first_name": "Francis Jeff", "middle_name": None, "last_name": "Batiancila",
     "dob": datetime.strptime("1995-12-20", "%Y-%m-%d"), "gender": "Male",
     "purok": "Sapa", "barangay": "Tilhaong", "city": None, "province": None},

    {"first_name": "Noel", "middle_name": None, "last_name": "Tudtud",
     "dob": datetime.strptime("2007-10-01", "%Y-%m-%d"), "gender": "Female",
     "purok": "Purok Lubi", "barangay": "MAGUI", "city": None, "province": None},

    {"first_name": "Tan", "middle_name": None, "last_name": "Baton",
     "dob": datetime.strptime("2007-11-01", "%Y-%m-%d"), "gender": "Male",
     "purok": "Purok Tinago", "barangay": "TILHAONG", "city": None, "province": None},

    {"first_name": "Angie", "middle_name": None, "last_name": "Cuyos",
     "dob": datetime.strptime("2004-10-17", "%Y-%m-%d"), "gender": "Female",
     "purok": "Purok Mangga", "barangay": "MANGGA", "city": None, "province": None},

    {"first_name": "Andy", "middle_name": None, "last_name": "Dela Marts",
     "dob": datetime.strptime("2000-01-01", "%Y-%m-%d"), "gender": "Male",
     "purok": "Purok Mangga", "barangay": "DefaultBarangay", "city": None, "province": None},
]

# ===========================
# Step 3: Insert Seed Data
# ===========================
def seed_residents(session: Session):
    for r in residents_data:
        exists = session.query(ResidentMasterlistDB).filter(
            ResidentMasterlistDB.first_name == r["first_name"],
            ResidentMasterlistDB.middle_name == r["middle_name"],
            ResidentMasterlistDB.last_name == r["last_name"],
            ResidentMasterlistDB.dob == r["dob"]
        ).first()
        if not exists:
            resident = ResidentMasterlistDB(**r)
            session.add(resident)
    session.commit()
    print("✅ Seeded all residents successfully!")

# ===========================
# Step 4: Run Seeder
# ===========================
if __name__ == "__main__":
    session = SessionLocal()
    try:
        seed_residents(session)
    finally:
        session.close()
