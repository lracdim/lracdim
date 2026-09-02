/**
 * Execution logs — real engagements, drawn from the same record as
 * _data/operations.js. Every figure here also appears on the Operations
 * page; nothing is claimed that the résumé does not.
 *
 * Images are local SVG plates until real screenshots are dropped into
 * src/assets/img/ — swap the `img` path, nothing else changes.
 */
export default [
  {
    date: '2025.06 — present',
    title: 'Spade_Web_Rebuild',
    arch: 'PHP / MySQL, custom modules',
    perf: '+40% system performance',
    tags: ['PHP', 'MYSQL', 'CUSTOM_MODULES', 'OPERATIONS'],
    img: '/assets/img/log-spade.svg',
    context:
      'Spade Security Services, Rocklin CA. A guarding company whose public site and internal tooling had grown separately and were both showing their age. Brought on as web developer and lead for system solutions and AI.',
    problem:
      'The website presented the company but did not serve it. Operational needs — scheduling, client-facing information, internal requests — were handled outside the system, so the site and the business had drifted apart.',
    approach:
      'Redeveloped the site and the backend behind it together. Backend improvements in PHP and MySQL, then custom web modules built around the specific operational requirements the team actually had, rather than a generic admin panel.',
    code: [
      '// Request routing — one entry point, explicit handlers',
      '$router->post("/ops/request", function (Request $r) {',
      '  $req = OpsRequest::fromForm($r->all());',
      '  $req->validate()->persist();',
      '  Notify::ops($req);           // lands with the right team',
      '  return Response::json(["id" => $req->id], 201);',
      '});'
    ],
    outcomes: [
      { label: 'Measured', value: '40% improvement in system performance' },
      { label: 'Delivered', value: 'Custom web solutions for operational needs' },
      { label: 'Role', value: 'Web dev, system solutions and AI lead' }
    ]
  },
  {
    date: '2024.11 — 2025.07',
    title: 'Agent_Pipeline',
    arch: 'AI-integrated web applications',
    perf: '−70% operational cost',
    tags: ['AI_AGENTS', 'AUTOMATION', 'ENTERPRISE_INTEGRATION', 'WEB_APPS'],
    img: '/assets/img/log-agentgenius.svg',
    context:
      'AgentGenius.ai, Toronto. Automation engineer building AI-powered web applications and integrating automation tooling into enterprise systems that already existed and could not be replaced.',
    problem:
      'Work that should have been handled by a system was being handled by people: repetitive processing, hand-offs between tools, and performance tuning done by intuition rather than data.',
    approach:
      'Built and deployed AI-powered web applications, then integrated automation into the client’s existing enterprise systems instead of alongside them. Web performance and user experience optimised using data-driven AI insights rather than guesswork.',
    code: [
      '// Agent step — bounded, logged, retryable',
      'const result = await agent.run({',
      '  input: job.payload,',
      '  tools: [crm.lookup, docs.extract, mail.draft],',
      '  maxSteps: 6,',
      '});',
      'await queue.ack(job, { trace: result.trace });'
    ],
    outcomes: [
      { label: 'Measured', value: 'Reduced operational costs by 70%' },
      { label: 'Delivered', value: 'AI web apps integrated into existing enterprise systems' },
      { label: 'Approach', value: 'Data-driven performance and UX optimisation' }
    ]
  },
  {
    date: '2025.01 — present',
    title: 'Site_to_System',
    arch: 'n8n workflows, webhooks, AI integration',
    perf: '8+ clients on automated platforms',
    tags: ['N8N', 'WEBHOOKS', 'AI_INTEGRATION', 'WORDPRESS_JETENGINE'],
    img: '/assets/img/log-elimate.svg',
    context:
      'Elimate Web Automation — founded to turn standard business websites into AI-powered automated platforms. Founder and web strategist; also the person the clients call.',
    problem:
      'Most small-business websites collect a form and stop. Everything after that — follow-up, qualification, scheduling, reporting — falls on whoever remembers to do it, and it leaks.',
    approach:
      'Intelligent automation tailored to each client, built on system integrations: n8n workflows triggered by site events, webhooks into the tools the client already pays for, and AI steps where a judgement call used to need a person. Direct support, maintenance and troubleshooting for every AI-integrated application shipped.',
    code: [
      '// n8n — form submission → qualify → route',
      '{ "nodes": [',
      '  { "type": "webhook",   "path": "/lead" },',
      '  { "type": "ai.classify", "labels": ["hot","warm","cold"] },',
      '  { "type": "switch",    "on": "label" },',
      '  { "type": "crm.create", "when": "hot" }',
      ']}'
    ],
    outcomes: [
      { label: 'Measured', value: 'Serving 8+ enterprise clients' },
      { label: 'Delivered', value: 'Websites converted into automated platforms' },
      { label: 'Ongoing', value: 'Direct support, maintenance and troubleshooting' }
    ]
  }
];
