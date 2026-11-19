import { site } from '../config/site.js';

/** "1m 12s" / "2h 05m" — used by the uptime chip. */
export function formatUptime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(rest).padStart(2, '0')}s`;
  return `${rest}s`;
}

/**
 * Formats a date in Dhaka time using the active interface language, so Bangla
 * users see Bengali digits and month names.
 */
export function formatDateTime(value, language = 'en') {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: site.timeZone,
  }).format(date);
}

/** 1250 → "৳1,250" (Bangla locale renders ৳ and Bengali digits). */
export function formatCurrency(amount, language = 'en') {
  return new Intl.NumberFormat(language === 'bn' ? 'bn-BD' : 'en-BD', {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);
}
