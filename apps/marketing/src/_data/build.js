/* Build identity for cache-busting entry assets. Vercel exposes the commit;
   locally fall back to the time so every build gets a fresh query string. */
export default {
  version: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 10) || String(Date.now())
};
