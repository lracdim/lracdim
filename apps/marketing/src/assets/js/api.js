/**
 * Thin client for the LRACDIMENSION API. `apiBase` comes from site config;
 * when it is empty the dimensions fall back to their browser-only modes and
 * say so. Errors are normalised to {code, message} so UIs never show raw
 * transport details.
 */
import { CFG } from './config.js';
export const API_BASE = (CFG.apiBase || '').replace(/\/$/, '');
export const hasApi = () => !!API_BASE;

export class ApiError extends Error {
  constructor(code, message, status, fields) {
    super(message);
    this.code = code;
    this.status = status;
    this.fields = fields || [];
  }
}

export async function api(path, { method = 'GET', body, timeout = 20000, headers = {} } = {}) {
  if (!API_BASE) throw new ApiError('no_api', 'The API is not connected on this deployment.', 0);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      mode: 'cors'
    });
  } catch (err) {
    clearTimeout(timer);
    throw new ApiError(err && err.name === 'AbortError' ? 'timeout' : 'network', err && err.name === 'AbortError' ? 'The API did not answer in time.' : 'The API could not be reached.', 0);
  }
  clearTimeout(timer);
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const e = (data && data.error) || {};
    throw new ApiError(e.code || 'http_' + res.status, e.message || `Request failed (${res.status}).`, res.status, e.fields);
  }
  return data;
}

export const relTime = (iso) => {
  if (!iso) return 'never';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 45) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h ago`;
  return `${Math.round(diff / 86400)} d ago`;
};

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
