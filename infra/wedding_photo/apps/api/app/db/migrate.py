import asyncio
import hashlib
from pathlib import Path

import asyncpg


def _to_pg_url(url: str) -> str:
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql+asyncpg://"):
        url = "postgresql://" + url[len("postgresql+asyncpg://") :]
    return url


async def run_migrations(database_url: str) -> None:
    conn = await asyncpg.connect(_to_pg_url(database_url))
    try:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                name TEXT PRIMARY KEY,
                sha256 TEXT NOT NULL,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )

        migrations_dir = Path(__file__).parent.parent / "migrations"
        files = sorted(f for f in migrations_dir.iterdir() if f.suffix == ".sql")

        for f in files:
            content = f.read_text(encoding="utf-8")
            sha = hashlib.sha256(content.encode("utf-8")).hexdigest()

            existing = await conn.fetchrow(
                "SELECT sha256 FROM schema_migrations WHERE name = $1", f.name
            )

            if existing is not None:
                if existing["sha256"] != sha:
                    raise RuntimeError(
                        f"Migration {f.name} has been modified after being applied. "
                        "Add a new migration file instead."
                    )
                print(f"[migrate] skip {f.name}")
                continue

            print(f"[migrate] apply {f.name}")
            async with conn.transaction():
                await conn.execute(content)
                await conn.execute(
                    "INSERT INTO schema_migrations (name, sha256) VALUES ($1, $2)",
                    f.name,
                    sha,
                )

        print("[migrate] done")
    finally:
        await conn.close()


def main() -> None:
    from ..config import settings

    asyncio.run(run_migrations(settings.DATABASE_URL))


if __name__ == "__main__":
    main()
