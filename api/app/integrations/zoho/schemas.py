"""Mapping between studio records and Zoho payloads.

Kept separate from the services so the field mapping can be read and changed
without touching transport code.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class ZohoLeadPayload(BaseModel):
    """Zoho CRM Leads module. Last_Name is the only required field."""

    Last_Name: str = Field(max_length=120)
    First_Name: str | None = Field(default=None, max_length=60)
    Email: str | None = None
    Company: str | None = Field(default=None, max_length=200)
    Website: str | None = None
    Lead_Source: str = "LRACDIMENSION website"
    Description: str | None = None
    Lead_Status: str | None = None
    # Custom fields must exist in the Zoho layout before they are sent.
    Budget_Range: str | None = None
    Timeline: str | None = None
    Site_Health_Score: int | None = None


def lead_to_zoho(lead) -> ZohoLeadPayload:
    """Studio Lead → Zoho Lead. Split the name conservatively: Zoho requires a
    last name, so a single-word name becomes the last name."""
    parts = (lead.name or "").strip().split()
    first = " ".join(parts[:-1]) if len(parts) > 1 else None
    last = parts[-1] if parts else "Unknown"
    return ZohoLeadPayload(
        Last_Name=last,
        First_Name=first,
        Email=lead.email,
        Company=lead.company or "(not given)",
        Website=lead.website,
        Description=lead.problem,
        Lead_Status=STAGE_TO_STATUS.get(lead.stage),
        Budget_Range=lead.budget_range,
        Timeline=lead.timeline,
        Site_Health_Score=lead.health_score,
    )


# Studio stage → Zoho Lead_Status picklist value. Adjust to match the layout
# in the target Zoho org; unknown stages are simply not sent.
STAGE_TO_STATUS = {
    "diagnostic_submitted": "Not Contacted",
    "lead_review": "Attempted to Contact",
    "discovery_call": "Contacted",
    "proposal": "Contacted",
    "contract_deposit": "Contacted",
    "qualified": "Qualified",
    "declined": "Not Qualified",
}


class WorkDriveFolder(BaseModel):
    id: str
    name: str
    url: str | None = None


class WorkDriveUpload(BaseModel):
    id: str
    name: str
    size: int | None = None
    url: str | None = None
