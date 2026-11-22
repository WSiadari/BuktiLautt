// Parser dan label tanggal untuk pertanyaan arsip. Zona waktu selalu Asia/Jakarta (WIB).
import { basicArchiveDateRange } from "../archive-agent.ts";

const MONTHS = [
  "januari",
  "februari",
  "maret",
  "april",
  "mei",
  "juni",
  "juli",
  "agustus",
  "september",
  "oktober",
  "november",
  "desember",
];
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
/** Tanggal hari ini menurut WIB dalam bentuk YYYY-MM-DD. */
export function jakartaDateKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
function jakartaToday(now: Date): Date {
  return new Date(jakartaDateKey(now) + "T00:00:00Z");
}
const NAMED_MONTH = new RegExp(
  `(?<!\\d\\s)\\b(?:bulan\\s+)?(${MONTHS.join("|")})(?:\\s+(\\d{4}))?\\b`,
  "u",
);
/** Periode alami: kemarin, minggu lalu, bulan ini/lalu, tahun ini, N hari terakhir, nama bulan. */
export function naturalDateRange(
  question: string,
  now = new Date(),
): { fromDate: string; toDate: string } | null {
  const q = question.toLocaleLowerCase("id-ID");
  const today = jakartaToday(now);
  const y = today.getUTCFullYear(),
    m = today.getUTCMonth();
  const day = (offset: number) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + offset);
    return d;
  };
  if (/\bkemarin\b/u.test(q) && !/\b(?:minggu|bulan) kemarin\b/u.test(q)) {
    const d = isoDay(day(-1));
    return { fromDate: d, toDate: d };
  }
  if (/\bminggu (?:lalu|kemarin)\b/u.test(q)) {
    const monday = day(-((today.getUTCDay() + 6) % 7) - 7);
    const sunday = new Date(monday);
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    return { fromDate: isoDay(monday), toDate: isoDay(sunday) };
  }
  if (/\bbulan (?:ini|sekarang)\b/u.test(q))
    return { fromDate: isoDay(new Date(Date.UTC(y, m, 1))), toDate: isoDay(today) };
  if (/\bbulan (?:lalu|kemarin|sebelumnya)\b/u.test(q))
    return {
      fromDate: isoDay(new Date(Date.UTC(y, m - 1, 1))),
      toDate: isoDay(new Date(Date.UTC(y, m, 0))),
    };
  if (/\btahun (?:ini|sekarang)\b/u.test(q))
    return { fromDate: `${y}-01-01`, toDate: isoDay(today) };
  const lastDays = /\b(\d{1,3})\s+hari\s+terakhir\b/u.exec(q);
  if (lastDays) {
    const n = Number(lastDays[1]);
    if (n >= 1 && n <= 366)
      return { fromDate: isoDay(day(-(n - 1))), toDate: isoDay(today) };
  }
  const named = NAMED_MONTH.exec(q);
  if (named) {
    const month = MONTHS.indexOf(named[1]);
    const year = named[2] ? Number(named[2]) : month <= m ? y : y - 1;
    return {
      fromDate: isoDay(new Date(Date.UTC(year, month, 1))),
      toDate: isoDay(new Date(Date.UTC(year, month + 1, 0))),
    };
  }
  return null;
}
export function basicDateRange(question: string, now: Date) {
  if (!/\bminggu ini\b/iu.test(question)) {
    try {
      return basicArchiveDateRange(question, now);
    } catch (error) {
      const natural = naturalDateRange(question, now);
      if (natural) return natural;
      throw error;
    }
  }
  const monday = jakartaToday(now);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  return {
    fromDate: monday.toISOString().slice(0, 10),
    toDate: sunday.toISOString().slice(0, 10),
  };
}
const MONTH_LABEL = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
export function dayLabel(iso: string, withYear = true) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTH_LABEL[m - 1]}${withYear ? ` ${y}` : ""}`;
}
export function periodLabel(fromDate: string, toDate: string): string {
  if (fromDate === toDate) return dayLabel(fromDate);
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const [ty, tm] = toDate.split("-").map(Number);
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  if (fy === ty && fm === tm && fd === 1 && Number(toDate.slice(8)) === last)
    return `${MONTH_LABEL[fm - 1]} ${fy}`;
  if (fy === ty && fm === tm)
    return `${fd}–${dayLabel(toDate)}`;
  return `${dayLabel(fromDate, fy !== ty)} – ${dayLabel(toDate)}`;
}
