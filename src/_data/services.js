/**
 * Services — organised around what a client needs, not around technology.
 * `sectors` are slugs from _data/industries.js.
 */
export default [
  {
    id: 'operations',
    title: 'Operations systems',
    outcome: 'One internal system that runs the day-to-day: intake, assignment, status, records.',
    need: [
      'Work lives in spreadsheets, inboxes and a group chat',
      'Nobody can say what is in progress without asking',
      'The same information is typed into three places'
    ],
    includes: ['Intake and request handling', 'Assignment and status', 'Records and documents', 'Role-based access', 'HR, learning and client portals'],
    stack: ['PHP / Node.js', 'MySQL / PostgreSQL', 'React / Next.js'],
    sectors: ['security-services', 'construction', 'accounting', 'recruitment']
  },
  {
    id: 'automation',
    title: 'Workflow automation',
    outcome: 'Follow-ups, routing and reminders that happen because an event fired, not because someone remembered.',
    need: [
      'Leads or requests go cold before anyone replies',
      'Hand-offs between tools are done by hand',
      'Reminders depend on a person’s memory'
    ],
    includes: ['Event-driven workflows (n8n)', 'Webhooks into the tools you already pay for', 'AI steps where a judgement call used to need a person', 'Escalation and chase schedules', 'Monitoring and retries'],
    stack: ['n8n', 'Webhooks', 'AI agents', 'Twilio / email'],
    sectors: ['real-estate', 'accounting', 'logistics', 'education']
  },
  {
    id: 'scheduling',
    title: 'Scheduling and tracking',
    outcome: 'Bookings, rosters and live status that customers and staff can see without calling.',
    need: [
      'Booking happens by phone during office hours only',
      'Shifts, jobs or deliveries are tracked on paper',
      'Customers call to ask where things are'
    ],
    includes: ['Online booking with real availability', 'Rosters, shifts and capacity', 'Geo-verified check-in and checkpoints', 'Public status and tracking pages', 'Reminder and recall engines'],
    stack: ['Node.js', 'PostgreSQL', 'SMS gateway', 'GPS / QR'],
    sectors: ['clinics', 'security-services', 'logistics', 'automotive']
  },
  {
    id: 'reporting',
    title: 'Dashboard and reporting systems',
    outcome: 'Live views built from real records, so decisions stop lagging reality.',
    need: [
      'Reports are assembled by hand at month-end',
      'Management is deciding on last week’s numbers',
      'Each team keeps its own version of the truth'
    ],
    includes: ['Live operational dashboards', 'Role-based views', 'KPI tracking from real records', 'Client-facing status dashboards', 'Scheduled reports'],
    stack: ['Next.js', 'PostgreSQL', 'Charting', 'n8n'],
    sectors: ['security-services', 'construction', 'education', 'accounting']
  },
  {
    id: 'integrations',
    title: 'Integrations and internal tools',
    outcome: 'The tools you already use, connected — and the small internal tools that retire the last spreadsheets.',
    need: [
      'Data is re-keyed between systems',
      'One important process still runs in a spreadsheet',
      'A vendor tool almost fits, but not quite'
    ],
    includes: ['CRM, accounting and payment integrations', 'Document capture and e-signature', 'Small purpose-built internal tools', 'Data sync and migration', 'Legacy system bridges'],
    stack: ['REST APIs', 'Webhooks', 'Xero / QuickBooks', 'E-signature'],
    sectors: ['accounting', 'law-offices', 'recruitment', 'real-estate']
  }
];
