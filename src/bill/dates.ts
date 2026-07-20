// Month helpers. The host clock is Europe/Amsterdam and matches the YNAB plan's
// current month, so local date math is the source of truth. A "month key" is the
// "YYYY-MM" string we thread through URLs and the YNAB month endpoints.

/** Current month as a key, e.g. "2026-07". */
export function currentMonthKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/** True for a well-formed "YYYY-MM" month key. */
export function isMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** "2026-07" -> "2026-07-01", the ISO date YNAB wants for since_date / months. */
export function monthStartDate(key: string): string {
  return `${key}-01`;
}

/** Shift a month key by whole months (delta may be negative). */
export function addMonths(key: string, delta: number): string {
  const [year, month] = key.split('-').map(Number);
  const index = year * 12 + (month - 1) + delta;
  const newYear = Math.floor(index / 12);
  const newMonth = (index % 12) + 1;
  return `${newYear}-${String(newMonth).padStart(2, '0')}`;
}

/** Human month label from a key, e.g. "July 2026". */
export function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(date);
}

/** Compact transaction date, e.g. "Jul 15". */
export function shortDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}
