/**
 * LRACDIMENSION → Google Sheets inbox.
 *
 * Deploy this as a Google Apps Script web app bound to a spreadsheet. The API
 * posts JSON to it for every intake submission and every Signal alert
 * (NOTIFY_WEBHOOK on the api service). Each post becomes a row, and an email
 * goes to the sheet owner from their own Gmail, so no mail provider is needed.
 *
 * Payload shape (from backend/app/services/notify.py):
 *   { subject, ...fields }   e.g. { subject, id, name, email, company,
 *   project_type, problem, current_system, desired_outcome, timeline,
 *   budget_range, website, classification }  for intake
 *   { subject, target, from, to, status_code, response_ms, error } for Signal
 */

var SHEETS = { intake: 'Intake', signal: 'Signal', other: 'Other' };
var NOTIFY_TO = Session.getEffectiveUser().getEmail(); // the account that deployed the script

function doPost(e) {
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'invalid json' });
  }
  var subject = String(data.subject || '');
  var kind = subject.indexOf('[Signal]') === 0 ? 'signal' : subject.indexOf('[LRACDIMENSION]') === 0 ? 'intake' : 'other';
  var sheet = sheet_(SHEETS[kind]);
  var row = kind === 'intake' ? intakeRow_(data) : kind === 'signal' ? signalRow_(data) : [new Date(), subject, JSON.stringify(data)];
  header_(sheet, kind);
  sheet.appendRow(row);
  try {
    MailApp.sendEmail({ to: NOTIFY_TO, subject: subject, body: body_(data), name: 'LRACDIMENSION' });
  } catch (err) {
    // Mail quota or permission problem: the row is still stored.
  }
  if (kind === 'intake' && AUTO_REPLY && validEmail_(data.email)) {
    try {
      MailApp.sendEmail({ to: data.email, replyTo: NOTIFY_TO, subject: REPLY_SUBJECT, body: replyBody_(data), name: REPLY_FROM_NAME });
    } catch (err) {
      // Same: never fail the webhook because a reply could not be sent.
    }
  }
  return json_({ ok: true, kind: kind });
}

/* ---- auto-reply to the person who submitted the form ---------------------- */

var AUTO_REPLY = true;
var REPLY_FROM_NAME = 'John Carl Dimatulac';
var REPLY_SUBJECT = 'Got your project inquiry';

function replyBody_(d) {
  var first = String(d.name || '').trim().split(/\s+/)[0] || 'there';
  var lines = [
    'Hi ' + first + ',',
    '',
    'Thanks for reaching out. Your inquiry has arrived and I will read it properly and reply within one working day.',
    '',
    'What you sent:',
    '  Project type: ' + (d.project_type || '-'),
    '  Timeline: ' + (d.timeline || '-'),
    '  Budget: ' + (d.budget_range || '-'),
    d.website ? '  Website: ' + d.website : null,
    '',
    'If anything changes in the meantime, just reply to this email.',
    '',
    'John Carl Dimatulac',
    'Full-Stack Web Developer · WordPress & Automation Engineer',
    'https://lracdimension.vercel.app'
  ];
  return lines.filter(function (l) { return l !== null; }).join('\n');
}

function validEmail_(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && !/@example\.(com|org|net)$/i.test(v);
}

function intakeRow_(d) {
  var c = d.classification || {};
  return [new Date(), d.name, d.email, d.company, d.project_type, d.budget_range, d.timeline, d.website, d.problem, d.current_system, d.desired_outcome, c.complexity, c.urgency, (c.likely_services || []).join(', '), d.id];
}

function signalRow_(d) {
  return [new Date(), d.subject, d.target, d.from, d.to, d.status_code, d.response_ms, d.error || d.expires_at || ''];
}

function header_(sheet, kind) {
  if (sheet.getLastRow() > 0) return;
  var h = {
    intake: ['Received', 'Name', 'Email', 'Company', 'Project type', 'Budget', 'Timeline', 'Website', 'Problem', 'Current system', 'Desired outcome', 'Complexity', 'Urgency', 'Likely services', 'Submission id'],
    signal: ['Received', 'Subject', 'Target', 'From', 'To', 'HTTP', 'Response ms', 'Detail'],
    other: ['Received', 'Subject', 'Payload']
  }[kind];
  sheet.appendRow(h);
  sheet.getRange(1, 1, 1, h.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function body_(d) {
  var lines = [];
  for (var k in d) {
    if (k === 'subject') continue;
    var v = d[k];
    lines.push(k + ': ' + (typeof v === 'object' ? JSON.stringify(v) : v));
  }
  return lines.join('\n');
}

function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor to grant the mail and sheet permissions and check the flow. */
function testPost() {
  var fake = { postData: { contents: JSON.stringify({ subject: '[LRACDIMENSION] New project inquiry: Automation — Test', id: 'test', name: 'Test Person', email: 'test@example.com', project_type: 'Automation', problem: 'Setup check from Apps Script.', classification: { complexity: 'Low', urgency: 'Normal', likely_services: ['Discovery call'] } }) } };
  Logger.log(doPost(fake).getContent());
}
