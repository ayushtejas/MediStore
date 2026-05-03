from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from decimal import Decimal
from .models import Order, OrderItem, OnlineOrder, OrderStatus
from ..inventory.service import get_fifo_batch, deduct_stock
from ..inventory.models import Medicine
import uuid


async def complete_order(db: AsyncSession, order_id: uuid.UUID) -> Order:
    """Deduct stock for all items and mark order confirmed. Called within a transaction."""
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise ValueError("Order not found")

    items_result = await db.execute(
        select(OrderItem).where(OrderItem.order_id == order_id)
    )
    items = items_result.scalars().all()

    total = Decimal("0")
    tax_total = Decimal("0")

    for item in items:
        med_result = await db.execute(
            select(Medicine).where(Medicine.id == item.medicine_id)
        )
        medicine = med_result.scalar_one()
        await deduct_stock(
            db, item.batch_id, item.quantity, reason="order_complete", order_id=order_id
        )
        line_total = item.unit_price * item.quantity
        tax = line_total * medicine.gst_rate / 100
        total += line_total
        tax_total += tax

    order.total_amount = total
    order.tax_amount = tax_total
    order.status = OrderStatus.confirmed
    await db.commit()
    return order


async def add_item_to_order(
    db: AsyncSession,
    order_id: uuid.UUID,
    medicine_id: uuid.UUID,
    quantity: int,
) -> OrderItem:
    """Auto-selects the FIFO batch and creates an OrderItem."""
    batch = await get_fifo_batch(db, medicine_id)
    if not batch:
        raise ValueError("No stock available for this medicine")
    if batch.quantity_available < quantity:
        raise ValueError(
            f"Requested {quantity} but only {batch.quantity_available} available"
        )

    item = OrderItem(
        id=uuid.uuid4(),
        order_id=order_id,
        medicine_id=medicine_id,
        batch_id=batch.id,
        quantity=quantity,
        unit_price=batch.selling_price or Decimal("0"),
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item
