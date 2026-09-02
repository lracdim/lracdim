/**
 * Lead pipeline.
 *
 * Every form on the site funnels through postLead(). If site.leadWebhook is
 * set (an n8n Webhook node, or anything that accepts JSON POST), the lead
 * is delivered there. If it is empty, or delivery fails, the lead is queued
 * in localStorage and the caller is told so — the UI never pretends a human
 * will see something that went nowhere.
 */

const CFG = window.LRACDIM || {};
const QUEUE_KEY = 'lracdim:lead-queue';

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeQueue(items) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-50)));
  } catch {
    /* private mode */
  }
}

/**
 * @param {string} source  e.g. "diagnostic" | "start"
 * @param {object} fields  form fields
 * @returns {Promise<{sent: boolean, queued: boolean, reason?: string}>}
 */
export async function postLead(source, fields) {
  const lead = {
    source,
    ...fields,
    page: location.pathname + location.search,
    submittedAt: new Date().toISOString(),
    userAgent: navigator.userAgent
  };

  if (!CFG.leadWebhook) {
    writeQueue([...readQueue(), lead]);
    return { sent: false, queued: true, reason: 'no-webhook' };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(CFG.leadWebhook, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { sent: true, queued: false };
  } catch (err) {
    writeQueue([...readQueue(), lead]);
    return { sent: false, queued: true, reason: err && err.message ? err.message : 'network' };
  }
}

/** Retry anything that queued while the webhook was unreachable. */
export async function flushQueue() {
  if (!CFG.leadWebhook) return 0;
  const items = readQueue();
  if (!items.length) return 0;
  const remaining = [];
  for (const lead of items) {
    try {
      const res = await fetch(CFG.leadWebhook, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...lead, replayed: true })
      });
      if (!res.ok) remaining.push(lead);
    } catch {
      remaining.push(lead);
    }
  }
  writeQueue(remaining);
  return items.length - remaining.length;
}
