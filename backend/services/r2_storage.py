import io
import boto3
import logging
from botocore.config import Config as BotoConfig
from config import Config
from fastapi import HTTPException
from services.observability import log_failure

logger = logging.getLogger(__name__)


class R2Service:
    def __init__(self):
        self.bucket = Config.R2_BUCKET
        self.public_url = Config.R2_PUBLIC_URL
        self.s3_client = None
        if all((Config.R2_ENDPOINT, Config.R2_ID, Config.R2_SECRET, self.bucket)):
            self.s3_client = boto3.client(
                's3', endpoint_url=Config.R2_ENDPOINT,
                aws_access_key_id=Config.R2_ID, aws_secret_access_key=Config.R2_SECRET,
                region_name='auto', config=BotoConfig(connect_timeout=5, read_timeout=15, retries={'max_attempts': 1}),
            )

    def write_image(self, key, image_data, mime_type):
        try:
            self.s3_client.upload_fileobj(io.BytesIO(image_data), self.bucket, key, ExtraArgs={'ContentType': mime_type})
        except Exception as error:
            log_failure(logger, 'storage.write', error)
            raise HTTPException(503, 'Image storage is unavailable') from None

    def read_image(self, key):
        from services.image_security import validate_image
        if not Config.R2_PRIVATE_BUCKET_CONFIRMED or not self.s3_client:
            raise HTTPException(503, 'Private image storage is not configured')
        body = None
        try:
            result = self.s3_client.get_object(Bucket=self.bucket, Key=key)
            body = result['Body']
            content = body.read(Config.MAX_IMAGE_BYTES + 1)
            return content, validate_image(content, result.get('ContentType'))
        except HTTPException:
            raise
        except Exception as error:
            log_failure(logger, 'storage.read', error)
            raise HTTPException(503, 'Image storage is unavailable') from None
        finally:
            if body is not None:
                body.close()
