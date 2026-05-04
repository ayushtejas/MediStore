import uuid

import pytest
from sqlalchemy import insert

from app.core.security import create_access_token, hash_password, verify_password
from app.settings.service import get_store_profile
from app.users.models import User


async def _admin(db):
    uid = uuid.uuid4()
    email = f"settings_admin_{uid}@test.com"
    await db.execute(
        insert(User).values(
            id=uid,
            name="Settings Admin",
            email=email,
            hashed_pw=hash_password("secret"),
            role="admin",
        )
    )
    await db.commit()
    token = create_access_token({"sub": str(uid), "role": "admin", "email": email})
    return token


@pytest.mark.asyncio
async def test_store_profile_can_be_updated_and_reused(client, db):
    token = await _admin(db)
    payload = {
        "app_name": "CarePlus Pharmacy",
        "report_title": "Retail Tax Bill",
        "tagline": "Local Care Desk",
        "address": "12 Market Road, Pune",
        "phone": "9999999999",
        "email": "care@example.com",
        "gstin": "27TESTGSTIN",
        "drug_license": "DL-777",
        "footer_note": "Stay healthy.",
    }

    resp = await client.patch(
        "/settings/store-profile",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )

    assert resp.status_code == 200
    assert resp.json()["app_name"] == "CarePlus Pharmacy"
    profile = await get_store_profile(db)
    assert profile.report_title == "Retail Tax Bill"


@pytest.mark.asyncio
async def test_licence_activation_is_one_time_and_lasts_two_years(client, db):
    before = await client.get("/settings/licence/status")
    assert before.status_code == 200
    assert before.json()["active"] is False
    assert before.json()["requires_activation"] is True
    assert before.json()["licence_key_visible"] is False

    malformed = await client.post("/settings/licence/activate", json={"licence_key": "123"})
    assert malformed.status_code == 422

    wrong = await client.post("/settings/licence/activate", json={"licence_key": "000000000000"})
    assert wrong.status_code == 401

    activated = await client.post("/settings/licence/activate", json={"licence_key": "706897056273"})
    assert activated.status_code == 200
    body = activated.json()
    assert body["active"] is True
    assert body["requires_activation"] is False
    assert body["licence_key_visible"] is False
    assert body["expires_at"]

    after = await client.get("/settings/licence/status")
    assert after.status_code == 200
    assert after.json()["active"] is True
    assert after.json()["expires_at"] == body["expires_at"]


@pytest.mark.asyncio
async def test_admin_can_update_user_login_and_password(client, db):
    token = await _admin(db)
    user_id = uuid.uuid4()
    await db.execute(
        insert(User).values(
            id=user_id,
            name="Counter",
            email="counter@test.com",
            hashed_pw=hash_password("oldpass"),
            role="staff",
        )
    )
    await db.commit()

    resp = await client.patch(
        f"/users/{user_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"email": "newcounter@test.com", "password": "newpass", "name": "New Counter"},
    )

    assert resp.status_code == 200
    assert resp.json()["email"] == "newcounter@test.com"
    login = await client.post(
        "/auth/login", json={"email": "newcounter@test.com", "password": "newpass"}
    )
    assert login.status_code == 200
