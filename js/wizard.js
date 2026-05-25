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
import {
  getTagessatz,
  setTagessatz,
  resetTagessatz,
  DEFAULT_TAGESSATZ,
  MAX_TAGESSATZ,
} from './config.js';
import { generateAssumptions } from './assumptions.js';
import { generateRisks } from './risks.js';
import { validateStep1, validateStep2 } from './validation.js';
import { animateCounter, cancelCounterAnimation, formatPT, formatEUR } from './ui.js';
import { renderPhasesChart, updatePhasesChart, destroyPhasesChart } from './charts.js';
import {
  getTopCostDrivers,
  getAllDriversSorted,
  renderSensitivitySliders,
  resetSensitivitySliders,
} from './sensitivity.js';
import { exportEstimationToPDF } from './pdf.js';
import { assessFeasibility } from './feasibility.js';
import {
  getDefaultIncludedIds,
  getScopeAdjustment,
  applyScopeAdjustmentToEstimation,
} from './scope.js';
import { SCOPE_ITEMS, SCOPE_CATEGORY_LABELS } from './config.js';
import { computeTimeline } from './timeline.js';
import { generateCalendarSlots } from './calendar-mock.js';

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

/** Default-Berater-Anzahl für den Machbarkeits-Check in Step 3. */
const DEFAULT_CONSULTANT_COUNT = 2;

const LIVE_PREVIEW_DEBOUNCE_MS = 300;

const FEASIBILITY_STATUS_LABELS = Object.freeze({
  green: 'Plan ist realistisch',
  yellow: 'Plan ist großzügig',
  red: 'Plan ist zu knapp',
});

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
  // Berater-Anzahl für den Machbarkeits-Check in Step 3.
  consultantCount: DEFAULT_CONSULTANT_COUNT,
  // Set der aktuell inkludierten Scope-Item-IDs. `null` = noch nicht
  // initialisiert (Step 3 noch nicht erreicht). Bei Step-3-Eintritt mit
  // den Default-Includes befüllt, danach persistent bis "Neue Schätzung".
  /** @type {Set<string> | null} */
  includedScopeIds: null,
  /** Gewählter Termin-Slot im Beratungs-Modal (Sprint-2-D1). */
  /** @type {Date | null} */
  terminSelectedSlot: null,
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
  clearStep3Display();

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
  state.consultantCount = DEFAULT_CONSULTANT_COUNT;
  state.includedScopeIds = null;

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
    'export-pdf': handleExportPDF,
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
    const result = calculateEstimation(params, getTagessatz());
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
    estimation = calculateEstimation(params, getTagessatz());
  } catch (err) {
    // Sollte nie eintreten — Step-2-Validation hat schon gesperrt.
    // Defensive Fallback statt Crash.
    console.error('Estimation failed despite passing validation:', err);
    return;
  }

  state.estimation = estimation;

  // Scope initialisieren (nur beim ersten Step-3-Eintritt seit Reset).
  if (state.includedScopeIds === null) {
    state.includedScopeIds = new Set(getDefaultIncludedIds([...SCOPE_ITEMS]));
  }

  // Wenn Scope vom Default abweicht, Estimation entsprechend anpassen.
  const scopeAdjustment = getScopeAdjustment([...SCOPE_ITEMS], [...state.includedScopeIds]);
  const renderedEstimation = scopeAdjustment === 0
    ? estimation
    : applyScopeAdjustmentToEstimation(estimation, scopeAdjustment, getTagessatz());

  renderSummary(renderedEstimation);
  renderAssumptions(params);
  renderRisks(params);
  renderChart(renderedEstimation);
  renderTimeline(renderedEstimation);
  renderSensitivity(params);
  renderFeasibility();
  renderScope();
}

/**
 * Liest die geplante Dauer aus Step 1 und konvertiert in eine positive Zahl.
 * @returns {number | null} Monate als Number, oder null wenn leer/ungültig.
 */
function getPlannedMonths() {
  const raw = state.step1Values.plannedDurationMonths;
  if (raw === '' || raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Rendert (oder versteckt) den Machbarkeits-Check-Block in Step 3.
 * Wenn keine geplante Dauer in Step 1 angegeben wurde: Block bleibt hidden.
 * Sonst: Slider initialisieren und Ampel-Karte mit aktuellem State befüllen.
 */
function renderFeasibility() {
  const container = document.querySelector('[data-feasibility]');
  if (!container) return;

  const plannedMonths = getPlannedMonths();
  if (plannedMonths == null) {
    container.hidden = true;
    return;
  }
  container.hidden = false;

  // Berater-Slider
  const consultantSlider = document.getElementById('consultantCount');
  const consultantValueEl = document.querySelector('[data-consultant-value]');
  if (consultantSlider) {
    consultantSlider.value = String(state.consultantCount);
    // Listener idempotent: wir entfernen ggf. vorhandenen und binden neu —
    // verhindert doppelte Aufrufe bei wiederholtem Step-3-Eintritt.
    consultantSlider.removeEventListener('input', handleConsultantSliderInput);
    consultantSlider.addEventListener('input', handleConsultantSliderInput);
  }
  if (consultantValueEl) consultantValueEl.textContent = String(state.consultantCount);

  // Plannned-Monate-Slider — bidirektional mit Step 1 verbunden. Max wächst
  // dynamisch mit, damit auch eine in Step 1 eingegebene Dauer von z.B.
  // 50 Monaten noch im Slider erreichbar ist.
  const monthsSlider = document.getElementById('plannedMonthsSlider');
  const monthsValueEl = document.querySelector('[data-planned-months-value]');
  if (monthsSlider) {
    const dynamicMax = Math.max(36, Math.ceil(plannedMonths * 2));
    monthsSlider.max = String(dynamicMax);
    monthsSlider.value = String(plannedMonths);
    monthsSlider.removeEventListener('input', handlePlannedMonthsSliderInput);
    monthsSlider.addEventListener('input', handlePlannedMonthsSliderInput);
  }
  if (monthsValueEl) monthsValueEl.textContent = String(plannedMonths);

  updateFeasibilityCard();
}

function handleConsultantSliderInput(event) {
  const v = Number(event.target.value);
  if (!Number.isFinite(v) || v < 1) return;
  state.consultantCount = v;
  const valueEl = document.querySelector('[data-consultant-value]');
  if (valueEl) valueEl.textContent = String(v);

  // Berater-Anzahl beeinflusst Machbarkeits-Karte UND Timeline (durationDays
  // pro Phase = ceil(pt / consultantCount)). applyOverrides re-rendert beide.
  if (state.sensitivityOriginalParams) {
    applyOverrides(state.sensitivityOverrides);
  } else {
    updateFeasibilityCard();
  }
}

/**
 * Bewegt der User in Step 3 den „Geplante Dauer"-Slider, wird der Wert
 * bidirektional in state.step1Values UND in das Step-1-DOM-Input geschrieben.
 * Damit ist die Wahrheit für plannedDurationMonths weiterhin Single Source.
 */
function handlePlannedMonthsSliderInput(event) {
  const v = Number(event.target.value);
  if (!Number.isFinite(v) || v < 1) return;

  state.step1Values.plannedDurationMonths = String(v);

  const valueEl = document.querySelector('[data-planned-months-value]');
  if (valueEl) valueEl.textContent = String(v);

  // Step-1-Form-Input synchronisieren, damit der User bei "Zurück" denselben
  // Wert sieht und nichts Magisches passiert.
  const step1Input = document.getElementById('plannedDurationMonths');
  if (step1Input) step1Input.value = String(v);

  updateFeasibilityCard();
}

/**
 * Aktualisiert die Ampel-Karte basierend auf aktuellem Estimation-Likely-Wert
 * und Berater-Anzahl im State.
 */
function updateFeasibilityCard() {
  const card = document.querySelector('[data-feasibility-card]');
  const statusEl = document.querySelector('[data-feasibility-status]');
  const detailsEl = document.querySelector('[data-feasibility-details]');
  const recEl = document.querySelector('[data-feasibility-recommendation]');
  if (!card || !statusEl || !detailsEl || !recEl) return;

  const plannedMonths = getPlannedMonths();
  if (plannedMonths == null || !state.estimation) return;

  // Aktuelle Likely-PT inkl. eventueller Sensitivity-Overrides verwenden:
  // re-calculate aus den effektiven Params, damit Slider-Bewegungen reflektiert
  // werden. State.estimation ist die ursprüngliche, nicht die überlagerte.
  const effectiveParams = state.sensitivityOriginalParams
    ? { ...state.sensitivityOriginalParams, ...state.sensitivityOverrides }
    : null;
  let likelyPT = state.estimation.likely;
  if (effectiveParams) {
    try {
      likelyPT = calculateEstimation(effectiveParams, getTagessatz()).likely;
      // Scope-Adjustment auch hier einbeziehen, damit die Machbarkeits-
      // Berechnung den selben Aufwand reflektiert wie der Counter.
      if (state.includedScopeIds) {
        const adjustment = getScopeAdjustment([...SCOPE_ITEMS], [...state.includedScopeIds]);
        likelyPT = Math.max(0, likelyPT + adjustment);
      }
    } catch {
      // Defensive: bei Pure-Function-Guard alten Wert behalten.
    }
  }

  let result;
  try {
    result = assessFeasibility(likelyPT, plannedMonths, state.consultantCount);
  } catch (err) {
    console.error('Feasibility-Berechnung fehlgeschlagen:', err);
    return;
  }

  // `data-status` (nicht `data-feasibility-status`) auf der Karte, damit kein
  // Selektor-Konflikt mit dem innen liegenden `[data-feasibility-status]`-Slot
  // entsteht — sonst würde querySelector die Karte statt das Status-Label
  // treffen und die Card-Children beim textContent-Set zerstören.
  card.dataset.status = result.status;
  statusEl.textContent = FEASIBILITY_STATUS_LABELS[result.status];

  const min = ptFormat(result.realisticMonthsMin);
  const max = ptFormat(result.realisticMonthsMax);
  detailsEl.textContent = `Realistisch: ${min}–${max} Monate · Geplant: ${ptFormat(result.plannedMonths)}`;

  recEl.textContent = result.recommendation;
}

/** Formatter für Monatszahlen: 1 Nachkommastelle, deutsches Komma. */
function ptFormat(value) {
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}

function renderSensitivity(params) {
  const container = document.querySelector('[data-sensitivity-sliders]');
  if (!container) return;

  state.sensitivityOriginalParams = { ...params };
  state.sensitivityOverrides = {};
  state.sensitivityTopDrivers = getTopCostDrivers(params, 3);

  // Additional Drivers = alle 8 (sortiert nach Beitrag) MINUS die Top-3.
  // Wird in einem aufklappbaren <details>-Block unter den Top-Slidern gerendert.
  const allSorted = getAllDriversSorted(params);
  const topKeys = new Set(state.sensitivityTopDrivers.map(d => d.key));
  const additionalDrivers = allSorted.filter(d => !topKeys.has(d.key));

  renderSensitivitySliders(
    container,
    state.sensitivityOriginalParams,
    state.sensitivityTopDrivers,
    applyOverrides,
    { additionalDrivers },
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
  const tagessatz = getTagessatz();

  let estimation;
  try {
    estimation = calculateEstimation(params, tagessatz);
  } catch {
    return;
  }

  // Scope-Adjustment auf die Estimation anwenden (falls vom Default abweichend).
  if (state.includedScopeIds) {
    const adjustment = getScopeAdjustment([...SCOPE_ITEMS], [...state.includedScopeIds]);
    if (adjustment !== 0) {
      try {
        estimation = applyScopeAdjustmentToEstimation(estimation, adjustment, tagessatz);
      } catch (err) {
        console.error('Scope-Adjustment fehlgeschlagen:', err);
      }
    }
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

  // Feasibility-Karte ist live mit Sensitivity- UND Scope-Overrides verbunden.
  updateFeasibilityCard();

  // Timeline aktualisieren mit den neuen (adjusted) Phasen.
  renderTimeline(estimation);
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings-Modal (Tagessatz-Override)
// ─────────────────────────────────────────────────────────────────────────────

function handleOpenSettings() {
  const overlay = document.querySelector('[data-modal="settings"]');
  const input = document.getElementById('settingsTagessatz');
  if (!overlay) return;
  overlay.hidden = false;
  if (input) {
    input.value = String(getTagessatz());
    input.focus();
    input.select();
  }
  // Inline-Error räumen, falls offen.
  setSettingsError('');
}

function handleCloseSettings() {
  const overlay = document.querySelector('[data-modal="settings"]');
  if (overlay) overlay.hidden = true;
  setSettingsError('');
}

function handleSaveSettings() {
  const input = document.getElementById('settingsTagessatz');
  if (!input) return;

  const raw = input.value;
  if (raw === '') {
    setSettingsError('Bitte einen Tagessatz angeben.');
    return;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    setSettingsError('Tagessatz muss eine positive Zahl sein.');
    return;
  }
  if (value > MAX_TAGESSATZ) {
    setSettingsError(`Tagessatz darf höchstens ${MAX_TAGESSATZ.toLocaleString('de-DE')} € sein.`);
    return;
  }
  if (!Number.isInteger(value)) {
    setSettingsError('Tagessatz muss eine ganze Zahl sein.');
    return;
  }

  try {
    setTagessatz(value);
  } catch (err) {
    setSettingsError(err.message);
    return;
  }

  handleCloseSettings();
  refreshAfterSettingsChange();
}

function handleResetSettings() {
  resetTagessatz();
  const input = document.getElementById('settingsTagessatz');
  if (input) input.value = String(DEFAULT_TAGESSATZ);
  setSettingsError('');
  refreshAfterSettingsChange();
}

/**
 * Wenn der User in Step 3 ist und den Tagessatz ändert, müssen Cost-Range,
 * Counter, Chart und Feasibility-Karte live neu berechnet werden.
 */
function refreshAfterSettingsChange() {
  if (state.currentStep !== 3 || !state.sensitivityOriginalParams) return;
  // applyOverrides re-rendert alles mit dem aktuellen Tagessatz via getTagessatz()
  applyOverrides(state.sensitivityOverrides);
}

function setSettingsError(message) {
  const errorSlot = document.querySelector('[data-error-for="settingsTagessatz"]');
  const input = document.getElementById('settingsTagessatz');
  if (errorSlot) errorSlot.textContent = message;
  if (input) {
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
}

function bindSettingsActions() {
  const overlay = document.querySelector('[data-modal="settings"]');
  if (!overlay) return;

  const handlers = {
    'open-settings': handleOpenSettings,
    'close-settings': handleCloseSettings,
    'save-settings': handleSaveSettings,
    'reset-settings': handleResetSettings,
  };
  for (const [action, handler] of Object.entries(handlers)) {
    for (const btn of document.querySelectorAll(`[data-action="${action}"]`)) {
      btn.addEventListener('click', handler);
    }
  }

  // Click auf Overlay (außerhalb der Modal-Karte) schließt.
  overlay.addEventListener('click', e => {
    if (e.target === overlay) handleCloseSettings();
  });

  // Escape-Key schließt Modal global, sofern offen.
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !overlay.hidden) handleCloseSettings();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Beratungs-Termin-Modal (Sprint-2-D1)
// ─────────────────────────────────────────────────────────────────────────────

const TERMIN_CALENDAR_DAYS = 5;
const TERMIN_WEEKDAY_LABELS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

const terminDayFormatter = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
});
const terminTimeFormatter = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
});
const terminFullFormatter = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function openTerminModal() {
  const overlay = document.querySelector('[data-modal="termin"]');
  if (!overlay) return;
  state.terminSelectedSlot = null;
  clearTerminFormErrors();
  renderTerminCalendar();
  updateTerminSelectedDisplay();
  overlay.hidden = false;
  // Fokus auf erstes Pflichtfeld setzen.
  const firstInput = document.getElementById('terminName');
  if (firstInput) setTimeout(() => firstInput.focus(), 50);
}

function closeTerminModal() {
  const overlay = document.querySelector('[data-modal="termin"]');
  if (overlay) overlay.hidden = true;
}

function openTerminConfirmation(summary) {
  const overlay = document.querySelector('[data-modal="termin-confirmation"]');
  if (!overlay) return;
  const summaryEl = document.querySelector('[data-termin-confirmation-summary]');
  if (summaryEl && summary) summaryEl.textContent = summary;
  overlay.hidden = false;
}

function closeTerminConfirmation() {
  const overlay = document.querySelector('[data-modal="termin-confirmation"]');
  if (overlay) overlay.hidden = true;
}

/**
 * Rendert die 5 Werktage als Spalten mit ihren Slot-Buttons.
 */
function renderTerminCalendar() {
  const calendarEl = document.querySelector('[data-termin-calendar]');
  if (!calendarEl) return;
  calendarEl.innerHTML = '';

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  let slots;
  try {
    slots = generateCalendarSlots(todayIso, TERMIN_CALENDAR_DAYS, { now: today });
  } catch (err) {
    console.error('Termin-Slot-Generation fehlgeschlagen:', err);
    return;
  }

  // Slots nach Tag gruppieren.
  /** @type {Map<string, typeof slots>} */
  const byDay = new Map();
  for (const slot of slots) {
    const key = slot.datetime.toDateString();
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(slot);
  }

  for (const [, daySlots] of byDay) {
    const dayEl = document.createElement('div');
    dayEl.className = 'termin-day';

    const headerEl = document.createElement('div');
    headerEl.className = 'termin-day__header';
    const firstSlot = daySlots[0];
    const weekday = TERMIN_WEEKDAY_LABELS[firstSlot.datetime.getDay()];
    headerEl.innerHTML = `${terminDayFormatter.format(firstSlot.datetime)}<span class="termin-day__header-weekday">${weekday}</span>`;
    dayEl.appendChild(headerEl);

    for (const slot of daySlots) {
      const slotEl = document.createElement('button');
      slotEl.type = 'button';
      slotEl.className = 'termin-slot';
      slotEl.textContent = terminTimeFormatter.format(slot.datetime);
      slotEl.dataset.slotTime = String(slot.datetime.getTime());
      slotEl.setAttribute('aria-label', terminFullFormatter.format(slot.datetime));

      if (slot.status === 'busy') {
        slotEl.classList.add('termin-slot--busy');
        slotEl.disabled = true;
      } else if (slot.status === 'recommended') {
        slotEl.classList.add('termin-slot--recommended');
        slotEl.title = 'Empfohlener Slot';
      }

      if (state.terminSelectedSlot && slot.datetime.getTime() === state.terminSelectedSlot.getTime()) {
        slotEl.classList.add('termin-slot--selected');
      }

      slotEl.addEventListener('click', handleTerminSlotClick);
      dayEl.appendChild(slotEl);
    }

    calendarEl.appendChild(dayEl);
  }
}

function handleTerminSlotClick(event) {
  const button = event.currentTarget;
  const ts = Number(button.dataset.slotTime);
  if (!Number.isFinite(ts)) return;
  state.terminSelectedSlot = new Date(ts);

  // Re-render Calendar damit das gewählte Slot-Highlight stimmt.
  renderTerminCalendar();
  updateTerminSelectedDisplay();
}

function updateTerminSelectedDisplay() {
  const display = document.querySelector('[data-termin-selected]');
  if (!display) return;
  if (state.terminSelectedSlot) {
    display.classList.add('termin-selected--active');
    display.textContent = `Gewählter Termin: ${terminFullFormatter.format(state.terminSelectedSlot)} Uhr`;
  } else {
    display.classList.remove('termin-selected--active');
    display.textContent = 'Bitte wählen Sie oben einen freien Termin aus.';
  }
}

function clearTerminFormErrors() {
  for (const field of ['terminName', 'terminEmail', 'terminFirma']) {
    const errorSlot = document.querySelector(`[data-error-for="${field}"]`);
    if (errorSlot) errorSlot.textContent = '';
    const input = document.getElementById(field);
    if (input) input.removeAttribute('aria-invalid');
  }
}

function handleSubmitTermin(event) {
  event.preventDefault();
  clearTerminFormErrors();

  const name = document.getElementById('terminName')?.value?.trim() ?? '';
  const email = document.getElementById('terminEmail')?.value?.trim() ?? '';
  const firma = document.getElementById('terminFirma')?.value?.trim() ?? '';

  let firstErrorField = null;
  const setError = (field, message) => {
    const errorSlot = document.querySelector(`[data-error-for="${field}"]`);
    if (errorSlot) errorSlot.textContent = message;
    const input = document.getElementById(field);
    if (input) input.setAttribute('aria-invalid', 'true');
    if (!firstErrorField) firstErrorField = field;
  };

  if (!name) setError('terminName', 'Name ist ein Pflichtfeld.');
  if (!email) {
    setError('terminEmail', 'E-Mail ist ein Pflichtfeld.');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setError('terminEmail', 'Bitte eine gültige E-Mail-Adresse angeben.');
  }
  if (!firma) setError('terminFirma', 'Firma ist ein Pflichtfeld.');

  if (!state.terminSelectedSlot) {
    const display = document.querySelector('[data-termin-selected]');
    if (display) {
      display.classList.add('termin-selected--error');
      display.textContent = 'Bitte oben einen Termin auswählen, bevor Sie anfragen.';
    }
    if (!firstErrorField) {
      const calendarEl = document.querySelector('[data-termin-calendar]');
      if (calendarEl) calendarEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  if (firstErrorField || !state.terminSelectedSlot) {
    if (firstErrorField) {
      const el = document.getElementById(firstErrorField);
      if (el) setTimeout(() => el.focus({ preventScroll: true }), 100);
    }
    return;
  }

  // Submit erfolgreich → Confirmation-Modal mit Zusammenfassung.
  const summary = `${name} (${firma}) — Termin am ${terminFullFormatter.format(state.terminSelectedSlot)} Uhr. Ein Berater meldet sich unter ${email}.`;
  closeTerminModal();
  openTerminConfirmation(summary);
}

function bindTerminModalActions() {
  const overlay = document.querySelector('[data-modal="termin"]');
  const confirmationOverlay = document.querySelector('[data-modal="termin-confirmation"]');
  if (!overlay) return;

  for (const btn of document.querySelectorAll('[data-action="close-termin"]')) {
    btn.addEventListener('click', closeTerminModal);
  }
  for (const btn of document.querySelectorAll('[data-action="submit-termin"]')) {
    btn.addEventListener('click', handleSubmitTermin);
  }
  const form = document.querySelector('[data-termin-form]');
  if (form) form.addEventListener('submit', handleSubmitTermin);

  // Click auf Overlay (außerhalb der Karte) schließt.
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeTerminModal();
  });

  if (confirmationOverlay) {
    for (const btn of document.querySelectorAll('[data-action="close-confirmation"]')) {
      btn.addEventListener('click', closeTerminConfirmation);
    }
    confirmationOverlay.addEventListener('click', e => {
      if (e.target === confirmationOverlay) closeTerminConfirmation();
    });
  }

  // Escape schließt das jeweils oberste sichtbare Modal.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (confirmationOverlay && !confirmationOverlay.hidden) {
      closeTerminConfirmation();
    } else if (!overlay.hidden) {
      closeTerminModal();
    }
  });
}

async function handleExportPDF() {
  if (state.currentStep !== 3 || !state.sensitivityOriginalParams) return;

  const button = document.querySelector('[data-action="export-pdf"]');
  const originalLabel = button?.textContent ?? '';
  if (button) {
    button.disabled = true;
    button.textContent = 'Generiere PDF…';
  }

  try {
    const currentParams = { ...state.sensitivityOriginalParams, ...state.sensitivityOverrides };
    const tagessatz = getTagessatz();
    let estimation = calculateEstimation(currentParams, tagessatz);

    // Scope-Adjustment auf die Estimation anwenden, damit das PDF die im
    // UI sichtbaren Zahlen reproduziert.
    if (state.includedScopeIds) {
      const adjustment = getScopeAdjustment([...SCOPE_ITEMS], [...state.includedScopeIds]);
      if (adjustment !== 0) {
        estimation = applyScopeAdjustmentToEstimation(estimation, adjustment, tagessatz);
      }
    }

    const sensitivityModified = Object.keys(state.sensitivityOverrides ?? {}).length > 0;

    // Dynamische Scope-Listen für das PDF basierend auf der aktuellen Auswahl.
    let scopeIn;
    let scopeOut;
    if (state.includedScopeIds) {
      scopeIn = SCOPE_ITEMS
        .filter(i => state.includedScopeIds.has(i.id))
        .map(i => i.name);
      scopeOut = SCOPE_ITEMS
        .filter(i => !state.includedScopeIds.has(i.id))
        .map(i => i.name);
    }

    await exportEstimationToPDF({
      projectInfo: { ...state.step1Values },
      params: currentParams,
      estimation,
      assumptions: generateAssumptions(currentParams),
      risks: generateRisks(currentParams),
      sensitivityModified,
      scopeIn,
      scopeOut,
    });

    // Nach erfolgreichem PDF-Export → Lead-Funnel anbieten (Sprint-2-D1).
    openTerminModal();
  } catch (err) {
    console.error('PDF-Export fehlgeschlagen:', err);
    window.alert('PDF-Export fehlgeschlagen. Bitte Browser-Konsole prüfen.');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel || 'Als PDF exportieren';
    }
  }
}

/**
 * Setzt alle Step-3-spezifischen DOM-Anzeigen auf ihren Initial-Zustand
 * zurück. Vermeidet, dass beim nächsten Step-3-Eintritt Geister-Daten
 * sichtbar werden, bevor calculateAndRenderResult neu rendert.
 */
function clearStep3Display() {
  // Counter — laufende Animation abbrechen, dann Placeholder setzen.
  const counterEl = document.querySelector('[data-counter]');
  if (counterEl) {
    cancelCounterAnimation(counterEl);
    counterEl.textContent = '— PT';
  }

  // Cost-Range zurücksetzen.
  for (const sel of ['[data-cost-min]', '[data-cost-likely]', '[data-cost-max]']) {
    const el = document.querySelector(sel);
    if (el) el.textContent = '— EUR';
  }

  // Listen leeren.
  const assumptionsList = document.querySelector('[data-assumptions]');
  if (assumptionsList) assumptionsList.innerHTML = '';
  const risksList = document.querySelector('[data-risks]');
  if (risksList) risksList.innerHTML = '';

  // Sensitivity-Slider-Container leeren.
  const sensitivityContainer = document.querySelector('[data-sensitivity-sliders]');
  if (sensitivityContainer) sensitivityContainer.innerHTML = '';

  // Chart-Instanz destroyen.
  const canvas = document.getElementById('phases-chart');
  if (canvas) destroyPhasesChart(canvas);

  // Machbarkeits-Block zurücksetzen: Container ausblenden, Slider auf Default.
  const feasibilityContainer = document.querySelector('[data-feasibility]');
  if (feasibilityContainer) feasibilityContainer.hidden = true;
  const consultantSlider = document.getElementById('consultantCount');
  if (consultantSlider) consultantSlider.value = String(DEFAULT_CONSULTANT_COUNT);
  const consultantValue = document.querySelector('[data-consultant-value]');
  if (consultantValue) consultantValue.textContent = String(DEFAULT_CONSULTANT_COUNT);
  // PlannedMonths-Slider auch zurücksetzen (Default = 6 wie im HTML).
  const monthsSlider = document.getElementById('plannedMonthsSlider');
  if (monthsSlider) {
    monthsSlider.max = '36';
    monthsSlider.value = '6';
  }
  const monthsValue = document.querySelector('[data-planned-months-value]');
  if (monthsValue) monthsValue.textContent = '6';
  const feasibilityCard = document.querySelector('[data-feasibility-card]');
  if (feasibilityCard) delete feasibilityCard.dataset.status;

  // Scope-Listen leeren.
  const scopeListIn = document.querySelector('[data-scope-list-in]');
  const scopeListOut = document.querySelector('[data-scope-list-out]');
  if (scopeListIn) scopeListIn.innerHTML = '';
  if (scopeListOut) scopeListOut.innerHTML = '';
  const scopeCountIn = document.querySelector('[data-scope-count-in]');
  const scopeCountOut = document.querySelector('[data-scope-count-out]');
  if (scopeCountIn) scopeCountIn.textContent = '0';
  if (scopeCountOut) scopeCountOut.textContent = '0';

  // Timeline-Rows leeren und Meta zurücksetzen.
  const timelineRows = document.querySelector('[data-timeline-rows]');
  if (timelineRows) timelineRows.innerHTML = '';
  const timelineMeta = document.querySelector('[data-timeline-meta]');
  if (timelineMeta) timelineMeta.textContent = '—';
}

// ─────────────────────────────────────────────────────────────────────────────
// Indikative Timeline (Sprint-2-C1)
// ─────────────────────────────────────────────────────────────────────────────

/** dd.MM.yyyy-Formatter für Timeline-Datums. */
const timelineDateFormatter = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});
/** dd.MM. (kurz, ohne Jahr) für Range-Anzeigen pro Phase. */
const timelineDateShort = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});

/**
 * Liefert das Start-Datum für die Timeline-Berechnung. Wenn der User in Step 1
 * ein gültiges Datum gesetzt hat, dieses; sonst heute (ISO).
 */
function getTimelineStartDate() {
  const raw = state.step1Values.plannedStart;
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  const today = new Date();
  return today.toISOString().slice(0, 10);
}

function renderTimeline(estimation) {
  const container = document.querySelector('[data-timeline]');
  if (!container) return;

  let rows;
  try {
    rows = computeTimeline(
      estimation.phases,
      getTimelineStartDate(),
      state.consultantCount,
    );
  } catch (err) {
    console.error('Timeline-Berechnung fehlgeschlagen:', err);
    container.hidden = true;
    return;
  }
  container.hidden = false;

  const totalWorkdays = rows.reduce((s, r) => s + r.durationDays, 0);
  const metaEl = container.querySelector('[data-timeline-meta]');
  if (metaEl) {
    if (rows.length === 0) {
      metaEl.textContent = '—';
    } else {
      const startStr = timelineDateFormatter.format(rows[0].startDate);
      const endStr = timelineDateFormatter.format(rows[rows.length - 1].endDate);
      const monthsApprox = (totalWorkdays / 20).toFixed(1).replace('.', ',');
      metaEl.textContent = `${startStr} – ${endStr} · ${totalWorkdays} Werktage (ca. ${monthsApprox} Monate)`;
    }
  }

  const rowsContainer = container.querySelector('[data-timeline-rows]');
  if (!rowsContainer) return;
  rowsContainer.innerHTML = '';

  let cumulativeDays = 0;
  for (const row of rows) {
    const widthPct = totalWorkdays > 0
      ? (row.durationDays / totalWorkdays) * 100
      : 0;
    const leftPct = totalWorkdays > 0
      ? (cumulativeDays / totalWorkdays) * 100
      : 0;

    const li = document.createElement('li');
    li.className = 'timeline-row';

    const label = document.createElement('span');
    label.className = 'timeline-row__label';
    label.textContent = row.phaseName;
    label.title = row.phaseName;

    const track = document.createElement('div');
    track.className = 'timeline-row__bar-track';
    const bar = document.createElement('div');
    bar.className = 'timeline-row__bar';
    bar.style.left = `${leftPct}%`;
    bar.style.width = `${widthPct}%`;
    bar.setAttribute('aria-label', `${row.phaseName}, ${row.durationDays} Werktage`);
    track.appendChild(bar);

    const dates = document.createElement('span');
    dates.className = 'timeline-row__dates';
    const startShort = timelineDateShort.format(row.startDate);
    const endShort = timelineDateShort.format(row.endDate);
    dates.textContent = `${startShort} – ${endShort} (${row.durationDays} d)`;

    li.appendChild(label);
    li.appendChild(track);
    li.appendChild(dates);
    rowsContainer.appendChild(li);

    cumulativeDays += row.durationDays;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scope-Konfigurator (Sprint-2-B1)
// ─────────────────────────────────────────────────────────────────────────────

function renderScope() {
  const listIn = document.querySelector('[data-scope-list-in]');
  const listOut = document.querySelector('[data-scope-list-out]');
  const countIn = document.querySelector('[data-scope-count-in]');
  const countOut = document.querySelector('[data-scope-count-out]');
  if (!listIn || !listOut) return;

  listIn.innerHTML = '';
  listOut.innerHTML = '';

  const included = state.includedScopeIds ?? new Set();

  for (const item of SCOPE_ITEMS) {
    const isIncluded = included.has(item.id);
    const targetList = isIncluded ? listIn : listOut;
    targetList.appendChild(buildScopeItemElement(item, isIncluded));
  }

  if (countIn) countIn.textContent = String(included.size);
  if (countOut) countOut.textContent = String(SCOPE_ITEMS.length - included.size);
}

function buildScopeItemElement(item, isIncluded) {
  const li = document.createElement('li');
  li.className = 'scope-item';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'scope-item__toggle';
  button.dataset.scopeId = item.id;
  button.setAttribute('aria-pressed', isIncluded ? 'true' : 'false');
  button.setAttribute(
    'aria-label',
    `${item.name}, ${isIncluded ? 'enthalten' : 'nicht enthalten'}. Klick zum Wechseln.`,
  );
  button.addEventListener('click', handleScopeToggle);

  const header = document.createElement('div');
  header.className = 'scope-item__header';

  const name = document.createElement('span');
  name.className = 'scope-item__name';
  name.textContent = item.name;

  const pt = document.createElement('span');
  pt.className = 'scope-item__pt';
  pt.textContent = `${item.defaultPT} PT`;

  header.appendChild(name);
  header.appendChild(pt);

  const desc = document.createElement('span');
  desc.className = 'scope-item__description';
  desc.textContent = item.description;

  const cat = document.createElement('span');
  cat.className = 'scope-item__category';
  cat.textContent = SCOPE_CATEGORY_LABELS[item.category] ?? item.category;

  button.appendChild(header);
  button.appendChild(desc);
  button.appendChild(cat);
  li.appendChild(button);

  return li;
}

function handleScopeToggle(event) {
  const button = event.currentTarget;
  const id = button?.dataset.scopeId;
  if (!id || !state.includedScopeIds) return;

  if (state.includedScopeIds.has(id)) {
    state.includedScopeIds.delete(id);
  } else {
    state.includedScopeIds.add(id);
  }

  renderScope();
  // Re-render der live-anhängigen Anzeigen (Counter, Cost-Range, Chart,
  // Feasibility-Karte). applyOverrides berücksichtigt den neuen Scope-State.
  if (state.sensitivityOriginalParams) {
    applyOverrides(state.sensitivityOverrides);
  }
}

function handleResetSensitivity() {
  const container = document.querySelector('[data-sensitivity-sliders]');
  if (!container || !state.sensitivityOriginalParams) return;
  resetSensitivitySliders(
    container,
    state.sensitivityOriginalParams,
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
  bindSettingsActions();
  bindTerminModalActions();

  // Initial-Render: State und DOM in Sync bringen.
  updateProgress();
  updateFooterButtons();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
