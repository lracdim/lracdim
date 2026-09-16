# Integrations

## Google Sheets inbox and email alerts

`google-sheets-webhook.gs` turns a Google Sheet into the inbox for intake
submissions and Signal alerts, and emails the sheet owner from their own
Gmail. No mail provider or domain is required.

Setup, done once in the Google account that should receive the mail:

1. Create a new Google Sheet. Name it anything, for example "LRACDIMENSION inbox".
2. In the sheet, open Extensions → Apps Script. Replace the default code with
   the contents of `google-sheets-webhook.gs` and save.
3. Run `testPost` once from the editor toolbar. Approve the permission prompt
   (it asks for Sheets and email). Two things should happen: an "Intake" tab
   appears with a test row, and a test email arrives.
4. Deploy → New deployment → type "Web app". Execute as: Me. Who has access:
   Anyone. Deploy, then copy the web app URL (it ends in `/exec`).
5. Set that URL as `NOTIFY_WEBHOOK` on the Railway `api` service. Railway
   redeploys on its own.

After that, every submission on `/start/` and every Signal incident or SSL
warning appends a row and sends an email. The API also keeps its own copy in
Postgres; the sheet is the human-facing view.

Limits worth knowing: Apps Script mail is capped at 100 emails a day for a
personal Gmail account, which is far above what this site produces. The web
app URL is unguessable but public; anyone who has it can append rows, which
is the same exposure as the public intake form itself.

To rotate, create a new deployment and update `NOTIFY_WEBHOOK`.
