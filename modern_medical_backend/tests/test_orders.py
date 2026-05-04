import uuid
import re
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import insert, select

from app.core.security import hash_password, create_access_token
from app.inventory.models import Inventory, Medicine
from app.orders.models import Order, OrderItem, OrderStatus, OrderType
from app.orders.router import (
    _fallback_invoice_pdf,
    _invoice_html,
    _pdf_text_width,
    _pdf_trim_to_width,
)
from app.users.models import User


async def _make_user(db, role: str = "staff"):
    uid = uuid.uuid4()
    email = f"{role}_{uid}@test.com"
    await db.execute(
        insert(User).values(
            id=uid,
            name=role.capitalize(),
            email=email,
            hashed_pw=hash_password("s"),
            role=role,
        )
    )
    await db.commit()
    token = create_access_token({"sub": str(uid), "role": role, "email": email})
    return uid, token


def test_invoice_html_uses_print_stable_report_layout():
    order = SimpleNamespace(
        id=uuid.uuid4(),
        type=OrderType.offline,
        status=OrderStatus.confirmed,
        customer_name="Aarav Mehta",
        customer_phone="+91 99999 00000",
        customer_address="221 Wellness Street, Bandra West, Mumbai",
        doctor_name="Dr. Rao",
        doctor_registration="MMC-12345",
        prescription_notes="After food",
        payment_method="upi",
        total_amount=Decimal("240.00"),
        tax_amount=Decimal("28.80"),
        created_at=date.today(),
        online_order=None,
    )
    item = SimpleNamespace(quantity=2, unit_price=Decimal("120.00"))
    medicine = SimpleNamespace(
        name="Paracetamol 650",
        composition="Paracetamol IP 650mg",
        brand="Calpol",
        category="Fever & Pain",
        gst_rate=Decimal("12.00"),
    )

    html = _invoice_html(order, [(item, medicine)])

    assert "<colgroup>" in html
    assert "GST %" in html
    assert "PHARMACY TAX BILL" in html
    assert "display: flex" not in html
    assert "display: grid" not in html


def test_fallback_invoice_pdf_registers_bold_font_resource():
    order = SimpleNamespace(
        id=uuid.uuid4(),
        type=OrderType.offline,
        status=OrderStatus.confirmed,
        customer_name="Aarav Mehta",
        customer_phone="+91 99999 00000",
        customer_address="221 Wellness Street, Bandra West, Mumbai",
        doctor_name=None,
        doctor_registration=None,
        prescription_notes=None,
        payment_method="cash",
        total_amount=Decimal("100.00"),
        tax_amount=Decimal("12.00"),
        created_at=date.today(),
        online_order=None,
    )
    item = SimpleNamespace(quantity=1, unit_price=Decimal("100.00"))
    medicine = SimpleNamespace(
        name="Paracetamol 650",
        composition="Paracetamol IP 650mg",
        brand="Calpol",
        category="Fever & Pain",
        gst_rate=Decimal("12.00"),
    )

    pdf = _fallback_invoice_pdf(order, [(item, medicine)])

    assert pdf.startswith(b"%PDF-1.4")
    assert b"/F2 6 0 R" in pdf
    assert b"/Helvetica-Bold" in pdf
    assert b"PHARMACY TAX INVOICE" not in pdf
    assert b"PHARMACY TAX BILL" in pdf


def test_fallback_invoice_pdf_keeps_due_reminders_internal():
    order = SimpleNamespace(
        id=uuid.uuid4(),
        type=OrderType.offline,
        status=OrderStatus.confirmed,
        customer_name="Due Customer",
        customer_phone="+91 99999 00000",
        customer_address="Market Road",
        doctor_name=None,
        doctor_registration=None,
        prescription_notes=None,
        payment_method="cash",
        payment_status="due",
        amount_paid=Decimal("0.00"),
        due_amount=Decimal("112.00"),
        due_reminder_at="2026-05-04 09:18:00",
        total_amount=Decimal("100.00"),
        tax_amount=Decimal("12.00"),
        bill_discount_amount=Decimal("0.00"),
        created_at=date.today(),
        online_order=None,
    )
    item = SimpleNamespace(quantity=1, unit_price=Decimal("100.00"))
    medicine = SimpleNamespace(
        name="Paracetamol 650",
        composition="Paracetamol IP 650mg",
        brand="Calpol",
        category="Fever & Pain",
        gst_rate=Decimal("12.00"),
    )

    pdf = _fallback_invoice_pdf(order, [(item, medicine)])

    assert b"Status: DUE" in pdf
    assert b"Reminder:" not in pdf
    assert b"2026-05-04 09:18:00" not in pdf


def test_pdf_text_trimming_keeps_values_inside_column_width():
    fitted = _pdf_trim_to_width("PHARMACY TAX BILL", 15, 85, "F2")

    assert fitted.endswith("...")
    assert fitted != "PHARMACY TAX BILL"


def test_fallback_invoice_pdf_text_stays_inside_page_bounds():
    order = SimpleNamespace(
        id=uuid.UUID("5f51cfcb-4d45-4428-88f4-02a4d6577712"),
        type=OrderType.online,
        status=OrderStatus.confirmed,
        customer_name="r34",
        customer_phone="1243124231",
        customer_address="q32, dde, Landmark: fae, qr34, Bihar 24",
        doctor_name=None,
        doctor_registration=None,
        prescription_notes=None,
        payment_method="upi",
        total_amount=Decimal("122.00"),
        tax_amount=Decimal("14.64"),
        created_at=date.today(),
        online_order=SimpleNamespace(payment_status="paid"),
    )
    rows = [
        (
            SimpleNamespace(quantity=1, unit_price=Decimal("38.00")),
            SimpleNamespace(
                name="Cetirizine 10",
                composition="Cetirizine Hydrochloride 10mg",
                brand="Okacet",
                category="Allergy",
                gst_rate=Decimal("12.00"),
            ),
        ),
        (
            SimpleNamespace(quantity=1, unit_price=Decimal("84.00")),
            SimpleNamespace(
                name="Pantoprazole 40",
                composition="Pantoprazole 40mg",
                brand="Pantocid",
                category="Digestive Health",
                gst_rate=Decimal("12.00"),
            ),
        ),
    ]

    content = _fallback_invoice_pdf(order, rows).decode("latin-1", errors="ignore")
    text_ops = re.findall(
        r"BT /(F[12]) (\d+) Tf 1 0 0 1 ([\d.]+) ([\d.]+) Tm \((.*?)\) Tj ET",
        content,
    )

    assert text_ops
    for font, size, x, _y, value in text_ops:
        right_edge = float(x) + _pdf_text_width(value, int(size), font)
        assert right_edge <= 559.5, value


def test_fallback_invoice_pdf_rate_and_amount_columns_do_not_overlap():
    order = SimpleNamespace(
        id=uuid.UUID("5f51cfcb-4d45-4428-88f4-02a4d6577712"),
        type=OrderType.online,
        status=OrderStatus.confirmed,
        customer_name="r34",
        customer_phone="1243124231",
        customer_address="q32, dde, Landmark: fae, qr34, Bihar 24",
        doctor_name=None,
        doctor_registration=None,
        prescription_notes=None,
        payment_method="upi",
        total_amount=Decimal("38.00"),
        tax_amount=Decimal("4.56"),
        created_at=date.today(),
        online_order=SimpleNamespace(payment_status="paid"),
    )
    rows = [
        (
            SimpleNamespace(quantity=1, unit_price=Decimal("38.00")),
            SimpleNamespace(
                name="Cetirizine 10",
                composition="Cetirizine Hydrochloride 10mg",
                brand="Okacet",
                category="Allergy",
                gst_rate=Decimal("12.00"),
            ),
        )
    ]

    content = _fallback_invoice_pdf(order, rows).decode("latin-1", errors="ignore")
    text_ops = re.findall(
        r"BT /(F[12]) (\d+) Tf 1 0 0 1 ([\d.]+) ([\d.]+) Tm \((.*?)\) Tj ET",
        content,
    )
    rate_op = next(op for op in text_ops if op[4] == "Rs 38.00")
    amount_op = next(op for op in text_ops if op[4] == "Rs 42.56")
    rate_right = float(rate_op[2]) + _pdf_text_width(rate_op[4], int(rate_op[1]), rate_op[0])
    amount_left = float(amount_op[2])

    assert rate_right <= amount_left - 8


def test_fallback_invoice_pdf_wraps_long_item_text_instead_of_truncating():
    order = SimpleNamespace(
        id=uuid.uuid4(),
        type=OrderType.offline,
        status=OrderStatus.confirmed,
        customer_name="Long Name Customer",
        customer_phone="9999999999",
        customer_address="Very long apartment address near a landmark and city",
        doctor_name=None,
        doctor_registration=None,
        prescription_notes=None,
        payment_method="cash",
        total_amount=Decimal("99.00"),
        tax_amount=Decimal("11.88"),
        created_at=date.today(),
        online_order=None,
    )
    rows = [
        (
            SimpleNamespace(quantity=1, unit_price=Decimal("99.00")),
            SimpleNamespace(
                name="Very Long Multivitamin Immune Support Tablet Extra Strength",
                composition="Vitamin C Zinc Selenium B12 D3 with botanical extract",
                brand="VeryLongBrandName",
                category="Wellness",
                gst_rate=Decimal("12.00"),
            ),
        )
    ]

    content = _fallback_invoice_pdf(order, rows).decode("latin-1", errors="ignore")

    assert "Very Long Multivitamin Immune Support" in content
    assert "Tablet Extra Strength" in content
    assert "Very Long Multivitamin Immune Support Tablet..." not in content


@pytest.mark.asyncio
async def test_complete_order_deducts_stock(client, db):
    uid, token = await _make_user(db, "staff")

    med_id = uuid.uuid4()
    batch_id = uuid.uuid4()
    await db.execute(
        insert(Medicine).values(
            id=med_id, name="TestMed", gst_rate=Decimal("12.0"), low_stock_threshold=5
        )
    )
    await db.execute(
        insert(Inventory).values(
            id=batch_id,
            medicine_id=med_id,
            batch_number="B001",
            expiry_date=date.today() + timedelta(days=180),
            selling_price=Decimal("100.00"),
            cost_price=Decimal("70.00"),
            quantity_available=10,
        )
    )
    await db.commit()

    # Create order
    resp = await client.post(
        "/orders",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "offline"},
    )
    assert resp.status_code == 201
    order_id = resp.json()["id"]

    # Add item
    resp2 = await client.post(
        f"/orders/{order_id}/items",
        headers={"Authorization": f"Bearer {token}"},
        json={"medicine_id": str(med_id), "quantity": 3},
    )
    assert resp2.status_code == 201

    # Complete order
    resp3 = await client.post(
        f"/orders/{order_id}/complete",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp3.status_code == 200
    data = resp3.json()
    assert data["status"] == "confirmed"

    # Verify stock was deducted
    result = await db.execute(select(Inventory).where(Inventory.id == batch_id))
    batch = result.scalar_one()
    assert batch.quantity_available == 7


@pytest.mark.asyncio
async def test_complete_order_tracks_discounts_partial_payment_and_due_reminder(client, db):
    _, token = await _make_user(db, "staff")

    med_id = uuid.uuid4()
    batch_id = uuid.uuid4()
    await db.execute(
        insert(Medicine).values(
            id=med_id,
            name="DiscountMed",
            gst_rate=Decimal("10.0"),
            low_stock_threshold=5,
        )
    )
    await db.execute(
        insert(Inventory).values(
            id=batch_id,
            medicine_id=med_id,
            batch_number="DISC-1",
            expiry_date=date.today() + timedelta(days=180),
            selling_price=Decimal("100.00"),
            cost_price=Decimal("70.00"),
            quantity_available=10,
        )
    )
    await db.commit()

    reminder_at = "2026-05-10T10:30:00+05:30"
    order_resp = await client.post(
        "/orders",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "type": "offline",
            "payment_method": "upi",
            "bill_discount_amount": "10.00",
            "amount_paid": "100.00",
            "payment_status": "partially_paid",
            "due_reminder_at": reminder_at,
            "due_notes": "Call customer before closing day.",
        },
    )
    assert order_resp.status_code == 201
    order_id = order_resp.json()["id"]

    item_resp = await client.post(
        f"/orders/{order_id}/items",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "medicine_id": str(med_id),
            "quantity": 2,
            "discount_amount": "20.00",
        },
    )
    assert item_resp.status_code == 201
    assert item_resp.json()["discount_amount"] == "20.00"

    complete_resp = await client.post(
        f"/orders/{order_id}/complete",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert complete_resp.status_code == 200
    data = complete_resp.json()

    assert data["total_amount"] == "180.00"
    assert data["tax_amount"] == "18.00"
    assert data["bill_discount_amount"] == "10.00"
    assert data["discount_amount"] == "30.00"
    assert data["amount_paid"] == "100.00"
    assert data["due_amount"] == "88.00"
    assert data["payment_status"] == "partially_paid"
    assert data["due_reminder_at"].startswith("2026-05-10T10:30:00")
    assert data["due_notes"] == "Call customer before closing day."

    result = await db.execute(select(Inventory).where(Inventory.id == batch_id))
    batch = result.scalar_one()
    assert batch.quantity_available == 8


@pytest.mark.asyncio
async def test_order_payment_patch_recalculates_due_state(client, db):
    _, token = await _make_user(db, "staff")

    med_id = uuid.uuid4()
    await db.execute(
        insert(Medicine).values(
            id=med_id,
            name="DueMed",
            gst_rate=Decimal("0.0"),
            low_stock_threshold=5,
        )
    )
    await db.execute(
        insert(Inventory).values(
            id=uuid.uuid4(),
            medicine_id=med_id,
            batch_number="DUE-1",
            expiry_date=date.today() + timedelta(days=180),
            selling_price=Decimal("50.00"),
            cost_price=Decimal("30.00"),
            quantity_available=5,
        )
    )
    await db.commit()

    order_resp = await client.post(
        "/orders",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "offline"},
    )
    order_id = order_resp.json()["id"]
    await client.post(
        f"/orders/{order_id}/items",
        headers={"Authorization": f"Bearer {token}"},
        json={"medicine_id": str(med_id), "quantity": 2},
    )
    complete_resp = await client.post(
        f"/orders/{order_id}/complete",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert complete_resp.status_code == 200
    assert complete_resp.json()["payment_status"] == "paid"

    patch_resp = await client.patch(
        f"/orders/{order_id}/payment",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "amount_paid": "40.00",
            "payment_status": "partially_paid",
            "due_reminder_at": "2026-05-12T09:00:00+05:30",
            "due_notes": "Reminder set by owner.",
        },
    )
    assert patch_resp.status_code == 200
    patched = patch_resp.json()
    assert patched["amount_paid"] == "40.00"
    assert patched["due_amount"] == "60.00"
    assert patched["payment_status"] == "partially_paid"
    assert patched["due_notes"] == "Reminder set by owner."


@pytest.mark.asyncio
async def test_cart_flow(client, db):
    uid, token = await _make_user(db, "customer")

    med_id = uuid.uuid4()
    await db.execute(
        insert(Medicine).values(
            id=med_id,
            name="CartMed",
            gst_rate=Decimal("12.0"),
            low_stock_threshold=5,
        )
    )
    await db.execute(
        insert(Inventory).values(
            id=uuid.uuid4(),
            medicine_id=med_id,
            batch_number="CART-1",
            quantity_available=10,
            cost_price=Decimal("10.0"),
            selling_price=Decimal("15.0"),
            expiry_date=date.today() + timedelta(days=120),
        )
    )
    await db.commit()

    # Add to cart
    add_resp = await client.post(
        "/cart/items",
        headers={"Authorization": f"Bearer {token}"},
        json={"medicine_id": str(med_id), "quantity": 2},
    )
    assert add_resp.status_code == 201
    item_id = add_resp.json()["id"]

    # Get cart
    cart_resp = await client.get("/cart", headers={"Authorization": f"Bearer {token}"})
    assert cart_resp.status_code == 200
    assert len(cart_resp.json()) >= 1

    # Update quantity
    patch_resp = await client.patch(
        f"/cart/items/{item_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"quantity": 5},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["quantity"] == 5

    # Delete item
    del_resp = await client.delete(
        f"/cart/items/{item_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert del_resp.status_code == 204


@pytest.mark.asyncio
async def test_order_status_update(client, db):
    _, staff_token = await _make_user(db, "staff")

    resp = await client.post(
        "/orders",
        headers={"Authorization": f"Bearer {staff_token}"},
        json={"type": "offline"},
    )
    order_id = resp.json()["id"]

    status_resp = await client.patch(
        f"/orders/{order_id}/status",
        headers={"Authorization": f"Bearer {staff_token}"},
        json={"status": "packed"},
    )
    assert status_resp.status_code == 200
    assert status_resp.json()["status"] == "packed"


@pytest.mark.asyncio
async def test_list_orders(client, db):
    _, staff_token = await _make_user(db, "staff")
    resp = await client.get("/orders", headers={"Authorization": f"Bearer {staff_token}"})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
