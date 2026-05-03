import uuid
from datetime import datetime
from typing import Any
from pydantic import BaseModel, EmailStr
from app.users.models import UserRole


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: str | None = None
    address: dict[str, Any] | None = None
    role: UserRole = UserRole.customer


class UserOut(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    phone: str | None
    address: dict[str, Any] | None
    role: UserRole
    created_at: datetime

    model_config = {"from_attributes": True}
