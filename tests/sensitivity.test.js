// @vitest-environment happy-dom

import { describe, it, expect, vi } from 'vitest';
import {
  getTopCostDrivers,
  renderSensitivitySliders,
  resetSensitivitySliders,
  computeSliderRange,
} from '../js/sensitivity.js';

// ─────────────────────────────────────────────────────────────────────────────
// getTopCostDrivers
// ─────────────────────────────────────────────────────────────────────────────

describe('getTopCostDrivers', () => {
  const mittelParams = {
    pages: 15, useCases: 10, businessObjects: 12, interfaces: 4,
    batches: 2, languages: 2, roles: 5, users: 150,
    projectType: 'Greenfield',
  };

  const grossParams = {
    pages: 40, useCases: 25, businessObjects: 30, interfaces: 10,
    batches: 5, languages: 3, roles: 12, users: 800,
    projectType: 'Migration',
  };

  it('Mittel-Demo: Top 3 = [useCases, businessObjects, interfaces] (users < max additive)', () => {
    // useCases=25, businessObjects=14.4, interfaces=12 (pages=12 ist gleichauf,
    // aber Definitionsreihenfolge gibt interfaces den Vorzug bei Tie? Sort ist
    // hier stabil → die Reihenfolge entspricht der Definitionsreihenfolge im
    // Array, also pages vor interfaces. Korrektur: pages=15*0.8=12,
    // interfaces=4*3=12 → identisch. Sort-Stabilität gibt pages den Vorzug.)
    // users-contribution = baseEffort*(1.25-1) = 75.9*0.25 = 18.975
    // maxAdditive = 25 (useCases) > 18.975 → users wird NICHT inkludiert.
    const top3 = getTopCostDrivers(mittelParams, 3);
    expect(top3.map(d => d.key)).toEqual(['useCases', 'businessObjects', 'pages']);
    // Anmerkung: pages und interfaces sind gleichauf (12 PT). Bei stabilem
    // Sort gewinnt pages, weil es früher im Definitions-Array steht.
  });

  it('Mittel-Demo: kein users in Top 3', () => {
    const top3 = getTopCostDrivers(mittelParams, 3);
    expect(top3.map(d => d.key)).not.toContain('users');
  });

  it('Groß-Demo: users in Top 3 weil dominant (users-contribution > useCases)', () => {
    // baseEffort groß = 32+62.5+36+30+7.5+1+21.6 = 190.6
    // users=800, factor 1.4, contribution = 190.6 * 0.4 = 76.24
    // maxAdditive = 62.5 (useCases) → users (76.24) > 62.5 → users included
    const top3 = getTopCostDrivers(grossParams, 3);
    expect(top3[0].key).toBe('users');
    expect(top3.map(d => d.key)).toEqual(['users', 'useCases', 'businessObjects']);
  });

  it('Users-Sonderfall: kleines Projekt mit hohem users → users dominiert', () => {
    const params = {
      pages: 2, useCases: 2, businessObjects: 2, interfaces: 1,
      batches: 1, languages: 1, roles: 1, users: 500,
      projectType: 'Greenfield',
    };
    const top3 = getTopCostDrivers(params, 3);
    expect(top3[0].key).toBe('users');
  });

  it('Alle Parameter 0: 3 Einträge mit contribution=0, kein Crash', () => {
    const params = {
      pages: 0, useCases: 0, businessObjects: 0, interfaces: 0,
      batches: 0, languages: 0, roles: 0, users: 0,
      projectType: 'Greenfield',
    };
    const top3 = getTopCostDrivers(params, 3);
    expect(top3).toHaveLength(3);
    expect(top3.every(d => d.contribution === 0)).toBe(true);
  });

  it('topN=1 liefert genau 1 Eintrag', () => {
    const top1 = getTopCostDrivers(mittelParams, 1);
    expect(top1).toHaveLength(1);
    expect(top1[0].key).toBe('useCases');
  });

  it('Driver-Objekte tragen key, contribution und currentValue', () => {
    const top3 = getTopCostDrivers(mittelParams, 3);
    for (const driver of top3) {
      expect(driver).toHaveProperty('key');
      expect(driver).toHaveProperty('contribution');
      expect(driver).toHaveProperty('currentValue');
      expect(typeof driver.contribution).toBe('number');
    }
  });

  it('useCases contribution = 25 bei mittel (10 × 2.5)', () => {
    const top3 = getTopCostDrivers(mittelParams, 3);
    const uc = top3.find(d => d.key === 'useCases');
    expect(uc.contribution).toBeCloseTo(25, 5);
    expect(uc.currentValue).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeSliderRange
// ─────────────────────────────────────────────────────────────────────────────

describe('computeSliderRange', () => {
  it('useCases=10 → max=30 (currentValue*3 schlägt floor 20)', () => {
    expect(computeSliderRange('useCases', 10).max).toBe(30);
  });

  it('useCases=5 → max=20 (floor schlägt currentValue*3=15)', () => {
    expect(computeSliderRange('useCases', 5).max).toBe(20);
  });

  it('useCases=50 → max=150 (currentValue*3)', () => {
    expect(computeSliderRange('useCases', 50).max).toBe(150);
  });

  it('FIELD_SPECS-Cap wird respektiert: interfaces=50 → max=100 (FIELD_SPECS.interfaces.max)', () => {
    // 50*3 = 150, aber FIELD_SPECS.interfaces.max = 100
    expect(computeSliderRange('interfaces', 50).max).toBe(100);
  });

  it('min für languages/roles/users ist 1', () => {
    expect(computeSliderRange('languages', 2).min).toBe(1);
    expect(computeSliderRange('roles', 5).min).toBe(1);
    expect(computeSliderRange('users', 100).min).toBe(1);
  });

  it('min für pages/useCases/businessObjects/interfaces/batches ist 0', () => {
    expect(computeSliderRange('pages', 10).min).toBe(0);
    expect(computeSliderRange('useCases', 10).min).toBe(0);
    expect(computeSliderRange('interfaces', 4).min).toBe(0);
  });

  it('users=150 → max=1000 (floor schlägt currentValue*3=450)', () => {
    expect(computeSliderRange('users', 150).max).toBe(1000);
  });

  it('users=500 → max=1500 (currentValue*3 schlägt floor 1000)', () => {
    expect(computeSliderRange('users', 500).max).toBe(1500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// renderSensitivitySliders
// ─────────────────────────────────────────────────────────────────────────────

describe('renderSensitivitySliders', () => {
  function makeContainer() {
    return document.createElement('div');
  }

  const sampleDrivers = [
    { key: 'useCases',        currentValue: 10, contribution: 25 },
    { key: 'businessObjects', currentValue: 12, contribution: 14.4 },
    { key: 'interfaces',      currentValue: 4,  contribution: 12 },
  ];

  it('rendert genau 3 input[type="range"] für 3 Driver', () => {
    const container = makeContainer();
    renderSensitivitySliders(container, {}, sampleDrivers, vi.fn());
    const inputs = container.querySelectorAll('input[type="range"]');
    expect(inputs).toHaveLength(3);
  });

  it('jeder Slider trägt die korrekten min/max/value/step-Attribute', () => {
    const container = makeContainer();
    renderSensitivitySliders(container, {}, sampleDrivers, vi.fn());

    const useCasesInput = container.querySelector('.sensitivity-slider[data-key="useCases"] input');
    expect(useCasesInput.min).toBe('0');
    expect(useCasesInput.max).toBe('30'); // useCases=10 → max=30
    expect(useCasesInput.value).toBe('10');
    expect(useCasesInput.step).toBe('1');
  });

  it('Original-Hint zeigt den currentValue', () => {
    const container = makeContainer();
    renderSensitivitySliders(container, {}, sampleDrivers, vi.fn());
    const hints = container.querySelectorAll('.sensitivity-slider__hint');
    expect(hints[0].textContent).toBe('Original: 10');
    expect(hints[1].textContent).toBe('Original: 12');
    expect(hints[2].textContent).toBe('Original: 4');
  });

  it('onChange wird beim Slider-Input mit Overrides aufgerufen', () => {
    const container = makeContainer();
    const onChange = vi.fn();
    renderSensitivitySliders(container, {}, sampleDrivers, onChange);

    const input = container.querySelector('.sensitivity-slider[data-key="useCases"] input');
    input.value = '15';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onChange).toHaveBeenCalledWith({ useCases: 15 });
  });

  it('mehrere Slider-Bewegungen werden in einem Overrides-Objekt zusammengefasst', () => {
    const container = makeContainer();
    const onChange = vi.fn();
    renderSensitivitySliders(container, {}, sampleDrivers, onChange);

    const ucInput = container.querySelector('.sensitivity-slider[data-key="useCases"] input');
    const ifInput = container.querySelector('.sensitivity-slider[data-key="interfaces"] input');

    ucInput.value = '15';
    ucInput.dispatchEvent(new Event('input', { bubbles: true }));

    ifInput.value = '7';
    ifInput.dispatchEvent(new Event('input', { bubbles: true }));

    // Letzter Call hat beide Overrides.
    expect(onChange).toHaveBeenLastCalledWith({ useCases: 15, interfaces: 7 });
  });

  it('value-Span wird mit dem Slider-Wert synchronisiert', () => {
    const container = makeContainer();
    renderSensitivitySliders(container, {}, sampleDrivers, vi.fn());

    const sliderEl = container.querySelector('.sensitivity-slider[data-key="useCases"]');
    const input = sliderEl.querySelector('input');
    const valueEl = sliderEl.querySelector('.sensitivity-slider__value');

    expect(valueEl.textContent).toBe('10');

    input.value = '15';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(valueEl.textContent).toBe('15');
  });

  it('data-modified="true" wenn Wert ≠ Original', () => {
    const container = makeContainer();
    renderSensitivitySliders(container, {}, sampleDrivers, vi.fn());

    const sliderEl = container.querySelector('.sensitivity-slider[data-key="useCases"]');
    const input = sliderEl.querySelector('input');
    const valueEl = sliderEl.querySelector('.sensitivity-slider__value');

    input.value = '15';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(valueEl.dataset.modified).toBe('true');

    // Zurück auf Original
    input.value = '10';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(valueEl.dataset.modified).toBeUndefined();
  });

  it('Container wird vor dem Render geleert (keine Geister-Slider)', () => {
    const container = makeContainer();
    container.innerHTML = '<div class="dummy">old content</div>';
    renderSensitivitySliders(container, {}, sampleDrivers, vi.fn());
    expect(container.querySelector('.dummy')).toBeNull();
    expect(container.querySelectorAll('.sensitivity-slider')).toHaveLength(3);
  });

  it('aria-label auf Slider gesetzt (Accessibility)', () => {
    const container = makeContainer();
    renderSensitivitySliders(container, {}, sampleDrivers, vi.fn());
    const input = container.querySelector('.sensitivity-slider[data-key="useCases"] input');
    expect(input.getAttribute('aria-label')).toBe('Use Cases');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resetSensitivitySliders
// ─────────────────────────────────────────────────────────────────────────────

describe('resetSensitivitySliders', () => {
  function makeContainer() {
    return document.createElement('div');
  }

  const drivers = [
    { key: 'useCases',        currentValue: 10, contribution: 25 },
    { key: 'businessObjects', currentValue: 12, contribution: 14.4 },
    { key: 'interfaces',      currentValue: 4,  contribution: 12 },
  ];

  it('setzt alle Slider-Werte auf currentValue zurück', () => {
    const container = makeContainer();
    const onChange = vi.fn();
    renderSensitivitySliders(container, {}, drivers, onChange);

    // Erst verschieben
    const inputs = container.querySelectorAll('input[type="range"]');
    inputs[0].value = '20';
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));

    // Dann reset
    resetSensitivitySliders(container, {}, drivers, onChange);

    expect(inputs[0].value).toBe('10');
    expect(inputs[1].value).toBe('12');
    expect(inputs[2].value).toBe('4');
  });

  it('entfernt alle data-modified-Markierungen', () => {
    const container = makeContainer();
    const onChange = vi.fn();
    renderSensitivitySliders(container, {}, drivers, onChange);

    const inputs = container.querySelectorAll('input[type="range"]');
    inputs[0].value = '20';
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));

    resetSensitivitySliders(container, {}, drivers, onChange);

    const valueEls = container.querySelectorAll('.sensitivity-slider__value');
    for (const v of valueEls) {
      expect(v.dataset.modified).toBeUndefined();
    }
  });

  it('ruft onChange mit leerem Overrides-Objekt auf', () => {
    const container = makeContainer();
    const onChange = vi.fn();
    renderSensitivitySliders(container, {}, drivers, onChange);

    onChange.mockClear();
    resetSensitivitySliders(container, {}, drivers, onChange);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({});
  });

  it('Wert-Spans zeigen wieder die Originalwerte', () => {
    const container = makeContainer();
    const onChange = vi.fn();
    renderSensitivitySliders(container, {}, drivers, onChange);

    const inputs = container.querySelectorAll('input[type="range"]');
    inputs[0].value = '20';
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));

    resetSensitivitySliders(container, {}, drivers, onChange);

    const valueEls = container.querySelectorAll('.sensitivity-slider__value');
    expect(valueEls[0].textContent).toBe('10');
    expect(valueEls[1].textContent).toBe('12');
    expect(valueEls[2].textContent).toBe('4');
  });
});
