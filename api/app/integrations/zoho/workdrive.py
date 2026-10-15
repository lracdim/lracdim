"""Zoho WorkDrive: a folder per client project for deliverables.

Interface only. Nothing is uploaded automatically; the studio stores
deliverable metadata in its own database and WorkDrive holds the files when
the integration is switched on.
"""
from __future__ import annotations

import logging

from .client import ZohoClient, ZohoError, ZohoResult, enabled
from .client import client as default_client
from .schemas import WorkDriveFolder, WorkDriveUpload

log = logging.getLogger("zoho.workdrive")

API = "/workdrive/api/v1"


def _settings_parent() -> str | None:
    from ...core.config import settings

    return settings.zoho_workdrive_parent_id or None


def ensure_project_folder(project, *, client: ZohoClient | None = None) -> ZohoResult:
    """Create (or report) the deliverables folder for a project.

    TODO: WorkDrive has no upsert. A real implementation should store the
    folder id on the project row after the first call instead of searching by
    name, which is what this skeleton would otherwise do on every call.
    """
    if not enabled():
        return ZohoResult.disabled()
    parent = _settings_parent()
    if not parent:
        return ZohoResult(ok=False, reason="ZOHO_WORKDRIVE_PARENT_ID is not set.")
    api = client or default_client
    name = f"{project.name} ({project.id[:8]})"
    payload = {"data": {"attributes": {"name": name, "parent_id": parent}, "type": "files"}}
    try:
        body = api.request("POST", f"{API}/files", json=payload)
    except ZohoError as e:
        log.warning("workdrive folder failed for project %s: %s", project.id, e)
        return ZohoResult(ok=False, reason=str(e))
    record = (body.get("data") or {})
    attrs = record.get("attributes") or {}
    folder = WorkDriveFolder(id=record.get("id", ""), name=attrs.get("name", name), url=attrs.get("permalink"))
    return ZohoResult(ok=True, data=folder.model_dump())


def upload_deliverable(folder_id: str, filename: str, content: bytes, *, client: ZohoClient | None = None) -> ZohoResult:
    """Upload one file into a project folder.

    TODO: multipart upload is not implemented here. The signature is fixed so
    the studio service can call it once the integration is enabled.
    """
    if not enabled():
        return ZohoResult.disabled()
    return ZohoResult(ok=False, reason="Upload is not implemented in this scaffold.", data=WorkDriveUpload(id="", name=filename, size=len(content)).model_dump())


def list_folder(folder_id: str, *, client: ZohoClient | None = None) -> ZohoResult:
    if not enabled():
        return ZohoResult.disabled()
    api = client or default_client
    try:
        body = api.request("GET", f"{API}/files/{folder_id}/files")
    except ZohoError as e:
        return ZohoResult(ok=False, reason=str(e))
    files = [{"id": f.get("id"), "name": (f.get("attributes") or {}).get("name")} for f in body.get("data", [])]
    return ZohoResult(ok=True, data={"files": files})
