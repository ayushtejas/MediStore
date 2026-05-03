import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import insert

from app.core.security import hash_password, create_access_token
from app.inventory.models import Inventory, Medicine
from app.users.models import User


@pytest.fixture
async def admin_token(db):
    user_id = uuid.uuid4()
    email = f"inv_admin_{user_id}@test.com"
    await db.execute(
        insert(User).values(
            id=user_id,
            name="Admin",
            email=email,
            hashed_pw=hash_password("secret"),
            role="admin",
        )
    )
    await db.commit()
    return create_access_token({"sub": str(user_id), "role": "admin", "email": email})


@pytest.mark.asyncio
async def test_create_medicine(client, admin_token):
    resp = await client.post(
        "/medicines",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Paracetamol",
            "brand": "Calpol",
            "category": "Analgesic",
            "gst_rate": 12.0,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Paracetamol"
    assert data["brand"] == "Calpol"
    assert "id" in data


@pytest.mark.asyncio
async def test_create_medicine_with_opening_stock_returns_metrics(client, admin_token):
    resp = await client.post(
        "/medicines",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Opening Stock Med",
            "brand": "BatchCo",
            "category": "Debug",
            "gst_rate": 12.0,
            "opening_batch_number": "OPEN001",
            "opening_expiry_date": str(date.today() + timedelta(days=365)),
            "opening_cost_price": "40.00",
            "opening_selling_price": "65.00",
            "opening_quantity_available": 25,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["selling_price"] == "65.00"
    assert data["stock_available"] == 25

    inventory_resp = await client.get(
        f"/inventory?medicine_id={data['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert inventory_resp.status_code == 200
    batches = inventory_resp.json()
    assert len(batches) == 1
    assert batches[0]["batch_number"] == "OPEN001"
    assert batches[0]["quantity_available"] == 25


@pytest.mark.asyncio
async def test_search_medicines(client):
    resp = await client.get("/medicines?q=Paracetamol")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_get_medicine_not_found(client):
    resp = await client.get(f"/medicines/{uuid.uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_patch_medicine(client, admin_token):
    # Create first
    create_resp = await client.post(
        "/medicines",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"name": "Ibuprofen", "gst_rate": 12.0},
    )
    med_id = create_resp.json()["id"]

    patch_resp = await client.patch(
        f"/medicines/{med_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"brand": "Brufen"},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["brand"] == "Brufen"


@pytest.mark.asyncio
async def test_add_inventory(client, admin_token, db):
    # Create a medicine first
    med_id = uuid.uuid4()
    await db.execute(
        insert(Medicine).values(
            id=med_id,
            name="TestMed",
            gst_rate=Decimal("12.00"),
            low_stock_threshold=5,
        )
    )
    await db.commit()

    resp = await client.post(
        "/inventory/add",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "medicine_id": str(med_id),
            "batch_number": "BATCH001",
            "expiry_date": str(date.today() + timedelta(days=365)),
            "cost_price": "50.00",
            "selling_price": "75.00",
            "quantity_available": 100,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["batch_number"] == "BATCH001"
    assert data["quantity_available"] == 100


@pytest.mark.asyncio
async def test_delete_medicine_removes_unsold_batches(client, admin_token, db):
    med_id = uuid.uuid4()
    await db.execute(
        insert(Medicine).values(
            id=med_id,
            name="DeleteMed",
            gst_rate=Decimal("12.00"),
            low_stock_threshold=5,
        )
    )
    await db.execute(
        insert(Inventory).values(
            id=uuid.uuid4(),
            medicine_id=med_id,
            batch_number="DEL001",
            expiry_date=date.today() + timedelta(days=365),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("9.00"),
            quantity_available=4,
        )
    )
    await db.commit()

    resp = await client.delete(
        f"/medicines/{med_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 204

    get_resp = await client.get(f"/medicines/{med_id}")
    assert get_resp.status_code == 404

    inventory_resp = await client.get(
        f"/inventory?medicine_id={med_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert inventory_resp.status_code == 200
    assert inventory_resp.json() == []


@pytest.mark.asyncio
async def test_delete_unsold_inventory_batch(client, admin_token, db):
    med_id = uuid.uuid4()
    batch_id = uuid.uuid4()
    await db.execute(
        insert(Medicine).values(
            id=med_id,
            name="BatchDeleteMed",
            gst_rate=Decimal("12.00"),
            low_stock_threshold=5,
        )
    )
    await db.execute(
        insert(Inventory).values(
            id=batch_id,
            medicine_id=med_id,
            batch_number="BDEL001",
            expiry_date=date.today() + timedelta(days=365),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("9.00"),
            quantity_available=4,
        )
    )
    await db.commit()

    resp = await client.delete(
        f"/inventory/{batch_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 204

    inventory_resp = await client.get(
        f"/inventory?medicine_id={med_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert inventory_resp.status_code == 200
    assert inventory_resp.json() == []


@pytest.mark.asyncio
async def test_create_supplier(client, admin_token):
    resp = await client.post(
        "/suppliers",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"name": "PharmaCorp", "contact": "+91-9876543210", "email": "pharma@corp.com"},
    )
    assert resp.status_code == 201
    assert resp.json()["name"] == "PharmaCorp"


@pytest.mark.asyncio
async def test_inventory_alerts(client, admin_token, db):
    med_id = uuid.uuid4()
    await db.execute(
        insert(Medicine).values(
            id=med_id, name="AlertMed", gst_rate=Decimal("12.00"), low_stock_threshold=50
        )
    )
    # Add a batch with low stock
    await db.execute(
        insert(Inventory).values(
            id=uuid.uuid4(),
            medicine_id=med_id,
            batch_number="LOW001",
            expiry_date=date.today() + timedelta(days=90),
            cost_price=Decimal("10.00"),
            selling_price=Decimal("15.00"),
            quantity_available=3,
        )
    )
    await db.commit()

    resp = await client.get(
        "/inventory/alerts",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "low_stock_alerts" in body
    assert "expiry_alerts" in body
