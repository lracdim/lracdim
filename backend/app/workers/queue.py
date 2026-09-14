"""Job queue with one integration point.

REDIS_URL set   → jobs are enqueued on RQ and executed by `rq worker vector`
                  processes (any number of API instances share the queue).
REDIS_URL unset → jobs run on a bounded in-process thread pool. Correct for
                  a single instance; the API never blocks on an audit either way.

Both paths call the same job functions below, so the pipeline is identical."""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor

from ..core.config import settings
from ..db import SessionLocal

log = logging.getLogger("queue")


def run_audit_job(audit_id: str) -> None:
    from ..services.audit_service import run_audit

    db = SessionLocal()
    try:
        run_audit(db, audit_id)
    finally:
        db.close()


def run_checks_job() -> int:
    from ..services.monitor_service import check_all

    db = SessionLocal()
    try:
        return check_all(db)
    finally:
        db.close()


class Queue:
    def __init__(self) -> None:
        self.backend = "thread"
        self._pool = ThreadPoolExecutor(max_workers=3, thread_name_prefix="lracdim-job")
        self._rq = None
        if settings.redis_url:
            try:
                import redis
                from rq import Queue as RQQueue

                conn = redis.Redis.from_url(settings.redis_url)
                conn.ping()
                self._rq = RQQueue("vector", connection=conn, default_timeout=180)
                self.backend = "rq"
            except Exception:  # pragma: no cover - depends on environment
                log.warning("REDIS_URL set but Redis unreachable; falling back to thread pool")

    def enqueue_audit(self, audit_id: str) -> None:
        if self._rq is not None:
            self._rq.enqueue(run_audit_job, audit_id, job_id=f"audit-{audit_id}")
        else:
            self._pool.submit(self._safe, run_audit_job, audit_id)

    def enqueue_checks(self) -> None:
        if self._rq is not None:
            self._rq.enqueue(run_checks_job)
        else:
            self._pool.submit(self._safe, run_checks_job)

    @staticmethod
    def _safe(fn, *args):
        try:
            fn(*args)
        except Exception:
            log.exception("job %s failed", fn.__name__)


queue = Queue()
