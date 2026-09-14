from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")
os.environ.setdefault("ADMIN_KEY", "test-admin")
os.environ["REDIS_URL"] = ""
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient

from app.db import Base, engine
from app.main import app


@pytest.fixture(scope="session", autouse=True)
def _schema():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


SAMPLE_HTML = """<!DOCTYPE html><html lang="en"><head><title>Example Company — Security guards in Rocklin</title>
<meta name="description" content="Security guard services for property managers and construction firms across Placer County, staffed and licensed.">
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="https://example.com/">
<meta property="og:title" content="Example"><meta property="og:description" content="Desc"><meta property="og:image" content="https://example.com/og.png">
<link rel="stylesheet" href="/a.css"></head><body><header><nav><a href="/about/">About</a><a href="/services/">Services</a><a href="https://other.example/x">Partner</a></nav></header>
<main><h1>Security guards</h1><h2>Services</h2><p>%s</p><img src="/a.jpg" alt="Guard" width="10" height="10"><img src="/b.jpg" width="10" height="10">
<form><label for="e">Email</label><input id="e" type="email"><input type="text" name="x"></form><button>Send</button></main><footer>© Example</footer>
<script src="/app.js" defer></script></body></html>""" % (" ".join(["word"] * 400))


class FakeFetched:
    def __init__(self, html=SAMPLE_HTML, url="https://example.com/", status=200, headers=None, elapsed_ms=350, redirects=None, https=True):
        self.url = url
        self.final_url = url
        self.status = status
        self.headers = {"content-type": "text/html; charset=utf-8", "content-encoding": "gzip", "cache-control": "max-age=60", "strict-transport-security": "max-age=31536000", **(headers or {})}
        self.body = html.encode()
        self.elapsed_ms = elapsed_ms
        self.redirects = redirects or []
        self.truncated = False
        self.https = https

    @property
    def text(self):
        return self.body.decode()
