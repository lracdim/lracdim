from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...core.config import settings
from ...core.security import rate_limit
from ...core.ssrf import UnsafeURL
from ...db import get_db
from ...models import ToolRun
from ...schemas import ToolRunIn, ToolRunOut
from ...services.fetcher import FetchError
from ...services.forge_tools import TOOLS, run_tool

router = APIRouter(prefix="/api/forge", tags=["forge"])


@router.get("/tools")
def list_tools():
    return [{"tool": name, "mode": "server"} for name in TOOLS]


@router.post("/{tool}/run", response_model=ToolRunOut, dependencies=[Depends(rate_limit("tools", settings.rate_limit_tools))])
def run(tool: str, payload: ToolRunIn, db: Session = Depends(get_db)):
    if tool not in TOOLS:
        raise HTTPException(status_code=404, detail={"code": "unknown_tool", "message": "No such tool."})
    started = time.perf_counter()
    status = "completed"
    try:
        result = run_tool(tool, payload.url)
    except UnsafeURL as e:
        status = "rejected"
        _record(db, tool, status, started, {"reason": str(e)})
        raise HTTPException(status_code=422, detail={"code": "invalid_url", "message": str(e)})
    except FetchError as e:
        status = "failed"
        _record(db, tool, status, started, {"reason": e.reason})
        raise HTTPException(status_code=502, detail={"code": "fetch_failed", "message": e.reason})
    run_row = _record(db, tool, status, started, {"url_host": result.get("url", payload.url)[:120], "problems": len(result.get("problems", []))})
    return {"tool": tool, "run_id": run_row.id, "processing_ms": run_row.processing_ms, "result": result}


def _record(db: Session, tool: str, status: str, started: float, meta: dict) -> ToolRun:
    row = ToolRun(tool=tool, status=status, processing_ms=int((time.perf_counter() - started) * 1000), result_meta=meta)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
