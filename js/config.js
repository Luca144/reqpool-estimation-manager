/**
 * config.js — Zentrale Konfiguration des ReqPOOL Estimation Managers.
 *
 * Diese Datei ist die EINE Stelle, an der ein Maintainer Stellschrauben
 * verändert, ohne die Domänenlogik anzufassen. Wenn Florian (oder ein
 * Nachfolger) z.B. die Schätzformel-Gewichte tunen, den Default-Tagessatz
 * anheben oder Scope-Items ergänzen will, passiert das hier.
 *
 * Bewusste Strukturierung in Sektionen unten:
 *   - SCHÄTZFORMEL: Gewichte, Multiplikatoren, Puffer, Phasen
 *   - PREISBASIS: Tagessatz-Default (User-Override via Settings möglich)
 *   - (Sprint 2) MACHBARKEIT: Workdays/Monat, Toleranzbänder
 *   - (Sprint 2) SCOPE: Items, Default-Inklusion
 *   - (Sprint 2) KALENDER: Belegt-Pattern für Lead-Funnel
 *
 * Die Bereiche wachsen iterativ. Aktuell ist die Datei noch leer und wird
 * im Schritt-0-Refactor nach und nach mit den existierenden Konstanten aus
 * estimation.js befüllt. Die "(Sprint 2)"-Sektionen kommen mit ihren
 * jeweiligen Features (A1/B1/D1).
 *
 * Konvention: jede Konstante hat einen JSDoc-Kommentar, der erklärt was sie
 * bewirkt und wo sie verwendet wird. Object.freeze() bzw. nested freeze für
 * defensive Schreibblockade.
 */

// ─────────────────────────────────────────────────────────────────────────────
// SCHÄTZFORMEL — Gewichte, Skalierung, Multiplikatoren, Phasen
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PT-Aufwand pro Einheit eines Parameters (Basis-RE-Aufwand).
 *
 * Wird in `calculateBaseEffort` (estimation.js) als reine Multiplikator-
 * Tabelle benutzt und in `sensitivity.js` zur Cost-Driver-Berechnung.
 * Anpassung dieser Werte → die ganze Schätzformel zieht nach, ohne dass
 * Code in estimation.js angefasst werden muss.
 *
 * @type {Readonly<{ pages: number, useCases: number, businessObjects: number, interfaces: number, batches: number, languages: number, roles: number }>}
 */
export const WEIGHTS = Object.freeze({
  pages: 0.8,
  useCases: 2.5,
  businessObjects: 1.2,
  interfaces: 3.0,
  batches: 1.5,
  // Languages: erste Sprache kostet nichts extra, jede weitere 0.5 PT
  languages: 0.5,
  roles: 1.8,
});

/**
 * Stufen-basierter User-Scaling-Faktor.
 *
 * Jede Stufe gilt bis einschließlich `upTo` Usern. Die letzte Stufe
 * (upTo: Infinity) fängt alle größeren Werte ab. Wird in
 * `getUserScalingFactor` (estimation.js) als Lookup-Tabelle benutzt.
 *
 * Grenzwert-Konvention (Briefing-Tests: "10/11, 50/51, 200/201"):
 *   users <= 10   → 1.00
 *   users <= 50   → 1.10
 *   users <= 200  → 1.25
 *   users <= 1000 → 1.40
 *   sonst         → 1.60
 *
 * @type {ReadonlyArray<Readonly<{ upTo: number, factor: number }>>}
 */
export const USER_SCALING_THRESHOLDS = Object.freeze([
  Object.freeze({ upTo: 10, factor: 1.0 }),
  Object.freeze({ upTo: 50, factor: 1.1 }),
  Object.freeze({ upTo: 200, factor: 1.25 }),
  Object.freeze({ upTo: 1000, factor: 1.4 }),
  Object.freeze({ upTo: Infinity, factor: 1.6 }),
]);

/**
 * Aufschlag-Multiplikator je Projekttyp.
 *
 * Greenfield = neu von Grün, kein Altbestand → 1.0
 * Brownfield = Bestand integrieren → 1.2
 * Migration  = bestehendes System ablösen → 1.35
 *
 * Wird in `getProjectTypeMultiplier` (estimation.js) als Lookup verwendet.
 *
 * @type {Readonly<Record<'Greenfield' | 'Brownfield' | 'Migration', number>>}
 */
export const PROJECT_TYPE_MULTIPLIERS = Object.freeze({
  Greenfield: 1.0,
  Brownfield: 1.2,
  Migration: 1.35,
});

/**
 * Komplexitäts-Puffer (15% für Unvorhergesehenes), multiplikativ auf
 * typeEffort. Verändert man diesen Wert, wird die gesamte Schätzung
 * pauschal angehoben/abgesenkt.
 */
export const COMPLEXITY_BUFFER = 1.15;

/**
 * Range-Faktoren für die Pessimistisch / Wahrscheinlich / Optimistisch-
 * Bandbreite, multiplikativ auf totalEffort.
 *   min:    -15% gegenüber likely
 *   likely:  100% (Referenz)
 *   max:    +25% gegenüber likely
 *
 * Wird in `calculateEstimation` (estimation.js) zur Range-Erzeugung benutzt.
 */
export const RANGE_FACTORS = Object.freeze({
  min: 0.85,
  likely: 1.0,
  max: 1.25,
});

/**
 * Phasen-Aufteilung des Gesamtaufwands (Summe der Shares = 1.0).
 *
 * Die Reihenfolge ist die Anzeigereihenfolge in Donut-Chart und PDF.
 * Wird in `calculatePhases` (estimation.js) als Multiplikator-Tabelle
 * benutzt. Methodik-Konstante — bleibt von Sensitivity-Slidern unberührt.
 *
 * @type {ReadonlyArray<Readonly<{ key: string, name: string, share: number }>>}
 */
export const PHASE_DISTRIBUTION = Object.freeze([
  Object.freeze({ key: 'stakeholderAnalysis', name: 'Stakeholder-Analyse', share: 0.12 }),
  Object.freeze({ key: 'requirementsElicitation', name: 'Anforderungserhebung', share: 0.28 }),
  Object.freeze({ key: 'specification', name: 'Spezifikation', share: 0.35 }),
  Object.freeze({ key: 'reviewQa', name: 'Review & QA', share: 0.15 }),
  Object.freeze({ key: 'acceptanceHandover', name: 'Abnahme & Übergabe', share: 0.05 }),
  Object.freeze({ key: 'projectManagement', name: 'Projektmanagement', share: 0.05 }),
]);

// ─────────────────────────────────────────────────────────────────────────────
// PREISBASIS — Default-Tagessatz (Sprint-2-A2 erlaubt User-Override)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default-Tagessatz in EUR für die Umrechnung Personentage → Kosten.
 *
 * Verwendet, wenn der User keinen eigenen Tagessatz im Settings-Modal
 * überschreibt. Aktueller ReqPOOL-Standardsatz.
 */
export const DEFAULT_TAGESSATZ = 1200;

/**
 * Höchstgrenze für den vom User eingegebenen Tagessatz. Schützt davor, dass
 * sich jemand mit einem Zahlendreher (z.B. 12000 statt 1200) selbst aus dem
 * realistischen Bereich heraus rechnet.
 */
export const MAX_TAGESSATZ = 10000;

/** localStorage-Key für den User-Override des Tagessatzes. */
export const TAGESSATZ_STORAGE_KEY = 'reqpool.tagessatz';

/**
 * Liefert den aktuell gültigen Tagessatz: User-Override aus localStorage,
 * sonst {@link DEFAULT_TAGESSATZ}. Robust gegen Umgebungen ohne localStorage
 * (z.B. Node-only-Tests).
 *
 * @returns {number} Tagessatz in EUR
 */
export function getTagessatz() {
  if (typeof localStorage === 'undefined') return DEFAULT_TAGESSATZ;
  let raw;
  try {
    raw = localStorage.getItem(TAGESSATZ_STORAGE_KEY);
  } catch {
    // localStorage kann in privacy-restricted Browsern throw werfen.
    return DEFAULT_TAGESSATZ;
  }
  if (raw === null || raw === '') return DEFAULT_TAGESSATZ;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_TAGESSATZ) return DEFAULT_TAGESSATZ;
  return n;
}

/**
 * Speichert einen User-Tagessatz in localStorage.
 *
 * @param {number} value Tagessatz in EUR, > 0 und ≤ {@link MAX_TAGESSATZ}
 * @throws {TypeError} bei nicht-numerischem Input
 * @throws {RangeError} bei Wert außerhalb (0, MAX_TAGESSATZ]
 */
export function setTagessatz(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`setTagessatz erwartet eine endliche Zahl (erhalten: ${String(value)}).`);
  }
  if (value <= 0) {
    throw new RangeError(`Tagessatz muss größer als 0 sein (erhalten: ${value}).`);
  }
  if (value > MAX_TAGESSATZ) {
    throw new RangeError(`Tagessatz darf höchstens ${MAX_TAGESSATZ} sein (erhalten: ${value}).`);
  }
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(TAGESSATZ_STORAGE_KEY, String(value));
  } catch {
    // Storage voll oder Privacy-Mode: defensiv schlucken, der User merkt es
    // anhand des nicht-persistierten Wertes ohnehin.
  }
}

/**
 * Entfernt einen eventuellen User-Override und setzt zurück auf
 * {@link DEFAULT_TAGESSATZ}.
 */
export function resetTagessatz() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(TAGESSATZ_STORAGE_KEY);
  } catch {
    // siehe setTagessatz
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCOPE — Kuratierter Katalog der Leistungsbausteine (Sprint-2-B1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Anzeigenamen für die fünf Scope-Kategorien (für die UI-Gruppierung).
 *
 * @type {Readonly<Record<string, string>>}
 */
export const SCOPE_CATEGORY_LABELS = Object.freeze({
  erhebung: 'Erhebung',
  spezifikation: 'Spezifikation',
  review: 'Review',
  uebergabe: 'Übergabe',
  optional: 'Optional / Spezial',
});

/**
 * Anzeigereihenfolge der Kategorien (analog zur Methodik: zeitlicher Verlauf
 * + optional/Spezial am Ende).
 */
export const SCOPE_CATEGORY_ORDER = Object.freeze([
  'erhebung',
  'spezifikation',
  'review',
  'uebergabe',
  'optional',
]);

/**
 * Kuratierter Katalog der Scope-Items (Leistungsbausteine).
 *
 * Jedes Item beschreibt einen Baustein des RE-Auftrags mit einem geschätzten
 * Default-Aufwand in PT. `defaultIncluded` markiert, ob das Item bei einem
 * Standard-ReqPOOL-Projekt initial enthalten ist — entsprechend wird die
 * Step-3-Anzeige initial in „Enthalten" / „Nicht enthalten" aufgeteilt.
 *
 * Die Schätzungs-Anpassung in Step 3 läuft als Delta: solange der User keine
 * Toggles bedient, ist die Anpassung 0 und die Step-2-Schätzung bleibt
 * unverändert. Beim Ein-/Aus-Toggeln verändert sich der Gesamtaufwand um
 * (item.defaultPT) addiert bzw. subtrahiert (siehe scope.js).
 *
 * @type {ReadonlyArray<Readonly<{
 *   id: string,
 *   name: string,
 *   description: string,
 *   defaultPT: number,
 *   defaultIncluded: boolean,
 *   category: string
 * }>>}
 */
export const SCOPE_ITEMS = Object.freeze([
  // ── Erhebung ──────────────────────────────────────────────────────────
  Object.freeze({
    id: 'stakeholder-interviews',
    name: 'Stakeholder-Interviews',
    description: 'Einzelgespräche mit identifizierten Stakeholdern zur Bedarfsklärung.',
    defaultPT: 5,
    defaultIncluded: true,
    category: 'erhebung',
  }),
  Object.freeze({
    id: 'workshop-moderation',
    name: 'Workshop-Moderation',
    description: 'Moderation strukturierter Workshops mit Fachbereich.',
    defaultPT: 8,
    defaultIncluded: true,
    category: 'erhebung',
  }),
  Object.freeze({
    id: 'anforderungswerkstatt',
    name: 'Anforderungswerkstatt',
    description: 'Erhebungs-Sessions zur kollaborativen Anforderungserarbeitung.',
    defaultPT: 6,
    defaultIncluded: true,
    category: 'erhebung',
  }),
  Object.freeze({
    id: 'bestandsanalyse',
    name: 'Bestandsanalyse',
    description: 'Analyse vorhandener Systeme und Dokumentation — typisch bei Brownfield/Migration.',
    defaultPT: 10,
    defaultIncluded: false,
    category: 'erhebung',
  }),

  // ── Spezifikation ─────────────────────────────────────────────────────
  Object.freeze({
    id: 'usecase-dokumentation',
    name: 'Use-Case-Dokumentation',
    description: 'Strukturierte Beschreibung aller fachlichen Use Cases mit Vor- und Nachbedingungen.',
    defaultPT: 12,
    defaultIncluded: true,
    category: 'spezifikation',
  }),
  Object.freeze({
    id: 'schnittstellenbeschreibungen',
    name: 'Schnittstellenbeschreibungen',
    description: 'Fachliche und technische Spezifikation der Drittsystem-Schnittstellen.',
    defaultPT: 6,
    defaultIncluded: true,
    category: 'spezifikation',
  }),
  Object.freeze({
    id: 'datenmodell',
    name: 'Datenmodell',
    description: 'Konzeptionelles Datenmodell mit Entitäten und Beziehungen.',
    defaultPT: 8,
    defaultIncluded: true,
    category: 'spezifikation',
  }),
  Object.freeze({
    id: 'glossar',
    name: 'Glossar',
    description: 'Fachliches Glossar mit konsolidierten Begriffsdefinitionen.',
    defaultPT: 3,
    defaultIncluded: true,
    category: 'spezifikation',
  }),
  Object.freeze({
    id: 'nfr-katalog',
    name: 'NFR-Katalog',
    description: 'Katalog nicht-funktionaler Anforderungen (Performance, Security, Verfügbarkeit, …).',
    defaultPT: 5,
    defaultIncluded: true,
    category: 'spezifikation',
  }),

  // ── Review ────────────────────────────────────────────────────────────
  Object.freeze({
    id: 'fachliche-reviews',
    name: 'Fachliche Reviews',
    description: 'Reviewzyklen mit dem Fachbereich auf Inhalt und Vollständigkeit.',
    defaultPT: 6,
    defaultIncluded: true,
    category: 'review',
  }),
  Object.freeze({
    id: 'technische-reviews',
    name: 'Technische Reviews',
    description: 'Reviewzyklen mit Architektur und Entwicklung auf Umsetzbarkeit.',
    defaultPT: 4,
    defaultIncluded: true,
    category: 'review',
  }),
  Object.freeze({
    id: 'stakeholder-abstimmung',
    name: 'Stakeholder-Abstimmung',
    description: 'Iterative Abstimmungsrunden mit den Hauptstakeholdern.',
    defaultPT: 4,
    defaultIncluded: true,
    category: 'review',
  }),

  // ── Übergabe ──────────────────────────────────────────────────────────
  Object.freeze({
    id: 'abnahme-kriterien',
    name: 'Abnahme-Kriterien',
    description: 'Definition messbarer Abnahmekriterien je Use Case.',
    defaultPT: 3,
    defaultIncluded: true,
    category: 'uebergabe',
  }),
  Object.freeze({
    id: 'uebergabe-workshops',
    name: 'Übergabe-Workshops',
    description: 'Workshops zur Übergabe der Spezifikationen an Entwicklung und Test.',
    defaultPT: 4,
    defaultIncluded: true,
    category: 'uebergabe',
  }),
  Object.freeze({
    id: 'wissenstransfer',
    name: 'Wissens-Transfer',
    description: 'Dokumentierte Übergabe in die Linienorganisation (Schulungsmaterialien, Doku).',
    defaultPT: 5,
    defaultIncluded: false,
    category: 'uebergabe',
  }),

  // ── Optional / Spezial ────────────────────────────────────────────────
  Object.freeze({
    id: 'testunterstuetzung',
    name: 'Testunterstützung',
    description: 'Begleitung der Testphase, Beratung bei Defect-Management.',
    defaultPT: 8,
    defaultIncluded: false,
    category: 'optional',
  }),
  Object.freeze({
    id: 'change-request-management',
    name: 'Change-Request-Management',
    description: 'Bewertung und Pflege von Anforderungsänderungen nach Spec-Freeze.',
    defaultPT: 5,
    defaultIncluded: false,
    category: 'optional',
  }),
  Object.freeze({
    id: 'compliance-dokumentation',
    name: 'Compliance-Dokumentation',
    description: 'Spezifische Compliance-Belege (DSGVO, BaFin, ISO 27001, …).',
    defaultPT: 6,
    defaultIncluded: false,
    category: 'optional',
  }),
]);

// ─────────────────────────────────────────────────────────────────────────────
// KALENDER — Belegt-Pattern für den Lead-Funnel-Mock (Sprint-2-D1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deterministisches Belegt-Pattern für den fingierten Beratungs-Kalender.
 *
 * Die Pattern-Werte (Vormittags/Nachmittags-Belegt-Wahrscheinlichkeit pro
 * Wochentag) wirken sich über einen deterministischen Hash auf die Slot-IDs
 * aus — gleicher Slot ergibt immer denselben Status, also keine Random-
 * Inkonsistenz zwischen Reloads.
 *
 * Wochentag-Konvention (analog `Date.getDay()`): 0 = Sonntag, 1 = Montag, …
 *
 * Hinweise:
 *   - Mittagspause (12:00–13:30) ist IMMER belegt — Berater essen Mittag.
 *   - Mo-Vormittag stark, Fr-Nachmittag stark → Standard-Berater-Realität.
 *   - Mi-Vormittag liegt typischerweise frei (Sprint-Plannings andernorts).
 */
export const BUSY_PATTERN = Object.freeze({
  /** Geschäftszeiten als Dezimal-Stunden. */
  workdayHours: Object.freeze({
    morningStart: 9,
    morningEnd: 12,
    afternoonStart: 13.5, // = 13:30
    afternoonEnd: 17,
  }),
  /** Slot-Länge in Minuten. */
  slotDurationMinutes: 15,
  /** Belegt-Wahrscheinlichkeit je Wochentag und Tagesabschnitt. */
  busyChances: Object.freeze({
    1: Object.freeze({ morning: 0.7, afternoon: 0.4 }), // Montag stark vormittags
    2: Object.freeze({ morning: 0.6, afternoon: 0.4 }), // Dienstag Standard
    3: Object.freeze({ morning: 0.2, afternoon: 0.4 }), // Mittwoch eher frei
    4: Object.freeze({ morning: 0.6, afternoon: 0.4 }), // Donnerstag Standard
    5: Object.freeze({ morning: 0.6, afternoon: 0.8 }), // Freitag stark nachmittags
  }),
  /** Empfohlener Slot muss mindestens X Stunden in der Zukunft liegen. */
  recommendedSlotMinHoursAhead: 4,
});

// ─────────────────────────────────────────────────────────────────────────────
// MACHBARKEIT — Werktage pro Monat, Toleranzband für Plan-vs-Realismus
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Werktage pro Monat — Annahme für die Machbarkeits-Analyse.
 * 20 ist branchenüblich (5 Tage × ~4 Wochen, abzüglich Feiertage/Urlaub im
 * Mittel). Wird in `assessFeasibility` (feasibility.js) zur Umrechnung
 * Personentage → Monate verwendet.
 */
export const WORKDAYS_PER_MONTH = 20;

/**
 * Toleranzband um die realistische Projektdauer (±20%).
 *
 * Liegt die geplante Dauer innerhalb dieses Bandes, gilt das Projekt als
 * „passend" (grün). Liegt sie darüber, ist die Dauer „großzügig" (gelb).
 * Liegt sie darunter, ist sie „zu knapp" (rot) — beratungsseitig der
 * gefährliche Fall.
 */
export const FEASIBILITY_TOLERANCE = 0.20;
