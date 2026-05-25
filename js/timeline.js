/**
 * timeline.js — Indikative Timeline-Berechnung (Pure Logic).
 *
 * Verteilt die Phasen-PT seriell auf Werktage und liefert pro Phase ein
 * Tupel (phaseName, phaseKey, startDate, endDate, durationDays, pt). Keine
 * Pufferzeiten, keine Feiertage — bewusst vereinfacht. Wochenenden werden
 * übersprungen.
 *
 * @example
 *   computeTimeline(
 *     [{ key: 'a', name: 'A', share: 1.0, pt: 10 }],
 *     '2026-05-25', // Montag
 *     2,
 *   )
 *   // → [{ phaseName: 'A', phaseKey: 'a', startDate: 2026-05-25,
 *   //      endDate: 2026-05-29, durationDays: 5, pt: 10 }]
 *
 * Pure: keine DOM-Zugriffe, keine Mutation der Eingaben. Date-Objekte werden
 * frisch konstruiert (Defensive Kopie). UI-nahe Formatierung (DE-Datum)
 * passiert NICHT hier, sondern im wizard.js.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Helfer (intern)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parst einen Date- oder ISO-String-Input zu einem Date-Objekt.
 * Liefert null wenn ungültig.
 * @param {Date | string} input
 * @returns {Date | null}
 */
function parseStartDate(input) {
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : new Date(input.getTime());
  }
  if (typeof input === 'string') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
    // Mittags-UTC-Zeit, um Zeitzonen-Off-by-One-Effekte zu vermeiden.
    const d = new Date(`${input}T12:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Liefert true, wenn der Tag Samstag (6) oder Sonntag (0) ist. */
function isWeekend(date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Liefert ein neues Date-Objekt mit `n` Kalendertagen Versatz (kann
 * Wochenenden enthalten).
 */
function addCalendarDays(date, n) {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + n);
  return result;
}

/**
 * Liefert ein neues Date-Objekt mit `n` Werktagen Versatz (Wochenenden werden
 * übersprungen). n=0 → gleiche (oder nächst-folgende, falls Wochenende)
 * Datum.
 */
function addWorkdays(date, n) {
  let result = new Date(date.getTime());
  // Wenn Startdatum auf Wochenende, auf nächsten Werktag rollen.
  while (isWeekend(result)) {
    result = addCalendarDays(result, 1);
  }
  let remaining = n;
  while (remaining > 0) {
    result = addCalendarDays(result, 1);
    if (!isWeekend(result)) {
      remaining -= 1;
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} TimelineRow
 * @property {string} phaseName
 * @property {string} phaseKey
 * @property {Date} startDate    Werktag-Beginn der Phase (UTC-normalisiert).
 * @property {Date} endDate      Werktag-Ende der Phase (inklusiv).
 * @property {number} durationDays Anzahl belegter Werktage.
 * @property {number} pt          PT-Anteil aus der Phase (Echo).
 */

/**
 * Berechnet eine serielle Timeline aus Phasen, Start-Datum und Berater-Anzahl.
 *
 * Pro Phase: durationDays = ceil(phase.pt / consultantCount), Minimum 1 Tag.
 * Zwischen Phasen kein Puffer; nächste Phase startet am Werktag nach dem
 * Ende der vorherigen.
 *
 * @param {Array<{ name: string, key?: string, pt: number }>} phases
 * @param {Date | string} startDate ISO-String YYYY-MM-DD oder Date.
 * @param {number} consultantCount  Berater-Anzahl ≥ 1.
 * @returns {TimelineRow[]}
 * @throws {TypeError | RangeError} bei ungültigen Eingaben.
 */
export function computeTimeline(phases, startDate, consultantCount) {
  if (!Array.isArray(phases)) {
    throw new TypeError('computeTimeline: phases muss ein Array sein.');
  }
  if (typeof consultantCount !== 'number' || !Number.isFinite(consultantCount)) {
    throw new TypeError(`computeTimeline: consultantCount muss eine endliche Zahl sein (erhalten: ${String(consultantCount)}).`);
  }
  if (consultantCount < 1) {
    throw new RangeError(`computeTimeline: consultantCount muss ≥ 1 sein (erhalten: ${consultantCount}).`);
  }

  const start = parseStartDate(startDate);
  if (start === null) {
    throw new TypeError('computeTimeline: startDate muss ein Date oder ein ISO-Datum (YYYY-MM-DD) sein.');
  }

  /** @type {TimelineRow[]} */
  const result = [];
  let currentDate = new Date(start.getTime());

  for (const phase of phases) {
    if (!phase || typeof phase !== 'object') {
      throw new TypeError('computeTimeline: phase-Eintrag muss ein Objekt sein.');
    }
    if (typeof phase.pt !== 'number' || !Number.isFinite(phase.pt)) {
      throw new TypeError(`computeTimeline: phase.pt muss eine endliche Zahl sein (Phase "${phase.name}").`);
    }
    if (phase.pt < 0) {
      throw new RangeError(`computeTimeline: phase.pt darf nicht negativ sein (Phase "${phase.name}", pt=${phase.pt}).`);
    }

    // Auch eine Phase mit 0 PT belegt minimal 1 Tag, sonst hätte der Donut
    // ein leeres Element ohne Visualisierung.
    const durationDays = Math.max(1, Math.ceil(phase.pt / consultantCount));

    // Wenn currentDate auf Wochenende fällt: weiterrollen.
    while (isWeekend(currentDate)) {
      currentDate = addCalendarDays(currentDate, 1);
    }

    const phaseStart = new Date(currentDate.getTime());
    const phaseEnd = addWorkdays(phaseStart, durationDays - 1);

    result.push({
      phaseName: phase.name ?? '',
      phaseKey: phase.key ?? '',
      startDate: phaseStart,
      endDate: phaseEnd,
      durationDays,
      pt: phase.pt,
    });

    // Nächste Phase startet am Werktag nach phaseEnd.
    currentDate = addWorkdays(phaseEnd, 1);
  }

  return result;
}
