import hmac
import hashlib
import uuid
import sys
import types

# Shim for razorpay's pkg_resources dependency (removed in newer setuptools)
if "pkg_resources" not in sys.modules:
    _mod = types.ModuleType("pkg_resources")
    _dist = type("D", (), {"version": "0.0.0"})()
    _mod.get_distribution = lambda name: _dist
    _mod.DistributionNotFound = type("DistributionNotFound", (Exception,), {})
    _mod.VersionConflict = type("VersionConflict", (Exception,), {})
    _mod.require = lambda *a, **kw: None
    sys.modules["pkg_resources"] = _mod

import boto3
import razorpay
from botocore.exceptions import ClientError, NoCredentialsError
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..core.config import settings
from ..core.database import get_db
from ..core.security import get_current_user, require_role
from ..orders.models import Order, OnlineOrder, PaymentStatus
from ..orders.service import complete_order
from .schemas import CreatePaymentRequest, VerifyPaymentRequest, PresignedUrlResponse

router = APIRouter(tags=["payments"])


def get_razorpay_client() -> razorpay.Client:
    return razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))


# ── Razorpay ──────────────────────────────────────────────────────────────────

@router.post("/payments/create")
async def create_payment(
    body: CreatePaymentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Order).where(Order.id == body.order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(404, "Order not found")

    # Ensure the requesting user owns the order (or is staff/admin)
    if current_user.get("role") not in ("admin", "staff"):
        if order.user_id != uuid.UUID(current_user["sub"]):
            raise HTTPException(403, "Access denied")

    client = get_razorpay_client()
    try:
        rz_order = client.order.create(
            {
                "amount": int(order.total_amount * 100),
                "currency": "INR",
                "receipt": str(order.id),
            }
        )
    except Exception as exc:
        raise HTTPException(502, f"Razorpay error: {exc}")

    online_result = await db.execute(
        select(OnlineOrder).where(OnlineOrder.order_id == body.order_id)
    )
    online_order = online_result.scalar_one_or_none()
    if online_order:
        online_order.razorpay_order_id = rz_order["id"]
        await db.commit()

    return {
        "razorpay_order_id": rz_order["id"],
        "amount": rz_order["amount"],
        "currency": "INR",
        "key_id": settings.razorpay_key_id,
    }


@router.post("/payments/verify")
async def verify_payment(
    body: VerifyPaymentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    # Validate HMAC signature
    generated = hmac.new(
        settings.razorpay_key_secret.encode(),
        f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()

    if generated != body.razorpay_signature:
        raise HTTPException(400, "Invalid payment signature")

    online_result = await db.execute(
        select(OnlineOrder).where(OnlineOrder.order_id == body.order_id)
    )
    online_order = online_result.scalar_one_or_none()
    if not online_order:
        raise HTTPException(404, "Online order not found")

    online_order.payment_status = PaymentStatus.paid
    await db.commit()

    try:
        order = await complete_order(db, body.order_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    return {"status": "confirmed", "order_id": str(order.id)}


# ── Prescription Upload ───────────────────────────────────────────────────────

@router.post("/prescriptions/upload-url", response_model=PresignedUrlResponse)
async def get_prescription_upload_url(
    current_user: dict = Depends(get_current_user),
):
    """Return a pre-signed S3 URL the client can use to upload a prescription PDF/image."""
    if not settings.aws_s3_bucket:
        raise HTTPException(503, "S3 not configured")

    user_id = current_user["sub"]
    key = f"prescriptions/{user_id}/{uuid.uuid4()}.pdf"
    expires_in = 300  # 5 minutes

    try:
        s3_client = boto3.client(
            "s3",
            region_name=settings.aws_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )
        upload_url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.aws_s3_bucket,
                "Key": key,
                "ContentType": "application/pdf",
            },
            ExpiresIn=expires_in,
        )
    except NoCredentialsError:
        raise HTTPException(503, "AWS credentials not configured")
    except ClientError as exc:
        raise HTTPException(502, f"S3 error: {exc}")

    return PresignedUrlResponse(upload_url=upload_url, key=key, expires_in=expires_in)
