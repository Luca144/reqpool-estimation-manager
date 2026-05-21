/**
 * ui.js — Wiederverwendbare UI-Helfer (Animationen, Formatter).
 *
 * Diese Datei sammelt UI-nahe Funktionen, die sich nicht in ein Pure-Module
 * fügen würden (DOM-Zugriff, RAF, Locale-Formatierung), aber auch nicht zur
 * Wizard-Orchestrierung selbst gehören.
 *
 * Beinhaltet:
 *   - animateCounter(): Frame-basierte Counter-Animation mit easeOutQuad
 *   - formatPT() / formatEUR(): de-DE-Locale-Formatter mit NaN-Fallback
 *
 * In Schritten 11–13 wachsen hier ggf. weitere Helfer (z.B. ein einheitliches
 * Hidden-Toggle, Chart-Resize-Observer) dazu.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Formatter (de-DE Locale)
// ─────────────────────────────────────────────────────────────────────────────

const ptFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const eurFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

/** Platzhalter, wenn ein Wert nicht darstellbar ist (NaN/Infinity). */
const NOT_AVAILABLE = '—';

/**
 * Formatiert einen PT-Wert ohne Einheit.
 * Beispiele: 109.10625 → "109,1", 0 → "0", NaN → "—".
 *
 * @param {number} value
 * @returns {string}
 */
export function formatPT(value) {
  if (!Number.isFinite(value)) return NOT_AVAILABLE;
  return ptFormatter.format(value);
}

/**
 * Formatiert einen Euro-Betrag mit Währungs-Suffix.
 * Beispiele: 130948 → "130.948 €", NaN → "—".
 *
 * @param {number} value
 * @returns {string}
 */
export function formatEUR(value) {
  if (!Number.isFinite(value)) return NOT_AVAILABLE;
  return eurFormatter.format(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// animateCounter
// ─────────────────────────────────────────────────────────────────────────────

/** Easing-Funktion easeOutQuad: schneller Start, weiches Auslaufen. */
const easeOutQuad = t => t * (2 - t);

/**
 * Liefert true, wenn der User reduzierte Bewegung präferiert. Robust gegen
 * Umgebungen ohne window.matchMedia (Node/jsdom-light).
 * @returns {boolean}
 */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * WeakMap-basiertes Tracking laufender Animationen pro DOM-Element.
 * Erlaubt das saubere Abbrechen einer vorigen Animation (cancelAnimationFrame)
 * UND das Aufgreifen ihres aktuellen Wertes als Startpunkt der nächsten.
 * @type {WeakMap<HTMLElement, { rafId: number, currentValue: number, resolve: () => void }>}
 */
const activeAnimations = new WeakMap();

/**
 * Animiert eine Zahl von startValue (Default: 0, oder vom Stand einer noch
 * laufenden vorherigen Animation) zu targetValue. Pro Frame wird der aktuelle
 * Wert via `format(value)` ins textContent geschrieben.
 *
 * Bei aktiviertem prefers-reduced-motion wird der Zielwert sofort gesetzt.
 * Bei nicht-endlichem targetValue (NaN, Infinity) wird "—" gesetzt.
 *
 * @param {HTMLElement} element - DOM-Element, dessen textContent gesetzt wird.
 * @param {number} targetValue - Zielwert (in den Einheiten des Formatters).
 * @param {object} [options]
 * @param {number} [options.duration=1200] - Animationsdauer in ms.
 * @param {(value: number) => string} [options.format] - Formatter-Callback.
 * @param {number} [options.startValue] - Explizit erzwungener Startwert.
 * @returns {Promise<void>} Resolved nach Ende (oder Interrupt) der Animation.
 */
export function animateCounter(element, targetValue, options = {}) {
  return new Promise(resolve => {
    // Vorhandene Animation auf demselben Element abbrechen — und ihren
    // aktuellen Wert als Startpunkt der neuen verwenden.
    let resumeFrom = 0;
    const previous = activeAnimations.get(element);
    if (previous != null) {
      cancelAnimationFrame(previous.rafId);
      resumeFrom = previous.currentValue;
      // Promise der vorigen Animation auflösen (Interrupt-Semantik).
      previous.resolve();
    }

    const startValue = options.startValue !== undefined ? options.startValue : resumeFrom;
    const duration = options.duration ?? 1200;
    const format = options.format ?? (v => String(v));

    // Defensive: nicht-endlicher Zielwert → Placeholder, kein Crash.
    if (!Number.isFinite(targetValue)) {
      element.textContent = NOT_AVAILABLE;
      activeAnimations.delete(element);
      resolve();
      return;
    }

    // prefers-reduced-motion: ohne Animation auf Zielwert springen.
    if (prefersReducedMotion()) {
      element.textContent = format(targetValue);
      activeAnimations.delete(element);
      resolve();
      return;
    }

    const startTime = performance.now();
    const delta = targetValue - startValue;

    const tracking = { rafId: 0, currentValue: startValue, resolve };
    activeAnimations.set(element, tracking);

    function step(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const current = startValue + delta * easeOutQuad(t);
      tracking.currentValue = current;
      element.textContent = format(current);

      if (t < 1) {
        tracking.rafId = requestAnimationFrame(step);
        return;
      }

      // Final-Frame: exakter Zielwert (vermeidet Rundungs-Drift) und Cleanup.
      element.textContent = format(targetValue);
      tracking.currentValue = targetValue;
      activeAnimations.delete(element);
      resolve();
    }

    tracking.rafId = requestAnimationFrame(step);
  });
}
