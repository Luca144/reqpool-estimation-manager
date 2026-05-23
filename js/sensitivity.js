/**
 * sensitivity.js — Sensitivity-Analyse für Step 3.
 *
 * Bestimmt die Top-N-Cost-Driver für ein gegebenes Parameter-Set und rendert
 * Range-Slider, mit denen der User die Top-Treiber live anpassen kann. Die
 * Slider-Bewegung triggert einen Callback, in dem wizard.js dann den Counter,
 * die Cost-Range und das Chart aktualisiert.
 *
 * Logik der Treiber-Auswahl:
 *   1. Sieben additive Parameter (pages..roles) werden nach ihrem PT-Beitrag
 *      sortiert (value × WEIGHT, languages mit (n-1)·WEIGHT).
 *   2. Users wirkt multiplikativ — sein Beitrag wird als Differenz
 *      (scaledEffort - baseEffort) berechnet.
 *   3. Users wird nur in die Top-N aufgenommen, wenn sein Beitrag den
 *      größten additiven Beitrag übertrifft. Damit bleibt users im Normalfall
 *      "im Hintergrund" und erscheint nur, wenn er tatsächlich der dominante
 *      Hebel ist (z.B. Großprojekte oder kleine Projekte mit viel Nutzern).
 */

import { WEIGHTS } from './config.js';
import { getUserScalingFactor } from './estimation.js';
import { FIELD_SPECS, FIELD_LABELS } from './validation.js';

// ─────────────────────────────────────────────────────────────────────────────
// Konstanten
// ─────────────────────────────────────────────────────────────────────────────

/** Mindest-Obergrenze pro Parameter, damit Slider auch bei kleinen
 *  Ausgangswerten sinnvollen Spielraum bieten. */
const SLIDER_FLOOR_MAX = Object.freeze({
  pages: 20,
  useCases: 20,
  businessObjects: 20,
  roles: 20,
  interfaces: 10,
  batches: 10,
  languages: 10,
  users: 1000,
});

/** Multiplikator: max = currentValue × dieser Faktor, mindestens FLOOR_MAX. */
const SLIDER_RANGE_FACTOR = 3;

// ─────────────────────────────────────────────────────────────────────────────
// getTopCostDrivers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Liefert die Top-N-Cost-Driver eines Parameter-Sets, absteigend nach PT-Beitrag.
 *
 * @typedef {object} CostDriver
 * @property {string} key             Parameter-Key (z.B. 'useCases')
 * @property {number} contribution    PT-Beitrag zur Gesamtsumme
 * @property {number} currentValue    Aktueller Wert des Parameters
 *
 * @param {object} params  Vollständiges Parameter-Set (alle 8 Numerics + projectType)
 * @param {number} [topN=3]
 * @returns {CostDriver[]}
 */
export function getTopCostDrivers(params, topN = 3) {
  const additive = [
    { key: 'pages',           contribution: (params.pages           ?? 0) * WEIGHTS.pages,           currentValue: params.pages           ?? 0 },
    { key: 'useCases',        contribution: (params.useCases        ?? 0) * WEIGHTS.useCases,        currentValue: params.useCases        ?? 0 },
    { key: 'businessObjects', contribution: (params.businessObjects ?? 0) * WEIGHTS.businessObjects, currentValue: params.businessObjects ?? 0 },
    { key: 'interfaces',      contribution: (params.interfaces      ?? 0) * WEIGHTS.interfaces,      currentValue: params.interfaces      ?? 0 },
    { key: 'batches',         contribution: (params.batches         ?? 0) * WEIGHTS.batches,         currentValue: params.batches         ?? 0 },
    { key: 'languages',       contribution: Math.max(0, (params.languages ?? 0) - 1) * WEIGHTS.languages, currentValue: params.languages ?? 0 },
    { key: 'roles',           contribution: (params.roles           ?? 0) * WEIGHTS.roles,           currentValue: params.roles           ?? 0 },
  ];

  // Users-Beitrag (multiplikativer Delta).
  const baseEffort = additive.reduce((sum, c) => sum + c.contribution, 0);
  const usersValue = params.users ?? 0;
  const userFactor = usersValue > 0 ? getUserScalingFactor(usersValue) : 1;
  const usersContribution = baseEffort * (userFactor - 1);

  // Users wird nur als Driver gelistet, wenn er den größten additiven Treiber
  // übertrifft — sonst wäre er bei "normalen" Projekten immer in den Top-3 und
  // würde die spannenderen Hebel verdrängen.
  const maxAdditive = Math.max(...additive.map(c => c.contribution), 0);

  const allDrivers = [...additive];
  if (usersContribution > maxAdditive) {
    allDrivers.push({
      key: 'users',
      contribution: usersContribution,
      currentValue: usersValue,
    });
  }

  return allDrivers
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, topN);
}

// ─────────────────────────────────────────────────────────────────────────────
// Slider-Range-Berechnung
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Berechnet { min, max } für einen Slider eines Parameters.
 * @param {string} key
 * @param {number} currentValue
 * @returns {{ min: number, max: number }}
 */
export function computeSliderRange(key, currentValue) {
  const spec = FIELD_SPECS[key];
  const floorMax = SLIDER_FLOOR_MAX[key] ?? 100;
  const desiredMax = Math.max(currentValue * SLIDER_RANGE_FACTOR, floorMax);
  const cappedMax = spec?.max != null ? Math.min(desiredMax, spec.max) : desiredMax;
  const min = spec?.min ?? 0;
  return { min, max: cappedMax };
}

// ─────────────────────────────────────────────────────────────────────────────
// renderSensitivitySliders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rendert die Slider-UI in den gegebenen Container. Vorheriger Inhalt wird
 * komplett ersetzt.
 *
 * @param {HTMLElement} container
 * @param {object} originalParams  Vollständiges Parameter-Set (für interne Referenz)
 * @param {CostDriver[]} topDrivers
 * @param {(overrides: Record<string, number>) => void} onChange
 */
export function renderSensitivitySliders(container, originalParams, topDrivers, onChange) {
  container.innerHTML = '';

  /** @type {Array<{ key: string, input: HTMLInputElement, valueEl: HTMLElement, original: number }>} */
  const sliders = [];

  for (const driver of topDrivers) {
    const sliderEl = document.createElement('div');
    sliderEl.className = 'sensitivity-slider';
    sliderEl.dataset.key = driver.key;

    const labelRow = document.createElement('label');

    const labelSpan = document.createElement('span');
    labelSpan.className = 'sensitivity-slider__label';
    labelSpan.textContent = FIELD_LABELS[driver.key] ?? driver.key;

    const valueSpan = document.createElement('span');
    valueSpan.className = 'sensitivity-slider__value';
    valueSpan.textContent = String(driver.currentValue);

    labelRow.appendChild(labelSpan);
    labelRow.appendChild(valueSpan);

    const { min, max } = computeSliderRange(driver.key, driver.currentValue);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = '1';
    input.value = String(driver.currentValue);
    input.setAttribute('aria-label', FIELD_LABELS[driver.key] ?? driver.key);

    const hint = document.createElement('div');
    hint.className = 'sensitivity-slider__hint';
    hint.textContent = `Original: ${driver.currentValue}`;

    sliderEl.appendChild(labelRow);
    sliderEl.appendChild(input);
    sliderEl.appendChild(hint);
    container.appendChild(sliderEl);

    sliders.push({
      key: driver.key,
      input,
      valueEl: valueSpan,
      original: driver.currentValue,
    });
  }

  // Ein gemeinsamer Listener: sammelt alle Override-Deltas und ruft onChange.
  function handleInput() {
    const overrides = {};
    for (const { key, input, valueEl, original } of sliders) {
      const v = Number(input.value);
      valueEl.textContent = String(v);
      if (v !== original) {
        valueEl.dataset.modified = 'true';
        overrides[key] = v;
      } else {
        delete valueEl.dataset.modified;
      }
    }
    onChange(overrides);
  }

  for (const { input } of sliders) {
    input.addEventListener('input', handleInput);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// resetSensitivitySliders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Setzt alle Slider auf ihre Originalwerte zurück und triggert onChange mit
 * leerem Overrides-Objekt (= "keine Anpassung").
 *
 * @param {HTMLElement} container
 * @param {object} originalParams
 * @param {CostDriver[]} topDrivers
 * @param {(overrides: Record<string, number>) => void} onChange
 */
export function resetSensitivitySliders(container, originalParams, topDrivers, onChange) {
  for (const driver of topDrivers) {
    const sliderEl = container.querySelector(`.sensitivity-slider[data-key="${driver.key}"]`);
    if (!sliderEl) continue;
    const input = sliderEl.querySelector('input[type="range"]');
    const valueEl = sliderEl.querySelector('.sensitivity-slider__value');
    if (input) input.value = String(driver.currentValue);
    if (valueEl) {
      valueEl.textContent = String(driver.currentValue);
      delete valueEl.dataset.modified;
    }
  }
  onChange({});
}
