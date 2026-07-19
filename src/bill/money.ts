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

/** Format milliunits as EUR. Always non-negative magnitude; callers add signs. */
export function formatEUR(milliunits: number, options?: { decimals?: boolean }): string {
  const euros = Math.abs(milliunits) / 1000;
  return (options?.decimals ? cents : whole).format(euros);
}
