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

// ─────────────────────────────────────────────────────────────────────────────
// PREISBASIS — Default-Tagessatz (Sprint-2-A2 erlaubt User-Override)
// (wird im letzten Mini-Commit dieses Refactors befüllt)
// ─────────────────────────────────────────────────────────────────────────────
