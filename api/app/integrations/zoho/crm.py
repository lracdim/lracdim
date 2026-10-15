"""Zoho CRM: mirror a studio lead into the Leads module.

The studio database stays the system of record. CRM is a mirror, so every
function returns a ZohoResult and never raises into the request path: if Zoho
is off or unreachable, the lead is still created locally and the result says
it was skipped or failed.
"""
from __future__ import annotations

import logging

from .client import ZohoClient, ZohoError, ZohoResult, enabled
from .client import client as default_client
from .schemas import lead_to_zoho

log = logging.getLogger("zoho.crm")

MODULE = "/crm/v5/Leads"


def upsert_lead(lead, *, client: ZohoClient | None = None) -> ZohoResult:
    """Create or update the CRM lead for a studio lead.

    Duplicate handling uses Zoho's upsert with Email as the duplicate check
    field, so re-submitting the same address updates one record instead of
    creating a second.
    """
    if not enabled():
        return ZohoResult.disabled()
    api = client or default_client
    payload = lead_to_zoho(lead).model_dump(exclude_none=True)
    try:
        body = api.request("POST", f"{MODULE}/upsert", json={"data": [payload], "duplicate_check_fields": ["Email"]})
    except ZohoError as e:
        log.warning("crm upsert failed for lead %s: %s", lead.id, e)
        return ZohoResult(ok=False, reason=str(e))
    record = (body.get("data") or [{}])[0]
    return ZohoResult(ok=True, data={"zoho_id": (record.get("details") or {}).get("id"), "action": record.get("action")})


def update_stage(lead, *, client: ZohoClient | None = None) -> ZohoResult:
    """Push a stage change to the mirrored record. Same contract as upsert."""
    return upsert_lead(lead, client=client)


def fetch_lead(zoho_id: str, *, client: ZohoClient | None = None) -> ZohoResult:
    if not enabled():
        return ZohoResult.disabled()
    api = client or default_client
    try:
        body = api.request("GET", f"{MODULE}/{zoho_id}")
    except ZohoError as e:
        return ZohoResult(ok=False, reason=str(e))
    return ZohoResult(ok=True, data=(body.get("data") or [{}])[0])
