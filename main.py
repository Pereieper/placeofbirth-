from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import users, document_requests, notifications, secretary
from database import Base, engine
from seed_admins import seed_admins

# ---------------------------
# Database initialization
# ---------------------------
Base.metadata.create_all(bind=engine)

# ---------------------------
# FastAPI app setup
# ---------------------------
app = FastAPI(
    title="EC2 FastAPI Backend",
    description="Backend for Ionic app with PostgreSQL + EC2",
    version="1.0.0"
)
app.router.redirect_slashes = True

# ---------------------------
# CORS configuration
# ---------------------------
# ⚠ Do NOT use "*" when allow_credentials=True
origins = [
    "http://localhost:8100",
    "http://127.0.0.1:8100",
    "http://localhost:8101",
    "capacitor://localhost",
    "http://3.26.113.125",
    "http://3.26.113.125:8100",
    "http://3.26.113.125:8000",  # ✅ actual backend origin
    "http://localhost",          # ✅ sometimes needed for Android webview
]


app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,      # explicitly list origins
    allow_credentials=True,     # allow cookies and auth headers
    allow_methods=["*"],        # allow all HTTP methods
    allow_headers=["*"],        # allow all headers including Authorization
)

# ---------------------------
# Root endpoints
# ---------------------------
@app.get("/")
def read_root():
    return {"message": "Hello from EC2 with PostgreSQL!"}

@app.get("/ping")
def ping():
    return {"message": "Backend is alive!"}

# ---------------------------
# Routers
# ---------------------------
app.include_router(users.router)
app.include_router(document_requests.router)
app.include_router(notifications.router)
app.include_router(secretary.router)

# ---------------------------
# Startup event
# ---------------------------
@app.on_event("startup")
def startup_tasks():
    """Tasks that run when the backend starts."""
    seed_admins()
    print("✅ Startup complete — routes loaded:")
    for route in app.routes:
        if hasattr(route, "methods"):
            print(f"  {route.path} → {list(route.methods)}")
    print("🚀 Backend running and CORS configured for localhost + EC2")
