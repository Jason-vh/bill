export function asJsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function truncateText(value: string, maxLength = 4000): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

export function includesCi(value: string | null | undefined, needle: string | null | undefined): boolean {
  if (!needle) return true;
  if (!value) return false;
  return value.toLowerCase().includes(needle.toLowerCase());
}
