/**
 * scope.js — Pure-Logic für den Scope-Konfigurator.
 *
 * Keine DOM-Zugriffe, keine Side Effects, keine Mutation des Inputs. Wird
 * in wizard.js zur Darstellung der Scope-Toggles und zur Berechnung des
 * additiven Scope-Adjustments auf die Step-2-Schätzung verwendet.
 *
 * Semantik der Anpassung (siehe BRIEFING2.md → B1):
 *   - Die Step-2-Schätzung enthält den Default-Scope implizit.
 *   - `getScopeAdjustment(items, includedIds)` liefert das DELTA zwischen
 *     der aktuellen Auswahl und der Default-Auswahl. Beim Initial-Eintritt
 *     zu Step 3 ist das Delta 0; der angezeigte PT-Wert ändert sich erst,
 *     wenn der User Items ein-/ausschaltet.
 *
 * Items leben in `config.js` als SCOPE_ITEMS. Diese Funktionen sind generisch
 * und akzeptieren beliebige Item-Arrays mit der gleichen Form — das macht sie
 * trivial testbar (kein localStorage, kein globaler State).
 */

import { RANGE_FACTORS } from './config.js';

// ─────────────────────────────────────────────────────────────────────────────
// Hilfs-Validatoren (intern)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {unknown} items
 * @returns {void}
 * @throws {TypeError}
 */
function assertItemsArray(items) {
  if (!Array.isArray(items)) {
    throw new TypeError(`scope: items muss ein Array sein (erhalten: ${typeof items}).`);
  }
}

/**
 * @param {unknown} includedIds
 * @returns {Set<string>}
 * @throws {TypeError}
 */
function toIncludedSet(includedIds) {
  if (!Array.isArray(includedIds) && !(includedIds instanceof Set)) {
    throw new TypeError(`scope: includedIds muss ein Array oder Set sein (erhalten: ${typeof includedIds}).`);
  }
  return new Set(includedIds);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — Selektoren über den Item-Katalog
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} ScopeItem
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {number} defaultPT
 * @property {boolean} defaultIncluded
 * @property {string} category
 */

/**
 * Liefert die IDs aller Items, die per Default in der Schätzung enthalten sind.
 *
 * @param {ScopeItem[]} items
 * @returns {string[]}
 */
export function getDefaultIncludedIds(items) {
  assertItemsArray(items);
  return items.filter(i => i.defaultIncluded === true).map(i => i.id);
}

/**
 * Gruppiert die Items nach Kategorie. Reihenfolge der Items innerhalb einer
 * Kategorie folgt der Definitionsreihenfolge im Eingabe-Array. Die Reihenfolge
 * der Kategorien selbst entspricht der Reihenfolge des Erstauftretens in
 * `items` — das macht die Funktion deterministisch und gleichzeitig flexibel.
 *
 * @param {ScopeItem[]} items
 * @returns {Record<string, ScopeItem[]>}
 */
export function groupItemsByCategory(items) {
  assertItemsArray(items);
  const groups = {};
  for (const item of items) {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  }
  return groups;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — PT-Aggregation und Delta-Berechnung
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Summe der `defaultPT`-Werte aller Items, deren IDs in `includedIds` enthalten
 * sind. IDs in `includedIds`, die nicht in `items` existieren, werden ignoriert
 * (kein Fehler — schützt vor stale State).
 *
 * @param {ScopeItem[]} items
 * @param {string[] | Set<string>} includedIds
 * @returns {number}
 */
export function aggregateScopeContribution(items, includedIds) {
  assertItemsArray(items);
  const included = toIncludedSet(includedIds);
  let sum = 0;
  for (const item of items) {
    if (included.has(item.id)) sum += item.defaultPT;
  }
  return sum;
}

/**
 * Liefert das Delta zwischen aktuell selektierten Items und der Default-
 * Auswahl in PT:
 *
 *   delta = sum(currently-included.defaultPT) − sum(default-included.defaultPT)
 *
 * Beispiel (Default-Set ist {A: 5, B: 8}, includedIds = {A: 5}):
 *   sum(current) = 5, sum(default) = 13, delta = −8.
 *
 * Wird in wizard.js addiert zu allen PT-Aspekten der Estimation (totalEffort,
 * min/likely/max), bevor diese in die UI geschrieben werden.
 *
 * @param {ScopeItem[]} items
 * @param {string[] | Set<string>} includedIds
 * @returns {number}
 */
export function getScopeAdjustment(items, includedIds) {
  const current = aggregateScopeContribution(items, includedIds);
  const defaultSum = aggregateScopeContribution(items, getDefaultIncludedIds(items));
  return current - defaultSum;
}

/**
 * Wendet ein PT-Delta auf eine bestehende Estimation an und liefert eine
 * neue Estimation (ohne Mutation der Ursprungs-Estimation).
 *
 * `adjustment` wird additiv auf `likely` angewendet. `min`/`max` werden
 * proportional über die {@link RANGE_FACTORS} neu berechnet, `phases` skalieren
 * mit dem neuen Likely-Wert (ihre Shares bleiben konstant), `costs` werden mit
 * dem übergebenen Tagessatz neu berechnet.
 *
 * Defensive: ein sehr negatives Adjustment kann likely nicht ins Negative
 * drücken — clamp auf 0.
 *
 * @param {{ min: number, likely: number, max: number, phases: Array<{key:string,name:string,share:number,pt:number}>, costs: {min:number,likely:number,max:number} }} estimation
 * @param {number} adjustment PT-Delta (positiv = Aufschlag, negativ = Abzug)
 * @param {number} tagessatz Aktueller Tagessatz in EUR (> 0)
 * @returns {object} Neue Estimation mit den selben Top-Level-Keys
 */
export function applyScopeAdjustmentToEstimation(estimation, adjustment, tagessatz) {
  if (estimation === null || typeof estimation !== 'object') {
    throw new TypeError('applyScopeAdjustmentToEstimation: estimation muss ein Objekt sein.');
  }
  if (typeof adjustment !== 'number' || !Number.isFinite(adjustment)) {
    throw new TypeError(`applyScopeAdjustmentToEstimation: adjustment muss eine endliche Zahl sein (erhalten: ${String(adjustment)}).`);
  }
  if (typeof tagessatz !== 'number' || !Number.isFinite(tagessatz) || tagessatz <= 0) {
    throw new TypeError(`applyScopeAdjustmentToEstimation: tagessatz muss > 0 sein (erhalten: ${String(tagessatz)}).`);
  }

  // Adjustment greift auf likely (= totalEffort). Negative Adjustments können
  // likely nicht unter 0 drücken.
  const newLikely = Math.max(0, estimation.likely + adjustment);

  // Range-Faktoren sind in RANGE_FACTORS hinterlegt; likely = totalEffort × 1.0.
  const newMin = newLikely * RANGE_FACTORS.min;
  const newMax = newLikely * RANGE_FACTORS.max;

  // Phasen skalieren proportional — Shares bleiben Methodik-Konstante.
  const newPhases = estimation.phases.map(p => ({
    ...p,
    pt: newLikely * p.share,
  }));

  const newCosts = {
    min: newMin * tagessatz,
    likely: newLikely * tagessatz,
    max: newMax * tagessatz,
  };

  return {
    min: newMin,
    likely: newLikely,
    max: newMax,
    phases: newPhases,
    costs: newCosts,
  };
}
