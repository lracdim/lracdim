export default {
  name: 'LRACDIMENSION',
  shortName: 'LRACDIM',
  owner: 'John Carl Dimatulac',
  initials: 'J.C.D',
  role: 'Full-Stack Web Developer · WordPress & Automation Engineer',
  location: 'Sta. Rosa, Laguna, Philippines',
  url: 'https://lracdimension.com',
  description:
    'John Carl Dimatulac builds systems that run operations — real-time tracking, scheduling engines, and scalable web infrastructure. Designed for execution, not presentation.',
  email: 'lracdim@gmail.com',

  /* Public résumé (PDF). Leave empty until a version without personal data
     and references is exported; the link is hidden while empty. */
  resumeUrl: '',
  portrait: '/assets/img/brand/portrait-1200.jpg',

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
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/carl-dimatulac/' },
    { label: 'Email', href: 'mailto:lracdim@gmail.com' }
  ],

  nav: [
    { label: 'Work', href: '/work/' },
    { label: 'Services', href: '/services/' },
    { label: 'Process', href: '/process/' },
    { label: 'About', href: '/about/' }
  ],

  cta: { label: 'Hire me', href: '/start/' },

  /* Secondary and experimental destinations live in the footer only. */
  footerLinks: [
    { label: 'Build notes', href: '/logs/' },
    { label: 'Resume', href: '/resume/' },
    { label: 'Clinic demo template', href: '/demos/clinic/' },
    { label: 'Industry blueprints', href: '/services/#sectors' },
    { label: 'Elimate Web Automation', href: 'https://elimate.vercel.app' }
  ]
};
