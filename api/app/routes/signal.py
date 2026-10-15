"""Signal: public domain scans and scheduled monitoring."""
from __future__ import annotations

from litestar import get, post
from litestar.di import Provide
from litestar.params import Parameter
from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.security import ApiError, rate_limit, require_admin
from ..core.ssrf import UnsafeURL
from ..db import provide_db
from ..models import MonitoringTarget, SignalEvent
from ..schemas import EventOut, ScanIn, ScanOut, SnapshotOut, TargetCreate, TargetOut
from ..services.fetcher import FetchError
from ..services.monitor_service import check_target, create_target
from ..services.signal_scan import latest_snapshot, public_scan

DB = {"db": Provide(provide_db)}


def _target_or_404(db: Session, target_id: str, require_enabled: bool = False) -> MonitoringTarget:
    target = db.get(MonitoringTarget, target_id)
    if target is None or (require_enabled and not target.enabled):
        raise ApiError(404, "not_found", "No monitoring target with that id.")
    return target


@post("/api/signal/targets", status_code=201, dependencies=DB, guards=[require_admin], sync_to_thread=True)
def add_target(data: TargetCreate, db: Session) -> TargetOut:
    try:
        target = create_target(db, data.name, data.url)
    except UnsafeURL as e:
        raise ApiError(422, "invalid_url", str(e))
    check_target(db, target)  # first measurement happens immediately
    db.refresh(target)
    return TargetOut.model_validate(target)


@post("/api/signal/scan", status_code=200, dependencies=DB, guards=[rate_limit("signal", settings.rate_limit_signal)], sync_to_thread=True)
def scan(data: ScanIn, db: Session) -> ScanOut:
    """Public: measure a domain now and register it for scheduled checks."""
    try:
        return ScanOut.model_validate(public_scan(db, data.url))
    except UnsafeURL as e:
        raise ApiError(422, "invalid_url", str(e))
    except FetchError as e:
        raise ApiError(502, "fetch_failed", e.reason)


@get("/api/signal/lookup", dependencies=DB, sync_to_thread=True)
def lookup(host: str, db: Session) -> TargetOut:
    target = db.query(MonitoringTarget).filter(MonitoringTarget.host == host.lower().strip(), MonitoringTarget.enabled == 1).one_or_none()
    if target is None:
        raise ApiError(404, "not_found", "That domain has not been scanned yet.")
    return TargetOut.model_validate(target)


@get("/api/signal/targets", dependencies=DB, sync_to_thread=True)
def list_targets(db: Session) -> list[TargetOut]:
    """Public board shows operator-registered targets only; public scans are
    reachable by their own id or by lookup."""
    rows = db.query(MonitoringTarget).filter(MonitoringTarget.enabled == 1, MonitoringTarget.source == "admin").order_by(MonitoringTarget.created_at.asc()).all()
    return [TargetOut.model_validate(r) for r in rows]


@get("/api/signal/targets/{target_id:str}/snapshot", dependencies=DB, sync_to_thread=True)
def target_snapshot(target_id: str, db: Session) -> SnapshotOut:
    _target_or_404(db, target_id)
    snap = latest_snapshot(db, target_id)
    return SnapshotOut.model_validate(snap if snap is not None else {"id": None, "created_at": None, "data": None})


@get("/api/signal/targets/{target_id:str}", dependencies=DB, sync_to_thread=True)
def get_target(target_id: str, db: Session) -> TargetOut:
    return TargetOut.model_validate(_target_or_404(db, target_id, require_enabled=True))


@get("/api/signal/targets/{target_id:str}/events", dependencies=DB, sync_to_thread=True)
def target_events(
    target_id: str,
    db: Session,
    kind: str | None = None,
    limit: int = Parameter(default=200, ge=1, le=1000),
) -> list[EventOut]:
    _target_or_404(db, target_id)
    q = db.query(SignalEvent).filter(SignalEvent.target_id == target_id)
    if kind:
        q = q.filter(SignalEvent.kind == kind)
    return [EventOut.model_validate(r) for r in q.order_by(SignalEvent.created_at.desc()).limit(limit).all()]


@post("/api/signal/targets/{target_id:str}/check", status_code=200, dependencies=DB, guards=[require_admin], sync_to_thread=True)
def run_check(target_id: str, db: Session) -> TargetOut:
    target = _target_or_404(db, target_id)
    check_target(db, target)
    db.refresh(target)
    return TargetOut.model_validate(target)


@get("/api/signal/events", dependencies=DB, sync_to_thread=True)
def recent_events(db: Session, limit: int = Parameter(default=50, ge=1, le=200)) -> list[EventOut]:
    rows = db.query(SignalEvent).filter(SignalEvent.kind.notin_(["check", "snapshot"])).order_by(SignalEvent.created_at.desc()).limit(limit).all()
    return [EventOut.model_validate(r) for r in rows]


routes = [add_target, scan, lookup, list_targets, target_snapshot, get_target, target_events, run_check, recent_events]
