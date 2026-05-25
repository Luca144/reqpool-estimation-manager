/**
 * calendar-mock.js — Fingierter Beratungs-Kalender für den Lead-Funnel.
 *
 * Generiert deterministische Slot-Listen (15-Min-Raster, Werktage,
 * Geschäftszeiten 9:00–12:00 und 13:30–17:00) mit einem Belegt-Pattern aus
 * config.js. Hier passiert KEINE echte Buchung — Submit ruft im UI ein
 * Confirmation-Modal auf, das transparent als „Konzept-Vorschlag"
 * deklariert ist.
 *
 * Pure-Logic: keine DOM-Zugriffe, keine Side Effects, keine Mutation der
 * Eingaben. Determinismus über einen einfachen Hash auf die Slot-ID
 * (Minuten seit Epoche / Slot-Dauer) — damit ist die Slot-Belegung
 * reproduzierbar zwischen Reloads.
 */

import { BUSY_PATTERN } from './config.js';

// ─────────────────────────────────────────────────────────────────────────────
// Hilfs-Funktionen (intern)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parst Date- oder ISO-String-Input zu Date. Liefert null wenn ungültig.
 * @param {Date | string} input
 * @returns {Date | null}
 */
function parseDate(input) {
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : new Date(input.getTime());
  }
  if (typeof input === 'string') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
    // Lokal-mittag, damit Wochentag-Berechnung stabil ist.
    const [year, month, day] = input.split('-').map(Number);
    const d = new Date(year, month - 1, day, 12, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function addCalendarDays(date, n) {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + n);
  return result;
}

/**
 * Deterministischer Pseudo-Hash 0..1 für eine Slot-ID. Gleiche Slot-ID
 * → gleicher Wert (kein Math.random!).
 */
function slotHash(datetime) {
  const minuteIndex = Math.floor(datetime.getTime() / (BUSY_PATTERN.slotDurationMinutes * 60 * 1000));
  // Mulberry32-artige Mischung.
  let h = minuteIndex | 0;
  h = (h ^ (h >>> 16)) * 0x85ebca6b;
  h = h | 0;
  h = (h ^ (h >>> 13)) * 0xc2b2ae35;
  h = h | 0;
  h = h ^ (h >>> 16);
  // Auf 0..1 normalisieren (unsigned).
  return (h >>> 0) / 0xFFFFFFFF;
}

/**
 * Belegt-Wahrscheinlichkeit (0..1) für einen einzelnen Slot.
 * 1.0 = sicher belegt, 0.0 = sicher frei.
 */
function getBusyChance(datetime) {
  const day = datetime.getDay();
  const decimalHour = datetime.getHours() + datetime.getMinutes() / 60;

  const { workdayHours, busyChances } = BUSY_PATTERN;

  // Mittagspause global belegt.
  if (decimalHour >= workdayHours.morningEnd && decimalHour < workdayHours.afternoonStart) {
    return 1.0;
  }

  // Außerhalb der Geschäftszeiten oder Wochenende → komplett belegt (= keine Slots).
  if (decimalHour < workdayHours.morningStart || decimalHour >= workdayHours.afternoonEnd) {
    return 1.0;
  }
  if (isWeekend(datetime)) return 1.0;

  const dayPattern = busyChances[day];
  if (!dayPattern) return 1.0;

  if (decimalHour < workdayHours.morningEnd) return dayPattern.morning;
  return dayPattern.afternoon;
}

/**
 * Liefert alle Slot-Zeitpunkte für einen Werktag (Vormittag + Nachmittag).
 * @param {Date} date Tag (Uhrzeit egal).
 * @returns {Date[]}
 */
function getDailySlots(date) {
  const result = [];
  const { workdayHours, slotDurationMinutes } = BUSY_PATTERN;

  // Vormittag: morningStart .. morningEnd
  let cursor = decimalHourToDate(date, workdayHours.morningStart);
  const morningEnd = decimalHourToDate(date, workdayHours.morningEnd);
  while (cursor.getTime() < morningEnd.getTime()) {
    result.push(new Date(cursor.getTime()));
    cursor = new Date(cursor.getTime() + slotDurationMinutes * 60 * 1000);
  }

  // Nachmittag: afternoonStart .. afternoonEnd
  cursor = decimalHourToDate(date, workdayHours.afternoonStart);
  const afternoonEnd = decimalHourToDate(date, workdayHours.afternoonEnd);
  while (cursor.getTime() < afternoonEnd.getTime()) {
    result.push(new Date(cursor.getTime()));
    cursor = new Date(cursor.getTime() + slotDurationMinutes * 60 * 1000);
  }

  return result;
}

function decimalHourToDate(date, decimalHour) {
  const hours = Math.floor(decimalHour);
  const minutes = Math.round((decimalHour - hours) * 60);
  const d = new Date(date.getTime());
  d.setHours(hours, minutes, 0, 0);
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} CalendarSlot
 * @property {Date} datetime
 * @property {'free' | 'busy' | 'recommended'} status
 */

/**
 * Generiert die Slot-Liste für `dayCount` Werktage ab `startDate`.
 *
 * Empfohlener Slot: der erste freie Slot, der mindestens
 * `BUSY_PATTERN.recommendedSlotMinHoursAhead` Stunden in der Zukunft liegt
 * (relativ zu `options.now`, oder zu jetzt). Dieser bekommt den Status
 * `recommended`. Genau einer pro Slot-Liste — danach gibt es keine weiteren
 * `recommended` mehr.
 *
 * @param {Date | string} startDate
 * @param {number} dayCount  Anzahl Werktage (Wochenenden werden übersprungen).
 * @param {{ now?: Date }} [options]
 * @returns {CalendarSlot[]}
 */
export function generateCalendarSlots(startDate, dayCount, options = {}) {
  if (typeof dayCount !== 'number' || !Number.isFinite(dayCount)) {
    throw new TypeError(`generateCalendarSlots: dayCount muss eine endliche Zahl sein (erhalten: ${String(dayCount)}).`);
  }
  if (dayCount < 1) {
    throw new RangeError(`generateCalendarSlots: dayCount muss ≥ 1 sein (erhalten: ${dayCount}).`);
  }

  const start = parseDate(startDate);
  if (start === null) {
    throw new TypeError('generateCalendarSlots: startDate muss Date oder ISO-Datum (YYYY-MM-DD) sein.');
  }

  const now = options.now instanceof Date ? options.now : new Date();
  const recommendedThreshold = new Date(
    now.getTime() + BUSY_PATTERN.recommendedSlotMinHoursAhead * 60 * 60 * 1000,
  );

  /** @type {CalendarSlot[]} */
  const slots = [];
  let cursor = start;
  let workdaysAdded = 0;

  while (workdaysAdded < dayCount) {
    if (isWeekend(cursor)) {
      cursor = addCalendarDays(cursor, 1);
      continue;
    }
    for (const slotTime of getDailySlots(cursor)) {
      const chance = getBusyChance(slotTime);
      const status = slotHash(slotTime) < chance ? 'busy' : 'free';
      slots.push({ datetime: slotTime, status });
    }
    workdaysAdded += 1;
    cursor = addCalendarDays(cursor, 1);
  }

  // Den ersten freien Slot ≥ recommendedThreshold zu "recommended" promoten.
  for (const slot of slots) {
    if (slot.status === 'free' && slot.datetime.getTime() >= recommendedThreshold.getTime()) {
      slot.status = 'recommended';
      break;
    }
  }

  return slots;
}
