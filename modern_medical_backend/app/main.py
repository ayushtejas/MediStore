from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth.router import router as auth_router
from .bootstrap import seed_demo_data
from .core.config import settings
from .core.database import Base, engine
from .core.schema_patches import apply_schema_patches
from .users.router import router as users_router
from .inventory.router import router as inventory_router
from .orders.router import router as orders_router
from .settings.router import router as settings_router

app = FastAPI(title="Medical Store API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3210",
        "http://127.0.0.1:3210",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(inventory_router)
app.include_router(orders_router)
app.include_router(settings_router)


@app.on_event("startup")
async def startup():
    if settings.bootstrap_on_startup:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        await apply_schema_patches()
    if settings.seed_demo_data:
        await seed_demo_data()


@app.get("/health")
async def health():
    return {"status": "ok"}
