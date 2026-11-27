// Shapes returned by the studio API in the Cloudflare Worker (worker/src/studio/).
// Keep in sync with worker/src/studio/views.js, sites.js, prospects.js, auth.js
// and worker/src/audit-view.js (Vector's audit and report shapes).

export type Role = 'admin' | 'client'

export interface User {
  id: string
  email: string
  name: string
  role: Role
  clientId: string | null
  active: boolean
  invited: boolean
  lastLoginAt: string | null
  createdAt: string
  impersonatedBy: string | null
  impersonatorName: string | null
}

export interface SessionResponse {
  token: string
  expiresAt: string
  user: User
}

export interface Invite {
  email: string
  token: string
  expiresAt: string
}

/* ------------------------------------------------------------------ Vector */

/** Vector's eight examination categories, in its weighting order. */
export type VectorCategory = 'technical' | 'seo' | 'performance' | 'accessibility' | 'security' | 'links' | 'content' | 'ai'
export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type AuditStatus = 'queued' | 'running' | 'completed' | 'failed'
export type CategoryScores = Partial<Record<VectorCategory, number>>

export interface AuditStage {
  key: string
  label: string
  state: 'pending' | 'active' | 'done' | 'failed'
}

/** auditOut in worker/src/audit-view.js. */
export interface Audit {
  id: string
  url: string
  status: AuditStatus
  stage: string
  stages: AuditStage[]
  error_message: string | null
  health_score: number | null
  scores: CategoryScores
  summary: {
    final_url?: string
    status?: number
    response_ms?: number
    counts?: Record<Severity, number>
    checked_at?: string
  }
  created_at: string
  completed_at: string | null
}

export interface VectorIssue {
  category: VectorCategory
  code: string
  severity: Severity
  title: string
  evidence: string
  explanation: string
  recommendation: string
  impact: string
}

export interface VectorResult {
  category: VectorCategory
  score: number
  metrics: Record<string, unknown>
}

export interface PrescriptionStep {
  position: number
  severity: Severity
  action: string
  issue_code: string
  title: string
  category: VectorCategory | null
}

/** GET /v1/admin/audits/{id}: progress while running; results once completed. */
export interface AuditReport {
  audit: Audit
  results: VectorResult[]
  issues: VectorIssue[]
  prescription: PrescriptionStep[]
}

export interface AuditListItem {
  id: string
  url: string
  host: string
  status: AuditStatus
  healthScore: number | null
  visibility: number | null
  scores: CategoryScores
  source: 'public' | 'studio'
  siteId: string | null
  createdAt: string
  completedAt: string | null
}

/* ------------------------------------------------------------------ websites */

export type MonitorStatus = 'operational' | 'degraded' | 'unavailable' | 'protected' | 'unknown' | 'not_monitored'

export interface Site {
  id: string
  clientId: string
  company: string | null
  name: string
  url: string
  host: string
  platform: string
  hosting: string
  notes: string
  createdAt: string
  monitoring: {
    targetId: string | null
    status: MonitorStatus
    lastCheckedAt: string | null
    lastResponseMs: number | null
    lastStatusCode: number | null
  }
  /** Percentage of Signal checks that found the site available, last 30 days. */
  uptime30: number | null
  /** Average Signal response time, last 7 days. */
  avgResponseMs: number | null
  incidents7d: number
  sslValid: boolean | null
  /** Not measured (a Worker cannot read the certificate); always null. */
  sslDaysLeft: null
  /** Not measured (no WHOIS from a Worker); always null. */
  domainDaysLeft: null
  /** Vector health score of the latest completed examination. */
  health: number | null
  /** Mean of Vector's SEO and AI-visibility category scores. */
  visibility: number | null
  scores: CategoryScores | null
  lastAuditId: string | null
  lastAuditAt: string | null
  openIssues: number
}

export interface UptimeDay {
  date: string
  uptimePct: number | null
  checks: number
  avgResponseMs: number | null
  incidents: number
}

export interface Incident {
  start: string
  end: string | null
  minutes: number | null
  cause: string
  ongoing: boolean
}

/** GET /v1/{admin|client}/sites/{id}/health. */
export interface SiteReport {
  site: Site
  audit: (Audit & { results: VectorResult[]; issues: VectorIssue[]; prescription: PrescriptionStep[] }) | null
  pendingAudit: Audit | null
  lastFailedAudit: Audit | null
  history: { id: string; date: string; health: number | null; visibility: number | null; scores: CategoryScores }[]
  brokenLinks: number | null
  uptime: {
    days: UptimeDay[]
    pct7: number | null
    pct30: number | null
    pct90: number | null
    checks30: number
    incidents: Incident[]
    downtimeMinutes30: number
  }
  ssl: { valid: boolean | null; expiresAt: null; note: string }
}

/* ------------------------------------------------------------------ clients */

export type PlanName = 'Essentials' | 'Growth' | 'Scale'

export interface Plan {
  name?: string | null
  price: number
  includedHours: number
  features: string[]
}

export interface Client {
  id: string
  company: string
  contactName: string
  email: string
  phone: string
  plan: PlanName
  mrr: number
  includedHours: number
  status: 'active' | 'onboarding' | 'paused' | 'churned'
  industry: string
  since: string
  renewalDate: string | null
  notes: string
  nps: number | null
  createdAt: string
}

export interface ClientRow extends Client {
  siteCount: number
  health: number | null
  visibility: number | null
  openTickets: number
  overdue: number
  lifetimeValue: number
  hoursUsed: number
  renewalDays: number | null
  churnRisk: 'low' | 'medium' | 'high'
  riskScore: number
}

export interface CreateClientResponse {
  client: ClientRow
  invite: Invite | null
  warning: string | null
}

/* ------------------------------------------------------------------ delivery */

export interface Milestone {
  id: string
  title: string
  dueDate: string
  status: 'upcoming' | 'in_progress' | 'awaiting_approval' | 'done'
  needsApproval: boolean
  approvedAt: string | null
  approvedBy: string | null
}

export interface Project {
  id: string
  clientId: string
  company: string | null
  name: string
  type: string
  phase: string
  startDate: string
  dueDate: string
  budget: number
  hoursBudget: number
  hoursLogged: number
  health: 'on_track' | 'at_risk' | 'late' | 'complete'
  milestones: Milestone[]
}

export interface WorkItem {
  id: string
  clientId: string
  siteId: string | null
  date: string
  category: string
  title: string
  minutes: number
  by: string
  company: string | null
}

export interface Message {
  id: string
  author: string
  role: Role
  body: string
  at: string
}

export interface Ticket {
  id: string
  number: number
  clientId: string
  company: string | null
  subject: string
  category: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  status: 'open' | 'in_progress' | 'waiting' | 'resolved'
  createdAt: string
  updatedAt: string
  slaHours: number
  slaDueAt: string
  slaState: 'met' | 'missed' | 'breached' | 'due_soon' | 'pending'
  firstResponseHours: number | null
  messageCount: number
  lastMessage?: string
  messages?: Message[]
}

export interface Invoice {
  id: string
  number: string
  clientId: string
  company: string | null
  kind: string
  issuedAt: string
  dueAt: string
  /** 'overdue' also for a sent invoice past its due date. */
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'void'
  paidAt: string | null
  items: { description: string; quantity: number; unitPrice: number }[]
  amount: number
}

export interface BillingReport {
  plan: Plan
  renewalDate: string | null
  invoices: Invoice[]
  outstanding: number
  overdue: number
  paidThisYear: number
}

export interface InvoicesReport {
  items: Invoice[]
  aging: Record<'current' | '1-30' | '31-60' | '60+', number>
  plans: Record<PlanName, Plan>
}

/* ------------------------------------------------------------------ pipeline */

export type Stage = 'new' | 'reviewing' | 'call_booked' | 'proposal' | 'won' | 'lost'

export interface Prospect {
  /** "contact-<id>" (project inquiry) or "report-<id>" (Vector report request). */
  id: string
  kind: 'contact' | 'report'
  source: 'Project inquiry' | 'Vector report'
  name: string
  email: string
  company: string
  website: string
  message: string
  createdAt: string
  /** Vector health score of the examined site (report requests only). */
  healthScore: number | null
  visibility: number | null
  auditId: string | null
  details: { projectType: string | null; timeline: string | null; budgetRange: string | null; reportStatus: string | null }
  stage: Stage
  value: number
  notes: string
  clientId: string | null
  updatedAt: string
}

export interface Activity {
  id: string
  at: string
  actor: string
  action: string
  target: string
  detail: string
}

/* ------------------------------------------------------------------ views */

export type MilestoneRef = Milestone & { projectId: string; project: string }

export interface TopIssue extends VectorIssue {
  siteId: string | null
  siteName: string
}

export interface ClientOverview {
  client: Client
  plan: Plan
  sites: Site[]
  scores: { health: number | null; visibility: number | null }
  uptime30: number | null
  topIssues: TopIssue[]
  approvals: MilestoneRef[]
  nextMilestone: MilestoneRef | null
  openTickets: number
  hours: { used: number; included: number }
  recentWork: WorkItem[]
  balance: { amount: number; overdue: number; nextDue: string | null }
}

export interface ClientDetail extends ClientOverview {
  row: ClientRow
  projects: Project[]
  tickets: Ticket[]
  billing: BillingReport
  users: User[]
}

export interface WorkReport {
  month: string
  months: string[]
  items: WorkItem[]
  hoursUsed: number
  hoursIncluded: number
  byCategory: { category: string; hours: number }[]
}

export interface AdminWork {
  month: string
  items: WorkItem[]
  perClient: { clientId: string; company: string; plan: string; hoursUsed: number; hoursIncluded: number; effectiveRate: number | null }[]
}

export interface MonthlyReport {
  month: string
  client: { company: string; plan: string } | null
  sites: { id: string; name: string; host: string }[]
  work: { hours: number; tasks: number; byCategory: { category: string; hours: number }[]; items: WorkItem[] }
  uptime: number | null
  incidents: number
  scores: Partial<Record<VectorCategory | 'health' | 'visibility', number | null>>
  tickets: { opened: number; resolved: number }
  highlights: string[]
}

export interface AdminOverview {
  mrr: number
  arr: number
  mrrByPlan: { plan: string; clients: number; mrr: number }[]
  clients: Record<'active' | 'onboarding' | 'paused' | 'churned', number>
  revenue: { series: { month: string; revenue: number }[]; thisMonth: number; lastMonth: number; trailing12: number }
  receivables: { outstanding: number; overdue: number; overdueCount: number }
  pipeline: { openValue: number; openCount: number; byStage: { stage: Stage; count: number; value: number }[]; winRate: number | null }
  support: { open: number; breached: number; urgent: number; avgFirstResponseHours: number | null }
  sites: { total: number; monitored: number; down: number; avgHealth: number | null; avgVisibility: number | null; avgUptime: number | null; atRisk: number }
  capacity: { hoursUsed: number; hoursIncluded: number; utilisation: number }
  projects: { active: number; atRisk: number }
  renewals: { clientId: string; company: string; renewalDate: string; days: number; mrr: number }[]
  attention: { severity: 'critical' | 'warning' | 'info'; kind: string; title: string; detail: string; link: string }[]
  activity: Activity[]
}

export interface SettingsResponse {
  environment: string
  plans: Record<PlanName, Plan>
  team: User[]
  integrations: { key: string; name: string; status: 'connected' | 'not_connected'; detail: string }[]
  inviteDays: number
  storage: { backend: string; counts: Record<string, number> }
}
