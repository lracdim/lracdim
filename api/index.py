"""Vercel entry point.

Vercel's Python runtime looks for an ASGI `app` in this module. Importing it
is all that is needed; `uvicorn app.main:app` is the equivalent locally.

Read this before deploying the API here: Vercel functions are short-lived and
stateless, so two things in this service do not work on Vercel.

  - The monitoring scheduler (APScheduler) only runs while a process is alive.
    On Vercel, schedule the sweep with a Vercel Cron that calls
    POST /api/signal/targets/{id}/check, or run the API on a host with a
    long-lived process.
  - A Vector audit takes ten to twenty seconds and runs on the API's own
    thread pool. That fits inside a function's execution limit on paid plans
    only; on the free plan it will time out.

The project deploys as-is to a long-running host (Railway, Fly, Render), which
is what the README recommends.
"""
from app.main import app

__all__ = ["app"]
