/**
 * risks.js — Regel-Engine für auto-generierte Risiken.
 *
 * Pure Module: keine DOM-Zugriffe, keine Side Effects, keine Mutation des
 * Eingabe-Objekts. Robustheit-Konventionen wie in assumptions.js (fehlende
 * numerische Felder → 0, fehlender projectType → Regel matcht nicht), damit
 * die Engine auch mit Live-Preview-Zwischenzuständen umgehen kann.
 *
 * Regelkatalog: BRIEFING.md → "Risiko-Engine". Die "Migration → Datenmigration
 * nicht enthalten"-Regel ist bewusst als Risiko modelliert (Scope-Lücke wird
 * kommuniziert, nicht versteckt).
 *
 * Severity-Zuordnung (eigenes Urteil, orientiert an Auswirkung auf Projekt-Erfolg):
 *   high   = bedroht den Projekt-Erfolg oder Kundenerwartung direkt
 *   medium = erhöht Aufwand/Komplexität spürbar, methodisch handhabbar
 *   low    = Hinweis, lokal begrenzte Auswirkung
 */

/** Severity-Werte, die in RISK_RULES erlaubt sind. */
export const RISK_SEVERITIES = Object.freeze(['high', 'medium', 'low']);

/** Sortierschlüssel: kleinerer Wert ⇒ frühere Position im Output. */
const SEVERITY_ORDER = Object.freeze({ high: 0, medium: 1, low: 2 });

/**
 * @typedef {object} RiskRule
 * @property {string} id          Eindeutiger Slug — dient als Dedup-Key und Testanker.
 * @property {string} text        Anzeigetext (Deutsch).
 * @property {'low' | 'medium' | 'high'} severity
 * @property {(params: object) => boolean} condition
 */

/**
 * @typedef {{ id: string, text: string, severity: 'low' | 'medium' | 'high' }} ResolvedRisk
 */

/**
 * Sicheres Auslesen einer Zahl aus params; fehlende oder nicht-numerische Werte
 * werden als 0 behandelt.
 * @param {object} params
 * @param {string} key
 * @returns {number}
 */
function num(params, key) {
  const value = params[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Risiko-Regelkatalog. Reihenfolge der Einträge bestimmt den Tiebreaker innerhalb
 * gleicher Severity (siehe {@link generateRisks}).
 *
 * @type {ReadonlyArray<Readonly<RiskRule>>}
 */
export const RISK_RULES = Object.freeze([
  Object.freeze({
    id: 'many-interfaces',
    text: 'Hohe Anzahl Schnittstellen birgt Risiko von Drittparteien-Abhängigkeiten und Verzögerungen',
    severity: 'high',
    condition: params => num(params, 'interfaces') > 5,
  }),
  Object.freeze({
    id: 'interface-data-mismatch',
    text: 'Verhältnis Schnittstellen zu Business Objects ist auffällig — möglicherweise unvollständige Datenmodellierung',
    severity: 'medium',
    condition: params => {
      const interfaces = num(params, 'interfaces');
      const businessObjects = num(params, 'businessObjects');
      return interfaces > 0 && businessObjects < interfaces;
    },
  }),
  Object.freeze({
    id: 'high-usecase-count',
    text: 'Hohe Use-Case-Anzahl erfordert strukturiertes Use-Case-Slicing und Priorisierung',
    severity: 'medium',
    condition: params => num(params, 'useCases') > 20,
  }),
  Object.freeze({
    id: 'multilingual-overhead',
    text: 'Mehrsprachigkeit erhöht Reviewaufwand und kann Lokalisierungsabhängigkeiten erzeugen',
    severity: 'low',
    condition: params => num(params, 'languages') > 2,
  }),
  Object.freeze({
    id: 'migration-scope-exclusion',
    text: 'Datenmigration ist explizit nicht in dieser Schätzung enthalten und muss separat skopiert werden',
    severity: 'high',
    condition: params => params.projectType === 'Migration',
  }),
  Object.freeze({
    id: 'change-management-scope',
    text: 'Großer Nutzerkreis impliziert Change-Management-Bedarf — nicht in RE-Aufwand enthalten',
    severity: 'medium',
    condition: params => num(params, 'users') > 500,
  }),
  Object.freeze({
    id: 'high-role-complexity',
    text: 'Hohe Rollenanzahl erhöht Berechtigungs-Komplexität und Stakeholder-Koordinationsaufwand',
    severity: 'medium',
    condition: params => num(params, 'roles') > 8,
  }),
  Object.freeze({
    id: 'pages-usecases-mismatch',
    text: 'Auffällig hohe Page-Anzahl bei wenigen Use Cases — möglicherweise unklare Funktionsabgrenzung',
    severity: 'high',
    condition: params => num(params, 'pages') > 30 && num(params, 'useCases') < 5,
  }),
]);

/**
 * Wertet alle Regeln gegen `params` aus und liefert die Liste der zutreffenden
 * Risiken, sortiert nach Severity (high → medium → low). Innerhalb gleicher
 * Severity bleibt die Definitionsreihenfolge erhalten (stabiler Sort).
 *
 * @param {object} params
 * @returns {ResolvedRisk[]}
 * @throws {TypeError} wenn `params` kein Plain-Objekt ist.
 */
export function generateRisks(params) {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    throw new TypeError(`generateRisks erwartet ein Parameter-Objekt (erhalten: ${describe(params)}).`);
  }

  const matched = [];
  const seen = new Set();

  for (const rule of RISK_RULES) {
    if (seen.has(rule.id)) {
      continue;
    }
    if (rule.condition(params)) {
      matched.push({ id: rule.id, text: rule.text, severity: rule.severity });
      seen.add(rule.id);
    }
  }

  // ECMAScript-Spec garantiert seit 2019 einen stabilen Sort, daher reicht der
  // Severity-Vergleich als Sortierschlüssel — die Definitionsreihenfolge bleibt
  // bei Gleichstand erhalten.
  matched.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return matched;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'Array';
  return typeof value;
}
