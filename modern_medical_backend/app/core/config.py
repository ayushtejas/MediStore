from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./medical_store.db"
    redis_url: str = "redis://localhost:6379"
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 30
    bootstrap_on_startup: bool = True
    seed_demo_data: bool = True
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_s3_bucket: str = ""
    aws_region: str = "ap-south-1"

    class Config:
        env_file = ".env"


settings = Settings()
