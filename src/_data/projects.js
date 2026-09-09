/**
 * Named projects — every entry and every fact here comes from the résumé
 * (JCGD_resume.pdf, "Work experience" and "Notable projects"). `kind` keeps
 * the résumé's own distinctions: client work is client work, a demo is a
 * demo, a concept is a concept. No metric is stated that the résumé does not
 * state, and "result" describes what was delivered, not an outcome figure.
 *
 * Fields used by the case-study page (project.njk) via _data/portfolio.js:
 *   kind      – Client work / Internal tool / Portfolio demo / Redesign concept / …
 *   role      – my role on the project
 *   context   – what the project is and who it is for
 *   approach  – what I built and how
 *   facts     – delivered features (bullet list)
 *   result    – delivery status, stated plainly
 */
export default [
  /* ---------------- Spade Security Services (June 2025 – present) ------- */
  {
    slug: 'spade-website',
    name: 'Spade Security Services website',
    org: 'Spade Security Services',
    status: 'live',
    kind: 'Client work',
    category: 'WordPress · Local SEO · Accessibility',
    role: 'Freelance Full-Stack Web Developer, June 2025 to present',
    summary:
      'Built and maintained the company WordPress site: 27 long-form SEO articles, service pages, and a local SEO silo targeting Placer County cities. WCAG 2.1 AA compliance implemented with Equalize Digital Accessibility Checker and PHP code snippets.',
    context:
      'Spade Security Services is a security company in Rocklin, California. I build and maintain its public WordPress website as a remote freelance developer.',
    approach:
      'Service pages, 27 long-form SEO blog articles, and a local SEO silo architecture targeting Placer County cities. WCAG 2.1 AA accessibility compliance implemented with the Equalize Digital Accessibility Checker and PHP code snippets.',
    result:
      'The site is live at spadesecurityservices.com and remains under my maintenance. Traffic and ranking figures are not published here.',
    stack: ['WordPress', 'PHP', 'Local SEO', 'WCAG 2.1 AA'],
    facts: ['27 long-form SEO articles', 'Service pages', 'Local SEO silo targeting Placer County cities', 'WCAG 2.1 AA compliance'],
    img: '/assets/img/projects/spade-website.svg',
    featured: true
  },
  {
    slug: 'argus',
    name: 'Argus',
    org: 'Spade Security Services',
    status: 'live',
    kind: 'Client work',
    category: 'AI chatbot',
    role: 'Developer, as part of the Spade freelance engagement',
    summary:
      'AI chatbot for the Spade site, built on the WordPress REST API with an NVIDIA-hosted MiniMax model. Full markdown rendering in replies and session memory across a conversation.',
    context:
      'An AI chatbot that runs inside the Spade Security Services WordPress site and answers visitors in conversation.',
    approach:
      'Built on the WordPress REST API with an NVIDIA-hosted MiniMax model. Replies render full markdown, and the bot keeps session memory across a conversation.',
    result:
      'Developed for the Spade website as part of the ongoing engagement. Usage figures are not published here.',
    stack: ['WordPress REST API', 'NVIDIA MiniMax', 'Markdown rendering', 'Session memory'],
    facts: ['WordPress REST API integration', 'NVIDIA-hosted MiniMax model', 'Full markdown rendering', 'Session memory'],
    img: '/assets/img/projects/argus.svg',
    featured: true
  },
  {
    slug: 'spade-handler',
    name: 'Spade Handler',
    org: 'Spade Security Services',
    status: 'internal',
    kind: 'Internal tool',
    category: 'Publishing & social automation',
    role: 'Developer, as part of the Spade freelance engagement',
    summary:
      'Internal blog publisher and social media automation tool. Next.js and Node.js with MongoDB, deployed on Railway.',
    context:
      'An internal tool for Spade Security Services that publishes blog posts and automates social media distribution.',
    approach:
      'Next.js front end with a Node.js back end on MongoDB, deployed on Railway.',
    result:
      'Deployed on Railway as an internal tool. Screens are not shown publicly because the tool is internal to the client.',
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
    kind: 'Internal tool',
    category: 'Message-center automation',
    role: 'Developer, as part of the Spade freelance engagement',
    summary:
      'Message center automation with n8n email threading. Express and TypeScript on PostgreSQL.',
    context:
      'A message center for Spade Security Services that automates how incoming email is threaded and handled.',
    approach:
      'Express and TypeScript service on PostgreSQL, with n8n workflows handling email threading.',
    result:
      'Delivered as an internal tool for the client. Screens are not shown publicly.',
    stack: ['Express', 'TypeScript', 'PostgreSQL', 'n8n'],
    facts: ['Message center automation', 'n8n email threading', 'Express / TypeScript / PostgreSQL'],
    img: '/assets/img/projects/spade-inbox.svg',
    featured: true
  },
  {
    slug: 'content-pipeline',
    name: 'n8n blog automation pipeline',
    org: 'Spade Security Services',
    status: 'live',
    kind: 'Client work',
    category: 'Automation',
    role: 'Automation engineer, as part of the Spade freelance engagement',
    summary:
      'Four-stage n8n pipeline that takes a topic through research, writing, and SEO generation, then publishes to WordPress.',
    context:
      'The automation behind blog publishing on the Spade Security Services website.',
    approach:
      'Four n8n stages in sequence: a Researcher, a Writer, an SEO Generator, and a WordPress publisher. The home page walkthrough illustrates the stages.',
    result:
      'Publishes to the Spade WordPress site. The walkthrough on this site is an illustration and does not generate content.',
    stack: ['n8n', 'AI content pipeline', 'WordPress'],
    facts: ['Researcher stage', 'Writer stage', 'SEO Generator stage', 'WordPress publisher stage'],
    img: '/assets/img/projects/content-pipeline.svg',
    featured: true
  },

  /* ---------------- Notable projects --------------------------------------- */
  {
    slug: 'spade-academy',
    name: 'Spade Academy LMS',
    org: 'Spade Security Services',
    status: 'live',
    kind: 'Client work',
    category: 'Learning management',
    role: 'Full-stack developer',
    summary:
      'Learning management system with video progress tracking, quizzes, and certificate generation. React and TypeScript frontend on Hostinger; Express and PostgreSQL backend on Railway.',
    context:
      'A learning management system built for Spade Security Services training content.',
    approach:
      'React and TypeScript front end hosted on Hostinger, with an Express and PostgreSQL back end on Railway.',
    result:
      'Delivered with video progress tracking, quizzes, and certificate generation. Learner numbers are not published here.',
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
    kind: 'Independent plugin',
    category: 'WordPress plugin',
    role: 'Author and developer',
    summary:
      'WordPress SEO plugin (v1.0.5) with a PipeFlow auto-fill engine. A SaaS version at rankking.io is planned.',
    context:
      'A WordPress SEO plugin I develop independently.',
    approach:
      'PHP plugin with a PipeFlow auto-fill engine for SEO fields.',
    result:
      'Released as version 1.0.5. A SaaS version at rankking.io is planned, not launched.',
    stack: ['WordPress', 'PHP', 'PipeFlow'],
    facts: ['Version 1.0.5', 'PipeFlow auto-fill engine', 'SaaS at rankking.io planned'],
    img: '/assets/img/projects/rankking.svg',
    featured: true
  },
  {
    slug: 'meridian',
    name: 'Meridian',
    org: 'Independent (formerly Avinu)',
    status: 'demo',
    kind: 'Portfolio demo',
    category: 'Medical courier & logistics platform',
    role: 'Design and development, independent',
    summary:
      'Medical courier and logistics platform demo: marketing site, quote flow, full admin dashboard, and a Capacitor driver mobile app.',
    context:
      'A medical courier and logistics platform built as a portfolio demo, formerly named Avinu.',
    approach:
      'React marketing site with a quote flow, a full admin dashboard, and a Capacitor driver mobile app, deployed on Vercel.',
    result:
      'Live as a demo at meridian09.vercel.app. It is not a production transport operation.',
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
    kind: 'Client work',
    category: 'Membership & accreditation',
    role: 'Full-stack developer',
    summary:
      'Membership and accreditation platform on React and Firebase, with PayCools payment integration.',
    context:
      'A membership and accreditation platform for an organisation that manages accredited members.',
    approach:
      'React front end on Firebase, with PayCools integrated for payments.',
    result:
      'Delivered with membership, accreditation, and PayCools payment integration.',
    stack: ['React', 'Firebase', 'PayCools'],
    facts: ['Membership management', 'Accreditation', 'PayCools payments'],
    img: '/assets/img/projects/paha.svg',
    featured: false
  },
  {
    slug: 'eskwela',
    name: 'e-Skwela / NSSC',
    org: 'Portfolio demo',
    status: 'demo',
    kind: 'Portfolio demo',
    category: 'Student information system',
    role: 'Design and development, independent',
    summary:
      'Role-based student information system and school marketing website, built as a portfolio demo.',
    context:
      'A student information system and school marketing website built as a portfolio demo.',
    approach:
      'React application with role-based access for the information system, alongside a marketing site.',
    result:
      'Built as a portfolio demo.',
    stack: ['React', 'Role-based access'],
    facts: ['Role-based student information system', 'School marketing website'],
    img: '/assets/img/projects/eskwela.svg',
    featured: false
  },
  {
    slug: 'st-clair',
    name: 'St. Clair Inn',
    org: 'Concept',
    status: 'concept',
    kind: 'Redesign concept',
    category: 'Hotel website redesign',
    role: 'Design and development, independent concept',
    summary:
      'Full website redesign concept for a historic hotel: an animated React marketing site with booking-focused UX.',
    context:
      'A full website redesign concept for a historic hotel, produced independently.',
    approach:
      'Animated React and TypeScript marketing site with booking-focused UX, deployed on Vercel.',
    result:
      'Concept live at st-claire.vercel.app. It was not commissioned by the hotel and has no production booking system.',
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
    kind: 'Redesign concept',
    category: 'Spec website redesign',
    role: 'Design and development, independent concept',
    summary:
      'Spec website redesign concept built for a California security firm as a cold-outreach pitch.',
    context:
      'A speculative website redesign for a California security firm, built as a cold-outreach pitch.',
    approach:
      'React marketing site concept.',
    result:
      'Built as a pitch. Not commissioned client work.',
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
    kind: 'Client work',
    category: 'Raffle system',
    role: 'Developer',
    summary: 'Raffle system on React and Firebase, migrated from Hostinger to Vercel.',
    context: 'A raffle system for a brewfest event.',
    approach: 'React application on Firebase.',
    result: 'Delivered, then migrated from Hostinger to Vercel.',
    stack: ['React', 'Firebase', 'Vercel'],
    facts: ['Raffle system', 'Migrated from Hostinger to Vercel'],
    img: '/assets/img/projects/brewfest.svg',
    featured: false
  },
  {
    slug: 'bakerich',
    name: 'Bakerich',
    org: 'Client',
    status: 'built',
    kind: 'Client work',
    category: 'Bakery website with AI recipes',
    role: 'Developer',
    summary: 'Bakery website with an AI-generated recipe pipeline via OpenRouter and Appwrite.',
    context: 'A bakery website with an AI-generated recipe pipeline.',
    approach: 'Recipe generation through OpenRouter, with Appwrite as the back end.',
    result: 'Delivered with the AI recipe pipeline.',
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
    kind: 'Personal project',
    category: 'Engineering workspace',
    role: 'Design and development',
    summary:
      'Personal engineering workspace site on Eleventy with a live website diagnostic system. The diagnostic runs a structural read in the browser; the PageSpeed Insights integration with AI-generated scoring described in the résumé is the next step for it.',
    context:
      'This site. A personal engineering workspace built on Eleventy.',
    approach:
      'Eleventy static site with vanilla JavaScript, a Three.js system scene, and a website diagnostic that runs a structural read in the browser.',
    result:
      'Live. The PageSpeed Insights integration with AI-generated scoring described in the résumé is the next step for the diagnostic.',
    stack: ['Eleventy', 'Vanilla JS', 'Three.js', 'Cloudflare'],
    facts: ['Eleventy', 'Website diagnostic system', 'Three.js system scene'],
    img: '/assets/img/projects/lracdimension.svg',
    featured: false
  }
];
