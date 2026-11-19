/** Page/limit parsing with sane bounds, shared by every list endpoint. */
export function parsePagination(query = {}, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(
    maxLimit,
    Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit),
  );
  return { page, limit, skip: (page - 1) * limit };
}

export function paginated(items, total, page, limit) {
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

/**
 * Escapes a user-supplied string before it goes into a RegExp.
 * Without this, a search like "a(b" throws, and a crafted pattern can make the
 * database do enormous work (ReDoS).
 */
export function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive "contains" condition for a text search. */
export function containsRegex(value) {
  return { $regex: escapeRegex(value), $options: 'i' };
}

/** Today's date in Dhaka as "YYYY-MM-DD". Server timezone never matters. */
export function dhakaToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** Turns "YYYY-MM-DD" + "HH:mm" in Dhaka time into a real Date (UTC instant). */
export function dhakaDateTime(dateValue, timeValue) {
  const date = String(dateValue).slice(0, 10);
  const [hours, minutes] = String(timeValue).split(':').map(Number);
  return new Date(
    `${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00+06:00`,
  );
}
