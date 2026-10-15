const DATE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatDate(iso: string | undefined): string {
  if (!iso) return '--';
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? '--' : DATE.format(value);
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '--';
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? '--' : DATE_TIME.format(value);
}

export function relativeDays(iso: string | undefined): string {
  if (!iso) return '--';
  const value = new Date(iso).getTime();
  if (Number.isNaN(value)) return '--';
  const days = Math.round((value - Date.now()) / 86_400_000);
  if (days === 0) return 'today';
  if (days > 0) return `in ${days} day${days === 1 ? '' : 's'}`;
  const ago = Math.abs(days);
  return `${ago} day${ago === 1 ? '' : 's'} ago`;
}

const PROJECT_TYPE_LABELS: Record<string, string> = {
  wordpress: 'WordPress',
  automation: 'Automation',
  web_app: 'Web application',
  maintenance: 'Maintenance',
  audit: 'Audit',
};

const BUDGET_LABELS: Record<string, string> = {
  under_5k: 'Under $5k',
  '5k_15k': '$5k - $15k',
  '15k_40k': '$15k - $40k',
  '40k_plus': '$40k +',
  undecided: 'Undecided',
};

const TIMELINE_LABELS: Record<string, string> = {
  asap: 'As soon as possible',
  one_to_three_months: '1 - 3 months',
  this_quarter: 'This quarter',
  exploring: 'Exploring',
};

export const labelFor = {
  projectType: (value: string) => PROJECT_TYPE_LABELS[value] ?? value,
  budget: (value: string) => BUDGET_LABELS[value] ?? value,
  timeline: (value: string) => TIMELINE_LABELS[value] ?? value,
  titleCase: (value: string) =>
    value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
};
