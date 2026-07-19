// "Current month" helpers. The host clock is Europe/Amsterdam and matches the
// YNAB plan's current month, so local date math is the source of truth.

/** First day of the current month as an ISO date (YYYY-MM-01), for since_date. */
export function currentMonthStart(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

/** Human month label, e.g. "July 2026". */
export function monthLabel(now = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(now);
}

/** Compact transaction date, e.g. "Jul 15". */
export function shortDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}
