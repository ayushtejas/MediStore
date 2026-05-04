from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import AppLicence, StoreProfile


async def get_store_profile(db: AsyncSession) -> StoreProfile:
    result = await db.execute(select(StoreProfile).where(StoreProfile.id == 1))
    profile = result.scalar_one_or_none()
    if profile:
        return profile
    profile = StoreProfile(id=1)
    db.add(profile)
    await db.flush()
    return profile


async def get_app_licence(db: AsyncSession) -> AppLicence:
    result = await db.execute(select(AppLicence).where(AppLicence.id == 1))
    licence = result.scalar_one_or_none()
    if licence:
        return licence
    licence = AppLicence(id=1, activated=False)
    db.add(licence)
    await db.flush()
    return licence
