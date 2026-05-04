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
    desktop_license_key_hash: str = "97935e441b1fab473c866cde6b362bb4834b8034f4ffebc1c38ea5be0a2ed6e1"
    desktop_license_duration_days: int = 730

    class Config:
        env_file = ".env"


settings = Settings()
