import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_path: str = os.environ.get("DATABASE_PATH", "./data/snapscope.db")

    # S3/Minio
    s3_endpoint: str = os.environ.get("S3_ENDPOINT", "http://localhost:9000")
    s3_access_key: str = os.environ.get("S3_ACCESS_KEY", "minioadmin")
    s3_secret_key: str = os.environ.get("S3_SECRET_KEY", "minioadmin")
    s3_sbom_bucket: str = os.environ.get("S3_SBOM_BUCKET", "sboms")
    s3_vuln_bucket: str = os.environ.get("S3_VULN_BUCKET", "vulnerabilities")

    # Snap Store
    snap_store_api: str = "https://api.snapcraft.io/v2"

    class Config:
        env_file = ".env"


settings = Settings()
