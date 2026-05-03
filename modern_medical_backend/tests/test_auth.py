import uuid

import pytest
from sqlalchemy import insert

from app.core.security import hash_password
from app.users.models import User


@pytest.mark.asyncio
async def test_login_success(client, db):
    await db.execute(
        insert(User).values(
            id=uuid.uuid4(),
            name="Admin",
            email="admin@test.com",
            hashed_pw=hash_password("secret"),
            role="admin",
        )
    )
    await db.commit()

    resp = await client.post(
        "/auth/login", json={"email": "admin@test.com", "password": "secret"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["role"] == "admin"
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(client, db):
    resp = await client.post(
        "/auth/login", json={"email": "admin@test.com", "password": "wrong"}
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_email(client, db):
    resp = await client.post(
        "/auth/login", json={"email": "nobody@test.com", "password": "secret"}
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token(client, db):
    uid = uuid.uuid4()
    email = f"refresh_{uid}@test.com"
    await db.execute(
        insert(User).values(
            id=uid,
            name="Refresh User",
            email=email,
            hashed_pw=hash_password("pass"),
            role="customer",
        )
    )
    await db.commit()

    login_resp = await client.post(
        "/auth/login", json={"email": email, "password": "pass"}
    )
    token = login_resp.json()["access_token"]

    refresh_resp = await client.post(
        "/auth/refresh", headers={"Authorization": f"Bearer {token}"}
    )
    assert refresh_resp.status_code == 200
    assert "access_token" in refresh_resp.json()
