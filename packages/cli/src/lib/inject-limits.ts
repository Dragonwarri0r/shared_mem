export const MAX_TAG_LINES = 12;
export const MAX_ALWAYS_INJECT = 6;
export const MAX_SUMMARY_LENGTH = 120;

export function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}
