"""Monitoring scheduler. Runs inside the API process by default (APScheduler
background thread) and enqueues one check sweep per interval. With Redis,
the sweep executes on a worker; without it, on the local pool."""
from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler

from ..core.config import settings
from .queue import queue

log = logging.getLogger("scheduler")
_scheduler: BackgroundScheduler | None = None


def start() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(queue.enqueue_checks, "interval", seconds=max(60, settings.signal_interval_seconds), id="signal-sweep", replace_existing=True, next_run_time=None)
    _scheduler.start()
    log.info("signal sweep every %ss", settings.signal_interval_seconds)
    return _scheduler


def stop() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
