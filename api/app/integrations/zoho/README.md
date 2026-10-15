# Zoho integration (scaffold)

This package is an interface, not a working connection. With the feature flag
off, which is the default everywhere including tests, no call leaves the
process and every function returns `ZohoResult(skipped=True)`.

## What it is for

- **CRM** (`crm.py`): mirror a studio lead into the Zoho CRM Leads module when
  a diagnostic or intake form is submitted, and push later stage changes.
- **WorkDrive** (`workdrive.py`): one folder per client project for
  deliverables.

Zoho is **not** the system of record. The studio database holds leads,
clients, projects, and messages; the dashboard reads only from the API. If
Zoho is unreachable, studio operations still succeed.

## Switching it on

Set these in the API environment (names only; never commit values):

| Variable | Meaning |
| --- | --- |
| `ZOHO_ENABLED` | `true` turns the integration on. Default `false`. |
| `ZOHO_CLIENT_ID` | Self-client or server-based app client id. |
| `ZOHO_CLIENT_SECRET` | Matching secret. |
| `ZOHO_REFRESH_TOKEN` | Long-lived refresh token for the scopes below. |
| `ZOHO_DATA_CENTER` | `com`, `eu`, `in`, `com.au`, `jp`, or `ca`. |
| `ZOHO_WORKDRIVE_PARENT_ID` | Folder that project folders are created inside. |

Scopes needed: `ZohoCRM.modules.leads.ALL` and, for deliverables,
`WorkDrive.files.ALL`.

## Logging

`client.redact()` masks `client_secret`, `refresh_token`, `access_token`,
`code`, and `authorization` before anything reaches the logger. Record ids and
status codes are logged; names, emails, and message bodies are not.

## Shape of a call

```python
from app.integrations.zoho import crm

result = crm.upsert_lead(lead)
if result.skipped:
    ...  # integration is off; nothing to do
elif not result.ok:
    ...  # log and carry on: the studio record is already saved
else:
    zoho_id = result.data["zoho_id"]
```

## Not implemented on purpose

- Token storage is per process. With several API instances, move it to Redis.
- WorkDrive multipart upload raises a clear "not implemented" result.
- No webhook receiver. Zoho writing back into the studio would make it a
  second source of truth, which this design avoids.
