/**
 * Replies and other mail sent to the domain (john@, hello@, anything@
 * lracdimension.online), received by Resend and forwarded to the owner's
 * private inbox. No other mailbox host is involved: the domain's MX points at
 * Resend, Resend posts an `email.received` webhook (metadata only), and this
 * fetches the message and sends it on.
 *
 * - Visitors only ever see the domain addresses. The forward goes to
 *   INBOUND_FORWARD_TO, or NOTIFY_EMAIL, with Reply-To set to the original
 *   sender, so answering it from that inbox answers them.
 * - Attachments travel as Resend `path` attachments: Resend fetches its own
 *   signed download URLs (valid an hour), nothing passes through the Worker.
 * - Idempotency key `inbound-<email id>`: a webhook retry never forwards twice.
 * - Mail from our own sending addresses is not forwarded (no loops).
 * - Nothing is stored; the message stays in Resend's own received list.
 *
 * Docs: resend.com/docs/dashboard/receiving/introduction,
 * resend.com/docs/api-reference/emails/retrieve-received-email.
 */
import { error, json } from './http.js';
import { addressOf, sendEmail, sender, ResendError } from './notify.js';

const API = 'https://api.resend.com';
const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024; // Resend allows 40 MB per email after encoding

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const flat = (v) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').trim();
const lower = (v) => addressOf(v).toLowerCase();

/** "Jane Doe <jane@x.com>" → "Jane Doe"; a bare address → its local part. */
function displayName(from) {
  const s = flat(from);
  const m = /^"?([^"<]*?)"?\s*<[^>]+>$/.exec(s);
  const name = (m && m[1].trim()) || s.split('@')[0];
  return name.replace(/[<>"\\]/g, '').slice(0, 60) || 'Someone';
}

async function resendGet(env, path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000)
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

/** Handles one `email.received` event. Returns the webhook response (non-2xx makes Resend retry). */
export async function forwardReceived(env, data) {
  const id = data && data.email_id;
  if (!id) return json({ received: true, forwarded: false, reason: 'no email id' });
  const forwardTo = env.INBOUND_FORWARD_TO || env.NOTIFY_EMAIL;
  if (!env.RESEND_API_KEY || !forwardTo) return error(503, 'not_configured', 'Forwarding is not configured (RESEND_API_KEY and NOTIFY_EMAIL).');

  const own = new Set([sender(env), env.REPORT_FROM, forwardTo].filter(Boolean).map(lower));
  if (own.has(lower(data.from))) {
    console.log(JSON.stringify({ event: 'inbound.skipped', email: id, reason: 'sent by this site' }));
    return json({ received: true, forwarded: false, reason: 'own address' });
  }

  const got = await resendGet(env, `/emails/receiving/${encodeURIComponent(id)}`);
  if (got.status === 404) return json({ received: true, forwarded: false, reason: 'not found' });
  if (got.status >= 400 || !got.data) return error(502, 'upstream', `Could not read the received email (${got.status}).`);
  const mail = got.data;

  const originalFrom = flat((mail.headers && mail.headers.from) || mail.from || data.from);
  const declared = Array.isArray(mail.reply_to) ? mail.reply_to[0] : mail.reply_to;
  const replyAddress = (typeof declared === 'string' && declared.includes('@') && declared) || addressOf(originalFrom);
  const to = [].concat(mail.to || data.to || []).map(flat).join(', ');
  const subject = flat(mail.subject || data.subject) || '(no subject)';
  const auth = mail.authentication || {};
  const checks = ['spf', 'dkim', 'dmarc'].filter((k) => auth[k]).map((k) => `${k.toUpperCase()} ${auth[k]}`).join(' · ');
  const suspicious = ['spf', 'dkim'].every((k) => auth[k] && auth[k] !== 'pass');

  // Attachments: forwarded by URL, while the total stays under Resend's limit.
  const attachments = [];
  const left = [];
  if (Array.isArray(mail.attachments) && mail.attachments.length) {
    const list = await resendGet(env, `/emails/receiving/${encodeURIComponent(id)}/attachments?limit=100`);
    let total = 0;
    for (const a of (list.data && list.data.data) || []) {
      if (a.download_url && total + (a.size || 0) <= MAX_ATTACHMENT_BYTES) {
        total += a.size || 0;
        attachments.push({ filename: flat(a.filename) || 'attachment', path: a.download_url, ...(a.content_id ? { content_id: a.content_id } : {}) });
      } else {
        left.push(flat(a.filename) || 'attachment');
      }
    }
  }

  const facts = [
    ['From', originalFrom],
    ['To', to],
    ['Received', mail.created_at || data.created_at || ''],
    ['Sender checks', checks || 'not reported'],
    ...(left.length ? [['Not attached (too large)', left.join(', ')]] : [])
  ].filter(([, v]) => v);
  const banner = suspicious ? 'Sender checks failed: treat links and attachments in this message with care.' : '';
  const headText = `${banner ? `${banner}\n` : ''}${facts.map(([k, v]) => `${k}: ${v}`).join('\n')}\nReply to this email to answer ${addressOf(replyAddress)}.\n${'-'.repeat(48)}\n\n`;
  const headHtml =
    `<div style="font:13px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#444;background:#f4f3ef;border:1px solid #e2e0d9;border-radius:6px;padding:10px 14px;margin:0 0 16px">` +
    (banner ? `<p style="margin:0 0 6px;color:#b42318;font-weight:600">${esc(banner)}</p>` : '') +
    facts.map(([k, v]) => `<div><strong>${esc(k)}:</strong> ${esc(v)}</div>`).join('') +
    `<div style="margin-top:6px;color:#666">Reply to this email to answer ${esc(addressOf(replyAddress))}.</div></div>`;

  const text = headText + (mail.text || (mail.html ? String(mail.html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '(no text)'));
  const html = mail.html ? headHtml + mail.html : `${headHtml}<pre style="white-space:pre-wrap;font:14px/1.5 monospace">${esc(mail.text || '(no text)')}</pre>`;

  try {
    const out = await sendEmail(env, {
      from: `${displayName(originalFrom)} via LRACDIMENSION <${addressOf(sender(env))}>`,
      to: forwardTo,
      subject: `${suspicious ? '[unverified sender] ' : ''}${subject}`,
      text,
      html,
      replyTo: addressOf(replyAddress),
      idempotencyKey: `inbound-${id}`,
      attachments,
      tags: [{ name: 'kind', value: 'inbound_forward' }]
    });
    console.log(JSON.stringify({ event: 'inbound.forwarded', email: id, forward: out.id, attachments: attachments.length, left: left.length }));
    return json({ received: true, forwarded: true });
  } catch (err) {
    if (err instanceof ResendError && err.permanent) {
      // Retrying cannot help; the message is still in Resend's received list.
      console.error(JSON.stringify({ event: 'inbound.forward_failed', email: id, reason: err.message }));
      return json({ received: true, forwarded: false, reason: 'refused' });
    }
    return error(502, 'upstream', 'Forwarding failed; Resend will retry the webhook.');
  }
}
