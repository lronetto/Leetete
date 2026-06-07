import asyncio
from typing import Any

import boto3
from botocore.client import Config

from ..config import settings

DEFAULT_PART_SIZE = 10 * 1024 * 1024


class S3Storage:
    """Thin wrapper around boto3 that fits the same shape used by routes.

    All network methods are async-wrapped via asyncio.to_thread so they
    can be awaited from FastAPI handlers without blocking the event loop.
    """

    def __init__(self) -> None:
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT,
            region_name=settings.S3_REGION,
            aws_access_key_id=settings.S3_ACCESS_KEY_ID,
            aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
            config=Config(
                signature_version="s3v4",
                s3={
                    "addressing_style": "path"
                    if settings.S3_FORCE_PATH_STYLE
                    else "virtual",
                },
                retries={"max_attempts": 3, "mode": "standard"},
            ),
        )
        self._bucket = settings.S3_BUCKET
        self._public_base = settings.S3_PUBLIC_BASE_URL.rstrip("/")

    def presign_put(
        self, key: str, content_type: str, expires_in: int = 600
    ) -> dict[str, Any]:
        url = self._client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self._bucket,
                "Key": key,
                "ContentType": content_type,
            },
            ExpiresIn=expires_in,
        )
        return {
            "url": url,
            "method": "PUT",
            "headers": {"content-type": content_type},
        }

    async def init_multipart(
        self,
        key: str,
        content_type: str,
        part_count: int,
        expires_in: int = 3600,
    ) -> dict[str, Any]:
        def _init() -> dict[str, Any]:
            res = self._client.create_multipart_upload(
                Bucket=self._bucket, Key=key, ContentType=content_type
            )
            return res

        res = await asyncio.to_thread(_init)
        upload_id: str = res["UploadId"]

        def _sign_parts() -> list[str]:
            urls: list[str] = []
            for i in range(1, part_count + 1):
                u = self._client.generate_presigned_url(
                    "upload_part",
                    Params={
                        "Bucket": self._bucket,
                        "Key": key,
                        "PartNumber": i,
                        "UploadId": upload_id,
                    },
                    ExpiresIn=expires_in,
                )
                urls.append(u)
            return urls

        part_urls = await asyncio.to_thread(_sign_parts)
        return {
            "upload_id": upload_id,
            "part_size": DEFAULT_PART_SIZE,
            "part_urls": part_urls,
        }

    async def complete_multipart(
        self,
        key: str,
        upload_id: str,
        parts: list[dict[str, Any]],
    ) -> None:
        sorted_parts = sorted(parts, key=lambda p: p["partNumber"])
        boto_parts = [
            {"PartNumber": p["partNumber"], "ETag": p["etag"]} for p in sorted_parts
        ]

        def _complete() -> None:
            self._client.complete_multipart_upload(
                Bucket=self._bucket,
                Key=key,
                UploadId=upload_id,
                MultipartUpload={"Parts": boto_parts},
            )

        await asyncio.to_thread(_complete)

    async def abort_multipart(self, key: str, upload_id: str) -> None:
        def _abort() -> None:
            try:
                self._client.abort_multipart_upload(
                    Bucket=self._bucket, Key=key, UploadId=upload_id
                )
            except Exception:  # noqa: BLE001
                pass

        await asyncio.to_thread(_abort)

    def public_url(self, key: str) -> str:
        return f"{self._public_base}/{key}"

    async def head(self, key: str) -> dict[str, Any] | None:
        def _head() -> dict[str, Any] | None:
            try:
                res = self._client.head_object(Bucket=self._bucket, Key=key)
                return {
                    "contentType": res.get("ContentType", "application/octet-stream"),
                    "contentLength": int(res.get("ContentLength", 0)),
                    "etag": (res.get("ETag", "") or "").strip('"'),
                }
            except self._client.exceptions.ClientError as e:
                code = e.response.get("Error", {}).get("Code", "")
                if code in {"404", "NoSuchKey", "NotFound"}:
                    return None
                raise

        return await asyncio.to_thread(_head)

    async def delete(self, key: str) -> None:
        def _delete() -> None:
            try:
                self._client.delete_object(Bucket=self._bucket, Key=key)
            except Exception:  # noqa: BLE001
                pass

        await asyncio.to_thread(_delete)


storage = S3Storage()
