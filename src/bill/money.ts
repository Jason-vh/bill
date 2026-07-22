// EUR formatting in nl-NL. YNAB amounts are milliunits (1/1000 of a euro).

const whole = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const cents = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format milliunits as EUR. By default returns a non-negative magnitude and
 * lets callers add signs; pass `sign: true` to prefix a minus for negatives.
 */
export function formatEUR(milliunits: number, options?: { decimals?: boolean; sign?: boolean }): string {
  const euros = Math.abs(milliunits) / 1000;
  const formatted = (options?.decimals ? cents : whole).format(euros);
  return options?.sign && milliunits < 0 ? `\u2212${formatted}` : formatted;
}
