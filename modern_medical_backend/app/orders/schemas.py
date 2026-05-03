import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any
from pydantic import BaseModel
from .models import (
    OrderType,
    OrderStatus,
    PaymentStatus,
    PaymentMethod,
    PrescriptionReviewStatus,
)


# ── Order ─────────────────────────────────────────────────────────────────────

class OrderCreate(BaseModel):
    type: OrderType = OrderType.offline
    delivery_address: dict[str, Any] | None = None
    prescription_url: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    customer_address: str | None = None
    doctor_name: str | None = None
    doctor_registration: str | None = None
    prescription_notes: str | None = None
    payment_method: PaymentMethod = PaymentMethod.cash


class OrderStatusPatch(BaseModel):
    status: OrderStatus


class PrescriptionUploadRequest(BaseModel):
    filename: str
    content_type: str
    data_base64: str


class PrescriptionUploadOut(BaseModel):
    prescription_url: str
    filename: str
    content_type: str
    size_bytes: int


class PrescriptionReviewPatch(BaseModel):
    status: PrescriptionReviewStatus
    notes: str | None = None


class OrderItemAdd(BaseModel):
    medicine_id: uuid.UUID
    quantity: int


class OrderMedicineOut(BaseModel):
    id: uuid.UUID
    name: str
    brand: str | None = None
    category: str | None = None
    composition: str | None = None
    image_url: str | None = None
    prescription_required: bool = False
    gst_rate: Decimal

    model_config = {"from_attributes": True}


class OrderItemOut(BaseModel):
    id: uuid.UUID
    order_id: uuid.UUID
    medicine_id: uuid.UUID
    batch_id: uuid.UUID
    quantity: int
    unit_price: Decimal
    medicine: OrderMedicineOut | None = None

    model_config = {"from_attributes": True}


class OnlineOrderOut(BaseModel):
    order_id: uuid.UUID
    payment_status: PaymentStatus
    razorpay_order_id: str | None
    delivery_address: dict[str, Any] | None
    prescription_url: str | None
    prescription_required: bool = False
    prescription_status: str = PrescriptionReviewStatus.not_required.value
    prescription_review_notes: str | None = None
    prescription_reviewed_at: datetime | None = None
    prescription_reviewed_by: uuid.UUID | None = None

    model_config = {"from_attributes": True}


class OrderOut(BaseModel):
    id: uuid.UUID
    type: OrderType
    user_id: uuid.UUID | None
    total_amount: Decimal
    tax_amount: Decimal
    status: OrderStatus
    customer_name: str | None = None
    customer_phone: str | None = None
    customer_address: str | None = None
    doctor_name: str | None = None
    doctor_registration: str | None = None
    prescription_notes: str | None = None
    payment_method: str | None = None
    created_at: datetime
    items: list[OrderItemOut] = []
    online_order: OnlineOrderOut | None = None

    model_config = {"from_attributes": True}


# ── Cart ──────────────────────────────────────────────────────────────────────

class CartItemAdd(BaseModel):
    medicine_id: uuid.UUID
    quantity: int = 1


class CartItemPatch(BaseModel):
    quantity: int


class CartMedicineOut(BaseModel):
    id: uuid.UUID
    name: str
    brand: str | None
    category: str | None
    prescription_required: bool
    gst_rate: Decimal
    selling_price: Decimal | None = None
    stock_available: int = 0


class CartItemOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    medicine_id: uuid.UUID
    quantity: int
    medicine: CartMedicineOut | None = None

    model_config = {"from_attributes": True}


# ── Checkout ──────────────────────────────────────────────────────────────────

class CheckoutRequest(BaseModel):
    delivery_address: dict[str, Any] | None = None
    prescription_url: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    customer_address: str | None = None
    doctor_name: str | None = None
    doctor_registration: str | None = None
    prescription_notes: str | None = None
    payment_method: PaymentMethod = PaymentMethod.upi
