"""Forge: server-side tools that fetch other sites through the validated fetcher."""
from __future__ import annotations

import time

from litestar import get, post
from litestar.di import Provide
from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.security import ApiError, rate_limit
from ..core.ssrf import UnsafeURL
from ..db import provide_db
from ..models import ToolRun
from ..schemas import ToolRunIn, ToolRunOut
from ..services.fetcher import FetchError
from ..services.forge_tools import TOOLS, run_tool

DB = {"db": Provide(provide_db)}


@get("/api/forge/tools", sync_to_thread=False)
def list_tools() -> list[dict]:
    return [{"tool": name, "mode": "server"} for name in TOOLS]


@post("/api/forge/{tool:str}/run", status_code=200, dependencies=DB, guards=[rate_limit("tools", settings.rate_limit_tools)], sync_to_thread=True)
def run(tool: str, data: ToolRunIn, db: Session) -> ToolRunOut:
    if tool not in TOOLS:
        raise ApiError(404, "unknown_tool", "No such tool.")
    started = time.perf_counter()
    try:
        result = run_tool(tool, data.url)
    except UnsafeURL as e:
        _record(db, tool, "rejected", started, {"reason": str(e)})
        raise ApiError(422, "invalid_url", str(e))
    except FetchError as e:
        _record(db, tool, "failed", started, {"reason": e.reason})
        raise ApiError(502, "fetch_failed", e.reason)
    run_row = _record(db, tool, "completed", started, {"url_host": result.get("url", data.url)[:120], "problems": len(result.get("problems", []))})
    return ToolRunOut(tool=tool, run_id=run_row.id, processing_ms=run_row.processing_ms, result=result)


def _record(db: Session, tool: str, status: str, started: float, meta: dict) -> ToolRun:
    row = ToolRun(tool=tool, status=status, processing_ms=int((time.perf_counter() - started) * 1000), result_meta=meta)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


routes = [list_tools, run]
