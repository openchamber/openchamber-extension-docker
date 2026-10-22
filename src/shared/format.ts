// Numbers and times, shared by every frame.
import { isZh, setLocale as setI18nLocale } from './i18n.ts';

let locale = 'en';
export const setLocale = (next: string): void => {
  locale = next || 'en';
  setI18nLocale(locale);
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
  if (minutes < 1) return isZh() ? '秒' : 'seconds';
  if (minutes < 60) return isZh() ? `${minutes} 分钟` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return isZh() ? `${hours} 小时` : `${hours} h`;
  return isZh() ? `${Math.floor(hours / 24)} 天` : `${Math.floor(hours / 24)} days`;
};

/** "2 min ago", from an RFC 3339 time. */
export const ago = (iso: string | null, now = Date.now()): string => {
  const at = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(at)) return '';
  const value = span(now - at);
  if (value === 'seconds' || value === '秒') return isZh() ? '刚刚' : 'just now';
  return isZh() ? `${value}前` : `${value} ago`;
};

/** "2 h", how long since an RFC 3339 time. */
export const since = (iso: string | null, now = Date.now()): string => {
  const at = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(at) ? span(now - at) : '';
};

const ZH_NOUNS: Record<string, string> = {
  container: '个容器',
  'unused image': '个未使用的镜像',
  'unused volume': '个未使用的卷',
  'stopped container': '个已停止的容器',
};

export const plural = (count: number, one: string, many = `${one}s`): string => {
  if (isZh()) return `${count} ${ZH_NOUNS[one] ?? one}`;
  return `${count} ${count === 1 ? one : many}`;
};
