from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import date, timedelta
from .models import Medicine, Inventory, Supplier, InventoryLog
import uuid


async def get_fifo_batch(db: AsyncSession, medicine_id: uuid.UUID) -> Inventory | None:
    """Return the earliest-expiring non-expired batch with stock (FIFO)."""
    result = await db.execute(
        select(Inventory)
        .where(
            Inventory.medicine_id == medicine_id,
            Inventory.quantity_available > 0,
            Inventory.expiry_date > date.today(),
        )
        .order_by(Inventory.expiry_date.asc())
        .limit(1)
        .with_for_update()
    )
    return result.scalar_one_or_none()


async def deduct_stock(
    db: AsyncSession,
    batch_id: uuid.UUID,
    qty: int,
    reason: str,
    order_id: uuid.UUID | None = None,
) -> Inventory:
    result = await db.execute(
        select(Inventory).where(Inventory.id == batch_id).with_for_update()
    )
    batch = result.scalar_one_or_none()
    if not batch:
        raise ValueError("Batch not found")
    if batch.quantity_available < qty:
        raise ValueError(
            f"Insufficient stock: available {batch.quantity_available}, requested {qty}"
        )
    batch.quantity_available -= qty
    log = InventoryLog(
        id=uuid.uuid4(),
        inventory_id=batch_id,
        change_qty=-qty,
        reason=reason,
        order_id=order_id,
    )
    db.add(log)
    return batch


async def get_expiry_alerts(db: AsyncSession) -> list[Inventory]:
    """Return batches expiring within 30 days that still have stock."""
    threshold = date.today() + timedelta(days=30)
    result = await db.execute(
        select(Inventory).where(
            Inventory.expiry_date <= threshold,
            Inventory.quantity_available > 0,
        )
    )
    return result.scalars().all()


async def get_low_stock_alerts(db: AsyncSession):
    """Return (Inventory, Medicine) pairs where stock is at or below threshold."""
    result = await db.execute(
        select(Inventory, Medicine)
        .join(Medicine, Inventory.medicine_id == Medicine.id)
        .where(Inventory.quantity_available <= Medicine.low_stock_threshold)
    )
    return result.all()
