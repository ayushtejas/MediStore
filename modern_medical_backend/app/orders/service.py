from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from decimal import Decimal
from .models import Order, OrderItem, OnlineOrder, OrderStatus, PaymentStatus
from ..inventory.service import get_fifo_batch, deduct_stock
from ..inventory.models import Medicine
import uuid


def _money(value) -> Decimal:
    parsed = Decimal(str(value or "0"))
    if parsed < 0:
        return Decimal("0")
    return parsed.quantize(Decimal("0.01"))


def _payment_status_for(payable: Decimal, paid: Decimal, requested: str | None = None) -> str:
    if requested in {PaymentStatus.due.value, PaymentStatus.partially_paid.value, PaymentStatus.paid.value}:
        if requested == PaymentStatus.paid.value:
            return PaymentStatus.paid.value
        if requested == PaymentStatus.due.value and paid <= 0:
            return PaymentStatus.due.value
        if requested == PaymentStatus.partially_paid.value and Decimal("0") < paid < payable:
            return PaymentStatus.partially_paid.value

    if payable <= 0 or paid >= payable:
        return PaymentStatus.paid.value
    if paid <= 0:
        return PaymentStatus.due.value
    return PaymentStatus.partially_paid.value


def normalize_payment_fields(order: Order) -> None:
    payable = _money(_money(order.total_amount) + _money(order.tax_amount) - _money(order.bill_discount_amount))
    requested_status = order.payment_status

    if requested_status == PaymentStatus.due.value:
        paid = Decimal("0")
    elif requested_status == PaymentStatus.paid.value:
        paid = payable
    else:
        paid = min(_money(order.amount_paid), payable)

    order.amount_paid = paid
    order.due_amount = _money(payable - paid)
    order.payment_status = _payment_status_for(payable, paid, requested_status)


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

    subtotal_after_item_discount = Decimal("0")
    tax_total = Decimal("0")
    item_discount_total = Decimal("0")

    for item in items:
        med_result = await db.execute(
            select(Medicine).where(Medicine.id == item.medicine_id)
        )
        medicine = med_result.scalar_one()
        await deduct_stock(
            db, item.batch_id, item.quantity, reason="order_complete", order_id=order_id
        )
        gross_line_total = _money(item.unit_price) * item.quantity
        item_discount = min(_money(item.discount_amount), gross_line_total)
        discounted_line_total = gross_line_total - item_discount
        tax = discounted_line_total * medicine.gst_rate / 100
        subtotal_after_item_discount += discounted_line_total
        tax_total += tax
        item_discount_total += item_discount

    bill_discount = min(_money(order.bill_discount_amount), subtotal_after_item_discount + tax_total)
    payable = subtotal_after_item_discount + tax_total - bill_discount
    if order.payment_status == PaymentStatus.due.value:
        paid = Decimal("0")
    elif order.payment_status == PaymentStatus.paid.value:
        paid = payable
    else:
        paid = min(_money(order.amount_paid), payable)

    order.total_amount = _money(subtotal_after_item_discount)
    order.tax_amount = _money(tax_total)
    order.bill_discount_amount = bill_discount
    order.discount_amount = _money(item_discount_total + bill_discount)
    order.amount_paid = paid
    order.due_amount = _money(payable - paid)
    order.payment_status = _payment_status_for(payable, paid, order.payment_status)
    order.status = OrderStatus.confirmed
    await db.commit()
    return order


async def add_item_to_order(
    db: AsyncSession,
    order_id: uuid.UUID,
    medicine_id: uuid.UUID,
    quantity: int,
    discount_amount: Decimal = Decimal("0"),
) -> OrderItem:
    """Auto-selects the FIFO batch and creates an OrderItem."""
    batch = await get_fifo_batch(db, medicine_id)
    if not batch:
        raise ValueError("No stock available for this medicine")
    if batch.quantity_available < quantity:
        raise ValueError(
            f"Requested {quantity} but only {batch.quantity_available} available"
        )

    gross_line_total = (batch.selling_price or Decimal("0")) * quantity
    item_discount = min(_money(discount_amount), _money(gross_line_total))

    item = OrderItem(
        id=uuid.uuid4(),
        order_id=order_id,
        medicine_id=medicine_id,
        batch_id=batch.id,
        quantity=quantity,
        unit_price=batch.selling_price or Decimal("0"),
        discount_amount=item_discount,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item
