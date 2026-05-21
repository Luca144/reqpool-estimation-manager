/**
 * charts.js — Donut-Chart der Phasen-Aufteilung (Chart.js).
 *
 * Chart.js wird via CDN als `window.Chart` erwartet (siehe index.html). Diese
 * Datei macht keine Annahmen über die Chart-Version, solange die Doughnut-API
 * stabil bleibt (Chart.js v3 / v4 sind kompatibel).
 *
 * Die Palette folgt der ReqPOOL-CI: Royal Blue und Green plus deren 50/25-
 * Abstufungen. Keine Farbverläufe (CI-Vorgabe).
 */

import { formatPT, prefersReducedMotion } from './ui.js';

// ─────────────────────────────────────────────────────────────────────────────
// Konstanten
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Farbpalette für die 6 Phasen — alternierend Royal Blue / Green mit
 * abnehmender Intensität.
 */
export const PHASE_COLORS = Object.freeze([
  '#002EB1',                    // Royal Blue
  '#19B874',                    // Green
  'rgba(0, 46, 177, 0.50)',     // Royal-Blue-50
  'rgba(25, 184, 116, 0.50)',   // Green-50
  'rgba(0, 46, 177, 0.25)',     // Royal-Blue-25
  'rgba(25, 184, 116, 0.25)',   // Green-25
]);

const ANIMATION_DURATION_MS = 800;

/**
 * Per-Canvas Tracking laufender Chart-Instanzen, damit ein Re-Render die alte
 * Instanz sauber zerstören kann (Chart.js leakt sonst Event-Listener).
 * @type {WeakMap<HTMLCanvasElement, any>}
 */
const CHART_INSTANCES = new WeakMap();

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rendert ein Donut-Chart der Phasenaufteilung in das gegebene Canvas.
 *
 * Wenn auf demselben Canvas bereits eine Chart-Instanz existiert, wird diese
 * vor dem Neu-Render zerstört.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Array<{ key: string, name: string, share: number, pt: number }>} phases
 * @returns {object} Chart.js-Instanz (für späteres destroy)
 * @throws {TypeError} wenn `phases` kein nicht-leeres Array ist
 * @throws {Error} wenn `window.Chart` nicht verfügbar ist (Chart.js-CDN nicht geladen)
 */
export function renderPhasesChart(canvas, phases) {
  if (!Array.isArray(phases) || phases.length === 0) {
    throw new TypeError('renderPhasesChart erwartet ein nicht-leeres Phasen-Array.');
  }
  if (typeof window === 'undefined' || typeof window.Chart !== 'function') {
    throw new Error('Chart.js ist nicht verfügbar (window.Chart fehlt).');
  }

  destroyPhasesChart(canvas);

  const labels = phases.map(p => p.name);
  const data = phases.map(p => p.pt);
  const total = data.reduce((acc, v) => acc + v, 0);
  const colors = PHASE_COLORS.slice(0, phases.length);

  // System-Font aus dem Body übernehmen, damit das Chart sich nicht visuell
  // vom Rest abhebt. Fallback für Test-/Server-Umgebungen.
  const fontFamily =
    (typeof document !== 'undefined' && document.body
      ? getComputedStyle(document.body).fontFamily
      : '') || 'sans-serif';

  const animationDuration = prefersReducedMotion() ? 0 : ANIMATION_DURATION_MS;

  const config = {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
          borderColor: '#FFFFFF',
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      animation: {
        duration: animationDuration,
        easing: 'easeOutQuart',
      },
      plugins: {
        legend: {
          position: 'right',
          labels: {
            usePointStyle: true,
            padding: 16,
            font: { family: fontFamily, size: 12 },
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const value = typeof ctx.parsed === 'number' ? ctx.parsed : 0;
              const pct = total > 0
                ? (value / total * 100).toFixed(1).replace('.', ',')
                : '0,0';
              return `${ctx.label}: ${formatPT(value)} PT (${pct}%)`;
            },
          },
          titleFont: { family: fontFamily },
          bodyFont: { family: fontFamily },
        },
      },
    },
  };

  const chart = new window.Chart(canvas, config);
  CHART_INSTANCES.set(canvas, chart);
  return chart;
}

/**
 * Zerstört eine eventuelle Chart-Instanz auf dem Canvas und räumt das Tracking
 * auf. No-op, wenn keine Instanz existiert.
 *
 * @param {HTMLCanvasElement} canvas
 */
export function destroyPhasesChart(canvas) {
  const instance = CHART_INSTANCES.get(canvas);
  if (instance && typeof instance.destroy === 'function') {
    instance.destroy();
  }
  CHART_INSTANCES.delete(canvas);
}
