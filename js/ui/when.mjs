/**
 * When something was made: a version by its day and time to the second ("Today
 * 14:05:37"), and in a sentence to the minute ("today at 14:05"). Version
 * history, the Share window, and the reading page of a link (js/share/).
 */

/** Midnight that begins the day `ms` falls in, local time. */
function midnightOf(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 0 for today, 1 for yesterday, 2 or more for earlier (by the calendar, not by 24 hours). */
function daysAgo(ms, now) {
  const today = new Date(now);
  if (ms >= midnightOf(now)) return 0;
  // Yesterday's midnight from the calendar: a day with a clock change is 23 or 25 hours.
  return ms >= new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1).getTime() ? 1 : 2;
}

/** The day a moment falls in, as a heading says it: "Today", "Yesterday", "2 Oct", "31 Dec 2025". */
export function dayWords(ms, now = Date.now()) {
  const ago = daysAgo(ms, now);
  if (ago === 0) return 'Today';
  if (ago === 1) return 'Yesterday';
  const at = new Date(ms);
  const opts = at.getFullYear() === new Date(now).getFullYear()
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' };
  return at.toLocaleDateString([], opts);
}

/** The time of day alone: "14:05", or "14:05:37" with `seconds`. */
export function clockTime(ms, seconds = false) {
  const opts = seconds ? { hour: 'numeric', minute: '2-digit', second: '2-digit' } : { hour: 'numeric', minute: '2-digit' };
  return new Date(ms).toLocaleTimeString([], opts);
}

/**
 * When a version was made, to the second, so each is told apart by its time
 * (versions are made at every sync, several a minute): "Today 14:05:37",
 * "Yesterday 09:12:00", "2 Oct 16:40:05".
 */
export function versionTime(ms, now = Date.now()) {
  return dayWords(ms, now) + ' ' + clockTime(ms, true);
}

/** The same moment inside a sentence: "today at 14:05", "yesterday at 09:12", "on 2 Oct at 16:40". */
export function whenWords(ms, now = Date.now()) {
  const ago = daysAgo(ms, now);
  const time = clockTime(ms);
  if (ago === 0) return 'today at ' + time;
  if (ago === 1) return 'yesterday at ' + time;
  return 'on ' + dayWords(ms, now) + ' at ' + time;
}
