/**
 * Dates are stored in UTC but staff in Bangladesh think in Dhaka time, so every
 * admin screen formats with the Asia/Dhaka zone explicitly (never the browser's).
 */
function localeFor(language) {
  return language === 'bn' ? 'bn-BD' : 'en-GB';
}

export function formatDateTime(value, language = 'en') {
  if (!value) return '—';
  return new Intl.DateTimeFormat(localeFor(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dhaka',
  }).format(new Date(value));
}

export function formatDate(value, language = 'en') {
  if (!value) return '—';
  return new Intl.DateTimeFormat(localeFor(language), {
    dateStyle: 'medium',
    timeZone: 'Asia/Dhaka',
  }).format(new Date(value));
}

export function formatTime(value, language = 'en') {
  if (!value) return '—';
  return new Intl.DateTimeFormat(localeFor(language), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Dhaka',
  }).format(new Date(value));
}

/** A hold countdown as mm:ss, with digits in the active language. */
export function formatCountdown(totalSeconds, language = 'en') {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const digits = new Intl.NumberFormat(localeFor(language), {
    minimumIntegerDigits: 2,
    useGrouping: false,
  });
  return `${digits.format(Math.floor(safe / 60))}:${digits.format(safe % 60)}`;
}

export function formatMoney(amount, language = 'en') {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat(localeFor(language), {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(value, language = 'en') {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(localeFor(language)).format(value);
}

/** "6h 30m" in English, "৬ ঘণ্টা ৩০ মিনিট" in Bangla. */
export function formatDuration(minutes, language = 'en') {
  if (minutes === null || minutes === undefined) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (language === 'bn') {
    const hourPart = `${formatNumber(hours, language)} ঘণ্টা`;
    return rest === 0 ? hourPart : `${hourPart} ${formatNumber(rest, language)} মিনিট`;
  }

  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** For <input type="date"> — the Dhaka calendar day of an instant. */
export function toDateInputValue(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date(value));
}
