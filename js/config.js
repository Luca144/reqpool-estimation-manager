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
 * Verwendet, wenn der User in Sprint-2-A2 keinen eigenen Tagessatz im
 * Settings-Modal überschreibt. Aktueller ReqPOOL-Standardsatz.
 *
 * Hinweis: Hieß früher `TAGESSATZ_EUR` in estimation.js. Umbenannt im
 * Schritt-0-Refactor, weil A2 dem User erlaubt, einen abweichenden
 * Tagessatz zu setzen — der hier ist der „Default".
 */
export const DEFAULT_TAGESSATZ = 1200;

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
