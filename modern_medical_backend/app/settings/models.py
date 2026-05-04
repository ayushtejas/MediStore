from datetime import datetime
from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base
from ..core.time import app_now


class StoreProfile(Base):
    __tablename__ = "store_profile"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    app_name: Mapped[str] = mapped_column(String, nullable=False, default="MedStore")
    report_title: Mapped[str] = mapped_column(String, nullable=False, default="Pharmacy Tax Bill")
    tagline: Mapped[str] = mapped_column(String, nullable=False, default="Pharmacy Billing & Retail Care")
    address: Mapped[str] = mapped_column(String, nullable=False, default="123 Health Avenue, Mumbai")
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    email: Mapped[str] = mapped_column(String, nullable=False, default="support@medstore.local")
    gstin: Mapped[str | None] = mapped_column(String, nullable=True, default="27AAECM0000A1Z5")
    drug_license: Mapped[str | None] = mapped_column(String, nullable=True, default="MH-MED-2026")
    footer_note: Mapped[str] = mapped_column(String, nullable=False, default="Thank you for choosing MedStore.")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=app_now, server_default=func.now(), onupdate=app_now, nullable=False
    )


class AppLicence(Base):
    __tablename__ = "app_licence"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    activated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    activated_key_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=app_now, server_default=func.now(), onupdate=app_now, nullable=False
    )
