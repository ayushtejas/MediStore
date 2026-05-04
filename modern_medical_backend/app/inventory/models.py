import uuid
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import (
    String,
    Text,
    Boolean,
    Date,
    DateTime,
    Integer,
    Numeric,
    ForeignKey,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from ..core.database import Base
from ..core.time import app_now


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    contact: Mapped[str | None] = mapped_column(String, nullable=True)
    email: Mapped[str | None] = mapped_column(String, nullable=True)

    batches: Mapped[list["Inventory"]] = relationship(
        "Inventory", back_populates="supplier"
    )


class Medicine(Base):
    __tablename__ = "medicines"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    composition: Mapped[str | None] = mapped_column(Text, nullable=True)
    brand: Mapped[str | None] = mapped_column(String, nullable=True)
    category: Mapped[str | None] = mapped_column(String, nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    prescription_required: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    gst_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal("12.00"), nullable=False
    )
    low_stock_threshold: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=app_now, server_default=func.now(), nullable=False
    )

    batches: Mapped[list["Inventory"]] = relationship(
        "Inventory", back_populates="medicine"
    )


class Inventory(Base):
    __tablename__ = "inventory"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    medicine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("medicines.id"), nullable=False
    )
    batch_number: Mapped[str] = mapped_column(String, nullable=False)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=False)
    cost_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    selling_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    quantity_available: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=app_now, server_default=func.now(), nullable=False
    )

    medicine: Mapped["Medicine"] = relationship("Medicine", back_populates="batches")
    supplier: Mapped["Supplier | None"] = relationship(
        "Supplier", back_populates="batches"
    )
    logs: Mapped[list["InventoryLog"]] = relationship(
        "InventoryLog",
        back_populates="batch",
        foreign_keys="InventoryLog.inventory_id",
    )


class InventoryLog(Base):
    """Stock change log.  order_id FK references orders.orders (string-resolved by SA)."""

    __tablename__ = "inventory_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    inventory_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory.id"), nullable=False
    )
    change_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String, nullable=False)
    # FK defined as string so this module need not import orders at load time
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=app_now, server_default=func.now(), nullable=False
    )

    batch: Mapped["Inventory"] = relationship(
        "Inventory",
        back_populates="logs",
        foreign_keys=[inventory_id],
    )
