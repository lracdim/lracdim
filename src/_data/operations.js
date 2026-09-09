/**
 * Work history — exactly as on the résumé (JCGD_resume.pdf). `delivered`
 * lists what the résumé says was built or done; no figures are added.
 */
export default {
  history: [
    {
      date: 'June 2025 — Present',
      role: 'Freelance',
      title: 'Freelance Full-Stack Web Developer',
      company: 'Spade Security Services — Rocklin, CA (remote)',
      points: [
        'Built and maintained the company WordPress website, including 27 long-form SEO blog articles, service pages, and a local SEO silo architecture targeting Placer County cities.',
        'Developed the Argus AI chatbot (WordPress REST API + NVIDIA-hosted MiniMax) with full markdown rendering and session memory.',
        'Built Spade Handler, an internal blog publisher and social media automation tool (Next.js / Node.js / MongoDB, deployed on Railway).',
        'Created Spade Inbox (Express / TypeScript / PostgreSQL) for message-center automation with n8n email threading.',
        'Implemented WCAG 2.1 AA accessibility compliance using Equalize Digital Accessibility Checker and PHP code snippets.',
        'Developed an n8n blog automation pipeline: Researcher, Writer, SEO Generator, WordPress publisher.'
      ],
      delivered: 'Company site, Argus, Spade Handler, Spade Inbox, content pipeline'
    },
    {
      date: 'August 2023 — 2026',
      role: 'IT staff',
      title: 'IT Staff / Web Developer',
      company: 'Sumitomo Mitsui Construction Co. / SaGabuilt Development Corp. — Calumpit, Bulacan',
      points: ['Supported IT infrastructure and internal digital tools for construction yard operations.'],
      delivered: 'IT infrastructure and internal tools for yard operations'
    },
    {
      date: 'April 2017 — March 2018',
      role: 'Network admin',
      title: 'Network Administrator',
      company: 'Pistevo Incorporated — Cabuyao, Laguna',
      points: ['Managed the local area network, hardware maintenance, and IT support for office staff.'],
      delivered: 'LAN, hardware maintenance, IT support'
    },
    {
      date: 'May 2016 — January 2017',
      role: 'Clerk',
      title: 'Accounting Clerk',
      company: 'Bulalacao Municipal Hall — Bulalacao, Oriental Mindoro',
      points: ['Handled financial records and clerical accounting duties for the municipal government.'],
      delivered: 'Financial records for the municipal government'
    }
  ]
};
