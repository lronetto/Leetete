import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .db.base import engine
from .db.migrate import run_migrations
from .routes import admin, public, uploads


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.AUTO_MIGRATE:
        print("[startup] running migrations")
        await run_migrations(settings.DATABASE_URL)
    print(f"[startup] static dir: {settings.STATIC_DIR}")
    yield
    await engine.dispose()


app = FastAPI(
    lifespan=lifespan,
    title="Wedding Photos API",
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"ok": True, "ts": int(time.time() * 1000)}


app.include_router(public.router, prefix="/api", tags=["public"])
app.include_router(uploads.router, prefix="/api/uploads", tags=["uploads"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])


# ----- SPA static asset serving -----
static_dir = Path(settings.STATIC_DIR)
assets_dir = static_dir / "assets"
if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")


@app.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    if full_path.startswith("api/") or full_path == "api":
        raise HTTPException(404, detail="not_found")
    if full_path in {"favicon.ico", "robots.txt"}:
        candidate = static_dir / full_path
        if candidate.is_file():
            return FileResponse(candidate)
    index = static_dir / "index.html"
    if index.is_file():
        return FileResponse(index)
    raise HTTPException(404, detail="static_not_found")
