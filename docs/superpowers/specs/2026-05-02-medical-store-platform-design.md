# Medical Store + E-commerce Platform — Design Spec

**Date:** 2026-05-02  
**Status:** Approved

---

## 1. Overview

A full-stack medical store system covering:

- **Retail POS** — billing, barcode search, auto stock deduction, GST calculation, PDF invoices
- **Inventory management** — batch tracking, FIFO selling, expiry alerts, supplier management
- **E-commerce storefront** — customer browse, cart, Razorpay checkout, order tracking, prescription upload
- **Admin dashboard** — order management, inventory insights, reporting

**Target users:** Store Owner/Admin, POS Staff, Customers (web)

**MVP scope:** Inventory + Billing + Basic E-commerce + Admin dashboard. AI features, advanced analytics, and multi-store support are phase 2.

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router) |
| UI library | shadcn/ui + Tailwind CSS |
| Data fetching | RSC (storefront) + React Query/TanStack Query (POS/admin) |
| Auth | NextAuth.js v5 (Credentials provider) + FastAPI JWT |
| Backend | FastAPI (Python 3.12) |
| ORM | SQLAlchemy 2.x (async) + Alembic |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Payments | Razorpay |
| Background jobs | APScheduler (FastAPI) |
| Dev environment | Docker Compose |
| Testing | pytest + httpx (backend); Jest + RTL (frontend) |

---

## 3. Repository Layout

The project lives in two root folders. The backend will be extracted to its own repository at deploy time.

```
modern_medical_ui/                  ← Next.js frontend repo
├── app/
│   ├── (shop)/                     ← Customer storefront (RSC, SEO)
│   │   ├── page.tsx                ← Homepage / medicine browse
│   │   ├── medicines/[id]/page.tsx
│   │   ├── cart/page.tsx
│   │   └── orders/page.tsx
│   ├── admin/                      ← Admin panel (React Query)
│   │   ├── dashboard/page.tsx
│   │   ├── inventory/page.tsx
│   │   ├── orders/page.tsx
│   │   └── suppliers/page.tsx
│   ├── pos/                        ← POS terminal (React Query)
│   │   └── page.tsx
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts
│   │   └── proxy/[...path]/route.ts  ← BFF proxy to FastAPI
│   └── layout.tsx
├── components/
│   ├── ui/                         ← shadcn generated
│   ├── shop/
│   ├── admin/
│   └── pos/
├── lib/
│   ├── auth.ts                     ← NextAuth config
│   ├── api-client.ts               ← fetch wrapper (server + client)
│   └── query-client.ts             ← TanStack Query provider
├── middleware.ts                   ← Edge route protection
├── .env.local
└── modern_medical_backend/         ← FastAPI backend (own repo at deploy)
    ├── app/
    │   ├── main.py
    │   ├── core/
    │   │   ├── config.py           ← Pydantic settings
    │   │   ├── database.py         ← Async SQLAlchemy session
    │   │   └── security.py         ← JWT issue + verify
    │   ├── inventory/
    │   │   ├── models.py
    │   │   ├── schemas.py
    │   │   ├── router.py
    │   │   └── service.py
    │   ├── orders/
    │   │   └── ... (same pattern)
    │   ├── auth/
    │   ├── users/
    │   └── payments/
    ├── migrations/                 ← Alembic
    ├── docker-compose.yml          ← postgres + redis + api
    ├── Dockerfile
    ├── requirements.txt
    └── .env
```

---

## 4. Auth Flow

### Roles
- `admin` — full access
- `staff` — POS + inventory read
- `customer` — storefront + own orders

### Login sequence (staff/admin and customers share the same flow)

1. User submits credentials on `/login`
2. NextAuth **Credentials provider** calls `POST /auth/login` on FastAPI
3. FastAPI verifies password hash (bcrypt), returns `{ access_token, role, user_id }`
4. NextAuth stores token + role in an **encrypted session cookie** (HTTP-only)
5. All React Query mutations go through `/api/[...proxy]` — the BFF reads the session server-side and attaches `Authorization: Bearer <token>` before forwarding to FastAPI
6. FastAPI never receives direct browser requests

### Route protection (`middleware.ts`)

```
/admin/*       → requires role: admin
/pos/*         → requires role: admin | staff
/(shop)/orders → requires role: customer
/(shop)/cart   → requires role: customer
```

Unauthenticated requests redirect to `/login`.

---

## 5. Data Models

### Inventory domain

```
Medicine
  id                    UUID PK
  name                  TEXT NOT NULL
  composition           TEXT
  brand                 TEXT
  category              TEXT
  prescription_required BOOLEAN DEFAULT false
  gst_rate              NUMERIC(5,2) DEFAULT 12.00  -- GST % per Indian tax law
  low_stock_threshold   INTEGER DEFAULT 10           -- alert when qty falls below
  created_at            TIMESTAMPTZ

Inventory  (one row per batch)
  id                UUID PK
  medicine_id       UUID FK → Medicine
  batch_number      TEXT NOT NULL
  expiry_date       DATE NOT NULL
  cost_price        NUMERIC(10,2)
  selling_price     NUMERIC(10,2)
  quantity_available INTEGER DEFAULT 0
  supplier_id       UUID FK → Supplier
  created_at        TIMESTAMPTZ

Supplier
  id       UUID PK
  name     TEXT NOT NULL
  contact  TEXT
  email    TEXT
```

### Orders domain

```
Order
  id           UUID PK
  type         ENUM('offline','online')
  user_id      UUID FK → User (nullable for offline)
  total_amount NUMERIC(10,2)
  tax_amount   NUMERIC(10,2)
  status       ENUM('pending','confirmed','packed','dispatched','delivered','cancelled')
  created_at   TIMESTAMPTZ

OrderItem
  id          UUID PK
  order_id    UUID FK → Order
  medicine_id UUID FK → Medicine
  batch_id    UUID FK → Inventory
  quantity    INTEGER
  unit_price  NUMERIC(10,2)

InventoryLog  (audit trail)
  id            UUID PK
  inventory_id  UUID FK → Inventory
  change_qty    INTEGER   (negative = deduction)
  reason        TEXT
  order_id      UUID FK → Order (nullable)
  created_at    TIMESTAMPTZ
```

### E-commerce domain

```
User
  id          UUID PK
  name        TEXT
  email       TEXT UNIQUE NOT NULL
  phone       TEXT
  address     JSONB
  role        ENUM('admin','staff','customer') DEFAULT 'customer'
  hashed_pw   TEXT NOT NULL
  created_at  TIMESTAMPTZ

CartItem
  id          UUID PK
  user_id     UUID FK → User
  medicine_id UUID FK → Medicine
  quantity    INTEGER

OnlineOrder  (extends Order)
  order_id          UUID FK → Order PK
  payment_status    ENUM('pending','paid','failed')
  razorpay_order_id TEXT
  delivery_address  JSONB
  prescription_url  TEXT (nullable, S3 key)
```

---

## 6. API Endpoints (FastAPI)

### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | — | Email + password → JWT |
| POST | `/auth/refresh` | JWT | Refresh access token |

### Medicines & Inventory
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/medicines` | — | Search by name/brand/composition, filter stock/expiry |
| POST | `/medicines` | admin | Create medicine |
| GET | `/medicines/{id}` | — | Medicine detail |
| PATCH | `/medicines/{id}` | admin | Update medicine |
| POST | `/inventory/add` | admin/staff | Add batch |
| PATCH | `/inventory/{id}` | admin/staff | Update batch quantity |
| GET | `/inventory/alerts` | admin/staff | Low stock + expiring ≤30 days |
| GET | `/suppliers` | admin/staff | List suppliers |
| POST | `/suppliers` | admin | Create supplier |

### Orders & Billing
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/orders` | admin/staff | Create offline order |
| POST | `/orders/{id}/items` | admin/staff | Add item (validates + reserves stock) |
| POST | `/orders/{id}/complete` | admin/staff | Finalise — deducts inventory in transaction |
| GET | `/orders` | admin | List all orders with filters |
| PATCH | `/orders/{id}/status` | admin | Update order status |

### Cart & Checkout
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/cart` | customer | Get current cart |
| POST | `/cart/items` | customer | Add item |
| PATCH | `/cart/items/{id}` | customer | Update quantity |
| DELETE | `/cart/items/{id}` | customer | Remove item |
| POST | `/checkout` | customer | Create OnlineOrder → Razorpay order |

### Payments
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/payments/create` | customer | Create Razorpay order |
| POST | `/payments/verify` | customer | Verify signature → confirm order + deduct stock |

### Prescriptions
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/prescriptions/upload-url` | customer | Returns presigned S3 URL; frontend uploads directly to S3, then saves key to OnlineOrder |

---

## 7. Inventory Sync (Critical Path)

All stock deductions happen inside a single database transaction:

```
BEGIN
  SELECT inventory WHERE id = batch_id FOR UPDATE  -- row lock
  IF quantity_available < requested_qty → RAISE error
  UPDATE inventory SET quantity_available = quantity_available - qty
  IF quantity_available = 0 → mark out_of_stock
  INSERT inventory_log (change_qty = -qty, reason, order_id)
COMMIT
```

This prevents overselling under concurrent requests.

**FIFO batch selection:** When auto-selecting a batch for an order item, the service queries:
```sql
SELECT * FROM inventory
WHERE medicine_id = :id AND quantity_available > 0 AND expiry_date > NOW()
ORDER BY expiry_date ASC
LIMIT 1
```

---

## 8. Background Jobs (APScheduler)

| Job | Schedule | Action |
|-----|----------|--------|
| Expiry alert | Daily 08:00 | Find batches expiring within 30 days → notify admin |
| Low stock alert | Daily 08:00 | Find batches with qty < threshold → notify admin |
| Invoice generation | On order complete | Generate PDF (WeasyPrint), upload to S3 |

---

## 9. BFF Proxy (Next.js)

`app/api/proxy/[...path]/route.ts` — catches all `/api/proxy/*` calls from React Query, reads the NextAuth session cookie server-side, forwards the request to FastAPI with the Bearer token attached. Sits at `/api/proxy/*` to avoid conflicting with NextAuth's own `/api/auth/*` handler.

```
Client → POST /api/proxy/orders/complete
  → BFF reads session (token, role)
  → forward to FastAPI POST /orders/complete
    with Authorization: Bearer <token>
  → return FastAPI response to client
```

This means FastAPI is only reachable from the Next.js server process, not from the public internet.

---

## 10. Frontend Data Fetching

| Section | Pattern | Why |
|---------|---------|-----|
| `(shop)/*` storefront | Server Components + server `fetch` | SSR for SEO, no JS overhead |
| `admin/*` dashboard | React Query via BFF | Mutation-heavy, real-time table updates |
| `pos/*` terminal | React Query via BFF | Optimistic cart, fast search |

---

## 11. Docker Compose (local dev)

`modern_medical_backend/docker-compose.yml` brings up:
- `postgres:16` on port 5432
- `redis:7` on port 6379
- `fastapi` on port 8000 (hot-reload via `uvicorn --reload`)

Frontend runs separately with `npm run dev` (port 3000), pointing to `http://localhost:8000` via the BFF proxy.

---

## 12. Out of Scope (Phase 2)

- AI recommendations / demand forecasting
- Advanced analytics
- Multi-store support
- Mobile app (React Native)
- Elasticsearch upgrade
- Barcode scanner hardware integration
- Multi-factor authentication
