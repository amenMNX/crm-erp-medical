/**
 * Tunisian public holidays for a given Gregorian year.
 *
 * Fixed-date national holidays are hardcoded.
 * Islamic holidays are estimated using the Intl.DateTimeFormat Hijri calendar
 * (available in all modern browsers / Node 13+). The Islamic calendar is lunar
 * so dates shift ~11 days earlier each Gregorian year; this is as accurate as
 * you can get without an external API.
 */

export type Holiday = {
  name: string;
  date: string; // YYYY-MM-DD
  type: "national" | "islamic";
  emoji: string;
};

// ─── Fixed national holidays ────────────────────────────────────────────────

const NATIONAL_HOLIDAYS: Array<{ month: number; day: number; name: string; emoji: string }> = [
  { month: 1,  day: 1,  name: "Jour de l'An",          emoji: "🎆" },
  { month: 3,  day: 20, name: "Fête de l'Indépendance", emoji: "🇹🇳" },
  { month: 4,  day: 9,  name: "Jour des Martyrs",       emoji: "🕯️" },
  { month: 5,  day: 1,  name: "Fête du Travail",         emoji: "⚒️" },
  { month: 7,  day: 25, name: "Fête de la République",  emoji: "🏛️" },
  { month: 8,  day: 13, name: "Fête de la Femme",        emoji: "👩" },
  { month: 10, day: 15, name: "Fête de l'Évacuation",   emoji: "🤝" },
  { month: 12, day: 17, name: "Fête de la Révolution",  emoji: "⭐" },
];

// ─── Islamic holiday estimation ──────────────────────────────────────────────
// These are the Hijri dates of each holiday (month, day in Islamic calendar).
// We scan Gregorian dates around the expected window to find when the Hijri
// date matches, then return that Gregorian date.

type HijriHoliday = {
  hijriMonth: number;
  hijriDay: number;
  name: string;
  emoji: string;
  durationDays: number; // how many days the holiday lasts (for display)
};

const HIJRI_HOLIDAYS: HijriHoliday[] = [
  { hijriMonth: 1,  hijriDay: 1,  name: "Ras el Am el Hijri",      emoji: "🌙", durationDays: 1 },
  { hijriMonth: 3,  hijriDay: 12, name: "Mouled",                   emoji: "🕌", durationDays: 1 },
  { hijriMonth: 10, hijriDay: 1,  name: "Aïd el-Fitr",              emoji: "🎉", durationDays: 2 },
  { hijriMonth: 12, hijriDay: 10, name: "Aïd el-Adha",              emoji: "🐑", durationDays: 2 },
];

/** Convert a JS Date to its Hijri { year, month, day } using Intl. */
function toHijri(date: Date): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year:  parseInt(parts.year),
    month: parseInt(parts.month),
    day:   parseInt(parts.day),
  };
}

/** Find the Gregorian date (in a given Gregorian year) for a given Hijri month+day. */
function findHijriHoliday(
  gregorianYear: number,
  hijriMonth: number,
  hijriDay: number,
): Date | null {
  // Search a 400-day window centred on the Gregorian year (Islamic year is ~354 days).
  const start = new Date(gregorianYear - 1, 8, 1); // Sep of previous year
  for (let offset = 0; offset < 480; offset++) {
    const candidate = new Date(start);
    candidate.setDate(start.getDate() + offset);
    if (candidate.getFullYear() > gregorianYear + 1) break;
    const h = toHijri(candidate);
    if (h.month === hijriMonth && h.day === hijriDay && candidate.getFullYear() === gregorianYear) {
      return candidate;
    }
  }
  return null;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toISO(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Return all Tunisian public holidays for the given Gregorian year, sorted by date. */
export function getTunisianHolidays(year: number): Holiday[] {
  const holidays: Holiday[] = [];

  // Fixed national holidays
  for (const h of NATIONAL_HOLIDAYS) {
    holidays.push({
      name: h.name,
      date: `${year}-${pad(h.month)}-${pad(h.day)}`,
      type: "national",
      emoji: h.emoji,
    });
  }

  // Islamic holidays
  for (const h of HIJRI_HOLIDAYS) {
    const date = findHijriHoliday(year, h.hijriMonth, h.hijriDay);
    if (date) {
      holidays.push({
        name: h.name,
        date: toISO(date),
        type: "islamic",
        emoji: h.emoji,
      });
      // Add extra days for multi-day holidays
      for (let d = 1; d < h.durationDays; d++) {
        const extra = new Date(date);
        extra.setDate(date.getDate() + d);
        holidays.push({
          name: `${h.name} (J+${d})`,
          date: toISO(extra),
          type: "islamic",
          emoji: h.emoji,
        });
      }
    }
  }

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

/** Return upcoming holidays within the next `days` days from today. */
export function getUpcomingHolidays(days = 60): Holiday[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(today.getDate() + days);

  const thisYear = today.getFullYear();
  const nextYear = thisYear + 1;

  return [...getTunisianHolidays(thisYear), ...getTunisianHolidays(nextYear)]
    .filter((h) => {
      const d = new Date(h.date);
      return d >= today && d <= cutoff;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Return true if the given YYYY-MM-DD string is a Tunisian public holiday. */
export function isTunisianHoliday(dateStr: string): boolean {
  const year = parseInt(dateStr.slice(0, 4));
  return getTunisianHolidays(year).some((h) => h.date === dateStr);
}