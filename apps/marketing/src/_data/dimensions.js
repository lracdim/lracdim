/**
 * The five Dimensions. This is the primary information architecture: each
 * entry is a capability environment, not a page label. `status` is honest
 * about what is live today: 'live' means the dimension works in the browser
 * now; 'building' means the page exists and says what it will do (none at present).
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
    summary: 'Examine a website with eight analyzers, AI visibility and Core Web Vitals included, see the summary at once, and get every issue with its evidence and a prioritised prescription by email. Reports are stored, shareable, and comparable over time.',
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
    summary: 'Enter a domain and get measured SEO, technical, performance, and analytics signals now; then scheduled checks of uptime, response time, and SSL are stored as events. Only measured data is shown.',
    verbs: ['Measure', 'Monitor', 'Detect', 'Understand'],
    status: 'live',
    proves: 'Monitoring and data systems'
  },
  {
    index: '04',
    slug: 'forge',
    name: 'Forge',
    href: '/forge/',
    identity: 'Construction',
    descriptor: 'Web and developer tools',
    summary: 'Fifteen practical tools for AI visibility, SEO, email and everyday web work. Browser tools never send what you paste; the checkers reach other sites through the engine’s validated, rate-limited fetcher.',
    verbs: ['Build', 'Transform', 'Validate', 'Generate'],
    status: 'live',
    proves: 'Practical development'
  },
  {
    index: '05',
    slug: 'labs',
    name: 'Labs',
    href: '/labs/',
    identity: 'Investigation',
    descriptor: 'Engineering notes and studies',
    summary: 'Sourced articles, build logs, and technical investigations. Written to show the reasoning, not only the conclusion.',
    verbs: ['Question', 'Test', 'Measure', 'Conclude'],
    status: 'live',
    proves: 'Engineering thought'
  }
];
