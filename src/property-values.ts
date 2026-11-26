export function webURL(value: string): URL | undefined {
  const input = value.trim();
  // Do not let WHATWG recovery turn missing slashes, backslashes, or an empty host into a link.
  const authority = /^https?:\/\/([^/?#\\\s]+)/iu.exec(input)?.[1];
  if (!authority || authority.includes('@') || /[\r\n\t\\]/u.test(input)) return;
  try {
    const url = new URL(input);
    if (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.hostname &&
      !url.username &&
      !url.password
    )
      return url;
  } catch {
    // An invalid field remains plain text.
  }
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const ISO_DATE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/u;

export function isGregorianDay(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const leapDay = month === 2 && year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= (leapDay ? 29 : DAYS_IN_MONTH[month - 1]!);
}

/** A full ISO 8601 calendar day, including astronomical year 0000. */
export function isISODate(value: string): boolean {
  const parts = value.length === 10 ? ISO_DATE.exec(value) : null;
  return parts !== null && isGregorianDay(Number(parts[1]), Number(parts[2]), Number(parts[3]));
}

export function isRating(value: string): boolean {
  return value.length === 1 && value >= '1' && value <= '5';
}
