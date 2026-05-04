from datetime import datetime
from pydantic import BaseModel, Field, field_validator


class StoreProfileOut(BaseModel):
    app_name: str
    report_title: str
    tagline: str
    address: str
    phone: str | None = None
    email: str
    gstin: str | None = None
    drug_license: str | None = None
    footer_note: str
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class StoreProfilePatch(BaseModel):
    app_name: str = Field(min_length=2, max_length=80)
    report_title: str = Field(min_length=2, max_length=120)
    tagline: str = Field(min_length=2, max_length=160)
    address: str = Field(min_length=2, max_length=240)
    phone: str | None = Field(default=None, max_length=40)
    email: str = Field(min_length=3, max_length=120)
    gstin: str | None = Field(default=None, max_length=40)
    drug_license: str | None = Field(default=None, max_length=80)
    footer_note: str = Field(min_length=2, max_length=200)


class LicenceStatus(BaseModel):
    active: bool
    activated_at: datetime | None = None
    expires_at: datetime | None = None
    expired: bool
    requires_activation: bool
    licence_key_visible: bool = False


class LicenceActivate(BaseModel):
    licence_key: str

    @field_validator("licence_key")
    @classmethod
    def validate_licence_key(cls, value: str):
        if not value.isdigit() or len(value) != 12:
            raise ValueError("Licence key must be exactly 12 digits")
        return value


class LicenceActivateOut(BaseModel):
    active: bool
    activated_at: datetime | None = None
    expires_at: datetime | None = None
    expired: bool
    requires_activation: bool
    licence_key_visible: bool = False

