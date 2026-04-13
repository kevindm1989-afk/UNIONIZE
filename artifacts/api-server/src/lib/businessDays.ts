function getEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function getNthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month, 1).getDay();
  const offset = (weekday - first + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

function lastMondayOnOrBefore(year: number, month: number, day: number): Date {
  const d = new Date(year, month, day);
  const dow = d.getDay();
  const offset = dow === 0 ? 6 : dow - 1;
  return new Date(year, month, day - offset);
}

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const holidayCache = new Map<number, Set<string>>();

function getOntarioHolidays(year: number): Set<string> {
  const easter = getEaster(year);
  const goodFriday = new Date(easter.getTime());
  goodFriday.setDate(goodFriday.getDate() - 2);

  const dates = [
    new Date(year, 0, 1),
    getNthWeekday(year, 1, 1, 3),
    goodFriday,
    lastMondayOnOrBefore(year, 4, 25),
    new Date(year, 6, 1),
    getNthWeekday(year, 7, 1, 1),
    getNthWeekday(year, 8, 1, 1),
    getNthWeekday(year, 9, 1, 2),
    new Date(year, 11, 25),
    new Date(year, 11, 26),
  ];

  return new Set(dates.map(fmt));
}

function holidays(year: number): Set<string> {
  if (!holidayCache.has(year)) {
    holidayCache.set(year, getOntarioHolidays(year));
  }
  return holidayCache.get(year)!;
}

export function isBusinessDay(dateStr: string): boolean {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  return !holidays(d.getFullYear()).has(dateStr);
}

export function countBusinessDaysUntil(fromStr: string, toStr: string): number {
  const from = new Date(fromStr + "T12:00:00");
  const to = new Date(toStr + "T12:00:00");
  if (from.getTime() === to.getTime()) return 0;

  const sign = to > from ? 1 : -1;
  let count = 0;
  const cur = new Date(from.getTime());

  while (true) {
    cur.setDate(cur.getDate() + sign);
    if (sign === 1 ? cur > to : cur < to) break;
    if (isBusinessDay(fmt(cur))) count += sign;
  }
  return count;
}

export function addBusinessDays(fromStr: string, n: number): string {
  if (n === 0) return fromStr;
  const sign = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  const cur = new Date(fromStr + "T12:00:00");

  while (remaining > 0) {
    cur.setDate(cur.getDate() + sign);
    if (isBusinessDay(fmt(cur))) remaining--;
  }
  return fmt(cur);
}
