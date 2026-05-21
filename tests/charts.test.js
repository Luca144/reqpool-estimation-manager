// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderPhasesChart, destroyPhasesChart, PHASE_COLORS } from '../js/charts.js';
import { PHASE_DISTRIBUTION, calculatePhases } from '../js/estimation.js';

/**
 * Tests mocken window.Chart, weil das echte Chart.js via CDN in der
 * Test-Umgebung nicht verfügbar ist. Jeder Test bekommt einen frischen
 * Constructor-Spy und ein frisches Fake-Instance-Objekt.
 */

let mockInstance;
let mockConstructor;

beforeEach(() => {
  mockInstance = { destroy: vi.fn() };
  // `() => mockInstance` liest die Variable beim Call (nicht beim Setup-Zeitpunkt),
  // dadurch können Tests `mockInstance` zwischendurch reassignen um zwei
  // unterschiedliche Instanzen pro Test zu erhalten.
  mockConstructor = vi.fn(() => mockInstance);
  window.Chart = mockConstructor;
});

afterEach(() => {
  delete window.Chart;
});

function makeCanvas() {
  return document.createElement('canvas');
}

// ─────────────────────────────────────────────────────────────────────────────
// renderPhasesChart — Aufruf-Form & Config-Struktur
// ─────────────────────────────────────────────────────────────────────────────

describe('renderPhasesChart — Aufruf', () => {
  it('ruft window.Chart genau einmal mit Canvas + Config-Objekt auf', () => {
    const canvas = makeCanvas();
    const phases = calculatePhases(100);
    renderPhasesChart(canvas, phases);

    expect(mockConstructor).toHaveBeenCalledTimes(1);
    const [calledCanvas, config] = mockConstructor.mock.calls[0];
    expect(calledCanvas).toBe(canvas);
    expect(config).toBeTypeOf('object');
    expect(config.type).toBe('doughnut');
  });

  it('gibt die Chart-Instanz zurück', () => {
    const canvas = makeCanvas();
    const result = renderPhasesChart(canvas, calculatePhases(100));
    expect(result).toBe(mockInstance);
  });
});

describe('renderPhasesChart — Config-Daten', () => {
  it('Labels in der Reihenfolge von PHASE_DISTRIBUTION', () => {
    const canvas = makeCanvas();
    renderPhasesChart(canvas, calculatePhases(100));

    const config = mockConstructor.mock.calls[0][1];
    expect(config.data.labels).toEqual(PHASE_DISTRIBUTION.map(p => p.name));
  });

  it('Daten als Numbers in der Reihenfolge der Phasen', () => {
    const canvas = makeCanvas();
    const phases = calculatePhases(100);
    renderPhasesChart(canvas, phases);

    const config = mockConstructor.mock.calls[0][1];
    expect(config.data.datasets).toHaveLength(1);
    expect(config.data.datasets[0].data).toEqual(phases.map(p => p.pt));
    expect(config.data.datasets[0].data.every(v => typeof v === 'number')).toBe(true);
  });

  it('6 Farben aus PHASE_COLORS, weiße Trennlinien', () => {
    const canvas = makeCanvas();
    renderPhasesChart(canvas, calculatePhases(100));

    const config = mockConstructor.mock.calls[0][1];
    expect(config.data.datasets[0].backgroundColor).toEqual([...PHASE_COLORS]);
    expect(config.data.datasets[0].backgroundColor).toHaveLength(6);
    expect(config.data.datasets[0].borderColor).toBe('#FFFFFF');
  });

  it('cutout 60% für Donut-Loch', () => {
    const canvas = makeCanvas();
    renderPhasesChart(canvas, calculatePhases(100));
    const config = mockConstructor.mock.calls[0][1];
    expect(config.options.cutout).toBe('60%');
  });

  it('responsive ohne fixes Aspect-Ratio (Container kontrolliert die Höhe)', () => {
    const canvas = makeCanvas();
    renderPhasesChart(canvas, calculatePhases(100));
    const config = mockConstructor.mock.calls[0][1];
    expect(config.options.responsive).toBe(true);
    expect(config.options.maintainAspectRatio).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip-Callback
// ─────────────────────────────────────────────────────────────────────────────

describe('renderPhasesChart — Tooltip-Callback', () => {
  it('formatiert "Name: PT-Wert PT (Prozent%)"', () => {
    const canvas = makeCanvas();
    // totalEffort = 100 → Stakeholder-Analyse (12%) bekommt pt = 12
    const phases = calculatePhases(100);
    renderPhasesChart(canvas, phases);

    const config = mockConstructor.mock.calls[0][1];
    const labelCb = config.options.plugins.tooltip.callbacks.label;

    const ctx = { parsed: 12, label: 'Stakeholder-Analyse' };
    expect(labelCb(ctx)).toBe('Stakeholder-Analyse: 12 PT (12,0%)');
  });

  it('zeigt 0,0% wenn der Total 0 ist (alle Phasen 0)', () => {
    const canvas = makeCanvas();
    const phases = calculatePhases(0);
    renderPhasesChart(canvas, phases);

    const labelCb = mockConstructor.mock.calls[0][1].options.plugins.tooltip.callbacks.label;
    expect(labelCb({ parsed: 0, label: 'Stakeholder-Analyse' })).toBe('Stakeholder-Analyse: 0 PT (0,0%)');
  });

  it('rundet auf eine Nachkommastelle und nutzt deutsches Komma', () => {
    const canvas = makeCanvas();
    // Test mit Phasen die 35,7% ergeben würden (35 von 98 = 35,7142...)
    const phases = [
      { key: 'a', name: 'A', share: 0, pt: 35 },
      { key: 'b', name: 'B', share: 0, pt: 63 },
    ];
    renderPhasesChart(canvas, phases);

    const labelCb = mockConstructor.mock.calls[0][1].options.plugins.tooltip.callbacks.label;
    expect(labelCb({ parsed: 35, label: 'A' })).toBe('A: 35 PT (35,7%)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// prefers-reduced-motion
// ─────────────────────────────────────────────────────────────────────────────

describe('renderPhasesChart — prefers-reduced-motion', () => {
  let originalMatchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('Animation 800ms bei normaler Bewegung', () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    const canvas = makeCanvas();
    renderPhasesChart(canvas, calculatePhases(100));
    const config = mockConstructor.mock.calls[0][1];
    expect(config.options.animation.duration).toBe(800);
    expect(config.options.animation.easing).toBe('easeOutQuart');
  });

  it('Animation 0ms wenn prefers-reduced-motion aktiv', () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    const canvas = makeCanvas();
    renderPhasesChart(canvas, calculatePhases(100));
    const config = mockConstructor.mock.calls[0][1];
    expect(config.options.animation.duration).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Re-Render & Cleanup
// ─────────────────────────────────────────────────────────────────────────────

describe('Re-Render & Cleanup', () => {
  it('wiederholter renderPhasesChart-Call zerstört vorige Instanz', () => {
    const canvas = makeCanvas();
    const phases = calculatePhases(100);

    renderPhasesChart(canvas, phases);
    const firstInstance = mockInstance;

    // Nächste Instanz für den zweiten Call vorbereiten.
    mockInstance = { destroy: vi.fn() };

    renderPhasesChart(canvas, phases);

    expect(firstInstance.destroy).toHaveBeenCalledTimes(1);
    expect(mockConstructor).toHaveBeenCalledTimes(2);
  });

  it('destroyPhasesChart ruft .destroy() auf der bestehenden Instanz', () => {
    const canvas = makeCanvas();
    renderPhasesChart(canvas, calculatePhases(100));
    const instance = mockInstance;

    destroyPhasesChart(canvas);
    expect(instance.destroy).toHaveBeenCalledTimes(1);
  });

  it('destroyPhasesChart ist no-op, wenn keine Instanz existiert', () => {
    const canvas = makeCanvas();
    // kein render vorher
    expect(() => destroyPhasesChart(canvas)).not.toThrow();
  });

  it('nach destroyPhasesChart ist das WeakMap-Tracking geleert', () => {
    const canvas = makeCanvas();
    renderPhasesChart(canvas, calculatePhases(100));
    const firstInstance = mockInstance;

    destroyPhasesChart(canvas);

    // Neuer Render auf demselben Canvas: vorige (schon zerstörte) Instanz darf
    // nicht erneut zerstört werden.
    mockInstance = { destroy: vi.fn() };
    renderPhasesChart(canvas, calculatePhases(100));

    expect(firstInstance.destroy).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fehlerfälle
// ─────────────────────────────────────────────────────────────────────────────

describe('Fehlerfälle', () => {
  it('wirft TypeError bei leerem phases-Array', () => {
    expect(() => renderPhasesChart(makeCanvas(), [])).toThrow(TypeError);
  });

  it('wirft TypeError bei null als phases', () => {
    expect(() => renderPhasesChart(makeCanvas(), null)).toThrow(TypeError);
  });

  it('wirft TypeError bei undefined als phases', () => {
    expect(() => renderPhasesChart(makeCanvas(), undefined)).toThrow(TypeError);
  });

  it('wirft TypeError bei Nicht-Array als phases', () => {
    expect(() => renderPhasesChart(makeCanvas(), 'not an array')).toThrow(TypeError);
  });

  it('wirft Error, wenn window.Chart nicht verfügbar ist', () => {
    delete window.Chart;
    expect(() => renderPhasesChart(makeCanvas(), calculatePhases(100))).toThrow(/Chart.js/);
  });
});
