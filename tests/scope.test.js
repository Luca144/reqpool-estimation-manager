import { describe, it, expect } from 'vitest';
import {
  getDefaultIncludedIds,
  groupItemsByCategory,
  aggregateScopeContribution,
  getScopeAdjustment,
  applyScopeAdjustmentToEstimation,
} from '../js/scope.js';
import {
  SCOPE_ITEMS,
  SCOPE_CATEGORY_ORDER,
  RANGE_FACTORS,
} from '../js/config.js';
import { calculateEstimation } from '../js/estimation.js';

// ─────────────────────────────────────────────────────────────────────────────
// Hilfs-Daten für Edge-Case-Tests
// ─────────────────────────────────────────────────────────────────────────────

const TEST_ITEMS = [
  { id: 'a', name: 'Alpha',   description: '', defaultPT: 5,  defaultIncluded: true,  category: 'erhebung' },
  { id: 'b', name: 'Beta',    description: '', defaultPT: 8,  defaultIncluded: true,  category: 'erhebung' },
  { id: 'c', name: 'Gamma',   description: '', defaultPT: 10, defaultIncluded: false, category: 'optional' },
  { id: 'd', name: 'Delta',   description: '', defaultPT: 3,  defaultIncluded: false, category: 'optional' },
];

// ─────────────────────────────────────────────────────────────────────────────
// SCOPE_ITEMS-Katalog-Smoke-Test
// ─────────────────────────────────────────────────────────────────────────────

describe('SCOPE_ITEMS (Konstanten aus config.js)', () => {
  it('enthält 18 Items', () => {
    expect(SCOPE_ITEMS).toHaveLength(18);
  });

  it('jedes Item hat alle Pflicht-Felder', () => {
    for (const item of SCOPE_ITEMS) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('description');
      expect(item).toHaveProperty('defaultPT');
      expect(item).toHaveProperty('defaultIncluded');
      expect(item).toHaveProperty('category');
      expect(typeof item.id).toBe('string');
      expect(typeof item.name).toBe('string');
      expect(typeof item.defaultPT).toBe('number');
      expect(typeof item.defaultIncluded).toBe('boolean');
    }
  });

  it('alle Item-IDs sind eindeutig', () => {
    const ids = SCOPE_ITEMS.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('jede Item-Kategorie kommt in SCOPE_CATEGORY_ORDER vor', () => {
    const allowedCategories = new Set(SCOPE_CATEGORY_ORDER);
    for (const item of SCOPE_ITEMS) {
      expect(allowedCategories, `Item "${item.id}" Kategorie "${item.category}"`).toContain(item.category);
    }
  });

  it('jede Kategorie hat mindestens 1 Item', () => {
    const itemsByCategory = groupItemsByCategory([...SCOPE_ITEMS]);
    for (const cat of SCOPE_CATEGORY_ORDER) {
      expect(itemsByCategory[cat]).toBeTruthy();
      expect(itemsByCategory[cat].length).toBeGreaterThanOrEqual(1);
    }
  });

  it('mindestens ein Item ist defaultIncluded=true', () => {
    expect(SCOPE_ITEMS.some(i => i.defaultIncluded)).toBe(true);
  });

  it('mindestens ein Item ist defaultIncluded=false', () => {
    expect(SCOPE_ITEMS.some(i => !i.defaultIncluded)).toBe(true);
  });

  it('alle defaultPT-Werte sind positive Zahlen', () => {
    for (const item of SCOPE_ITEMS) {
      expect(item.defaultPT, `Item "${item.id}"`).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getDefaultIncludedIds
// ─────────────────────────────────────────────────────────────────────────────

describe('getDefaultIncludedIds', () => {
  it('liefert nur die IDs der defaultIncluded=true Items', () => {
    expect(getDefaultIncludedIds(TEST_ITEMS)).toEqual(['a', 'b']);
  });

  it('leeres Array → leere ID-Liste', () => {
    expect(getDefaultIncludedIds([])).toEqual([]);
  });

  it('alle defaultIncluded=false → leere Liste', () => {
    const items = [
      { id: 'x', name: '', description: '', defaultPT: 1, defaultIncluded: false, category: 'a' },
    ];
    expect(getDefaultIncludedIds(items)).toEqual([]);
  });

  it('SCOPE_ITEMS: 13 Default-Items', () => {
    // Erhebung 3 + Spezifikation 5 + Review 3 + Übergabe 2 + Optional 0 = 13
    expect(getDefaultIncludedIds([...SCOPE_ITEMS])).toHaveLength(13);
  });

  it('wirft TypeError bei Nicht-Array-Input', () => {
    expect(() => getDefaultIncludedIds(null)).toThrow(TypeError);
    expect(() => getDefaultIncludedIds('abc')).toThrow(TypeError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// groupItemsByCategory
// ─────────────────────────────────────────────────────────────────────────────

describe('groupItemsByCategory', () => {
  it('gruppiert nach category-Feld', () => {
    const groups = groupItemsByCategory(TEST_ITEMS);
    expect(Object.keys(groups).sort()).toEqual(['erhebung', 'optional']);
    expect(groups.erhebung).toHaveLength(2);
    expect(groups.optional).toHaveLength(2);
  });

  it('Reihenfolge innerhalb einer Kategorie folgt der Eingabe-Reihenfolge', () => {
    const groups = groupItemsByCategory(TEST_ITEMS);
    expect(groups.erhebung.map(i => i.id)).toEqual(['a', 'b']);
    expect(groups.optional.map(i => i.id)).toEqual(['c', 'd']);
  });

  it('leeres Array → leeres Objekt', () => {
    expect(groupItemsByCategory([])).toEqual({});
  });

  it('SCOPE_ITEMS: alle 5 Kategorien vorhanden', () => {
    const groups = groupItemsByCategory([...SCOPE_ITEMS]);
    expect(Object.keys(groups).sort()).toEqual(['erhebung', 'optional', 'review', 'spezifikation', 'uebergabe']);
  });

  it('wirft TypeError bei Nicht-Array-Input', () => {
    expect(() => groupItemsByCategory(null)).toThrow(TypeError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// aggregateScopeContribution
// ─────────────────────────────────────────────────────────────────────────────

describe('aggregateScopeContribution', () => {
  it('summiert defaultPT der inkludierten Items', () => {
    expect(aggregateScopeContribution(TEST_ITEMS, ['a', 'b'])).toBe(13);
  });

  it('leerer Include-Set → 0', () => {
    expect(aggregateScopeContribution(TEST_ITEMS, [])).toBe(0);
  });

  it('alle Items inkludiert → Summe aller defaultPT', () => {
    expect(aggregateScopeContribution(TEST_ITEMS, ['a', 'b', 'c', 'd'])).toBe(26);
  });

  it('akzeptiert auch ein Set statt Array', () => {
    expect(aggregateScopeContribution(TEST_ITEMS, new Set(['a', 'c']))).toBe(15);
  });

  it('ignoriert IDs, die nicht in items existieren (stale state)', () => {
    expect(aggregateScopeContribution(TEST_ITEMS, ['a', 'nonexistent', 'b'])).toBe(13);
  });

  it('SCOPE_ITEMS mit Default-Set: 74 PT', () => {
    const defaults = getDefaultIncludedIds([...SCOPE_ITEMS]);
    // 5+8+6+12+6+8+3+5+6+4+4+3+4 = 74
    expect(aggregateScopeContribution([...SCOPE_ITEMS], defaults)).toBe(74);
  });

  it('wirft TypeError bei Nicht-Array-Items', () => {
    expect(() => aggregateScopeContribution(null, [])).toThrow(TypeError);
  });

  it('wirft TypeError bei Nicht-Array/Set-IncludedIds', () => {
    expect(() => aggregateScopeContribution(TEST_ITEMS, 'abc')).toThrow(TypeError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getScopeAdjustment
// ─────────────────────────────────────────────────────────────────────────────

describe('getScopeAdjustment', () => {
  it('default-set entspricht Default-IDs → Adjustment = 0', () => {
    const defaults = getDefaultIncludedIds(TEST_ITEMS); // ['a', 'b']
    expect(getScopeAdjustment(TEST_ITEMS, defaults)).toBe(0);
  });

  it('zusätzliches Item aktiviert → positive Adjustment', () => {
    // Default = a+b = 13, current = a+b+c = 23, delta = +10
    expect(getScopeAdjustment(TEST_ITEMS, ['a', 'b', 'c'])).toBe(10);
  });

  it('default-Item entfernt → negatives Adjustment', () => {
    // Default = a+b = 13, current = a = 5, delta = -8 (b entfernt)
    expect(getScopeAdjustment(TEST_ITEMS, ['a'])).toBe(-8);
  });

  it('komplett anderes Set → Differenz', () => {
    // Default = a+b = 13, current = c+d = 13, delta = 0 (zufällig gleiche Summe)
    expect(getScopeAdjustment(TEST_ITEMS, ['c', 'd'])).toBe(0);
  });

  it('leere Auswahl → -Summe aller Defaults', () => {
    expect(getScopeAdjustment(TEST_ITEMS, [])).toBe(-13);
  });

  it('alle Items inkludiert → +Summe aller Optional-Items', () => {
    // Default = 13, all = 26, delta = +13 (c+d hinzu)
    expect(getScopeAdjustment(TEST_ITEMS, ['a', 'b', 'c', 'd'])).toBe(13);
  });

  it('SCOPE_ITEMS-Default → 0', () => {
    const defaults = getDefaultIncludedIds([...SCOPE_ITEMS]);
    expect(getScopeAdjustment([...SCOPE_ITEMS], defaults)).toBe(0);
  });

  it('SCOPE_ITEMS — alle Items aktiv → +34 (Summe der nicht-default Items)', () => {
    // Optional 24 (8+5+6 = 19? wait: testunterstuetzung=8, change-request=5, compliance=6 = 19)
    // bestandsanalyse=10, wissenstransfer=5
    // Total nicht-default = 10 + 5 + 8 + 5 + 6 = 34
    const allIds = SCOPE_ITEMS.map(i => i.id);
    expect(getScopeAdjustment([...SCOPE_ITEMS], allIds)).toBe(34);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyScopeAdjustmentToEstimation
// ─────────────────────────────────────────────────────────────────────────────

describe('applyScopeAdjustmentToEstimation', () => {
  // Mittel-Demo-Estimation als Basis für die Tests.
  const mittelParams = {
    pages: 15, useCases: 10, businessObjects: 12, interfaces: 4,
    batches: 2, languages: 2, roles: 5, users: 150,
    projectType: 'Greenfield',
  };
  const baseEstimation = calculateEstimation(mittelParams, 1200);

  it('adjustment = 0 → unveränderte Estimation', () => {
    const result = applyScopeAdjustmentToEstimation(baseEstimation, 0, 1200);
    expect(result.likely).toBeCloseTo(baseEstimation.likely, 5);
    expect(result.min).toBeCloseTo(baseEstimation.min, 5);
    expect(result.max).toBeCloseTo(baseEstimation.max, 5);
    expect(result.costs.likely).toBeCloseTo(baseEstimation.costs.likely, 5);
  });

  it('positives adjustment → likely steigt um genau adjustment-PT', () => {
    const result = applyScopeAdjustmentToEstimation(baseEstimation, 10, 1200);
    expect(result.likely).toBeCloseTo(baseEstimation.likely + 10, 5);
  });

  it('negatives adjustment → likely sinkt um genau |adjustment|-PT', () => {
    const result = applyScopeAdjustmentToEstimation(baseEstimation, -20, 1200);
    expect(result.likely).toBeCloseTo(baseEstimation.likely - 20, 5);
  });

  it('min/max skalieren proportional über RANGE_FACTORS', () => {
    const result = applyScopeAdjustmentToEstimation(baseEstimation, 10, 1200);
    expect(result.min).toBeCloseTo(result.likely * RANGE_FACTORS.min, 5);
    expect(result.max).toBeCloseTo(result.likely * RANGE_FACTORS.max, 5);
  });

  it('phases skalieren proportional, shares bleiben konstant', () => {
    const result = applyScopeAdjustmentToEstimation(baseEstimation, 20, 1200);
    expect(result.phases).toHaveLength(6);
    for (const phase of result.phases) {
      expect(phase.pt).toBeCloseTo(result.likely * phase.share, 5);
    }
    // Summe der Phasen-PT == likely
    const sumPhases = result.phases.reduce((acc, p) => acc + p.pt, 0);
    expect(sumPhases).toBeCloseTo(result.likely, 5);
  });

  it('costs werden mit dem neuen Tagessatz berechnet', () => {
    const result = applyScopeAdjustmentToEstimation(baseEstimation, 10, 1500);
    expect(result.costs.likely).toBeCloseTo(result.likely * 1500, 5);
    expect(result.costs.min).toBeCloseTo(result.min * 1500, 5);
    expect(result.costs.max).toBeCloseTo(result.max * 1500, 5);
  });

  it('sehr negatives adjustment → likely auf 0 geclamp', () => {
    const result = applyScopeAdjustmentToEstimation(baseEstimation, -1000, 1200);
    expect(result.likely).toBe(0);
    expect(result.min).toBe(0);
    expect(result.max).toBe(0);
    expect(result.costs.likely).toBe(0);
  });

  it('mutiert die Eingabe-Estimation nicht', () => {
    const snapshot = JSON.parse(JSON.stringify(baseEstimation));
    applyScopeAdjustmentToEstimation(baseEstimation, 30, 1200);
    expect(JSON.parse(JSON.stringify(baseEstimation))).toEqual(snapshot);
  });

  it('wirft TypeError bei adjustment NaN', () => {
    expect(() => applyScopeAdjustmentToEstimation(baseEstimation, NaN, 1200)).toThrow(TypeError);
  });

  it('wirft TypeError bei tagessatz <= 0', () => {
    expect(() => applyScopeAdjustmentToEstimation(baseEstimation, 0, 0)).toThrow(TypeError);
    expect(() => applyScopeAdjustmentToEstimation(baseEstimation, 0, -100)).toThrow(TypeError);
  });

  it('wirft TypeError bei null als estimation', () => {
    expect(() => applyScopeAdjustmentToEstimation(null, 0, 1200)).toThrow(TypeError);
  });
});
