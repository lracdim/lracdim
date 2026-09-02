export default {
  name: 'LRACDIMENSION',
  shortName: 'LRACDIM',
  owner: 'John Carl Dimatulac',
  initials: 'J.C.D',
  role: 'System Builder / Automation Engineer',
  location: 'Laguna, Philippines 4025',
  url: 'https://lracdimension.com',
  description:
    'John Carl Dimatulac builds systems that run operations — real-time tracking, scheduling engines, and scalable web infrastructure. Designed for execution, not presentation.',
  email: 'john@spadesecurityservices.com',

  /* ------------------------------------------------------------------
     Runtime integrations. Both are optional; the site degrades honestly
     when they are empty.

     scanEndpoint — URL of the deployed Cloudflare Worker in workers/scan/.
       When set, "Analyze my website" fetches the prospect's real HTML
       through it and reports a LIVE scan. When empty, it falls back to the
       modelled profile and says so in the report.

     leadWebhook — an n8n Webhook node URL (or any endpoint accepting JSON
       POST). Every diagnostic request and every /start/ submission is sent
       here as { source, ...fields, submittedAt, page }. When empty,
       submissions are kept in localStorage and the UI says a human will
       not see them yet.
     ------------------------------------------------------------------ */
  scanEndpoint: '',
  leadWebhook: '',

  /* Public profiles. Only entries with a real URL are rendered. */
  social: [
    { label: 'GitHub', href: '' },
    { label: 'LinkedIn', href: '' },
    { label: 'Email', href: 'mailto:john@spadesecurityservices.com' }
  ],

  nav: [
    { label: 'Builds', href: '/builds/' },
    { label: 'Industries', href: '/industries/' },
    { label: 'Templates', href: '/demos/' },
    { label: 'Capabilities', href: '/capabilities/' },
    { label: 'Operations', href: '/operations/' },
    { label: 'Logs', href: '/logs/' },
    { label: 'Terminal', href: '/terminal/' }
  ]
};
