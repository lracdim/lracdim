from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ...core.config import settings
from ...core.security import rate_limit, require_admin
from ...core.ssrf import UnsafeURL
from ...db import get_db
from ...models import MonitoringTarget, SignalEvent
from ...schemas import EventOut, ScanIn, ScanOut, SnapshotOut, TargetCreate, TargetOut
from ...services.fetcher import FetchError
from ...services.monitor_service import check_target, create_target
from ...services.signal_scan import latest_snapshot, public_scan

router = APIRouter(prefix="/api/signal", tags=["signal"])


@router.post("/targets", response_model=TargetOut, status_code=201, dependencies=[Depends(require_admin)])
def add_target(payload: TargetCreate, db: Session = Depends(get_db)):
    try:
        target = create_target(db, payload.name, payload.url)
    except UnsafeURL as e:
        raise HTTPException(status_code=422, detail={"code": "invalid_url", "message": str(e)})
    check_target(db, target)  # first measurement happens immediately
    db.refresh(target)
    return target


@router.post("/scan", response_model=ScanOut, dependencies=[Depends(rate_limit("signal", settings.rate_limit_signal))])
def scan(payload: ScanIn, db: Session = Depends(get_db)):
    """Public: measure a domain now and register it for scheduled checks."""
    try:
        return public_scan(db, payload.url)
    except UnsafeURL as e:
        raise HTTPException(status_code=422, detail={"code": "invalid_url", "message": str(e)})
    except FetchError as e:
        raise HTTPException(status_code=502, detail={"code": "fetch_failed", "message": e.reason})


@router.get("/lookup", response_model=TargetOut)
def lookup(host: str, db: Session = Depends(get_db)):
    target = db.query(MonitoringTarget).filter(MonitoringTarget.host == host.lower().strip(), MonitoringTarget.enabled == 1).one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "That domain has not been scanned yet."})
    return target


@router.get("/targets", response_model=list[TargetOut])
def list_targets(db: Session = Depends(get_db)):
    """Public board shows operator-registered targets only; public scans are
    reachable by their own id or by lookup."""
    return db.query(MonitoringTarget).filter(MonitoringTarget.enabled == 1, MonitoringTarget.source == "admin").order_by(MonitoringTarget.created_at.asc()).all()


@router.get("/targets/{target_id}/snapshot", response_model=SnapshotOut)
def target_snapshot(target_id: str, db: Session = Depends(get_db)):
    if db.get(MonitoringTarget, target_id) is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "No monitoring target with that id."})
    snap = latest_snapshot(db, target_id)
    return snap if snap is not None else {"id": None, "created_at": None, "data": None}


@router.get("/targets/{target_id}", response_model=TargetOut)
def get_target(target_id: str, db: Session = Depends(get_db)):
    target = db.get(MonitoringTarget, target_id)
    if target is None or not target.enabled:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "No monitoring target with that id."})
    return target


@router.get("/targets/{target_id}/events", response_model=list[EventOut])
def target_events(target_id: str, kind: str | None = None, limit: int = Query(default=200, ge=1, le=1000), db: Session = Depends(get_db)):
    if db.get(MonitoringTarget, target_id) is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "No monitoring target with that id."})
    q = db.query(SignalEvent).filter(SignalEvent.target_id == target_id)
    if kind:
        q = q.filter(SignalEvent.kind == kind)
    return q.order_by(SignalEvent.created_at.desc()).limit(limit).all()


@router.post("/targets/{target_id}/check", response_model=TargetOut, dependencies=[Depends(require_admin)])
def run_check(target_id: str, db: Session = Depends(get_db)):
    target = db.get(MonitoringTarget, target_id)
    if target is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "No monitoring target with that id."})
    check_target(db, target)
    db.refresh(target)
    return target


@router.get("/events", response_model=list[EventOut])
def recent_events(limit: int = Query(default=50, ge=1, le=200), db: Session = Depends(get_db)):
    return db.query(SignalEvent).filter(SignalEvent.kind.notin_(["check", "snapshot"])).order_by(SignalEvent.created_at.desc()).limit(limit).all()
