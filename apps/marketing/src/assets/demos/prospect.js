/* Loaded by layouts/demo.njk. Kept external so the demo CSP can forbid inline scripts. */
/* Prospect personalisation: /demos/clinic/?prospect=Ridgeway%20Family%20Care
   swaps the displayed brand name at runtime so a demo link can be sent to a
   named business without rebuilding the site. */
(function () {
  try {
    var name = new URLSearchParams(location.search).get('prospect');
    if (!name) return;
    name = name.slice(0, 60).trim();
    if (!name) return;

    document.querySelectorAll('[data-brand-name]').forEach(function (el) {
      el.textContent = name;
    });
    document.querySelectorAll('[data-brand-short]').forEach(function (el) {
      el.textContent = name.split(/\s+/).slice(0, 2).join(' ');
    });
    document.querySelectorAll('[data-brand-mark]').forEach(function (el) {
      el.textContent = name
        .split(/\s+/)
        .slice(0, 2)
        .map(function (w) { return w.charAt(0); })
        .join('')
        .toUpperCase();
    });

    document.title = document.title.replace(/[^—]+$/, name);

    /* Keep the parameter attached while browsing the demo. */
    document.querySelectorAll('a[href^="/demos/"]').forEach(function (a) {
      var u = new URL(a.getAttribute('href'), location.origin);
      u.searchParams.set('prospect', name);
      a.setAttribute('href', u.pathname + u.search);
    });
  } catch (e) {
    /* Personalisation is cosmetic — never let it break the page. */
  }
})();
