/**
 * Execution logs — case notes on real work. Every fact and figure here is
 * on the résumé (JCGD_resume.pdf). Where the résumé gives no number, none
 * is claimed.
 */
export default [
  {
    date: '2025.06 — present',
    title: 'Spade_Local_SEO',
    arch: 'WordPress · local SEO silo · WCAG 2.1 AA',
    perf: '27 long-form articles',
    tags: ['WORDPRESS', 'LOCAL_SEO', 'WCAG_2.1_AA', 'PHP'],
    img: '/assets/img/projects/spade-website.svg',
    context:
      'Spade Security Services, Rocklin, California — a guarding company serving Placer County. Brought on as a freelance full-stack web developer to build and maintain the company website.',
    problem:
      'A security firm competes city by city. A single generic site does not rank for the towns it actually serves, and an inaccessible one exposes a business to complaints it cannot afford.',
    approach:
      'Built the WordPress site around a local SEO silo: service pages and 27 long-form articles structured to target Placer County cities individually. Implemented WCAG 2.1 AA compliance using the Equalize Digital Accessibility Checker with PHP code snippets for the fixes the theme could not make on its own.',
    code: [
      '// Accessibility fix registered as a snippet, not a theme hack',
      "add_filter('nav_menu_link_attributes', function ($atts, $item) {",
      "  if (in_array('current-menu-item', $item->classes, true)) {",
      "    $atts['aria-current'] = 'page';",
      '  }',
      '  return $atts;',
      '}, 10, 2);'
    ],
    outcomes: [
      { label: 'Delivered', value: '27 long-form SEO articles and service pages' },
      { label: 'Structure', value: 'Local SEO silo targeting Placer County cities' },
      { label: 'Compliance', value: 'WCAG 2.1 AA' }
    ]
  },
  {
    date: '2025 — present',
    title: 'Spade_Automation_Stack',
    arch: 'Argus · Spade Handler · Spade Inbox',
    perf: 'Three internal systems',
    tags: ['WP_REST_API', 'NVIDIA_MINIMAX', 'NEXT_JS', 'EXPRESS', 'POSTGRESQL', 'N8N'],
    img: '/assets/img/projects/argus.svg',
    context:
      'The same client, once the site was in place. Enquiries, publishing and inbound messages were each being handled by hand, in three different places.',
    problem:
      'A chatbot that forgets the conversation is worse than none. Publishing that needs a person to copy posts to each channel does not happen. An inbox nobody threads becomes a queue nobody clears.',
    approach:
      'Three systems, each on the stack that fit it. Argus: an AI chatbot on the WordPress REST API with an NVIDIA-hosted MiniMax model, full markdown rendering and session memory. Spade Handler: an internal blog publisher and social media automation tool in Next.js and Node.js on MongoDB, deployed on Railway. Spade Inbox: message-center automation in Express and TypeScript on PostgreSQL, with n8n handling email threading.',
    code: [
      '// Spade Inbox — thread an inbound message before it is stored',
      'router.post("/inbound", async (req, res) => {',
      '  const msg = parseInbound(req.body);',
      '  const thread = await threads.findOrCreate(msg.references);',
      '  await messages.insert({ ...msg, threadId: thread.id });',
      '  io.to(thread.id).emit("message", msg);',
      '  res.sendStatus(202);',
      '});'
    ],
    outcomes: [
      { label: 'Argus', value: 'Markdown replies with session memory' },
      { label: 'Spade Handler', value: 'Blog publishing and social automation on Railway' },
      { label: 'Spade Inbox', value: 'n8n email threading on Express / TypeScript / PostgreSQL' }
    ]
  },
  {
    date: '2025 — present',
    title: 'Content_Pipeline',
    arch: 'n8n · four-stage AI content pipeline',
    perf: 'Researcher → Writer → SEO → WordPress',
    tags: ['N8N', 'AI_CONTENT_PIPELINE', 'WORDPRESS', 'PROMPT_ENGINEERING'],
    img: '/assets/img/projects/content-pipeline.svg',
    context:
      'Twenty-seven articles is a content programme, not a one-off. Keeping it going by hand would have meant the programme stopping the first busy month.',
    problem:
      'Each article needed research, drafting, SEO work and publishing — four different kinds of attention, from one person, every time.',
    approach:
      'An n8n pipeline with four stages, each a separate step with its own prompt and its own output: Researcher gathers and structures the source material, Writer drafts against it, SEO Generator produces the title, meta and heading structure, and the WordPress publisher posts the result through the REST API.',
    code: [
      '// n8n — the four stages, as nodes',
      '[',
      '  { "name": "Researcher",   "type": "ai",        "out": "brief" },',
      '  { "name": "Writer",       "type": "ai",        "in": "brief",   "out": "draft" },',
      '  { "name": "SEO Generator","type": "ai",        "in": "draft",   "out": "post" },',
      '  { "name": "Publisher",    "type": "wordpress", "in": "post",    "op": "create" }',
      ']'
    ],
    outcomes: [
      { label: 'Stages', value: 'Research, write, SEO, publish' },
      { label: 'Output', value: 'Posts created through the WordPress REST API' },
      { label: 'Effect', value: 'The content programme runs without a person driving each step' }
    ]
  }
];
