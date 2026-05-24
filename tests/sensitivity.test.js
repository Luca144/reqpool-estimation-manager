// @vitest-environment happy-dom

import { describe, it, expect, vi } from 'vitest';
import {
  getTopCostDrivers,
  getAllDriversSorted,
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
// getAllDriversSorted (A3)
// ─────────────────────────────────────────────────────────────────────────────

describe('getAllDriversSorted', () => {
  const mittelParams = {
    pages: 15, useCases: 10, businessObjects: 12, interfaces: 4,
    batches: 2, languages: 2, roles: 5, users: 150,
    projectType: 'Greenfield',
  };

  it('liefert genau 8 Einträge — alle Parameter inkl. users', () => {
    const all = getAllDriversSorted(mittelParams);
    expect(all).toHaveLength(8);
  });

  it('enthält alle 8 erwarteten Keys', () => {
    const all = getAllDriversSorted(mittelParams);
    const keys = all.map(d => d.key).sort();
    expect(keys).toEqual([
      'batches', 'businessObjects', 'interfaces', 'languages',
      'pages', 'roles', 'useCases', 'users',
    ]);
  });

  it('users IMMER inkludiert (auch wenn nicht der dominanteste Driver)', () => {
    // Bei Mittel-Demo ist users (18.975) NICHT der dominante Driver
    // (useCases mit 25 ist größer), trotzdem soll users in der Liste sein.
    const all = getAllDriversSorted(mittelParams);
    expect(all.map(d => d.key)).toContain('users');
  });

  it('ist absteigend nach contribution sortiert', () => {
    const all = getAllDriversSorted(mittelParams);
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1].contribution).toBeGreaterThanOrEqual(all[i].contribution);
    }
  });

  it('Mittel-Demo: erster Eintrag ist useCases (25 PT)', () => {
    const all = getAllDriversSorted(mittelParams);
    expect(all[0].key).toBe('useCases');
    expect(all[0].contribution).toBeCloseTo(25, 5);
  });

  it('Mittel-Demo: users ist auf Platz 2 (18.975 PT, vor businessObjects=14.4)', () => {
    const all = getAllDriversSorted(mittelParams);
    expect(all[1].key).toBe('users');
    expect(all[1].contribution).toBeCloseTo(18.975, 3);
  });

  it('all-zero Parameter: 8 Einträge mit contribution=0', () => {
    const params = {
      pages: 0, useCases: 0, businessObjects: 0, interfaces: 0,
      batches: 0, languages: 0, roles: 0, users: 0,
      projectType: 'Greenfield',
    };
    const all = getAllDriversSorted(params);
    expect(all).toHaveLength(8);
    expect(all.every(d => d.contribution === 0)).toBe(true);
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

  // ── A3: Erweiterte Sensitivity (additionalDrivers in <details>) ──────────
  it('ohne additionalDrivers wird KEIN <details>-Element gerendert', () => {
    const container = makeContainer();
    renderSensitivitySliders(container, {}, sampleDrivers, vi.fn());
    expect(container.querySelector('details')).toBeNull();
  });

  it('mit additionalDrivers wird ein <details>-Element mit Summary gerendert', () => {
    const container = makeContainer();
    const additionalDrivers = [
      { key: 'roles',    currentValue: 5, contribution: 9 },
      { key: 'batches',  currentValue: 2, contribution: 3 },
    ];
    renderSensitivitySliders(container, {}, sampleDrivers, vi.fn(), { additionalDrivers });

    const details = container.querySelector('details.sensitivity-additional');
    expect(details).not.toBeNull();
    const summary = details.querySelector('summary');
    expect(summary).not.toBeNull();
    expect(summary.textContent).toContain('Weitere Parameter anpassen');
  });

  it('mit additionalDrivers werden insgesamt alle Slider gerendert (Top + Additional)', () => {
    const container = makeContainer();
    const additionalDrivers = [
      { key: 'roles',     currentValue: 5, contribution: 9 },
      { key: 'batches',   currentValue: 2, contribution: 3 },
      { key: 'languages', currentValue: 2, contribution: 0.5 },
      { key: 'users',     currentValue: 150, contribution: 18.975 },
      { key: 'pages',     currentValue: 15, contribution: 12 },
    ];
    renderSensitivitySliders(container, {}, sampleDrivers, vi.fn(), { additionalDrivers });

    const allSliders = container.querySelectorAll('.sensitivity-slider');
    expect(allSliders).toHaveLength(3 + 5);
  });

  it('<details> ist initial geschlossen (Default-Browser-Verhalten)', () => {
    const container = makeContainer();
    const additionalDrivers = [{ key: 'roles', currentValue: 5, contribution: 9 }];
    renderSensitivitySliders(container, {}, sampleDrivers, vi.fn(), { additionalDrivers });
    const details = container.querySelector('details');
    expect(details.open).toBe(false);
  });

  it('Slider im <details>-Bucket lösen onChange aus (gemeinsamer Listener)', () => {
    const container = makeContainer();
    const onChange = vi.fn();
    const additionalDrivers = [
      { key: 'roles', currentValue: 5, contribution: 9 },
    ];
    renderSensitivitySliders(container, {}, sampleDrivers, onChange, { additionalDrivers });

    const rolesInput = container.querySelector('.sensitivity-slider[data-key="roles"] input');
    rolesInput.value = '8';
    rolesInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onChange).toHaveBeenCalledWith({ roles: 8 });
  });

  it('Modifikationen an Top- und Additional-Slidern kombinieren sich im selben overrides-Objekt', () => {
    const container = makeContainer();
    const onChange = vi.fn();
    const additionalDrivers = [
      { key: 'roles', currentValue: 5, contribution: 9 },
    ];
    renderSensitivitySliders(container, {}, sampleDrivers, onChange, { additionalDrivers });

    const ucInput = container.querySelector('.sensitivity-slider[data-key="useCases"] input');
    const rolesInput = container.querySelector('.sensitivity-slider[data-key="roles"] input');

    ucInput.value = '15';
    ucInput.dispatchEvent(new Event('input', { bubbles: true }));

    rolesInput.value = '8';
    rolesInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onChange).toHaveBeenLastCalledWith({ useCases: 15, roles: 8 });
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

  // originalParams enthält die Step-2-Werte, aus denen Reset die Originalwerte
  // pro Slider-Key ableitet (signature ohne drivers-Array seit A3).
  const originalParams = { useCases: 10, businessObjects: 12, interfaces: 4 };

  it('setzt alle Slider-Werte auf currentValue zurück', () => {
    const container = makeContainer();
    const onChange = vi.fn();
    renderSensitivitySliders(container, {}, drivers, onChange);

    // Erst verschieben
    const inputs = container.querySelectorAll('input[type="range"]');
    inputs[0].value = '20';
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));

    // Dann reset
    resetSensitivitySliders(container, originalParams, onChange);

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

    resetSensitivitySliders(container, originalParams, onChange);

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
    resetSensitivitySliders(container, originalParams, onChange);

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

    resetSensitivitySliders(container, originalParams, onChange);

    const valueEls = container.querySelectorAll('.sensitivity-slider__value');
    expect(valueEls[0].textContent).toBe('10');
    expect(valueEls[1].textContent).toBe('12');
    expect(valueEls[2].textContent).toBe('4');
  });

  // ── A3: Reset wirkt auch auf Slider im <details>-Bucket ─────────────────
  it('Reset setzt auch die Slider im aufgeklappten <details>-Bucket zurück', () => {
    const container = makeContainer();
    const onChange = vi.fn();
    const additionalDrivers = [
      { key: 'roles',   currentValue: 5, contribution: 9 },
      { key: 'batches', currentValue: 2, contribution: 3 },
    ];
    const fullParams = { ...originalParams, roles: 5, batches: 2 };

    renderSensitivitySliders(container, {}, drivers, onChange, { additionalDrivers });

    // Top-Slider UND Additional-Slider verschieben.
    const ucInput = container.querySelector('.sensitivity-slider[data-key="useCases"] input');
    const rolesInput = container.querySelector('.sensitivity-slider[data-key="roles"] input');
    ucInput.value = '15';
    ucInput.dispatchEvent(new Event('input', { bubbles: true }));
    rolesInput.value = '9';
    rolesInput.dispatchEvent(new Event('input', { bubbles: true }));

    onChange.mockClear();
    resetSensitivitySliders(container, fullParams, onChange);

    expect(ucInput.value).toBe('10');
    expect(rolesInput.value).toBe('5');
    expect(onChange).toHaveBeenCalledWith({});
  });
});
