/**
 * The five Dimensions. This is the primary information architecture: each
 * entry is a capability environment, not a page label. `status` is honest
 * about what is live today: 'live' means the dimension works in the browser
 * now; 'building' means the page exists and says what it will do.
 */
export default [
  {
    index: '01',
    slug: 'work',
    name: 'Work',
    href: '/work/',
    identity: 'Architecture',
    descriptor: 'Projects and systems',
    summary: 'Projects and systems I have built: client work, internal tools, demos, and concepts, each with the problem, the architecture, and what shipped.',
    verbs: ['Problem', 'System', 'Architecture', 'Result'],
    status: 'live',
    proves: 'Experience'
  },
  {
    index: '02',
    slug: 'vector',
    name: 'Vector',
    href: '/vector/',
    identity: 'Diagnosis',
    descriptor: 'Web Clinic',
    summary: 'Examine a website, find the structural problems, and get a prioritised prescription. The diagnostic runs in the browser today; the Python analysis engine is the next build.',
    verbs: ['Examine', 'Diagnose', 'Prescribe', 'Improve'],
    status: 'live',
    proves: 'Analytical engineering'
  },
  {
    index: '03',
    slug: 'signal',
    name: 'Signal',
    href: '/signal/',
    identity: 'Telemetry',
    descriptor: 'Analytics and monitoring',
    summary: 'Uptime, response time, SSL, and search signals as measured data. In build: the page describes the system; no metrics are shown until they are real.',
    verbs: ['Measure', 'Monitor', 'Detect', 'Understand'],
    status: 'building',
    proves: 'Monitoring and data systems'
  },
  {
    index: '04',
    slug: 'forge',
    name: 'Forge',
    href: '/forge/',
    identity: 'Construction',
    descriptor: 'Web and developer tools',
    summary: 'Practical tools that run in your browser: JSON, URLs, slugs, timestamps, and text. Nothing you paste leaves the page.',
    verbs: ['Build', 'Transform', 'Validate', 'Generate'],
    status: 'live',
    proves: 'Practical development'
  },
  {
    index: '05',
    slug: 'research',
    name: 'Research',
    href: '/research/',
    identity: 'Investigation',
    descriptor: 'Engineering notes and studies',
    summary: 'Sourced articles, build logs, and technical investigations. Written to show the reasoning, not only the conclusion.',
    verbs: ['Question', 'Test', 'Measure', 'Conclude'],
    status: 'live',
    proves: 'Engineering thought'
  }
];
