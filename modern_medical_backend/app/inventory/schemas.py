import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from pydantic import BaseModel


# ── Supplier ─────────────────────────────────────────────────────────────────

class SupplierCreate(BaseModel):
    name: str
    contact: str | None = None
    email: str | None = None


class SupplierOut(BaseModel):
    id: uuid.UUID
    name: str
    contact: str | None
    email: str | None

    model_config = {"from_attributes": True}


# ── Medicine ──────────────────────────────────────────────────────────────────

class MedicineCreate(BaseModel):
    name: str
    composition: str | None = None
    brand: str | None = None
    category: str | None = None
    image_url: str | None = None
    prescription_required: bool = False
    gst_rate: Decimal = Decimal("12.00")
    low_stock_threshold: int = 10
    opening_batch_number: str | None = None
    opening_expiry_date: date | None = None
    opening_cost_price: Decimal | None = None
    opening_selling_price: Decimal | None = None
    opening_quantity_available: int | None = None
    opening_supplier_id: uuid.UUID | None = None


class MedicinePatch(BaseModel):
    name: str | None = None
    composition: str | None = None
    brand: str | None = None
    category: str | None = None
    image_url: str | None = None
    prescription_required: bool | None = None
    gst_rate: Decimal | None = None
    low_stock_threshold: int | None = None


class MedicineOut(BaseModel):
    id: uuid.UUID
    name: str
    composition: str | None
    brand: str | None
    category: str | None
    image_url: str | None = None
    prescription_required: bool
    gst_rate: Decimal
    low_stock_threshold: int
    selling_price: Decimal | None = None
    stock_available: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Inventory Batch ───────────────────────────────────────────────────────────

class InventoryAdd(BaseModel):
    medicine_id: uuid.UUID
    batch_number: str
    expiry_date: date
    cost_price: Decimal
    selling_price: Decimal
    quantity_available: int
    supplier_id: uuid.UUID | None = None


class InventoryPatch(BaseModel):
    batch_number: str | None = None
    expiry_date: date | None = None
    cost_price: Decimal | None = None
    selling_price: Decimal | None = None
    quantity_available: int | None = None
    supplier_id: uuid.UUID | None = None


class InventoryOut(BaseModel):
    id: uuid.UUID
    medicine_id: uuid.UUID
    batch_number: str
    expiry_date: date
    cost_price: Decimal | None
    selling_price: Decimal | None
    quantity_available: int
    supplier_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Alerts ────────────────────────────────────────────────────────────────────

class ExpiryAlertOut(BaseModel):
    id: uuid.UUID
    medicine_id: uuid.UUID
    batch_number: str
    expiry_date: date
    quantity_available: int

    model_config = {"from_attributes": True}


class LowStockAlertOut(BaseModel):
    inventory_id: uuid.UUID
    medicine_id: uuid.UUID
    medicine_name: str
    batch_number: str
    quantity_available: int
    low_stock_threshold: int


# ── Inventory Log ─────────────────────────────────────────────────────────────

class InventoryLogOut(BaseModel):
    id: uuid.UUID
    inventory_id: uuid.UUID
    change_qty: int
    reason: str
    order_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}
