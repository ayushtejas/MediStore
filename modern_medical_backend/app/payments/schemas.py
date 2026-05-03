import uuid
from pydantic import BaseModel


class CreatePaymentRequest(BaseModel):
    order_id: uuid.UUID


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    order_id: uuid.UUID


class PresignedUrlResponse(BaseModel):
    upload_url: str
    key: str
    expires_in: int
