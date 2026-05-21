/**
 * assumptions.js — Regel-Engine für auto-generierte Annahmen.
 *
 * Pure Module: keine DOM-Zugriffe, keine Side Effects, keine Mutation des
 * Eingabe-Objekts. Robust gegen Teilbefüllung (fehlende Felder werden für
 * Numbers als 0, für projectType als "kein Match" behandelt), damit auch der
 * Live-Preview in Step 2 mit unvollständigem State arbeiten kann.
 *
 * Regelkatalog: BRIEFING.md → "Annahmen-Engine".
 */

/**
 * @typedef {object} AssumptionRule
 * @property {string} id          Eindeutiger Slug — dient als Dedup-Key und Testanker.
 * @property {string} text        Anzeigetext (Deutsch).
 * @property {(params: object) => boolean} condition  Always-Regeln: `() => true`.
 */

/**
 * @typedef {{ id: string, text: string }} ResolvedAssumption
 */

/**
 * Sicheres Auslesen einer Zahl aus params; fehlende oder nicht-numerische Werte
 * werden als 0 behandelt (siehe Modul-Doku oben).
 * @param {object} params
 * @param {string} key
 * @returns {number}
 */
function num(params, key) {
  const value = params[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Vollständiger Annahmen-Regelkatalog.
 *
 * Reihenfolge ist semantisch relevant: Always-Regeln stehen zuerst, danach die
 * Conditional-Regeln. {@link generateAssumptions} bewahrt diese Reihenfolge im
 * Output.
 *
 * @type {ReadonlyArray<Readonly<AssumptionRule>>}
 */
export const ASSUMPTION_RULES = Object.freeze([
  // ── Always-Regeln ─────────────────────────────────────────────────────────
  Object.freeze({
    id: 'stakeholders-workshops',
    text: 'Stakeholder sind in maximal 2 Workshop-Runden je Use Case verfügbar',
    condition: () => true,
  }),
  Object.freeze({
    id: 'review-cycle-5-days',
    text: 'Reviewzyklen werden in maximal 5 Werktagen abgeschlossen',
    condition: () => true,
  }),
  Object.freeze({
    id: 'existing-documentation',
    text: 'Bestehende Systemdokumentation wird zur Verfügung gestellt',
    condition: () => true,
  }),

  // ── Conditional-Regeln (in Briefing-Reihenfolge) ──────────────────────────
  Object.freeze({
    id: 'interface-descriptions',
    text: 'Schnittstellenpartner stellen Schnittstellenbeschreibungen bereit',
    condition: params => num(params, 'interfaces') > 0,
  }),
  Object.freeze({
    id: 'interface-contacts',
    text: 'Mindestens ein technischer Ansprechpartner je Schnittstelle ist verfügbar',
    condition: params => num(params, 'interfaces') > 3,
  }),
  Object.freeze({
    id: 'codebase-access',
    text: 'Zugriff auf bestehende Codebasis und Architektur-Dokumentation wird gewährt',
    condition: params => params.projectType === 'Brownfield' || params.projectType === 'Migration',
  }),
  Object.freeze({
    id: 'translations-by-customer',
    text: 'Übersetzungen werden vom Kunden bereitgestellt, ReqPOOL erstellt nur die deutschen Originale',
    condition: params => num(params, 'languages') > 1,
  }),
  Object.freeze({
    id: 'batch-workshops',
    text: 'Batch-Anforderungen werden in separaten Workshops mit Betrieb erhoben',
    condition: params => num(params, 'batches') > 0,
  }),
  Object.freeze({
    id: 'end-user-reps',
    text: 'End-User-Repräsentanten stehen für User-Story-Workshops zur Verfügung',
    condition: params => num(params, 'users') > 50,
  }),
]);

/**
 * Wertet alle Regeln gegen `params` aus und liefert die Liste der zutreffenden
 * Annahmen. Reihenfolge entspricht der Definitionsreihenfolge in
 * {@link ASSUMPTION_RULES} (Always-Regeln zuerst, danach Conditionals).
 * Dedupliziert anhand `rule.id`.
 *
 * @param {object} params Parameter-Objekt der laufenden Schätzung.
 * @returns {ResolvedAssumption[]}
 * @throws {TypeError} wenn `params` kein Plain-Objekt ist.
 */
export function generateAssumptions(params) {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    throw new TypeError(`generateAssumptions erwartet ein Parameter-Objekt (erhalten: ${describe(params)}).`);
  }

  const matched = [];
  const seen = new Set();

  for (const rule of ASSUMPTION_RULES) {
    if (seen.has(rule.id)) {
      continue;
    }
    if (rule.condition(params)) {
      matched.push({ id: rule.id, text: rule.text });
      seen.add(rule.id);
    }
  }

  return matched;
}

/**
 * Erzeugt eine kompakte Type-Beschreibung für Fehlermeldungen.
 * @param {unknown} value
 * @returns {string}
 */
function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'Array';
  return typeof value;
}
