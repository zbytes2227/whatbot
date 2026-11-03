// lib/campaignTime.js
// Time-zone aware helpers for campaign schedules and sending windows.

export const DEFAULT_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidTime(value) {
  return TIME_RE.test(String(value || ''));
}

export function isValidDate(value) {
  if (!DATE_RE.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function getTimeParts(date = new Date(), timeZone = DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
  return values;
}

function minutesOf(value) {
  const match = TIME_RE.exec(String(value || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Convert a wall-clock date/time in `timeZone` to a UTC Date. */
export function zonedToUtc({ year, month, day, hour = 0, minute = 0 }, timeZone = DEFAULT_TIMEZONE) {
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes settle DST transitions.
  for (let i = 0; i < 2; i += 1) {
    const p = getTimeParts(new Date(guess), timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += Date.UTC(year, month - 1, day, hour, minute) - asUtc;
  }
  return new Date(guess);
}

export function parseZonedDateTime(dateStr, timeStr, timeZone = DEFAULT_TIMEZONE) {
  if (!isValidDate(dateStr)) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = isValidTime(timeStr) ? timeStr.split(':').map(Number) : [0, 0];
  return zonedToUtc({ year, month, day, hour, minute }, timeZone);
}

export function dateKey(date = new Date(), timeZone = DEFAULT_TIMEZONE) {
  const p = getTimeParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function startOfDay(date = new Date(), timeZone = DEFAULT_TIMEZONE, dayOffset = 0) {
  const p = getTimeParts(date, timeZone);
  return zonedToUtc({ year: p.year, month: p.month, day: p.day + dayOffset }, timeZone);
}

export function hasSendingWindow(scheduling) {
  return minutesOf(scheduling?.startTime) != null && minutesOf(scheduling?.endTime) != null && scheduling?.windowEnabled !== false;
}

export function isWithinSendingHours(scheduling, now = new Date()) {
  if (!hasSendingWindow(scheduling)) return true;
  const p = getTimeParts(now, scheduling.timezone || DEFAULT_TIMEZONE);
  const current = p.hour * 60 + p.minute;
  const start = minutesOf(scheduling.startTime);
  const end = minutesOf(scheduling.endTime);
  if (start === end) return true;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

/** The first instant at or after `from` that falls inside the sending window. */
export function nextWindowStart(scheduling, from = new Date()) {
  if (!hasSendingWindow(scheduling) || isWithinSendingHours(scheduling, from)) return from;
  const timeZone = scheduling.timezone || DEFAULT_TIMEZONE;
  const p = getTimeParts(from, timeZone);
  const [hour, minute] = scheduling.startTime.split(':').map(Number);
  let candidate = zonedToUtc({ year: p.year, month: p.month, day: p.day, hour, minute }, timeZone);
  if (candidate <= from) {
    candidate = zonedToUtc({ year: p.year, month: p.month, day: p.day + 1, hour, minute }, timeZone);
  }
  return candidate;
}

/** Resolve when a scheduled campaign should start (supports legacy documents). */
export function resolveScheduledStart(campaign) {
  const scheduling = campaign?.scheduling || {};
  if (scheduling.startAt) return new Date(scheduling.startAt);
  if (!scheduling.startDate) return null;
  const date = new Date(scheduling.startDate);
  if (Number.isNaN(date.getTime())) return null;
  return parseZonedDateTime(date.toISOString().slice(0, 10), scheduling.startTime || '00:00', scheduling.timezone || DEFAULT_TIMEZONE);
}
