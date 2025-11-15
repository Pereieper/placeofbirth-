from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import List, Optional
from database import get_db
from models import NotificationDB
from schemas import NotificationResponse
from datetime import datetime

router = APIRouter(prefix="/notifications", tags=["notifications"])

# ---------------------------
# Helper to create notifications
# ---------------------------
def create_notification(db: Session, user_id: int, title: str, message: str, notif_type: str = "user_request"):
    notif = NotificationDB(
        user_id=user_id,
        title=title,
        message=message,
        type=notif_type,
        is_read=False,
        created_at=datetime.utcnow()
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif


# ---------------------------
# Get notifications
# ---------------------------
@router.get("/", response_model=List[NotificationResponse])
def get_notifications(
    db: Session = Depends(get_db),
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    role: Optional[str] = Query(None, description="User role (resident, secretary, captain)"),
    unread_only: Optional[bool] = Query(False, description="Return only unread notifications")
):
    """
    Fetch notifications:
    - Residents see all notifications related to their own requests (any status or staff action).
    - Staff see staff_action notifications.
    """
    try:
        query = db.query(NotificationDB)

        if role:
            role = role.lower()
            if role in ["resident", "user"]:
                if not user_id:
                    raise HTTPException(status_code=400, detail="user_id is required for residents")
                
                # Residents see all notifications where they are the owner
                query = query.filter(NotificationDB.user_id == user_id)

            elif role in ["secretary", "captain"]:
                # Staff sees only staff notifications
                query = query.filter(func.lower(NotificationDB.type) == "staff_action")
            else:
                raise HTTPException(status_code=400, detail="Invalid role")

        if unread_only:
            query = query.filter(NotificationDB.is_read == False)

        notifications = query.order_by(desc(NotificationDB.created_at)).all()
        return notifications

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error fetching notifications: {e}")


# ---------------------------
# Mark notification as read
# ---------------------------
@router.put("/{notif_id}/read")
def mark_notification_as_read(notif_id: int, db: Session = Depends(get_db)):
    notif = db.query(NotificationDB).filter(NotificationDB.id == notif_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    notif.is_read = True
    db.commit()
    db.refresh(notif)
    return {"message": f"Notification {notif.id} marked as read"}


# ---------------------------
# Mark all notifications as read
# ---------------------------
@router.put("/mark-all-read")
def mark_all_as_read(user_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    try:
        query = db.query(NotificationDB)
        if user_id:
            query = query.filter(NotificationDB.user_id == user_id)

        count = query.update({NotificationDB.is_read: True})
        db.commit()
        return {"message": f"{count} notifications marked as read"}

    except Exception as e:
        db.rollback()
        print(f"⚠ Failed to mark all notifications as read: {e}")
        raise HTTPException(status_code=500, detail="Failed to update notifications")

# ---------------------------
# Delete a notification
# ---------------------------
@router.delete("/{notif_id}")
def delete_notification(notif_id: int, db: Session = Depends(get_db)):
    notif = db.query(NotificationDB).filter(NotificationDB.id == notif_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    db.delete(notif)
    db.commit()
    return {"message": f"Notification {notif_id} deleted successfully"}
