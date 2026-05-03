from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..core.database import get_db
from ..core.security import verify_password, create_access_token, get_current_user
from ..users.models import User
from .schemas import LoginRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_pw):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )
    token = create_access_token(
        {"sub": str(user.id), "role": user.role.value, "email": user.email}
    )
    return TokenResponse(access_token=token, role=user.role.value, user_id=str(user.id))


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.email == current_user["email"])
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    token = create_access_token(
        {"sub": str(user.id), "role": user.role.value, "email": user.email}
    )
    return TokenResponse(access_token=token, role=user.role.value, user_id=str(user.id))
