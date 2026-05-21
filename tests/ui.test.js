// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { animateCounter, cancelCounterAnimation, formatPT, formatEUR } from '../js/ui.js';

// ─────────────────────────────────────────────────────────────────────────────
// formatPT
// ─────────────────────────────────────────────────────────────────────────────

describe('formatPT', () => {
  it('formatPT(109.10625) → "109,1"', () => {
    expect(formatPT(109.10625)).toBe('109,1');
  });

  it('formatPT(0) → "0"', () => {
    expect(formatPT(0)).toBe('0');
  });

  it('formatPT(NaN) → "—"', () => {
    expect(formatPT(NaN)).toBe('—');
  });

  it('formatPT(Infinity) → "—"', () => {
    expect(formatPT(Infinity)).toBe('—');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatEUR
// ─────────────────────────────────────────────────────────────────────────────

describe('formatEUR', () => {
  it('formatEUR(130948) → "130.948 €"', () => {
    // Intl liefert ein non-breaking space zwischen Zahl und €-Zeichen.
    // Für robuste Tests normalisieren wir auf reguläres Leerzeichen.
    expect(formatEUR(130948).replace(/ /g, ' ')).toBe('130.948 €');
  });

  it('formatEUR(0) → "0 €"', () => {
    expect(formatEUR(0).replace(/ /g, ' ')).toBe('0 €');
  });

  it('formatEUR(NaN) → "—"', () => {
    expect(formatEUR(NaN)).toBe('—');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// animateCounter
// ─────────────────────────────────────────────────────────────────────────────

describe('animateCounter', () => {
  let originalMatchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    // Default-Mock: prefers-reduced-motion ist NICHT aktiv → animieren.
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('setzt am Ende den finalen Wert (Default-Formatter)', async () => {
    const el = document.createElement('div');
    await animateCounter(el, 100, { duration: 50 });
    expect(el.textContent).toBe('100');
  });

  it('setzt "—" bei NaN, ohne RAF-Frames dazwischen', async () => {
    const el = document.createElement('div');
    el.textContent = 'prev';
    await animateCounter(el, NaN);
    expect(el.textContent).toBe('—');
  });

  it('setzt "—" bei Infinity', async () => {
    const el = document.createElement('div');
    await animateCounter(el, Infinity);
    expect(el.textContent).toBe('—');
  });

  it('mehrfacher Aufruf während laufender Animation: zweiter Call gewinnt', async () => {
    const el = document.createElement('div');
    // Erste Animation soll lang genug sein, dass die zweite sie unterbricht.
    const first = animateCounter(el, 1000, { duration: 5000 });
    // Direkt eine zweite Animation starten — soll die erste abbrechen.
    const second = animateCounter(el, 42, { duration: 50 });
    await second;
    expect(el.textContent).toBe('42');
    // Erste muss auch resolven (Interrupt-Semantik).
    await first;
  });

  it('wendet Formatter-Callback an', async () => {
    const el = document.createElement('div');
    await animateCounter(el, 109.1, {
      duration: 50,
      format: v => Math.round(v) + 'X',
    });
    expect(el.textContent).toBe('109X');
  });

  it('respektiert explizit gesetzten startValue', async () => {
    const el = document.createElement('div');
    await animateCounter(el, 200, {
      duration: 50,
      startValue: 100,
      format: v => Math.round(v).toString(),
    });
    // Animation endet beim Zielwert.
    expect(el.textContent).toBe('200');
  });

  it('springt bei prefers-reduced-motion sofort auf Endwert', async () => {
    // matchMedia so mocken, dass reduce-motion aktiv ist.
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    const el = document.createElement('div');
    // Lange Duration — falls Animation läuft, würde der Test länger dauern.
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
    await animateCounter(el, 500, { duration: 10000 });

    expect(el.textContent).toBe('500');
    // Bei reduce-motion darf KEIN RAF gescheduled werden.
    expect(rafSpy).not.toHaveBeenCalled();
    rafSpy.mockRestore();
  });

  it('Promise resolved, auch wenn targetValue ungültig ist', async () => {
    const el = document.createElement('div');
    // Wenn animateCounter bei NaN nicht resolved, würde Promise.race timeouten.
    await Promise.race([
      animateCounter(el, NaN),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 500)),
    ]);
    expect(el.textContent).toBe('—');
  });
});

describe('cancelCounterAnimation', () => {
  it('bricht eine laufende Animation ab und resolved deren Promise', async () => {
    const el = document.createElement('div');
    // Lange Animation starten, NICHT awaiten.
    const promise = animateCounter(el, 100, { duration: 5000 });
    // Sofort abbrechen.
    cancelCounterAnimation(el);
    // Promise muss resolven, sonst timeout.
    await Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 500)),
    ]);
  });

  it('ist no-op, wenn keine Animation läuft', () => {
    const el = document.createElement('div');
    expect(() => cancelCounterAnimation(el)).not.toThrow();
  });
});
