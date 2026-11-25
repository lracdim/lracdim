"""TLS_TRUST_STORE=system switches outbound verification to the OS store."""
import sys
import types

from app.core import config


def _fake_truststore(calls):
    mod = types.ModuleType("truststore")
    mod.inject_into_ssl = lambda: calls.append("injected")
    return mod


def test_system_trust_store_is_injected_when_enabled(monkeypatch):
    calls = []
    monkeypatch.setitem(sys.modules, "truststore", _fake_truststore(calls))
    monkeypatch.setenv("TLS_TRUST_STORE", "system")
    config._use_system_trust_store()
    assert calls == ["injected"]


def test_default_keeps_certifi(monkeypatch):
    calls = []
    monkeypatch.setitem(sys.modules, "truststore", _fake_truststore(calls))
    monkeypatch.delenv("TLS_TRUST_STORE", raising=False)
    config._use_system_trust_store()
    monkeypatch.setenv("TLS_TRUST_STORE", "certifi")
    config._use_system_trust_store()
    assert calls == []
