/**
 * Industry blueprints.
 *
 * These are REFERENCE ARCHITECTURES, not delivered client case studies.
 * Every figure in `metrics` is a typical sector baseline and the target a
 * system like this is built to hit :  never a claim of past measured results.
 * Delivered work with real numbers lives in _data/logs.js and operations.js.
 */

export default [
  /* ====================================================== LOGISTICS ===== */
  {
    slug: 'logistics',
    name: 'Freight & Logistics',
    sector: 'Movement',
    tagline: 'The load moves. The paperwork does not.',
    summary:
      'Freight operators lose margin in the gap between the truck arriving and the invoice going out. Rates are quoted from memory, proof of delivery travels back on paper, and customers call the office because nothing tells them where their shipment is.',
    signals: [
      'Quotes answered from a rate card someone maintains privately',
      'Dispatch runs on a group chat',
      'Proof of delivery arrives days after the delivery',
      '"Where is my shipment?" is a phone call, not a page'
    ],
    leaks: [
      {
        title: 'Quoting is a bottleneck of one',
        detail:
          'Rate requests queue behind whoever knows the lanes. Every hour of delay is a shipper calling a competitor who answered first.'
      },
      {
        title: 'Delivery and billing are disconnected',
        detail:
          'The invoice cannot be raised until a signed POD comes back from the driver. Cash sits in a glovebox.'
      },
      {
        title: 'Visibility is a person, not a system',
        detail:
          'Status lives with the dispatcher. When they are off, the answer is "I will check and call you back."'
      },
      {
        title: 'Compliance drifts silently',
        detail:
          'Driver licences, insurance, and vehicle inspections expire on dates nobody is watching until one of them fails an audit.'
      }
    ],
    build: {
      public: [
        { name: 'Rate request', purpose: 'Structured lane, weight, and service inputs :  not a contact form' },
        { name: 'Shipment tracking', purpose: 'Reference lookup with live status and ETA, no login required' },
        { name: 'Service lanes & coverage', purpose: 'Where you actually run, with transit times' },
        { name: 'Driver recruitment', purpose: 'Applications that land in a pipeline, not an inbox' }
      ],
      portal: [
        { name: 'Dispatch board', purpose: 'Loads, vehicles, and drivers on one assignable timeline' },
        { name: 'Driver view', purpose: 'Manifest, navigation handoff, and POD capture on a phone' },
        { name: 'Customer portal', purpose: 'Shipment history, documents, and invoices self-served' },
        { name: 'Rate card manager', purpose: 'Lane pricing with margin floors and surcharge rules' },
        { name: 'Compliance register', purpose: 'Licence, insurance, and inspection expiry per driver and vehicle' }
      ],
      automations: [
        { trigger: 'Rate request submitted', action: 'Price against the lane card, generate a PDF quote, send within minutes' },
        { trigger: 'Driver captures POD', action: 'Attach signature and photos, notify consignee, draft the invoice' },
        { trigger: 'ETA slips past threshold', action: 'SMS the consignee before they call you' },
        { trigger: 'Document expires in 30 days', action: 'Escalating reminder to driver and operations' }
      ]
    },
    integrations: ['GPS / telematics', 'SMS gateway', 'Xero / QuickBooks', 'Routing & maps', 'Fuel card data'],
    metrics: [
      { name: 'Quote turnaround', typical: '4–8 hours', target: 'Under 15 minutes' },
      { name: 'POD to invoice', typical: '7–14 days', target: 'Same day' },
      { name: 'Status enquiry calls', typical: 'Daily, per customer', target: '−70% via self-serve tracking' },
      { name: 'Expired compliance docs', typical: 'Found at audit', target: 'Zero, flagged 30 days out' }
    ],
    firstBuild: 'Tracking page and the rate-request-to-quote pipeline :  the two things that stop the phone ringing.',
    stack: ['Eleventy / Next.js', 'Node.js', 'PostgreSQL', 'n8n', 'Twilio']
  },

  /* ========================================================= CLINICS ==== */
  {
    slug: 'clinics',
    name: 'Medical & Dental Clinics',
    sector: 'Care',
    tagline: 'The schedule is the business. Protect it.',
    summary:
      'A clinic’s revenue is its calendar. Empty chairs from no-shows, recalls nobody sent, and a front desk that spends its day on the phone instead of with patients in front of them.',
    signals: [
      'Booking happens by phone, during office hours only',
      'Recare reminders depend on someone remembering',
      'Intake forms are filled on a clipboard in the waiting room',
      'Nobody can say this month’s no-show rate'
    ],
    leaks: [
      {
        title: 'No-shows are absorbed, not addressed',
        detail:
          'An unfilled slot is unrecoverable revenue. Without reminders and a waitlist that auto-offers the gap, it is simply lost.'
      },
      {
        title: 'Recare lapses invisibly',
        detail:
          'Patients due at six months quietly become patients who left. There is no queue showing who is overdue this week.'
      },
      {
        title: 'The front desk is a switchboard',
        detail:
          'Staff hired for patient care spend the day confirming appointments that a message could confirm.'
      },
      {
        title: 'Intake repeats itself',
        detail:
          'History and insurance details are re-collected on paper each visit, then retyped into the system.'
      }
    ],
    build: {
      public: [
        { name: 'Online booking', purpose: 'Real provider availability, bookable outside office hours' },
        { name: 'Pre-visit intake', purpose: 'Forms completed before arrival and attached to the record' },
        { name: 'Services & providers', purpose: 'What is offered, by whom, and what it costs' },
        { name: 'Insurance & HMO accepted', purpose: 'Answers the question that drives the first phone call' }
      ],
      portal: [
        { name: 'Provider calendar', purpose: 'Per-chair, per-practitioner scheduling with room constraints' },
        { name: 'Patient record', purpose: 'History, treatment plan, documents, and visit notes' },
        { name: 'Recall queue', purpose: 'Everyone due or overdue, ranked, with one-click outreach' },
        { name: 'Waitlist engine', purpose: 'Auto-offers cancelled slots to patients who want an earlier date' },
        { name: 'Billing & claims', purpose: 'Charges, payments, and insurance submission status' }
      ],
      automations: [
        { trigger: 'Appointment booked', action: 'Confirmation plus intake form link' },
        { trigger: '24 hours before', action: 'SMS reminder with one-tap confirm or reschedule' },
        { trigger: 'Cancellation received', action: 'Offer the slot to the waitlist in priority order' },
        { trigger: 'Recare due at 6 months', action: 'Add to recall queue and send the first touch' }
      ]
    },
    integrations: ['SMS gateway', 'Payment gateway', 'HMO eligibility check', 'Calendar sync', 'E-prescription'],
    metrics: [
      { name: 'No-show rate', typical: '15–25%', target: 'Under 8% with reminders and waitlist' },
      { name: 'Bookings made by phone', typical: '~90%', target: 'Under 40%' },
      { name: 'Recare reactivation', typical: 'Ad hoc', target: 'Systematic weekly queue' },
      { name: 'Intake completed pre-arrival', typical: '0%', target: 'Over 70%' }
    ],
    firstBuild: 'Online booking with reminders and the waitlist auto-offer :  the fastest path to recovered chair time.',
    stack: ['Next.js', 'Node.js', 'PostgreSQL', 'n8n', 'Twilio'],
    note: 'Built to respect patient data handling rules in your jurisdiction. Clinical scope stays with your practitioners :  this is scheduling, records, and revenue operations.'
  },

  /* ======================================================= LAW OFFICE === */
  {
    slug: 'law-offices',
    name: 'Law Offices',
    sector: 'Practice',
    tagline: 'Unbilled time is the largest expense on no ledger.',
    summary:
      'Legal practices lose money in two places nobody audits: time reconstructed from memory at month-end, and intake enquiries that sit unanswered while the client calls the next firm on the list.',
    signals: [
      'Time is entered on the last day of the month',
      'Matter documents live across email, drive, and a filing cabinet',
      'Deadlines are tracked in one person’s calendar',
      'Clients call to ask what is happening with their matter'
    ],
    leaks: [
      {
        title: 'Billable time evaporates',
        detail:
          'Work reconstructed days later is systematically under-recorded. The hours were spent; they were simply never captured.'
      },
      {
        title: 'Intake has no clock',
        detail:
          'A prospective client who waits two days has usually already retained someone else. There is no SLA and no conflict check at the door.'
      },
      {
        title: 'Deadlines depend on one memory',
        detail:
          'Statutory and court dates calculated by hand, held by one person, with no second system watching.'
      },
      {
        title: 'Clients are informed on request only',
        detail:
          'Status updates happen when a client chases. Every chase is unbilled time spent on reassurance.'
      }
    ],
    build: {
      public: [
        { name: 'Practice area pages', purpose: 'Depth per area, written to be found and to qualify' },
        { name: 'Qualified intake form', purpose: 'Matter type, jurisdiction, and urgency captured up front' },
        { name: 'Consultation booking', purpose: 'Real availability, not a callback promise' },
        { name: 'Attorney profiles', purpose: 'Credentials, admissions, and matter experience' }
      ],
      portal: [
        { name: 'Matter management', purpose: 'Parties, status, documents, and the full activity trail' },
        { name: 'Conflict check', purpose: 'Runs against parties at intake, before engagement' },
        { name: 'Deadline docket', purpose: 'Dates computed from filing rules, with layered reminders' },
        { name: 'Time & billing', purpose: 'Capture at the point of work, with pre-bill assembly' },
        { name: 'Client portal', purpose: 'Matter status, shared documents, and invoices' },
        { name: 'Document vault', purpose: 'Versioned, permissioned, and searchable per matter' }
      ],
      automations: [
        { trigger: 'Intake submitted', action: 'Conflict check, qualification score, assignment, acknowledgement within minutes' },
        { trigger: 'Filing date recorded', action: 'Compute dependent deadlines and docket reminders' },
        { trigger: 'Matter stage changes', action: 'Client portal update, no chase required' },
        { trigger: 'Month-end approaches', action: 'Assemble pre-bills and flag unbilled work in progress' }
      ]
    },
    integrations: ['E-signature', 'Accounting & trust ledger', 'Court rules calendar', 'Secure document storage'],
    metrics: [
      { name: 'Billable capture', typical: 'Reconstructed monthly', target: '+10–18% from contemporaneous capture' },
      { name: 'Intake first response', typical: '1–2 days', target: 'Under 15 minutes' },
      { name: 'WIP to invoice', typical: '45–60 days', target: 'Under 20 days' },
      { name: 'Missed deadline exposure', typical: 'Single point of failure', target: 'Systematised with layered alerts' }
    ],
    firstBuild: 'Intake with conflict check and SLA clock, plus contemporaneous time capture :  revenue protection first.',
    stack: ['Next.js', 'Node.js', 'PostgreSQL', 'n8n'],
    note: 'Client-fund and trust-account handling is regulated. Ledgers are built to your jurisdiction’s rules and reconciled, never improvised.'
  },

  /* ================================================ SECURITY SERVICES === */
  {
    slug: 'security-services',
    name: 'Security Services',
    sector: 'Deployment',
    tagline: 'A post is either covered or it is a liability.',
    summary:
      'Guarding companies sell coverage. The system has to prove coverage happened :  every shift filled, every patrol walked, every incident recorded :  or the contract renewal becomes an argument about trust.',
    signals: [
      'Rosters are built in a spreadsheet each week',
      'Shift no-shows are discovered by the client',
      'Patrol verification is a signed paper logbook',
      'Incident reports are typed up the next day'
    ],
    leaks: [
      {
        title: 'Unfilled shifts surface too late',
        detail:
          'A guard who does not arrive is found out at the post, not at dispatch. There is no standby pool being called four hours earlier.'
      },
      {
        title: 'Coverage cannot be proven',
        detail:
          'A paper logbook is not evidence a client will accept at renewal. Without geo-verified checkpoints, service delivery is an assertion.'
      },
      {
        title: 'Incidents lose their detail',
        detail:
          'Reports written from memory hours later drop the specifics that matter if the matter escalates.'
      },
      {
        title: 'Licences lapse into non-compliance',
        detail:
          'Guard certifications and firearm permits expire on dates held in a folder, not in a system that warns you.'
      }
    ],
    build: {
      public: [
        { name: 'Service & coverage pages', purpose: 'What you guard, where, and to what standard' },
        { name: 'Quote request', purpose: 'Site type, posts, hours, and risk level captured up front' },
        { name: 'Guard recruitment', purpose: 'Applications with licence details into a screening pipeline' },
        { name: 'Client references', purpose: 'Sector credibility, presented without naming what you cannot' }
      ],
      portal: [
        { name: 'Scheduling engine', purpose: 'Posts, shifts, rest rules, and qualified-guard matching' },
        { name: 'Geo-verified clock-in', purpose: 'Attendance tied to location, not honour' },
        { name: 'Patrol checkpoints', purpose: 'QR or NFC scans producing a timestamped route record' },
        { name: 'Incident reporting', purpose: 'Structured capture with photos, filed from the post' },
        { name: 'Client dashboard', purpose: 'Live coverage, patrol compliance, and incident history' },
        { name: 'Licence register', purpose: 'Certification and permit expiry per guard' }
      ],
      automations: [
        { trigger: 'Shift unfilled at T−4 hours', action: 'Escalate to the qualified standby pool automatically' },
        { trigger: 'Clock-in missed by 10 minutes', action: 'Alert the supervisor before the client notices' },
        { trigger: 'Incident filed', action: 'Notify the client, generate the report PDF, open follow-up' },
        { trigger: 'Licence expires in 30 days', action: 'Notify guard and operations, block scheduling at expiry' }
      ]
    },
    integrations: ['GPS', 'NFC / QR checkpoints', 'SMS gateway', 'Payroll', 'Incident escalation'],
    metrics: [
      { name: 'Unfilled shift discovery', typical: 'At the post', target: '4+ hours ahead' },
      { name: 'Patrol verification', typical: 'Paper logbook', target: '100% timestamped and geo-tagged' },
      { name: 'Incident report lag', typical: '12–24 hours', target: 'Under 15 minutes, from site' },
      { name: 'Scheduling with expired licence', typical: 'Possible', target: 'Blocked by the system' }
    ],
    firstBuild: 'Scheduling engine with geo-verified clock-in :  coverage you can schedule and then prove.',
    stack: ['Next.js', 'PHP / Node.js', 'MySQL', 'n8n', 'Twilio']
  },

  /* ==================================================== CONSTRUCTION ==== */
  {
    slug: 'construction',
    name: 'Construction & Contracting',
    sector: 'Delivery',
    tagline: 'Every verbal change order is a future dispute.',
    summary:
      'Margin on a build is decided by two things: how fast an accurate estimate goes out, and whether every variation to scope was captured, priced, and approved in writing before the work happened.',
    signals: [
      'Estimates are assembled in a spreadsheet per job',
      'Changes are agreed on site and remembered differently later',
      'Site progress arrives as photos in a group chat',
      'Progress billing lags the actual work by weeks'
    ],
    leaks: [
      {
        title: 'Scope creep is absorbed as cost',
        detail:
          'Work agreed verbally on site gets built and never billed, because there is no record the client signed anything.'
      },
      {
        title: 'Estimates are slow and inconsistent',
        detail:
          'Rebuilt from scratch each time, priced from different assumptions, and sent days after the client asked.'
      },
      {
        title: 'Site reality is undocumented',
        detail:
          'Without a dated log and photos, delay claims and defect disputes come down to competing recollections.'
      },
      {
        title: 'Cash trails the build',
        detail:
          'Progress claims are assembled manually well after the milestone was reached, financing the client for free.'
      }
    ],
    build: {
      public: [
        { name: 'Project portfolio', purpose: 'Completed work by type, scale, and budget band' },
        { name: 'Scoped estimate request', purpose: 'Trade, scale, and site questions that make a real estimate possible' },
        { name: 'Trade & service pages', purpose: 'What you self-perform versus subcontract' },
        { name: 'Licences & insurance', purpose: 'The credentials commercial clients check first' }
      ],
      portal: [
        { name: 'Estimating', purpose: 'Reusable assemblies and unit rates with margin control' },
        { name: 'Project schedule', purpose: 'Trades, dependencies, and critical path' },
        { name: 'Daily site log', purpose: 'Dated crew, weather, progress, and photo record' },
        { name: 'Change orders', purpose: 'Priced, sent, e-signed, and pushed into the budget' },
        { name: 'Subcontractor portal', purpose: 'Scope, schedule, insurance status, and payment claims' },
        { name: 'Progress billing', purpose: 'Claims generated from verified milestone completion' }
      ],
      automations: [
        { trigger: 'Estimate request received', action: 'Scoped questionnaire, then a templated estimate for review' },
        { trigger: 'Change order approved', action: 'Update contract value, budget, and schedule in one move' },
        { trigger: 'Daily log not filed by 6pm', action: 'Reminder to the site supervisor' },
        { trigger: 'Milestone marked complete', action: 'Assemble the progress claim with supporting photos' }
      ]
    },
    integrations: ['E-signature', 'Accounting', 'Weather data', 'Photo & document storage'],
    metrics: [
      { name: 'Estimate turnaround', typical: '5–10 days', target: 'Under 48 hours' },
      { name: 'Change orders signed before work', typical: 'Sometimes', target: 'Enforced by workflow' },
      { name: 'Milestone to claim issued', typical: '2–4 weeks', target: 'Under 3 days' },
      { name: 'Disputed variations', typical: 'Recurring', target: 'Evidenced by signed record' }
    ],
    firstBuild: 'Change order workflow with e-signature and budget push :  the fastest margin recovery on any build.',
    stack: ['Next.js', 'Node.js', 'PostgreSQL', 'n8n']
  },

  /* ==================================================== REAL ESTATE ===== */
  {
    slug: 'real-estate',
    name: 'Real Estate Agencies',
    sector: 'Transaction',
    tagline: 'A lead has a half-life measured in minutes.',
    summary:
      'Property enquiries decay faster than in almost any other sector. The agency that replies in two minutes wins the instruction; the one that replies at the end of the day is providing free market research to a competitor.',
    signals: [
      'Listings are re-entered by hand on every portal',
      'Enquiries land in a shared inbox with no owner',
      'Viewings are arranged over a chain of phone calls',
      'Buyer matching is done from memory'
    ],
    leaks: [
      {
        title: 'Leads decay before contact',
        detail:
          'An enquiry answered four hours later reaches someone who has already booked two other viewings.'
      },
      {
        title: 'Listing distribution is manual',
        detail:
          'The same property typed into four portals, with prices and photos drifting out of sync between them.'
      },
      {
        title: 'Matching depends on recall',
        detail:
          'A new instruction should notify every registered buyer whose criteria it fits :  instead it notifies whoever the agent thinks of.'
      },
      {
        title: 'Pipeline is invisible until exchange',
        detail:
          'Deals stall between offer and completion with no system flagging which ones have gone quiet.'
      }
    ],
    build: {
      public: [
        { name: 'Search with map', purpose: 'Filterable listings with saved-search registration' },
        { name: 'Listing detail', purpose: 'Gallery, floorplan, tour, and area data on one page' },
        { name: 'Valuation request', purpose: 'The instruction-generating form, routed instantly' },
        { name: 'Area guides', purpose: 'Local depth that earns search traffic and credibility' }
      ],
      portal: [
        { name: 'Listing manager', purpose: 'One record syndicated to every portal automatically' },
        { name: 'Lead inbox with SLA', purpose: 'Owned, timed, and escalated if unanswered' },
        { name: 'Viewing scheduler', purpose: 'Agent availability, vendor approval, and confirmations' },
        { name: 'Buyer match engine', purpose: 'New and reduced listings pushed to matching criteria' },
        { name: 'Deal pipeline', purpose: 'Offer through completion, with stall detection' },
        { name: 'Commission calculator', purpose: 'Splits and referrals resolved at completion' }
      ],
      automations: [
        { trigger: 'Enquiry received', action: 'Assign, acknowledge, and start a 5-minute response clock' },
        { trigger: 'Listing published or reduced', action: 'Alert every buyer whose saved search matches' },
        { trigger: 'Viewing booked', action: 'Confirm all parties, remind at T−2h, request feedback after' },
        { trigger: 'Deal inactive 7 days', action: 'Flag to the manager with last-contact context' }
      ]
    },
    integrations: ['Portal feeds', 'SMS gateway', 'E-signature', 'Maps', 'CRM'],
    metrics: [
      { name: 'Lead first response', typical: '2–4 hours', target: 'Under 5 minutes' },
      { name: 'Listing to portals live', typical: 'Half a day, manual', target: 'Minutes, automatic' },
      { name: 'Buyers alerted per new listing', typical: 'Whoever is remembered', target: 'Every match, instantly' },
      { name: 'Stalled deals detected', typical: 'At month-end review', target: 'Day 7, automatically' }
    ],
    firstBuild: 'Lead routing with a response SLA and the saved-search match engine :  instructions won on speed.',
    stack: ['Next.js', 'Node.js', 'PostgreSQL', 'n8n', 'Twilio']
  },

  /* ====================================================== EDUCATION ===== */
  {
    slug: 'education',
    name: 'Training Providers & Schools',
    sector: 'Learning',
    tagline: 'Enrolment is easy. Completion is the product.',
    summary:
      'Training businesses are measured on outcomes, but most run blind between enrolment and certificate. Dropout is discovered at the end, when it is far too late and the refund conversation has already started.',
    signals: [
      'Enrolment happens over messenger, payment tracked in a notebook',
      'Course content is a folder of drive links',
      'Nobody knows who has stopped logging in',
      'Certificates are made by hand in a design tool'
    ],
    leaks: [
      {
        title: 'Disengagement is detected too late',
        detail:
          'A learner who stops at module three is found at the end of term. Two weeks earlier, a nudge would have recovered them.'
      },
      {
        title: 'Enrolment admin consumes teaching time',
        detail:
          'Instructors chase payments, resend links, and re-answer schedule questions instead of teaching.'
      },
      {
        title: 'Progress is invisible to those who paid',
        detail:
          'Parents and sponsoring employers have no view, so they ask :  and every question is answered manually.'
      },
      {
        title: 'Content is not a curriculum',
        detail:
          'Ungated links mean no sequencing, no prerequisites, and no evidence of what was actually completed.'
      }
    ],
    build: {
      public: [
        { name: 'Course catalogue', purpose: 'Outcomes, prerequisites, schedule, and price per course' },
        { name: 'Enrolment & payment', purpose: 'Register and pay in one flow, including instalments' },
        { name: 'Instructor profiles', purpose: 'Credibility that converts on the fence' },
        { name: 'Intake schedule', purpose: 'Next cohort dates with capacity remaining' }
      ],
      portal: [
        { name: 'Module delivery', purpose: 'Sequenced lessons with prerequisite gating' },
        { name: 'Assessment', purpose: 'Auto-graded quizzes and submitted assignments' },
        { name: 'Progress dashboard', purpose: 'Per learner and per cohort, with at-risk flags' },
        { name: 'Attendance', purpose: 'For blended and in-person components' },
        { name: 'Certificate generation', purpose: 'Verifiable, issued automatically on completion' },
        { name: 'Sponsor view', purpose: 'Read-only progress for parents or funding employers' }
      ],
      automations: [
        { trigger: 'Enrolment paid', action: 'Create the account, send credentials, schedule the onboarding sequence' },
        { trigger: 'No activity for 7 days', action: 'Nudge the learner, flag to the instructor at 14' },
        { trigger: 'Module completed', action: 'Unlock the next and record the milestone' },
        { trigger: 'Course completed', action: 'Issue the certificate and request a testimonial' }
      ]
    },
    integrations: ['Payment gateway', 'Video hosting', 'Email & SMS', 'Certificate verification'],
    metrics: [
      { name: 'Completion rate', typical: '40–60%', target: '75%+ with at-risk intervention' },
      { name: 'Disengagement detected', typical: 'End of term', target: 'Day 7' },
      { name: 'Enrolment admin per learner', typical: '30–45 minutes', target: 'Under 5 minutes' },
      { name: 'Certificate issue', typical: 'Days, manual', target: 'Immediate on completion' }
    ],
    firstBuild: 'Enrolment-to-access pipeline plus the at-risk flag :  stop losing learners you already sold.',
    stack: ['Eleventy / Next.js', 'PHP / Node.js', 'MySQL', 'n8n']
  },

  /* ===================================================== ACCOUNTING ===== */
  {
    slug: 'accounting',
    name: 'Accounting & Bookkeeping',
    sector: 'Compliance',
    tagline: 'The job does not start until the client sends the documents.',
    summary:
      'Practice capacity is not limited by accounting work. It is limited by chasing clients for records, then compressing every job into the days before a filing deadline.',
    signals: [
      'Document chasing is a manual monthly ritual',
      'Deadlines per client per obligation live in one calendar',
      'Clients ask "are my books done?" by email',
      'Capacity planning happens after the crunch'
    ],
    leaks: [
      {
        title: 'Chasing consumes billable capacity',
        detail:
          'Senior staff spend the first week of every period asking for bank statements and receipts.'
      },
      {
        title: 'Work compresses into deadline weeks',
        detail:
          'Jobs start late because records arrive late, so quality drops and overtime becomes structural.'
      },
      {
        title: 'Status is a question, not a page',
        detail:
          'Every "where are we?" email is unbilled time that a client dashboard would have answered.'
      },
      {
        title: 'Rework is never measured',
        detail:
          'Errors from rushed work get written off quietly and never surface as a number anyone manages.'
      }
    ],
    build: {
      public: [
        { name: 'Service packages', purpose: 'Scope and price per tier, stated plainly' },
        { name: 'Fit-check calculator', purpose: 'Entity type and turnover producing an indicative quote' },
        { name: 'Secure document upload', purpose: 'Onboarding without an email attachment chain' },
        { name: 'Deadline resources', purpose: 'Sector obligation calendars that earn search traffic' }
      ],
      portal: [
        { name: 'Client dashboard', purpose: 'Job status, outstanding requests, and filed returns' },
        { name: 'Document request engine', purpose: 'Itemised requests with an escalating chase schedule' },
        { name: 'Obligation calendar', purpose: 'Every filing date per client, generated from entity type' },
        { name: 'Job workflow board', purpose: 'Preparation, review, approval, and filing stages' },
        { name: 'Capacity view', purpose: 'Workload by person against upcoming deadlines' }
      ],
      automations: [
        { trigger: 'Period opens', action: 'Issue the itemised document request automatically' },
        { trigger: 'No response at 3, 7, 14 days', action: 'Escalating chase, then flag to the manager' },
        { trigger: 'All documents received', action: 'Create the job and assign against capacity' },
        { trigger: 'Job stage changes', action: 'Update the client dashboard, no email required' }
      ]
    },
    integrations: ['Xero / QuickBooks', 'OCR receipt capture', 'E-signature', 'Secure storage'],
    metrics: [
      { name: 'Time chasing documents', typical: 'Days per period', target: 'Near zero, automated' },
      { name: 'Records received before deadline week', typical: '~40%', target: 'Over 80%' },
      { name: 'On-time filing', typical: 'Achieved by overtime', target: 'Achieved by scheduling' },
      { name: 'Status enquiry emails', typical: 'Constant', target: '−80% via client dashboard' }
    ],
    firstBuild: 'Document request engine with automated chase :  it returns capacity in the first month.',
    stack: ['Next.js', 'Node.js', 'PostgreSQL', 'n8n']
  },

  /* ===================================================== AUTOMOTIVE ===== */
  {
    slug: 'automotive',
    name: 'Auto Service & Repair',
    sector: 'Throughput',
    tagline: 'A car waiting for approval is a bay earning nothing.',
    summary:
      'Workshop profit is bay hours sold. The largest silent loss is a vehicle stripped and waiting while someone tries to reach the owner by phone for approval on additional work.',
    signals: [
      'Bookings are taken by phone with no capacity check',
      'Estimate approval means calling until someone answers',
      'Service history lives in a paper folder per customer',
      'Service reminders are not sent at all'
    ],
    leaks: [
      {
        title: 'Approval delay stalls the bay',
        detail:
          'A technician stops, the lift is occupied, and the shop waits on a phone call that could have been a link.'
      },
      {
        title: 'Repeat business is never prompted',
        detail:
          'Customers due for service are not reminded, so they drift to whoever advertises nearest when the light comes on.'
      },
      {
        title: 'Capacity is guessed',
        detail:
          'Bookings taken without visibility of bay and technician load produce both idle mornings and impossible afternoons.'
      },
      {
        title: 'Additional work is undersold',
        detail:
          'Without photo evidence, recommended repairs sound like upselling and get declined.'
      }
    ],
    build: {
      public: [
        { name: 'Booking with vehicle', purpose: 'Service type and vehicle details against real bay capacity' },
        { name: 'Transparent pricing', purpose: 'Fixed-price services published, not quoted on the phone' },
        { name: 'Fleet accounts', purpose: 'Business customers with agreed rates and consolidated billing' },
        { name: 'Location & hours', purpose: 'The practical detail most workshop sites bury' }
      ],
      portal: [
        { name: 'Bay scheduler', purpose: 'Jobs against bays and technician skills' },
        { name: 'Digital job card', purpose: 'Work performed, parts used, and time recorded' },
        { name: 'Photo inspection', purpose: 'Evidence attached to every recommendation' },
        { name: 'Approval by link', purpose: 'Customer approves itemised work from their phone' },
        { name: 'Vehicle history', purpose: 'Full record per VIN across every visit' },
        { name: 'Reminder engine', purpose: 'Due by date or mileage, sent automatically' }
      ],
      automations: [
        { trigger: 'Inspection completed', action: 'Send an itemised estimate with photos for approval' },
        { trigger: 'Customer approves', action: 'Release the work order and order any parts required' },
        { trigger: 'Parts delayed', action: 'Notify the customer with a revised collection time' },
        { trigger: 'Service due by date or mileage', action: 'Reminder with a direct booking link' }
      ]
    },
    integrations: ['SMS gateway', 'Payment', 'Parts supplier catalogues', 'VIN lookup'],
    metrics: [
      { name: 'Estimate approval time', typical: '2–4 hours', target: 'Under 20 minutes' },
      { name: 'Bay utilisation', typical: '55–65%', target: '80%+' },
      { name: 'Additional work approved', typical: 'Low, unevidenced', target: 'Higher, with photo evidence' },
      { name: 'Rebooking from reminders', typical: 'None sent', target: 'Systematic recall revenue' }
    ],
    firstBuild: 'Photo inspection with approval-by-link :  it unblocks bays from week one.',
    stack: ['Next.js', 'Node.js', 'MySQL', 'n8n', 'Twilio']
  },

  /* ==================================================== RECRUITMENT ===== */
  {
    slug: 'recruitment',
    name: 'Staffing & Recruitment',
    sector: 'Placement',
    tagline: 'Speed to shortlist decides who fills the role.',
    summary:
      'Agencies compete on how fast a credible shortlist reaches the client. Everything that slows that down :  CVs buried in an inbox, compliance documents chased by hand, timesheets collected on Friday :  is margin.',
    signals: [
      'Applications arrive as email attachments',
      'The candidate pipeline is a spreadsheet',
      'Compliance documents are chased individually',
      'Timesheets are collected, then invoices are built by hand'
    ],
    leaks: [
      {
        title: 'Good candidates are already placed',
        detail:
          'A shortlist that takes four days reaches a client who has been sent three by someone faster.'
      },
      {
        title: 'The database is not searchable',
        detail:
          'Candidates placed last year are invisible this year because nothing was tagged on the way in.'
      },
      {
        title: 'Compliance lapses create liability',
        detail:
          'Right-to-work documents and certifications expire mid-placement with nothing watching the dates.'
      },
      {
        title: 'Timesheet to invoice is manual',
        detail:
          'Contractor hours are collected, chased, retyped, and only then billed :  delaying cash every single week.'
      }
    ],
    build: {
      public: [
        { name: 'Job board', purpose: 'Live vacancies with structured apply' },
        { name: 'Candidate registration', purpose: 'Skills, availability, and documents captured once' },
        { name: 'Client brief form', purpose: 'Role requirements captured properly at the start' },
        { name: 'Sector pages', purpose: 'Specialism depth that attracts both sides of the market' }
      ],
      portal: [
        { name: 'ATS pipeline', purpose: 'Stages from application to placement, per role' },
        { name: 'Candidate database', purpose: 'Skill-tagged and searchable, built at intake' },
        { name: 'Client portal', purpose: 'Shortlists reviewed and feedback given in one place' },
        { name: 'Compliance tracker', purpose: 'Document status and expiry per candidate' },
        { name: 'Timesheets', purpose: 'Submitted, approved, and exported to billing' },
        { name: 'Placement billing', purpose: 'Invoices generated from approved hours' }
      ],
      automations: [
        { trigger: 'Application received', action: 'Parse the CV, tag skills, place in the pipeline, acknowledge' },
        { trigger: 'Client brief submitted', action: 'Match the database and surface a candidate longlist' },
        { trigger: 'Document expires in 30 days', action: 'Chase the candidate, flag the placement' },
        { trigger: 'Timesheet approved', action: 'Generate the invoice and queue contractor pay' }
      ]
    },
    integrations: ['Job board feeds', 'CV parsing', 'E-signature', 'Payroll', 'Calendar'],
    metrics: [
      { name: 'Time to shortlist', typical: '3–5 days', target: 'Under 24 hours' },
      { name: 'Database reuse per role', typical: 'Rare', target: 'First source, every time' },
      { name: 'Compliance lapses', typical: 'Found during placement', target: 'Flagged 30 days out' },
      { name: 'Timesheet to invoice', typical: '5–10 days', target: 'Next business day' }
    ],
    firstBuild: 'CV parsing into a tagged, searchable database with brief-to-longlist matching.',
    stack: ['Next.js', 'Node.js', 'PostgreSQL', 'n8n']
  }
];
