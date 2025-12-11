import boto3
import json
import logging
from botocore.config import Config
from .config import settings

logger = logging.getLogger(__name__)


def get_s3_client():
    """Get configured S3 client for Minio."""
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=Config(signature_version="s3v4"),
        region_name="us-east-1",
    )


def upload_json(bucket: str, key: str, data: dict) -> bool:
    """Upload JSON data to S3."""
    try:
        client = get_s3_client()
        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=json.dumps(data).encode("utf-8"),
            ContentType="application/json",
        )
        logger.info(f"Uploaded {key} to {bucket}")
        return True
    except Exception as e:
        logger.error(f"Failed to upload to S3: {e}")
        return False


def download_json(bucket: str, key: str) -> dict | None:
    """Download JSON data from S3."""
    try:
        client = get_s3_client()
        response = client.get_object(Bucket=bucket, Key=key)
        data = json.loads(response["Body"].read().decode("utf-8"))
        return data
    except Exception as e:
        logger.error(f"Failed to download from S3: {e}")
        return None
