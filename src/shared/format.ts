// Numbers and times, shared by every frame.
let locale = 'en';
/** A tag Intl does not know (`en_US`) falls back to English instead of throwing on every number. */
export const setLocale = (next: string): void => {
  try {
    locale = Intl.NumberFormat.supportedLocalesOf(next)[0] ?? 'en';
  } catch {
    locale = 'en';
  }
};

const number = (value: number, digits: number): string => new Intl.NumberFormat(locale, {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
}).format(value);

/** 1024-based, as `docker stats` and Activity Monitor count memory. */
export const formatBytes = (bytes: number | null): string => {
  if (bytes === null) return '–';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit >= 3 && value < 100 ? 1 : 0;
  return `${number(value, digits)} ${units[unit]}`;
};

/** 1000-based, as `docker system df` and Finder count disk space. */
export const formatDisk = (bytes: number): string => {
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const digits = unit >= 3 && value < 100 ? 1 : 0;
  return `${number(value, digits)} ${units[unit]}`;
};

export const formatPercent = (value: number | null): string => {
  if (value === null) return '–';
  if (value > 0 && value < 0.1) return '<0.1%';
  return `${number(value, value < 10 ? 1 : 0)}%`;
};

const span = (ms: number): string => {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'seconds';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} days`;
};

/** "2 min ago", from an RFC 3339 time. */
export const ago = (iso: string | null, now = Date.now()): string => {
  const at = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(at)) return '';
  const value = span(now - at);
  return value === 'seconds' ? 'just now' : `${value} ago`;
};

/** "2 h", how long since an RFC 3339 time. */
export const since = (iso: string | null, now = Date.now()): string => {
  const at = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(at) ? span(now - at) : '';
};

export const plural = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;
