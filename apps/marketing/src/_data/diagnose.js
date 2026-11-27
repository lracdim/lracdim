/**
 * Bottleneck Finder questions. Each "yes" is a leak; `weight` is how much it
 * usually costs (3 = loses jobs, 1 = loses hours). The fix names the system
 * that removes it and the page that explains it. Answers score 2 (yes),
 * 1 (sometimes) or 0 (no). Industry detail comes from _data/industries.js.
 */
export default [
  {
    id: 'intake',
    q: 'New enquiries arrive through several channels — email, phone, chat, forms — and nobody has one list of them.',
    leak: 'Enquiries are scattered',
    cost: 'Leads go unanswered when they land in the wrong inbox, and nobody can say how many came in this week.',
    fix: 'One intake queue: every form, email and message lands in a single list with an owner and a status.',
    link: { label: 'Operations systems', href: '/services/#operations' },
    need: 'Business System',
    weight: 3
  },
  {
    id: 'response',
    q: 'Quotes, bookings or first replies to a new customer take more than a day.',
    leak: 'Slow first response',
    cost: 'The first business to answer usually wins the job. Every hour of delay is a customer calling someone else.',
    fix: 'Instant replies and quote pipelines: requests acknowledged or priced automatically, within minutes.',
    link: { label: 'Workflow automation', href: '/services/#automation' },
    need: 'Automation',
    weight: 3
  },
  {
    id: 'double',
    q: 'The same information is typed into two or more places — spreadsheets, invoices, a CRM, a booking tool.',
    leak: 'Double entry',
    cost: 'Hours every week spent retyping, and every copy is another chance for a mistake to reach a customer.',
    fix: 'Integrations: enter it once and it flows to every tool that needs it.',
    link: { label: 'Integrations and internal tools', href: '/services/#integrations' },
    need: 'Automation',
    weight: 2
  },
  {
    id: 'status',
    q: 'Customers or staff have to ask someone to find out where a job, order or request stands.',
    leak: 'Status lives in someone’s head',
    cost: 'Phone calls and messages that exist only to ask “any update?”, and nothing moves when that person is away.',
    fix: 'Status pages and client portals: customers and staff see progress without asking.',
    link: { label: 'Operations systems', href: '/services/#operations' },
    need: 'Business System',
    weight: 2
  },
  {
    id: 'memory',
    q: 'Deadlines, renewals or follow-ups depend on one person remembering them.',
    leak: 'Work runs on memory',
    cost: 'Missed renewals, late follow-ups and expired documents — found only when something goes wrong.',
    fix: 'Automated reminders and escalations triggered by dates and stages, not by memory.',
    link: { label: 'Workflow automation', href: '/services/#automation' },
    need: 'Automation',
    weight: 2
  },
  {
    id: 'scheduling',
    q: 'Bookings, shifts, visits or deliveries are coordinated by phone calls or a group chat.',
    leak: 'Scheduling by chat',
    cost: 'Double bookings, no-shows and a dispatcher who cannot take a day off.',
    fix: 'Scheduling and tracking: one shared board with confirmations and reminders built in.',
    link: { label: 'Scheduling and tracking', href: '/services/#scheduling' },
    need: 'Business System',
    weight: 2
  },
  {
    id: 'billing',
    q: 'Invoices go out days after the work is done.',
    leak: 'Billing lags the work',
    cost: 'Cash sits uncollected while paperwork catches up, and some jobs are never billed at all.',
    fix: 'Billing triggered by finished work: the invoice is drafted the moment a job closes.',
    link: { label: 'Workflow automation', href: '/services/#automation' },
    need: 'Automation',
    weight: 2
  },
  {
    id: 'reporting',
    q: 'Weekly or monthly numbers are put together by hand in a spreadsheet.',
    leak: 'Reporting by hand',
    cost: 'Decisions wait for someone to build the report, and the numbers are out of date when they arrive.',
    fix: 'Live dashboards built from the records you already keep.',
    link: { label: 'Dashboards and reporting', href: '/services/#reporting' },
    need: 'Data / Analytics',
    weight: 1
  },
  {
    id: 'website',
    q: 'Your website does not bring in steady, qualified enquiries.',
    leak: 'The website does not sell',
    cost: 'Visitors arrive and leave. A slow page or a generic contact form loses the people who were ready to buy.',
    fix: 'A fast website built to convert, with a structured request form instead of an empty contact box.',
    link: { label: 'Examine your website', href: '/vector/' },
    need: 'Website',
    weight: 2
  },
  {
    id: 'visibility',
    q: 'You do not show up when people search on Google or ask an AI assistant about what you offer.',
    leak: 'Invisible to search and AI',
    cost: 'Customers find a competitor first, and AI assistants recommend businesses they can read and verify.',
    fix: 'SEO, AEO and GEO: technical SEO, structured data, and open access for AI crawlers.',
    link: { label: 'AI visibility tools', href: '/forge/#ai-visibility' },
    need: 'Website',
    weight: 2
  }
];
