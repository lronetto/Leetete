from sqlalchemy import BigInteger, Boolean, Index, Integer, Text, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


_NOW_MS_DEFAULT = text("(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT")


class EventConfig(Base):
    __tablename__ = "event_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, server_default=text("1"))
    couple_names: Mapped[str] = mapped_column(Text, nullable=False)
    event_date: Mapped[str | None] = mapped_column(Text)
    cover_key: Mapped[str | None] = mapped_column(Text)
    gallery_visibility: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'public'")
    )
    moderation: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'post'")
    )
    max_file_mb: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("500")
    )
    allow_video: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("TRUE")
    )
    max_video_seconds: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("300")
    )
    welcome_message: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[int] = mapped_column(
        BigInteger, nullable=False, server_default=_NOW_MS_DEFAULT
    )


class Upload(Base):
    __tablename__ = "uploads"
    __table_args__ = (
        Index("idx_uploads_status_created", "status", "created_at"),
        Index("idx_uploads_source", "source"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    storage_key: Mapped[str] = mapped_column(Text, nullable=False)
    thumbnail_key: Mapped[str | None] = mapped_column(Text)
    mime_type: Mapped[str] = mapped_column(Text, nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    author_name: Mapped[str | None] = mapped_column(Text)
    message: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'approved'")
    )
    source: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'guest'")
    )
    ip_hash: Mapped[str | None] = mapped_column(Text)
    provider_upload_id: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[int] = mapped_column(
        BigInteger, nullable=False, server_default=_NOW_MS_DEFAULT
    )
    approved_at: Mapped[int | None] = mapped_column(BigInteger)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    action: Mapped[str] = mapped_column(Text, nullable=False)
    actor: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[int] = mapped_column(
        BigInteger, nullable=False, server_default=_NOW_MS_DEFAULT
    )
