"""LRACDIMENSION API. Vector (audits), Signal (monitoring), Forge (server
tools), Contact (intake). Static site is served separately by Eleventy."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .api.routes import contact, forge, signal, vector
from .core.config import settings
from .workers import scheduler
from .workers.queue import queue

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("api")

MAX_BODY = 64 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.start()
    log.info("queue backend: %s · db: %s", queue.backend, "sqlite" if settings.is_sqlite else "postgresql")
    yield
    scheduler.stop()


app = FastAPI(title="LRACDIMENSION API", version="1.0.0", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")

@app.middleware("http")
async def limit_body(request: Request, call_next):
    length = request.headers.get("content-length")
    if length and int(length) > MAX_BODY:
        return JSONResponse(status_code=413, content={"error": {"code": "too_large", "message": "Request body is too large."}})
    try:
        response = await call_next(request)
    except Exception:  # noqa: BLE001 - last line of defence; keeps the JSON envelope and CORS headers on 500s
        log.exception("unhandled error on %s %s", request.method, request.url.path)
        response = JSONResponse(status_code=500, content={"error": {"code": "internal", "message": "Something went wrong on our side. It has been logged."}})
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    return response


# Added last so it is the outermost layer: every response, including the
# 500 envelope above, carries the CORS headers the browser needs.
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type", "X-Admin-Key"], max_age=600)


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException):
    detail = exc.detail if isinstance(exc.detail, dict) else {"code": "error", "message": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content={"error": detail})


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in first.get("loc", []) if p != "body")
    return JSONResponse(status_code=422, content={"error": {"code": "validation", "message": f"{field}: {first.get('msg', 'invalid')}" if field else "Invalid request.", "fields": [{"field": ".".join(str(p) for p in e.get("loc", []) if p != "body"), "message": e.get("msg")} for e in exc.errors()]}})


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("unhandled error on %s", request.url.path)
    return JSONResponse(status_code=500, content={"error": {"code": "internal", "message": "Something went wrong on our side. It has been logged."}})


@app.get("/api/health")
def health():
    return {"ok": True, "queue": queue.backend, "database": "sqlite" if settings.is_sqlite else "postgresql"}


app.include_router(vector.router)
app.include_router(signal.router)
app.include_router(forge.router)
app.include_router(contact.router)
