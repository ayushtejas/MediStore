from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection

from .database import engine


ORDER_COLUMN_PATCHES = {
    "customer_name": "customer_name VARCHAR(255)",
    "customer_phone": "customer_phone VARCHAR(64)",
    "customer_address": "customer_address VARCHAR(500)",
    "doctor_name": "doctor_name VARCHAR(255)",
    "doctor_registration": "doctor_registration VARCHAR(128)",
    "prescription_notes": "prescription_notes VARCHAR(500)",
    "payment_method": "payment_method VARCHAR(32) DEFAULT 'cash'",
    "payment_status": "payment_status VARCHAR(32) DEFAULT 'paid' NOT NULL",
    "discount_amount": "discount_amount NUMERIC(10, 2) DEFAULT 0 NOT NULL",
    "bill_discount_amount": "bill_discount_amount NUMERIC(10, 2) DEFAULT 0 NOT NULL",
    "amount_paid": "amount_paid NUMERIC(10, 2) DEFAULT 0 NOT NULL",
    "due_amount": "due_amount NUMERIC(10, 2) DEFAULT 0 NOT NULL",
    "due_reminder_at": "due_reminder_at DATETIME",
    "due_notes": "due_notes VARCHAR(500)",
}

ORDER_ITEM_COLUMN_PATCHES = {
    "discount_amount": "discount_amount NUMERIC(10, 2) DEFAULT 0 NOT NULL",
}

MEDICINE_COLUMN_PATCHES = {
    "image_url": "image_url TEXT",
}

ONLINE_ORDER_COLUMN_PATCHES = {
    "prescription_required": "prescription_required BOOLEAN DEFAULT false NOT NULL",
    "prescription_status": "prescription_status VARCHAR(32) DEFAULT 'not_required' NOT NULL",
    "prescription_review_notes": "prescription_review_notes VARCHAR(500)",
    "prescription_reviewed_at": "prescription_reviewed_at DATETIME",
    "prescription_reviewed_by": "prescription_reviewed_by CHAR(32)",
}


def _apply_order_column_patches_sync(conn: Connection) -> None:
    inspector = inspect(conn)
    table_names = inspector.get_table_names()

    if "medicines" in table_names:
        existing_medicine_columns = {c["name"] for c in inspector.get_columns("medicines")}
        for column_name, ddl in MEDICINE_COLUMN_PATCHES.items():
            if column_name in existing_medicine_columns:
                continue
            conn.execute(text(f"ALTER TABLE medicines ADD COLUMN {ddl}"))

    if "orders" not in table_names:
        return

    existing_columns = {c["name"] for c in inspector.get_columns("orders")}
    for column_name, ddl in ORDER_COLUMN_PATCHES.items():
        if column_name in existing_columns:
            continue
        conn.execute(text(f"ALTER TABLE orders ADD COLUMN {ddl}"))

    if "order_items" in table_names:
        existing_item_columns = {c["name"] for c in inspector.get_columns("order_items")}
        for column_name, ddl in ORDER_ITEM_COLUMN_PATCHES.items():
            if column_name in existing_item_columns:
                continue
            conn.execute(text(f"ALTER TABLE order_items ADD COLUMN {ddl}"))

    if "online_orders" in table_names:
        existing_online_columns = {c["name"] for c in inspector.get_columns("online_orders")}
        for column_name, ddl in ONLINE_ORDER_COLUMN_PATCHES.items():
            if column_name in existing_online_columns:
                continue
            conn.execute(text(f"ALTER TABLE online_orders ADD COLUMN {ddl}"))


async def apply_schema_patches() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(_apply_order_column_patches_sync)
