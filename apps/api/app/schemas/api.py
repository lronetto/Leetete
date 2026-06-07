from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class UploadInitIn(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    mimeType: str = Field(pattern=r"^(image|video)/[a-z0-9.+-]+$")
    sizeBytes: int = Field(gt=0)
    durationSeconds: int | None = Field(default=None, gt=0)
    authorName: str | None = Field(default=None, max_length=80)
    message: str | None = Field(default=None, max_length=2000)


class MultipartPart(BaseModel):
    partNumber: int = Field(gt=0)
    etag: str = Field(min_length=1)


class MultipartConfirm(BaseModel):
    providerUploadId: str
    parts: list[MultipartPart]


class UploadConfirmIn(BaseModel):
    multipart: MultipartConfirm | None = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class EventConfigUpdate(BaseModel):
    coupleNames: str | None = Field(default=None, min_length=1, max_length=120)
    eventDate: str | None = None
    coverKey: str | None = None
    galleryVisibility: Literal["public", "private"] | None = None
    moderation: Literal["pre", "post"] | None = None
    maxFileMb: int | None = Field(default=None, gt=0)
    allowVideo: bool | None = None
    maxVideoSeconds: int | None = Field(default=None, gt=0)
    welcomeMessage: str | None = Field(default=None, max_length=2000)


class AdminUploadUpdate(BaseModel):
    authorName: str | None = Field(default=None, max_length=80)
    message: str | None = Field(default=None, max_length=2000)


class AdminBulk(BaseModel):
    action: Literal["approve", "reject", "delete"]
    ids: list[str] = Field(min_length=1, max_length=200)
