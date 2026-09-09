/**
 * Named projects — every entry and every fact here comes from the résumé
 * (JCGD_resume.pdf, "Work experience" and "Notable projects"). Status labels
 * preserve the résumé's own distinctions: a demo is a demo, a concept is a
 * concept. No metrics are stated that the résumé does not state.
 *
 * `img` points to a local plate until a real screenshot lands in
 * src/assets/img/projects/<slug>.png — swap the path, nothing else changes.
 */
export default [
  /* ---------------- Spade Security Services (June 2025 – present) ------- */
  {
    slug: 'spade-website',
    name: 'Spade Security Services website',
    org: 'Spade Security Services',
    status: 'live',
    category: 'WordPress · Local SEO · Accessibility',
    summary:
      'Built and maintained the company WordPress site: 27 long-form SEO articles, service pages, and a local SEO silo targeting Placer County cities. WCAG 2.1 AA compliance implemented with Equalize Digital Accessibility Checker and PHP code snippets.',
    stack: ['WordPress', 'PHP', 'Local SEO', 'WCAG 2.1 AA'],
    facts: ['27 long-form SEO articles', 'Local SEO silo — Placer County', 'WCAG 2.1 AA'],
    img: '/assets/img/projects/spade-website.svg',
    featured: true
  },
  {
    slug: 'argus',
    name: 'Argus',
    org: 'Spade Security Services',
    status: 'live',
    category: 'AI chatbot',
    summary:
      'AI chatbot for the Spade site, built on the WordPress REST API with an NVIDIA-hosted MiniMax model. Full markdown rendering in replies and session memory across a conversation.',
    stack: ['WordPress REST API', 'NVIDIA MiniMax', 'Markdown rendering', 'Session memory'],
    facts: ['WordPress REST API + NVIDIA-hosted MiniMax', 'Markdown rendering', 'Session memory'],
    img: '/assets/img/projects/argus.svg',
    featured: true
  },
  {
    slug: 'spade-handler',
    name: 'Spade Handler',
    org: 'Spade Security Services',
    status: 'internal',
    category: 'Publishing & social automation',
    summary:
      'Internal blog publisher and social media automation tool. Next.js and Node.js with MongoDB, deployed on Railway.',
    stack: ['Next.js', 'Node.js', 'MongoDB', 'Railway'],
    facts: ['Blog publisher', 'Social media automation', 'Deployed on Railway'],
    img: '/assets/img/projects/spade-handler.svg',
    featured: true
  },
  {
    slug: 'spade-inbox',
    name: 'Spade Inbox',
    org: 'Spade Security Services',
    status: 'internal',
    category: 'Message-center automation',
    summary:
      'Message center automation with n8n email threading. Express and TypeScript on PostgreSQL.',
    stack: ['Express', 'TypeScript', 'PostgreSQL', 'n8n'],
    facts: ['n8n email threading', 'Express / TypeScript / PostgreSQL'],
    img: '/assets/img/projects/spade-inbox.svg',
    featured: true
  },
  {
    slug: 'content-pipeline',
    name: 'n8n blog automation pipeline',
    org: 'Spade Security Services',
    status: 'live',
    category: 'Automation',
    summary:
      'Four-stage n8n pipeline that takes a topic through research, writing, and SEO generation, then publishes to WordPress.',
    stack: ['n8n', 'AI content pipeline', 'WordPress'],
    facts: ['Researcher → Writer → SEO Generator → WordPress publisher'],
    img: '/assets/img/projects/content-pipeline.svg',
    featured: true
  },

  /* ---------------- Notable projects --------------------------------------- */
  {
    slug: 'spade-academy',
    name: 'Spade Academy LMS',
    org: 'Spade Security Services',
    status: 'live',
    category: 'Learning management',
    summary:
      'Learning management system with video progress tracking, quizzes, and certificate generation. React and TypeScript frontend on Hostinger; Express and PostgreSQL backend on Railway.',
    stack: ['React', 'TypeScript', 'Express', 'PostgreSQL', 'Hostinger', 'Railway'],
    facts: ['Video progress tracking', 'Quizzes', 'Certificate generation'],
    img: '/assets/img/projects/spade-academy.svg',
    featured: true
  },
  {
    slug: 'rankking',
    name: 'RankKing SEO',
    org: 'Independent',
    status: 'plugin',
    category: 'WordPress plugin',
    summary:
      'WordPress SEO plugin (v1.0.5) with a PipeFlow auto-fill engine. A SaaS version at rankking.io is planned.',
    stack: ['WordPress', 'PHP', 'PipeFlow'],
    facts: ['v1.0.5', 'PipeFlow auto-fill engine', 'SaaS planned: rankking.io'],
    img: '/assets/img/projects/rankking.svg',
    featured: true
  },
  {
    slug: 'meridian',
    name: 'Meridian',
    org: 'Independent (formerly Avinu)',
    status: 'demo',
    category: 'Medical courier & logistics platform',
    summary:
      'Medical courier and logistics platform demo: marketing site, quote flow, full admin dashboard, and a Capacitor driver mobile app.',
    stack: ['React', 'Capacitor', 'Vercel'],
    facts: ['Marketing site', 'Quote flow', 'Admin dashboard', 'Capacitor driver app'],
    url: 'https://meridian09.vercel.app',
    img: '/assets/img/projects/meridian.svg',
    featured: true
  },
  {
    slug: 'paha',
    name: 'PAHA',
    org: 'Client',
    status: 'built',
    category: 'Membership & accreditation',
    summary:
      'Membership and accreditation platform on React and Firebase, with PayCools payment integration.',
    stack: ['React', 'Firebase', 'PayCools'],
    facts: ['Membership and accreditation', 'PayCools payments'],
    img: '/assets/img/projects/paha.svg',
    featured: false
  },
  {
    slug: 'eskwela',
    name: 'e-Skwela / NSSC',
    org: 'Portfolio demo',
    status: 'demo',
    category: 'Student information system',
    summary:
      'Role-based student information system and school marketing website, built as a portfolio demo.',
    stack: ['React', 'Role-based access'],
    facts: ['Role-based SIS', 'School marketing site'],
    img: '/assets/img/projects/eskwela.svg',
    featured: false
  },
  {
    slug: 'st-clair',
    name: 'St. Clair Inn',
    org: 'Concept',
    status: 'concept',
    category: 'Hotel website redesign',
    summary:
      'Full website redesign concept for a historic hotel: an animated React marketing site with booking-focused UX.',
    stack: ['React', 'TypeScript', 'Vercel'],
    facts: ['Animated marketing site', 'Booking-focused UX'],
    url: 'https://st-claire.vercel.app',
    img: '/assets/img/projects/st-clair.svg',
    featured: false
  },
  {
    slug: 'delta-one',
    name: 'Delta One Security',
    org: 'Concept',
    status: 'concept',
    category: 'Spec website redesign',
    summary:
      'Spec website redesign concept built for a California security firm as a cold-outreach pitch.',
    stack: ['React'],
    facts: ['Cold-outreach pitch', 'Spec redesign'],
    img: '/assets/img/projects/delta-one.svg',
    featured: false
  },
  {
    slug: 'brewfest',
    name: 'Brewfest Raffle System',
    org: 'Client',
    status: 'live',
    category: 'Raffle system',
    summary: 'Raffle system on React and Firebase, migrated from Hostinger to Vercel.',
    stack: ['React', 'Firebase', 'Vercel'],
    facts: ['Migrated Hostinger → Vercel'],
    img: '/assets/img/projects/brewfest.svg',
    featured: false
  },
  {
    slug: 'bakerich',
    name: 'Bakerich',
    org: 'Client',
    status: 'built',
    category: 'Bakery website with AI recipes',
    summary: 'Bakery website with an AI-generated recipe pipeline via OpenRouter and Appwrite.',
    stack: ['OpenRouter', 'Appwrite'],
    facts: ['AI-generated recipe pipeline'],
    img: '/assets/img/projects/bakerich.svg',
    featured: false
  },
  {
    slug: 'lracdimension',
    name: 'LRAC Dimension',
    org: 'This site',
    status: 'live',
    category: 'Engineering workspace',
    summary:
      'Personal engineering workspace site on Eleventy with a live website diagnostic system. The diagnostic runs a structural read in the browser; the PageSpeed Insights integration with AI-generated scoring described in the résumé is the next step for it.',
    stack: ['Eleventy', 'Vanilla JS', 'Cloudflare'],
    facts: ['Eleventy', 'Website diagnostic system'],
    img: '/assets/img/projects/lracdimension.svg',
    featured: false
  }
];
