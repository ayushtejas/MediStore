import hashlib
import hmac
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..core.database import get_db
from ..core.security import require_role
from ..core.time import APP_TIMEZONE, app_now
from .schemas import (
    LicenceActivate,
    LicenceActivateOut,
    LicenceStatus,
    StoreProfileOut,
    StoreProfilePatch,
)
from .service import get_app_licence, get_store_profile

router = APIRouter(prefix="/settings", tags=["settings"])


def _utc_now() -> datetime:
    return app_now()


def _as_app_time(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=APP_TIMEZONE)
    return value.astimezone(APP_TIMEZONE)


def _licence_status_response(licence) -> LicenceStatus:
    expires_at = _as_app_time(licence.expires_at)
    activated_at = _as_app_time(licence.activated_at)
    expired = bool(expires_at and expires_at <= _utc_now())
    active = bool(licence.activated and expires_at and not expired)
    return LicenceStatus(
        active=active,
        activated_at=activated_at,
        expires_at=expires_at,
        expired=expired,
        requires_activation=not active,
        licence_key_visible=False,
    )


def _hash_licence_key(licence_key: str) -> str:
    return hashlib.sha256(licence_key.encode("utf-8")).hexdigest()


@router.get("/store-profile", response_model=StoreProfileOut)
async def read_store_profile(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role("admin")),
):
    return await get_store_profile(db)


@router.get("/store-profile/public", response_model=StoreProfileOut)
async def read_public_store_profile(db: AsyncSession = Depends(get_db)):
    return await get_store_profile(db)


@router.patch("/store-profile", response_model=StoreProfileOut)
async def update_store_profile(
    body: StoreProfilePatch,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role("admin")),
):
    profile = await get_store_profile(db)
    for field, value in body.model_dump().items():
        setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("/licence/status", response_model=LicenceStatus)
async def licence_status(db: AsyncSession = Depends(get_db)):
    licence = await get_app_licence(db)
    return _licence_status_response(licence)


@router.post("/licence/activate", response_model=LicenceActivateOut)
async def activate_licence(body: LicenceActivate, db: AsyncSession = Depends(get_db)):
    licence = await get_app_licence(db)
    current_status = _licence_status_response(licence)
    if current_status.active:
        return LicenceActivateOut(**current_status.model_dump())

    submitted_hash = _hash_licence_key(body.licence_key)
    if not hmac.compare_digest(submitted_hash, settings.desktop_license_key_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid licence key")

    now = _utc_now()
    licence.activated = True
    licence.activated_at = now
    licence.expires_at = now + timedelta(days=settings.desktop_license_duration_days)
    licence.activated_key_hash = submitted_hash
    await db.commit()
    await db.refresh(licence)
    return LicenceActivateOut(**_licence_status_response(licence).model_dump())
