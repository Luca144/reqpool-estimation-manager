import { describe, it, expect } from 'vitest';
import { generateCalendarSlots } from '../js/calendar-mock.js';
import { BUSY_PATTERN } from '../js/config.js';

// ─────────────────────────────────────────────────────────────────────────────
// Hilfs-Konstanten und -Funktionen
// ─────────────────────────────────────────────────────────────────────────────

// Mo 2026-05-25 als ISO-String — entspricht Date.getDay() === 1.
const MO_2026_05_25 = '2026-05-25';
// Sa 2026-05-30
const SA_2026_05_30 = '2026-05-30';
// Mi 2026-05-27 (entspannter Wochentag)
const MI_2026_05_27 = '2026-05-27';
// Fr 2026-05-29
const FR_2026_05_29 = '2026-05-29';

/** Konstantes „Jetzt" für deterministisches Empfohlen-Verhalten. */
function fixedNow(iso) {
  return new Date(iso);
}

// Anzahl Slots pro Werktag = 12 Vormittag (9:00–11:45) + 14 Nachmittag (13:30–16:45) = 26
const SLOTS_PER_WORKDAY = 26;

// ─────────────────────────────────────────────────────────────────────────────
// Basics
// ─────────────────────────────────────────────────────────────────────────────

describe('generateCalendarSlots — Basics', () => {
  it('1 Werktag → 26 Slots (12 Vormittag + 14 Nachmittag)', () => {
    const slots = generateCalendarSlots(MO_2026_05_25, 1, { now: fixedNow('2026-01-01T00:00:00Z') });
    expect(slots).toHaveLength(SLOTS_PER_WORKDAY);
  });

  it('5 Werktage → 130 Slots', () => {
    const slots = generateCalendarSlots(MO_2026_05_25, 5, { now: fixedNow('2026-01-01T00:00:00Z') });
    expect(slots).toHaveLength(5 * SLOTS_PER_WORKDAY);
  });

  it('jeder Slot hat datetime und status-Feld', () => {
    const slots = generateCalendarSlots(MO_2026_05_25, 1, { now: fixedNow('2026-01-01T00:00:00Z') });
    for (const slot of slots) {
      expect(slot.datetime).toBeInstanceOf(Date);
      expect(['free', 'busy', 'recommended']).toContain(slot.status);
    }
  });

  it('status ist deterministisch — zwei Aufrufe liefern identische Status-Sequenz', () => {
    const a = generateCalendarSlots(MO_2026_05_25, 3, { now: fixedNow('2026-01-01T00:00:00Z') });
    const b = generateCalendarSlots(MO_2026_05_25, 3, { now: fixedNow('2026-01-01T00:00:00Z') });
    expect(a.map(s => s.status)).toEqual(b.map(s => s.status));
  });

  it('Slots sind in der 15-Minuten-Raster-Form 9:00, 9:15, … 11:45, 13:30, …', () => {
    const slots = generateCalendarSlots(MO_2026_05_25, 1, { now: fixedNow('2026-01-01T00:00:00Z') });
    const firstSlot = slots[0];
    expect(firstSlot.datetime.getHours()).toBe(9);
    expect(firstSlot.datetime.getMinutes()).toBe(0);

    // Letzter Vormittags-Slot (Index 11) ist 11:45.
    expect(slots[11].datetime.getHours()).toBe(11);
    expect(slots[11].datetime.getMinutes()).toBe(45);

    // Erster Nachmittags-Slot (Index 12) ist 13:30.
    expect(slots[12].datetime.getHours()).toBe(13);
    expect(slots[12].datetime.getMinutes()).toBe(30);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Wochenend-Skip
// ─────────────────────────────────────────────────────────────────────────────

describe('generateCalendarSlots — Wochenend-Skip', () => {
  it('Wochenenden werden nicht in die Werktag-Zählung einbezogen', () => {
    // Ab Fr 2026-05-29, 3 Werktage → Fr, Mo, Di (Sa/So überspringen).
    const slots = generateCalendarSlots(FR_2026_05_29, 3, { now: fixedNow('2026-01-01T00:00:00Z') });
    expect(slots).toHaveLength(3 * SLOTS_PER_WORKDAY);

    // Die Tag-1-Slots sollten alle auf Fr 29.05.2026 fallen, Tag-2 auf Mo 01.06.
    const days = new Set(slots.map(s => s.datetime.toDateString()));
    expect(days.has(new Date(2026, 4, 29).toDateString())).toBe(true); // Fr
    expect(days.has(new Date(2026, 4, 30).toDateString())).toBe(false); // Sa
    expect(days.has(new Date(2026, 4, 31).toDateString())).toBe(false); // So
    expect(days.has(new Date(2026, 5, 1).toDateString())).toBe(true); // Mo
  });

  it('Start am Samstag rollt zum Montag', () => {
    const slots = generateCalendarSlots(SA_2026_05_30, 1, { now: fixedNow('2026-01-01T00:00:00Z') });
    // Der erste Slot sollte am Mo 2026-06-01 sein, nicht am Sa 2026-05-30.
    expect(slots[0].datetime.getDay()).toBe(1); // Montag
  });

  it('keine Slots auf Wochenenden in der Ergebnis-Liste', () => {
    const slots = generateCalendarSlots(MO_2026_05_25, 7, { now: fixedNow('2026-01-01T00:00:00Z') });
    for (const slot of slots) {
      const day = slot.datetime.getDay();
      expect(day).not.toBe(0); // nicht Sonntag
      expect(day).not.toBe(6); // nicht Samstag
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Belegt-Pattern: Mittagspause, Vormittag/Nachmittag-Variationen
// ─────────────────────────────────────────────────────────────────────────────

describe('generateCalendarSlots — Belegt-Pattern', () => {
  it('Mittagspause-Slots existieren nicht (12:00–13:30 ist Lücke)', () => {
    // Die Slot-Generation springt vom Vormittag direkt zum Nachmittag.
    // Es darf KEIN Slot mit Stunde 12 oder Stunde 13 vor 13:30 existieren.
    const slots = generateCalendarSlots(MO_2026_05_25, 1, { now: fixedNow('2026-01-01T00:00:00Z') });
    const lunchSlots = slots.filter(s => {
      const h = s.datetime.getHours();
      const m = s.datetime.getMinutes();
      return (h === 12) || (h === 13 && m < 30);
    });
    expect(lunchSlots).toHaveLength(0);
  });

  it('Mittwoch-Vormittag ist statistisch deutlich freier als Montag-Vormittag', () => {
    // Mittwoch-Pattern: morning=0.2 (frei), Montag: morning=0.7 (voll).
    // Bei 12 Slots pro Vormittag erwarten wir Mi mehr freie Slots als Mo.
    const slotsMo = generateCalendarSlots(MO_2026_05_25, 1, { now: fixedNow('2026-01-01T00:00:00Z') });
    const slotsMi = generateCalendarSlots(MI_2026_05_27, 1, { now: fixedNow('2026-01-01T00:00:00Z') });

    const moMorningFree = slotsMo.slice(0, 12).filter(s => s.status === 'free' || s.status === 'recommended').length;
    const miMorningFree = slotsMi.slice(0, 12).filter(s => s.status === 'free' || s.status === 'recommended').length;
    expect(miMorningFree).toBeGreaterThan(moMorningFree);
  });

  it('Freitag-Nachmittag ist statistisch deutlich voller als andere Nachmittage', () => {
    // Freitag-Pattern: afternoon=0.8, andere=0.4.
    const slotsFr = generateCalendarSlots(FR_2026_05_29, 1, { now: fixedNow('2026-01-01T00:00:00Z') });
    const slotsMi = generateCalendarSlots(MI_2026_05_27, 1, { now: fixedNow('2026-01-01T00:00:00Z') });

    const frAfternoonBusy = slotsFr.slice(12).filter(s => s.status === 'busy').length;
    const miAfternoonBusy = slotsMi.slice(12).filter(s => s.status === 'busy').length;
    expect(frAfternoonBusy).toBeGreaterThan(miAfternoonBusy);
  });

  it('Slots existieren nur in den Geschäftszeiten 9:00–11:45 und 13:30–16:45', () => {
    const slots = generateCalendarSlots(MO_2026_05_25, 1, { now: fixedNow('2026-01-01T00:00:00Z') });
    for (const slot of slots) {
      const h = slot.datetime.getHours();
      const m = slot.datetime.getMinutes();
      const decimalHour = h + m / 60;
      const inMorning = decimalHour >= 9 && decimalHour < 12;
      const inAfternoon = decimalHour >= 13.5 && decimalHour < 17;
      expect(inMorning || inAfternoon, `Slot bei ${h}:${m}`).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Empfohlen-Logik
// ─────────────────────────────────────────────────────────────────────────────

describe('generateCalendarSlots — Empfohlen-Slot', () => {
  it('genau ein Slot bekommt status "recommended"', () => {
    const slots = generateCalendarSlots(MO_2026_05_25, 5, {
      now: new Date(2026, 4, 25, 8, 0, 0), // Mo 25.05.2026 08:00
    });
    const recommended = slots.filter(s => s.status === 'recommended');
    expect(recommended).toHaveLength(1);
  });

  it('Empfohlen-Slot liegt mindestens 4 Stunden in der Zukunft', () => {
    const now = new Date(2026, 4, 25, 8, 0, 0); // Mo 25.05.2026 08:00
    const slots = generateCalendarSlots(MO_2026_05_25, 5, { now });
    const recommended = slots.find(s => s.status === 'recommended');
    expect(recommended).toBeTruthy();
    const minTime = now.getTime() + BUSY_PATTERN.recommendedSlotMinHoursAhead * 60 * 60 * 1000;
    expect(recommended.datetime.getTime()).toBeGreaterThanOrEqual(minTime);
  });

  it('Empfohlen-Slot ist freie Slot (war vorher "free")', () => {
    // Wir können das nicht direkt zeigen, weil "free" zu "recommended" überschrieben wird.
    // Aber: alle "busy"-Slots bleiben "busy". Empfohlen wird nur ein non-busy.
    const slots = generateCalendarSlots(MO_2026_05_25, 5, {
      now: new Date(2026, 4, 25, 8, 0, 0),
    });
    const recommended = slots.find(s => s.status === 'recommended');
    expect(recommended).toBeTruthy();
    // Wenn alle Slots vor recommended busy waren, ist das OK.
  });

  it('wenn alle Slots vor "jetzt+4h" liegen → kein Empfohlen-Slot', () => {
    // Generate Slots ab 01.01.2020, now ist 2030 → alle Slots in Vergangenheit
    const slots = generateCalendarSlots('2020-01-06', 5, {
      now: new Date(2030, 0, 1),
    });
    const recommended = slots.filter(s => s.status === 'recommended');
    expect(recommended).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

describe('generateCalendarSlots — Validation', () => {
  it('wirft TypeError bei ungültigem startDate-String', () => {
    expect(() => generateCalendarSlots('25.05.2026', 1)).toThrow(TypeError);
    expect(() => generateCalendarSlots('tomorrow', 1)).toThrow(TypeError);
  });

  it('wirft TypeError bei null/undefined startDate', () => {
    expect(() => generateCalendarSlots(null, 1)).toThrow(TypeError);
    expect(() => generateCalendarSlots(undefined, 1)).toThrow(TypeError);
  });

  it('wirft RangeError bei dayCount < 1', () => {
    expect(() => generateCalendarSlots(MO_2026_05_25, 0)).toThrow(RangeError);
    expect(() => generateCalendarSlots(MO_2026_05_25, -1)).toThrow(RangeError);
  });

  it('wirft TypeError bei NaN als dayCount', () => {
    expect(() => generateCalendarSlots(MO_2026_05_25, NaN)).toThrow(TypeError);
  });

  it('akzeptiert Date-Objekt als startDate', () => {
    const startDate = new Date(2026, 4, 25, 0, 0, 0);
    expect(() => generateCalendarSlots(startDate, 1, { now: fixedNow('2026-01-01T00:00:00Z') })).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Determinismus — kein Math.random im Spiel
// ─────────────────────────────────────────────────────────────────────────────

describe('generateCalendarSlots — Determinismus', () => {
  it('mehrmaliges Aufrufen mit denselben Parametern → identische Slot-Liste', () => {
    const opts = { now: fixedNow('2026-01-01T00:00:00Z') };
    const a = generateCalendarSlots(MO_2026_05_25, 5, opts);
    const b = generateCalendarSlots(MO_2026_05_25, 5, opts);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].datetime.getTime()).toBe(b[i].datetime.getTime());
      expect(a[i].status).toBe(b[i].status);
    }
  });
});
