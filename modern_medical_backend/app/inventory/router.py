import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from decimal import Decimal

from ..core.database import get_db
from ..core.security import get_current_user, require_role
from .models import Medicine, Inventory, Supplier
from ..orders.models import CartItem, OrderItem
from .schemas import (
    MedicineCreate,
    MedicinePatch,
    MedicineOut,
    InventoryAdd,
    InventoryPatch,
    InventoryOut,
    SupplierCreate,
    SupplierOut,
    ExpiryAlertOut,
    LowStockAlertOut,
)
from .service import get_expiry_alerts, get_low_stock_alerts
from datetime import date

router = APIRouter(tags=["inventory"])


def _active_stock_subquery():
    return (
        select(
            Inventory.medicine_id.label("medicine_id"),
            func.sum(Inventory.quantity_available).label("stock_available"),
            func.min(Inventory.selling_price).label("selling_price"),
        )
        .where(
            Inventory.quantity_available > 0,
            Inventory.expiry_date > date.today(),
        )
        .group_by(Inventory.medicine_id)
        .subquery()
    )


def _to_medicine_out(
    medicine: Medicine, selling_price, stock_available
) -> MedicineOut:
    payload = MedicineOut.model_validate(medicine).model_dump()
    payload["selling_price"] = selling_price
    payload["stock_available"] = int(stock_available or 0)
    return MedicineOut(**payload)


async def _get_medicine_with_metrics(
    db: AsyncSession, medicine_id: uuid.UUID
) -> MedicineOut:
    stock_sq = _active_stock_subquery()
    result = await db.execute(
        select(
            Medicine,
            stock_sq.c.selling_price,
            func.coalesce(stock_sq.c.stock_available, 0).label("stock_available"),
        )
        .outerjoin(stock_sq, stock_sq.c.medicine_id == Medicine.id)
        .where(Medicine.id == medicine_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Medicine not found")
    medicine, selling_price, stock_available = row
    return _to_medicine_out(medicine, selling_price, stock_available)


# ── Medicines ─────────────────────────────────────────────────────────────────

@router.get("/medicines", response_model=list[MedicineOut])
async def list_medicines(
    q: str | None = Query(None, description="Search by name, brand, category, or composition"),
    in_stock: bool | None = Query(None, description="Filter to only medicines with stock"),
    expiry_soon: bool | None = Query(None, description="Filter medicines with batches expiring within 30 days"),
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    stock_sq = _active_stock_subquery()
    stmt = select(
        Medicine,
        stock_sq.c.selling_price,
        func.coalesce(stock_sq.c.stock_available, 0).label("stock_available"),
    ).outerjoin(stock_sq, stock_sq.c.medicine_id == Medicine.id)

    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                Medicine.name.ilike(like),
                Medicine.brand.ilike(like),
                Medicine.category.ilike(like),
                Medicine.composition.ilike(like),
            )
        )

    if in_stock is True:
        stmt = stmt.where(func.coalesce(stock_sq.c.stock_available, 0) > 0)
    elif in_stock is False:
        stmt = stmt.where(func.coalesce(stock_sq.c.stock_available, 0) == 0)

    if expiry_soon:
        from datetime import timedelta
        threshold = date.today() + timedelta(days=30)
        from sqlalchemy import exists
        stmt = stmt.where(
            exists(
                select(Inventory.id).where(
                    Inventory.medicine_id == Medicine.id,
                    Inventory.expiry_date <= threshold,
                    Inventory.quantity_available > 0,
                )
            )
        )

    stmt = stmt.order_by(Medicine.name.asc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    rows = result.all()
    return [
        _to_medicine_out(medicine, selling_price, stock_available)
        for medicine, selling_price, stock_available in rows
    ]


@router.post("/medicines", response_model=MedicineOut, status_code=status.HTTP_201_CREATED)
async def create_medicine(
    body: MedicineCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role("admin", "staff")),
):
    payload = body.model_dump()
    opening_batch_number = payload.pop("opening_batch_number")
    opening_expiry_date = payload.pop("opening_expiry_date")
    opening_cost_price = payload.pop("opening_cost_price")
    opening_selling_price = payload.pop("opening_selling_price")
    opening_quantity_available = payload.pop("opening_quantity_available") or 0
    opening_supplier_id = payload.pop("opening_supplier_id")

    if opening_quantity_available < 0:
        raise HTTPException(status_code=422, detail="Opening stock quantity cannot be negative")

    medicine = Medicine(id=uuid.uuid4(), **payload)
    db.add(medicine)

    if opening_quantity_available > 0:
        if opening_expiry_date is None:
            raise HTTPException(status_code=422, detail="Opening stock expiry date is required")
        if opening_selling_price is None or opening_selling_price <= 0:
            raise HTTPException(status_code=422, detail="Opening stock selling price must be greater than zero")
        if opening_cost_price is not None and opening_cost_price < 0:
            raise HTTPException(status_code=422, detail="Opening stock cost price cannot be negative")
        if opening_supplier_id is not None:
            supplier = await db.get(Supplier, opening_supplier_id)
            if supplier is None:
                raise HTTPException(status_code=404, detail="Supplier not found")

        db.add(
            Inventory(
                id=uuid.uuid4(),
                medicine_id=medicine.id,
                batch_number=opening_batch_number or f"OPEN-{str(medicine.id)[:6]}",
                expiry_date=opening_expiry_date,
                cost_price=opening_cost_price or Decimal("0"),
                selling_price=opening_selling_price,
                quantity_available=opening_quantity_available,
                supplier_id=opening_supplier_id,
            )
        )

    await db.commit()
    await db.refresh(medicine)
    return await _get_medicine_with_metrics(db, medicine.id)


@router.get("/medicines/{medicine_id}", response_model=MedicineOut)
async def get_medicine(
    medicine_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    return await _get_medicine_with_metrics(db, medicine_id)


@router.patch("/medicines/{medicine_id}", response_model=MedicineOut)
async def patch_medicine(
    medicine_id: uuid.UUID,
    body: MedicinePatch,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role("admin", "staff")),
):
    result = await db.execute(select(Medicine).where(Medicine.id == medicine_id))
    medicine = result.scalar_one_or_none()
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(medicine, field, value)

    await db.commit()
    await db.refresh(medicine)
    return await _get_medicine_with_metrics(db, medicine.id)


@router.delete("/medicines/{medicine_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_medicine(
    medicine_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role("admin", "staff")),
):
    result = await db.execute(select(Medicine).where(Medicine.id == medicine_id))
    medicine = result.scalar_one_or_none()
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")

    order_ref = await db.execute(
        select(OrderItem.id).where(OrderItem.medicine_id == medicine_id).limit(1)
    )
    if order_ref.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="Cannot delete a medicine that is already used in bills or orders",
        )

    cart_ref = await db.execute(
        select(CartItem.id).where(CartItem.medicine_id == medicine_id).limit(1)
    )
    if cart_ref.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="Cannot delete a medicine while it is present in an active cart",
        )

    batches = await db.execute(select(Inventory).where(Inventory.medicine_id == medicine_id))
    for batch in batches.scalars().all():
        await db.delete(batch)
    await db.delete(medicine)
    await db.commit()
    return None


# ── Inventory Batches ─────────────────────────────────────────────────────────

@router.post("/inventory/add", response_model=InventoryOut, status_code=status.HTTP_201_CREATED)
async def add_inventory(
    body: InventoryAdd,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role("admin", "staff")),
):
    # Verify medicine exists
    med_result = await db.execute(select(Medicine).where(Medicine.id == body.medicine_id))
    if not med_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Medicine not found")

    batch = Inventory(id=uuid.uuid4(), **body.model_dump())
    db.add(batch)
    await db.commit()
    await db.refresh(batch)
    return batch


@router.patch("/inventory/{batch_id}", response_model=InventoryOut)
async def patch_inventory(
    batch_id: uuid.UUID,
    body: InventoryPatch,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role("admin", "staff")),
):
    result = await db.execute(select(Inventory).where(Inventory.id == batch_id))
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Inventory batch not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(batch, field, value)

    await db.commit()
    await db.refresh(batch)
    return batch


@router.delete("/inventory/{batch_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_inventory(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role("admin", "staff")),
):
    result = await db.execute(select(Inventory).where(Inventory.id == batch_id))
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Inventory batch not found")

    order_ref = await db.execute(
        select(OrderItem.id).where(OrderItem.batch_id == batch_id).limit(1)
    )
    if order_ref.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="Cannot delete a batch that is already used in bills or orders",
        )

    await db.delete(batch)
    await db.commit()
    return None


@router.get("/inventory", response_model=list[InventoryOut])
async def list_inventory(
    medicine_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role("admin", "staff")),
):
    stmt = select(Inventory)
    if medicine_id:
        stmt = stmt.where(Inventory.medicine_id == medicine_id)
    stmt = stmt.offset(skip).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


# ── Alerts ────────────────────────────────────────────────────────────────────

@router.get("/inventory/alerts")
async def inventory_alerts(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role("admin", "staff")),
):
    expiry = await get_expiry_alerts(db)
    low_stock_rows = await get_low_stock_alerts(db)

    expiry_out = [
        ExpiryAlertOut(
            id=b.id,
            medicine_id=b.medicine_id,
            batch_number=b.batch_number,
            expiry_date=b.expiry_date,
            quantity_available=b.quantity_available,
        )
        for b in expiry
    ]

    low_stock_out = [
        LowStockAlertOut(
            inventory_id=inv.id,
            medicine_id=med.id,
            medicine_name=med.name,
            batch_number=inv.batch_number,
            quantity_available=inv.quantity_available,
            low_stock_threshold=med.low_stock_threshold,
        )
        for inv, med in low_stock_rows
    ]

    return {"expiry_alerts": expiry_out, "low_stock_alerts": low_stock_out}


# ── Suppliers ─────────────────────────────────────────────────────────────────

@router.get("/suppliers", response_model=list[SupplierOut])
async def list_suppliers(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role("admin", "staff")),
):
    result = await db.execute(select(Supplier))
    return result.scalars().all()


@router.post("/suppliers", response_model=SupplierOut, status_code=status.HTTP_201_CREATED)
async def create_supplier(
    body: SupplierCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role("admin", "staff")),
):
    supplier = Supplier(id=uuid.uuid4(), **body.model_dump())
    db.add(supplier)
    await db.commit()
    await db.refresh(supplier)
    return supplier
