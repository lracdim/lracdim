/**
 * Google Analytics 4. Loaded only when the site config carries a measurement
 * id, and kept as an external module so the Content-Security-Policy can stay
 * free of inline scripts. The gtag library is injected from Google's host,
 * which the CSP allows explicitly.
 */
import { CFG } from './config.js';

const id = CFG.gaId;
if (id && /^G-[A-Z0-9]+$/.test(id)) {
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', id, { anonymize_ip: true });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s);
}
