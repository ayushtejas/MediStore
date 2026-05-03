import uuid
import base64
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select

from .core.database import AsyncSessionLocal
from .core.security import hash_password
from .inventory.models import Inventory, Medicine, Supplier
from .users.models import User, UserRole

DEMO_USERS = [
    {
        "name": "Admin User",
        "email": "admin@medstore.dev",
        "password": "Admin@123",
        "role": UserRole.admin,
    },
    {
        "name": "Staff User",
        "email": "staff@medstore.dev",
        "password": "Staff@123",
        "role": UserRole.staff,
    },
]

DEMO_SUPPLIERS = [
    {"name": "Apollo Pharma Distributors", "contact": "Ankit Sharma", "email": "apollo@supplier.dev"},
    {"name": "Healthline Wholesale", "contact": "Ritika Verma", "email": "healthline@supplier.dev"},
]

DEMO_MEDICINES = [
    {
        "name": "Paracetamol 650",
        "brand": "Dolo",
        "category": "Pain Relief",
        "composition": "Paracetamol 650mg",
        "prescription_required": False,
        "gst_rate": Decimal("12"),
        "low_stock_threshold": 20,
        "batch_number": "DOLO-650-A1",
        "cost_price": Decimal("20"),
        "selling_price": Decimal("32"),
        "quantity_available": 120,
        "supplier_name": "Apollo Pharma Distributors",
    },
    {
        "name": "Azithromycin 500",
        "brand": "Azee",
        "category": "Antibiotic",
        "composition": "Azithromycin 500mg",
        "prescription_required": True,
        "gst_rate": Decimal("12"),
        "low_stock_threshold": 10,
        "batch_number": "AZEE-500-B2",
        "cost_price": Decimal("88"),
        "selling_price": Decimal("112"),
        "quantity_available": 45,
        "supplier_name": "Healthline Wholesale",
    },
    {
        "name": "Cetirizine 10",
        "brand": "Okacet",
        "category": "Allergy",
        "composition": "Cetirizine Hydrochloride 10mg",
        "prescription_required": False,
        "gst_rate": Decimal("12"),
        "low_stock_threshold": 15,
        "batch_number": "OKCT-10-C1",
        "cost_price": Decimal("24"),
        "selling_price": Decimal("38"),
        "quantity_available": 90,
        "supplier_name": "Apollo Pharma Distributors",
    },
    {
        "name": "Pantoprazole 40",
        "brand": "Pantocid",
        "category": "Acidity",
        "composition": "Pantoprazole 40mg",
        "prescription_required": False,
        "gst_rate": Decimal("12"),
        "low_stock_threshold": 18,
        "batch_number": "PNT-40-D4",
        "cost_price": Decimal("58"),
        "selling_price": Decimal("84"),
        "quantity_available": 75,
        "supplier_name": "Healthline Wholesale",
    },
    {
        "name": "Metformin 500",
        "brand": "Glycomet",
        "category": "Diabetes",
        "composition": "Metformin 500mg",
        "prescription_required": True,
        "gst_rate": Decimal("12"),
        "low_stock_threshold": 12,
        "batch_number": "GLY-500-E2",
        "cost_price": Decimal("42"),
        "selling_price": Decimal("61"),
        "quantity_available": 66,
        "supplier_name": "Apollo Pharma Distributors",
    },
]


def _medicine_image_data_url(name: str, category: str) -> str:
    initials = "".join(part[0] for part in name.split()[:2]).upper()
    svg = f"""
    <svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="#dcfce7"/>
          <stop offset="1" stop-color="#cffafe"/>
        </linearGradient>
      </defs>
      <rect width="480" height="360" rx="42" fill="url(#g)"/>
      <rect x="155" y="74" width="170" height="220" rx="34" fill="#ffffff" opacity="0.92"/>
      <rect x="185" y="52" width="110" height="48" rx="16" fill="#0f766e"/>
      <circle cx="240" cy="176" r="52" fill="#10b981" opacity="0.14"/>
      <text x="240" y="188" text-anchor="middle" font-family="Arial" font-size="48" font-weight="800" fill="#047857">{initials}</text>
      <text x="240" y="254" text-anchor="middle" font-family="Arial" font-size="24" font-weight="700" fill="#0f172a">{category}</text>
    </svg>
    """
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


async def seed_demo_data() -> None:
    """Idempotent seed for local/demo runs."""
    async with AsyncSessionLocal() as db:
        existing_users = {
            user.email: user
            for user in (
                await db.execute(select(User).where(User.email.in_([u["email"] for u in DEMO_USERS])))
            ).scalars().all()
        }
        for user_payload in DEMO_USERS:
            if user_payload["email"] in existing_users:
                continue
            db.add(
                User(
                    id=uuid.uuid4(),
                    name=user_payload["name"],
                    email=user_payload["email"],
                    role=user_payload["role"],
                    hashed_pw=hash_password(user_payload["password"]),
                )
            )

        existing_suppliers = {
            supplier.name: supplier
            for supplier in (await db.execute(select(Supplier))).scalars().all()
        }
        for supplier_payload in DEMO_SUPPLIERS:
            if supplier_payload["name"] in existing_suppliers:
                continue
            supplier = Supplier(id=uuid.uuid4(), **supplier_payload)
            db.add(supplier)
            existing_suppliers[supplier.name] = supplier

        existing_medicines = {
            med.name: med for med in (await db.execute(select(Medicine))).scalars().all()
        }
        for med_payload in DEMO_MEDICINES:
            if med_payload["name"] in existing_medicines:
                continue
            medicine = Medicine(
                id=uuid.uuid4(),
                name=med_payload["name"],
                brand=med_payload["brand"],
                category=med_payload["category"],
                image_url=_medicine_image_data_url(med_payload["name"], med_payload["category"]),
                composition=med_payload["composition"],
                prescription_required=med_payload["prescription_required"],
                gst_rate=med_payload["gst_rate"],
                low_stock_threshold=med_payload["low_stock_threshold"],
            )
            db.add(medicine)
            existing_medicines[medicine.name] = medicine

        for med_payload in DEMO_MEDICINES:
            medicine = existing_medicines[med_payload["name"]]
            if not getattr(medicine, "image_url", None):
                medicine.image_url = _medicine_image_data_url(
                    med_payload["name"], med_payload["category"]
                )

        await db.flush()

        existing_batches = {
            (row.medicine_id, row.batch_number): row
            for row in (await db.execute(select(Inventory))).scalars().all()
        }

        expiry_date = date.today() + timedelta(days=365)
        for med_payload in DEMO_MEDICINES:
            medicine = existing_medicines[med_payload["name"]]
            supplier = existing_suppliers[med_payload["supplier_name"]]
            key = (medicine.id, med_payload["batch_number"])
            if key in existing_batches:
                continue

            db.add(
                Inventory(
                    id=uuid.uuid4(),
                    medicine_id=medicine.id,
                    batch_number=med_payload["batch_number"],
                    expiry_date=expiry_date,
                    cost_price=med_payload["cost_price"],
                    selling_price=med_payload["selling_price"],
                    quantity_available=med_payload["quantity_available"],
                    supplier_id=supplier.id,
                )
            )

        await db.commit()
