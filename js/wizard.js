/**
 * wizard.js — Browser-Einstiegspunkt, zentraler State-Manager und
 * Step-Navigation für den 3-Step-Wizard.
 *
 * Architektur: Pure Modules (estimation/assumptions/risks/validation) liefern
 * die Domain-Logik. Diese Datei ist der einzige Ort mit DOM-Zugriff und
 * Side-Effects. State liegt zentral in {@link state}; nach Änderungen wird
 * explizit gerendert (kein reaktives Framework).
 *
 * Was noch nicht hier ist (kommt in späteren Schritten):
 *   - Counter-Animation        → Schritt 10 (ui.js übernimmt)
 *   - Donut-Chart              → Schritt 11 (charts.js)
 *   - Sensitivity-Slider       → Schritt 12
 *   - PDF-Export               → Schritt 13 (pdf.js)
 */

import { calculateEstimation } from './estimation.js';
import { generateAssumptions } from './assumptions.js';
import { generateRisks } from './risks.js';
import { validateStep1, validateStep2 } from './validation.js';
import { animateCounter, formatPT, formatEUR } from './ui.js';
import { renderPhasesChart, updatePhasesChart, destroyPhasesChart } from './charts.js';
import {
  getTopCostDrivers,
  renderSensitivitySliders,
  resetSensitivitySliders,
} from './sensitivity.js';

// ─────────────────────────────────────────────────────────────────────────────
// Konstanten
// ─────────────────────────────────────────────────────────────────────────────

const STEP_1_FIELDS = [
  'projectName', 'customerName', 'projectDescription',
  'projectType', 'plannedStart', 'plannedDurationMonths',
];

const STEP_2_FIELDS = [
  'pages', 'useCases', 'businessObjects', 'interfaces',
  'batches', 'languages', 'roles', 'users',
];

/** Default-Projekttyp für die Live-Preview, falls Step 1 noch leer ist. */
const DEFAULT_PROJECT_TYPE = 'Greenfield';

const LIVE_PREVIEW_DEBOUNCE_MS = 300;

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

const state = {
  currentStep: 1,
  step1Values: {
    projectName: '',
    customerName: '',
    projectDescription: '',
    projectType: '',
    plannedStart: '',
    plannedDurationMonths: '',
  },
  step2Values: {
    pages: '',
    useCases: '',
    businessObjects: '',
    interfaces: '',
    batches: '',
    languages: '',
    roles: '',
    users: '',
  },
  estimation: null,
  // Sensitivity-State — gilt nur in Step 3 und wird bei jedem Wechsel zu Step 3
  // (calculateAndRenderResult) frisch gesetzt.
  sensitivityOriginalParams: null,
  sensitivityTopDrivers: null,
  sensitivityOverrides: {},
};

// ─────────────────────────────────────────────────────────────────────────────
// Helfer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wartet bis `ms` nach dem letzten Aufruf, bevor `fn` ausgeführt wird.
 * @template {(...args: any[]) => void} F
 * @param {F} fn
 * @param {number} ms
 * @returns {F}
 */
function debounce(fn, ms) {
  let timer = null;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/**
 * Konvertiert Form-Werte (Strings) in Numbers. Leere/ungültige Eingaben werden
 * als 0 behandelt, damit die Live-Preview auch mit Teilbefüllung funktioniert.
 */
function stepValuesToNumbers(stepValues) {
  const out = {};
  for (const [key, value] of Object.entries(stepValues)) {
    if (value === '' || value === null || value === undefined) {
      out[key] = 0;
      continue;
    }
    const n = Number(value);
    out[key] = Number.isFinite(n) ? n : 0;
  }
  return out;
}

/**
 * Baut das Parameter-Objekt für estimation/assumptions/risks zusammen.
 * Verwendet den projectType aus Step 1; falls leer (z.B. während der Eingabe
 * für die Live-Preview), wird {@link DEFAULT_PROJECT_TYPE} verwendet.
 */
function buildEstimationParams() {
  return {
    ...stepValuesToNumbers(state.step2Values),
    projectType: state.step1Values.projectType || DEFAULT_PROJECT_TYPE,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Zentrale Step-Navigation. Aktualisiert State, Step-Sichtbarkeit, Progress-
 * Indikator und Footer-Buttons. Beim Wechsel auf Step 3 wird das Ergebnis
 * berechnet und gerendert.
 *
 * @param {1 | 2 | 3} stepNumber
 */
function goToStep(stepNumber) {
  state.currentStep = stepNumber;
  showStep(stepNumber);
  updateProgress();
  updateFooterButtons();

  if (stepNumber === 2) {
    // Refresh, falls der User mit "Zurück" aus Step 3 zurückkommt und schon
    // Werte da sind.
    updateLivePreview();
  }
  if (stepNumber === 3) {
    calculateAndRenderResult();
  }
}

/**
 * Toggelt das `hidden`-Attribut auf den Step-Sections und triggert die
 * Slide-in-Animation auf der neuen aktiven Section neu.
 */
function showStep(stepNumber) {
  for (const section of document.querySelectorAll('.wizard__step')) {
    const n = Number(section.dataset.step);
    if (n === stepNumber) {
      section.hidden = false;
      // Re-trigger der CSS-@keyframes-Animation: Klasse kurz entfernen,
      // Reflow erzwingen, dann wieder hinzufügen.
      section.classList.remove('wizard__step--active');
      void section.offsetWidth;
      section.classList.add('wizard__step--active');
    } else {
      section.hidden = true;
      section.classList.remove('wizard__step--active');
    }
  }
}

function updateProgress() {
  for (const li of document.querySelectorAll('[data-progress]')) {
    const n = Number(li.dataset.progress);
    li.classList.remove(
      'wizard__progress-step--active',
      'wizard__progress-step--done',
    );
    li.removeAttribute('aria-current');

    if (n < state.currentStep) {
      li.classList.add('wizard__progress-step--done');
    } else if (n === state.currentStep) {
      li.classList.add('wizard__progress-step--active');
      li.setAttribute('aria-current', 'step');
    }
  }
}

function updateFooterButtons() {
  const visibility = {
    back: state.currentStep > 1,
    next: state.currentStep === 1,
    calculate: state.currentStep === 2,
    'export-pdf': state.currentStep === 3,
    'new-estimation': state.currentStep === 3,
  };
  for (const [action, visible] of Object.entries(visibility)) {
    const btn = document.querySelector(`[data-action="${action}"]`);
    if (btn) {
      btn.hidden = !visible;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Form-Handling
// ─────────────────────────────────────────────────────────────────────────────

function bindFormInputs() {
  const step1Form = document.querySelector('[data-form="step1"]');
  const step2Form = document.querySelector('[data-form="step2"]');

  if (step1Form) {
    step1Form.addEventListener('input', e => handleFieldInput(e, 1));
  }
  if (step2Form) {
    step2Form.addEventListener('input', e => handleFieldInput(e, 2));
  }
}

function handleFieldInput(event, stepNumber) {
  const target = event.target;
  if (!target || !target.name) {
    return;
  }

  const stateKey = stepNumber === 1 ? 'step1Values' : 'step2Values';
  if (!(target.name in state[stateKey])) {
    return;
  }
  state[stateKey][target.name] = target.value;

  // Aktiven Fehler dieses Feldes räumen, damit der User beim Tippen Feedback
  // sieht, dass sein Fix akzeptiert wurde.
  const errorSlot = document.querySelector(`[data-error-for="${target.name}"]`);
  if (errorSlot) {
    errorSlot.textContent = '';
  }
  target.removeAttribute('aria-invalid');

  if (stepNumber === 2) {
    updateLivePreviewDebounced();
  }
}

function clearErrors(stepNumber) {
  const fields = stepNumber === 1 ? STEP_1_FIELDS : STEP_2_FIELDS;
  for (const fieldName of fields) {
    const errorSlot = document.querySelector(`[data-error-for="${fieldName}"]`);
    if (errorSlot) {
      errorSlot.textContent = '';
    }
    const input = document.getElementById(fieldName);
    if (input) {
      input.removeAttribute('aria-invalid');
    }
  }
}

function renderErrors(stepNumber, errors) {
  clearErrors(stepNumber);

  const fields = stepNumber === 1 ? STEP_1_FIELDS : STEP_2_FIELDS;
  for (const fieldName of fields) {
    const error = errors[fieldName];
    if (!error) continue;

    const errorSlot = document.querySelector(`[data-error-for="${fieldName}"]`);
    if (errorSlot) {
      errorSlot.textContent = error.message;
    }
    const input = document.getElementById(fieldName);
    if (input) {
      input.setAttribute('aria-invalid', 'true');
    }
  }
}

function scrollToFirstError(stepNumber, errors) {
  const fields = stepNumber === 1 ? STEP_1_FIELDS : STEP_2_FIELDS;
  const firstFieldWithError = fields.find(name => errors[name]);
  if (!firstFieldWithError) return;

  const input = document.getElementById(firstFieldWithError);
  if (!input) return;

  input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // Focus zeitversetzt, damit Smooth-Scroll nicht abgewürgt wird.
  setTimeout(() => input.focus({ preventScroll: true }), 250);
}

// ─────────────────────────────────────────────────────────────────────────────
// Button-Handler
// ─────────────────────────────────────────────────────────────────────────────

function handleNext() {
  if (state.currentStep !== 1) return;
  const result = validateStep1(state.step1Values);
  if (result.valid) {
    clearErrors(1);
    goToStep(2);
  } else {
    renderErrors(1, result.errors);
    scrollToFirstError(1, result.errors);
  }
}

function handleCalculate() {
  if (state.currentStep !== 2) return;
  const result = validateStep2(state.step2Values);
  if (result.valid) {
    clearErrors(2);
    goToStep(3);
  } else {
    renderErrors(2, result.errors);
    scrollToFirstError(2, result.errors);
  }
}

function handleBack() {
  if (state.currentStep <= 1) return;
  goToStep(state.currentStep - 1);
}

function handleReset() {
  // Erst Chart-Instanz killen, damit beim Wechsel zurück zu Step 1 keine
  // Geister-Chart-Listener überleben.
  const canvas = document.getElementById('phases-chart');
  if (canvas) destroyPhasesChart(canvas);

  // Sensitivity-Container leeren, damit beim nächsten Durchlauf keine
  // Geister-Slider übrigbleiben.
  const sensitivityContainer = document.querySelector('[data-sensitivity-sliders]');
  if (sensitivityContainer) sensitivityContainer.innerHTML = '';

  for (const key of Object.keys(state.step1Values)) {
    state.step1Values[key] = '';
  }
  for (const key of Object.keys(state.step2Values)) {
    state.step2Values[key] = '';
  }
  state.estimation = null;
  state.sensitivityOriginalParams = null;
  state.sensitivityTopDrivers = null;
  state.sensitivityOverrides = {};

  const step1Form = document.querySelector('[data-form="step1"]');
  const step2Form = document.querySelector('[data-form="step2"]');
  step1Form?.reset();
  step2Form?.reset();

  clearErrors(1);
  clearErrors(2);

  // Live-Preview-Anzeigen zurücksetzen.
  const livePt = document.querySelector('[data-live-pt]');
  const liveCost = document.querySelector('[data-live-cost]');
  if (livePt) livePt.textContent = '— PT';
  if (liveCost) liveCost.textContent = '— EUR';

  goToStep(1);
}

function bindFooterButtons() {
  const handlers = {
    next: handleNext,
    calculate: handleCalculate,
    back: handleBack,
    'new-estimation': handleReset,
    'reset-sensitivity': handleResetSensitivity,
    // 'export-pdf' wird in Schritt 13 verdrahtet.
  };
  for (const [action, handler] of Object.entries(handlers)) {
    const btn = document.querySelector(`[data-action="${action}"]`);
    if (btn) {
      btn.addEventListener('click', handler);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Live-Preview (Step 2)
// ─────────────────────────────────────────────────────────────────────────────

function updateLivePreview() {
  const livePt = document.querySelector('[data-live-pt]');
  const liveCost = document.querySelector('[data-live-cost]');
  if (!livePt || !liveCost) return;

  // Solange noch nichts eingegeben ist: Placeholder behalten (besser als
  // "0 PT / 0 €" anzuzeigen, was wie ein "Bug" wirkt).
  const allEmpty = Object.values(state.step2Values).every(v => v === '');
  if (allEmpty) {
    livePt.textContent = '— PT';
    liveCost.textContent = '— EUR';
    return;
  }

  const params = buildEstimationParams();
  try {
    const result = calculateEstimation(params);
    livePt.textContent = `${formatPT(result.likely)} PT`;
    liveCost.textContent = formatEUR(result.costs.likely);
  } catch {
    // Defensive: wenn Pure-Function-Guard greift (z.B. User tippt -5),
    // Placeholder zeigen statt Crash.
    livePt.textContent = '— PT';
    liveCost.textContent = '— EUR';
  }
}

const updateLivePreviewDebounced = debounce(updateLivePreview, LIVE_PREVIEW_DEBOUNCE_MS);

// ─────────────────────────────────────────────────────────────────────────────
// Step-3-Rendering (Vollständige Schätzung)
// ─────────────────────────────────────────────────────────────────────────────

function calculateAndRenderResult() {
  const params = buildEstimationParams();

  let estimation;
  try {
    estimation = calculateEstimation(params);
  } catch (err) {
    // Sollte nie eintreten — Step-2-Validation hat schon gesperrt.
    // Defensive Fallback statt Crash.
    console.error('Estimation failed despite passing validation:', err);
    return;
  }

  state.estimation = estimation;

  renderSummary(estimation);
  renderAssumptions(params);
  renderRisks(params);
  renderChart(estimation);
  renderSensitivity(params);
}

function renderSensitivity(params) {
  const container = document.querySelector('[data-sensitivity-sliders]');
  if (!container) return;

  state.sensitivityOriginalParams = { ...params };
  state.sensitivityOverrides = {};
  state.sensitivityTopDrivers = getTopCostDrivers(params, 3);

  renderSensitivitySliders(
    container,
    state.sensitivityOriginalParams,
    state.sensitivityTopDrivers,
    applyOverrides,
  );
}

/**
 * Wird vom Sensitivity-Slider-onChange aufgerufen. Berechnet die Schätzung neu
 * mit den überlagerten Werten und aktualisiert Counter, Cost-Range und Chart
 * direkt (kein animateCounter — Live-Updates dürfen nicht zappeln).
 *
 * @param {Record<string, number>} overrides
 */
function applyOverrides(overrides) {
  if (!state.sensitivityOriginalParams) return;
  state.sensitivityOverrides = overrides;

  const params = { ...state.sensitivityOriginalParams, ...overrides };

  let estimation;
  try {
    estimation = calculateEstimation(params);
  } catch {
    return;
  }

  const counter = document.querySelector('[data-counter]');
  if (counter) counter.textContent = `${formatPT(estimation.likely)} PT`;

  const costMin = document.querySelector('[data-cost-min]');
  const costLikely = document.querySelector('[data-cost-likely]');
  const costMax = document.querySelector('[data-cost-max]');
  if (costMin) costMin.textContent = formatEUR(estimation.costs.min);
  if (costLikely) costLikely.textContent = formatEUR(estimation.costs.likely);
  if (costMax) costMax.textContent = formatEUR(estimation.costs.max);

  const canvas = document.getElementById('phases-chart');
  if (canvas) {
    try {
      updatePhasesChart(canvas, estimation.phases);
    } catch (err) {
      console.error('Chart-Update fehlgeschlagen:', err);
    }
  }
}

function handleResetSensitivity() {
  const container = document.querySelector('[data-sensitivity-sliders]');
  if (!container || !state.sensitivityTopDrivers) return;
  resetSensitivitySliders(
    container,
    state.sensitivityOriginalParams,
    state.sensitivityTopDrivers,
    applyOverrides,
  );
}

function renderChart(estimation) {
  const canvas = document.getElementById('phases-chart');
  if (!canvas) return;
  try {
    renderPhasesChart(canvas, estimation.phases);
  } catch (err) {
    // Chart.js-CDN nicht geladen, oder anderer Renderfehler: User-Flow bleibt
    // erhalten, nur das Chart fehlt.
    console.error('Chart-Rendering fehlgeschlagen:', err);
  }
}

function renderSummary(estimation) {
  const counter = document.querySelector('[data-counter]');
  const costMin = document.querySelector('[data-cost-min]');
  const costLikely = document.querySelector('[data-cost-likely]');
  const costMax = document.querySelector('[data-cost-max]');

  // Animierter Counter (Schritt 10) — easeOutQuad, 1.2s, respektiert
  // prefers-reduced-motion (siehe animateCounter in ui.js).
  if (counter) {
    animateCounter(counter, estimation.likely, {
      duration: 1200,
      format: v => `${formatPT(v)} PT`,
    });
  }
  if (costMin) costMin.textContent = formatEUR(estimation.costs.min);
  if (costLikely) costLikely.textContent = formatEUR(estimation.costs.likely);
  if (costMax) costMax.textContent = formatEUR(estimation.costs.max);
}

function renderAssumptions(params) {
  const list = document.querySelector('[data-assumptions]');
  if (!list) return;

  list.innerHTML = '';
  for (const assumption of generateAssumptions(params)) {
    const li = document.createElement('li');
    li.textContent = assumption.text;
    li.dataset.id = assumption.id;
    list.appendChild(li);
  }
}

function renderRisks(params) {
  const list = document.querySelector('[data-risks]');
  if (!list) return;

  list.innerHTML = '';
  const risks = generateRisks(params);

  if (risks.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Keine spezifischen Risiken identifiziert.';
    li.dataset.severity = 'low';
    list.appendChild(li);
    return;
  }

  for (const risk of risks) {
    const li = document.createElement('li');
    li.textContent = risk.text;
    li.dataset.id = risk.id;
    li.dataset.severity = risk.severity;
    list.appendChild(li);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

function init() {
  const root = document.getElementById('app');
  if (!root) {
    return;
  }

  bindFormInputs();
  bindFooterButtons();

  // Initial-Render: State und DOM in Sync bringen.
  updateProgress();
  updateFooterButtons();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
