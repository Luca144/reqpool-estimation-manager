// @vitest-environment happy-dom

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_TAGESSATZ,
  MAX_TAGESSATZ,
  TAGESSATZ_STORAGE_KEY,
  getTagessatz,
  setTagessatz,
  resetTagessatz,
} from '../js/config.js';

// localStorage zwischen Tests immer leeren, damit Tests unabhängig laufen.
beforeEach(() => {
  localStorage.clear();
});

// ─────────────────────────────────────────────────────────────────────────────
// Konstanten
// ─────────────────────────────────────────────────────────────────────────────

describe('Tagessatz-Konstanten', () => {
  it('DEFAULT_TAGESSATZ ist 1200', () => {
    expect(DEFAULT_TAGESSATZ).toBe(1200);
  });

  it('MAX_TAGESSATZ ist 10000', () => {
    expect(MAX_TAGESSATZ).toBe(10000);
  });

  it('TAGESSATZ_STORAGE_KEY ist namespaced ("reqpool.tagessatz")', () => {
    expect(TAGESSATZ_STORAGE_KEY).toBe('reqpool.tagessatz');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getTagessatz
// ─────────────────────────────────────────────────────────────────────────────

describe('getTagessatz', () => {
  it('liefert DEFAULT_TAGESSATZ wenn nichts in localStorage steht', () => {
    expect(getTagessatz()).toBe(DEFAULT_TAGESSATZ);
  });

  it('liefert den gespeicherten User-Wert', () => {
    localStorage.setItem(TAGESSATZ_STORAGE_KEY, '1500');
    expect(getTagessatz()).toBe(1500);
  });

  it('liefert DEFAULT bei leerem String in localStorage', () => {
    localStorage.setItem(TAGESSATZ_STORAGE_KEY, '');
    expect(getTagessatz()).toBe(DEFAULT_TAGESSATZ);
  });

  it('liefert DEFAULT bei ungültigem (nicht-numerischem) Wert in localStorage', () => {
    localStorage.setItem(TAGESSATZ_STORAGE_KEY, 'abc');
    expect(getTagessatz()).toBe(DEFAULT_TAGESSATZ);
  });

  it('liefert DEFAULT bei negativem Wert in localStorage', () => {
    localStorage.setItem(TAGESSATZ_STORAGE_KEY, '-500');
    expect(getTagessatz()).toBe(DEFAULT_TAGESSATZ);
  });

  it('liefert DEFAULT bei Wert über MAX_TAGESSATZ in localStorage', () => {
    localStorage.setItem(TAGESSATZ_STORAGE_KEY, '999999');
    expect(getTagessatz()).toBe(DEFAULT_TAGESSATZ);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setTagessatz
// ─────────────────────────────────────────────────────────────────────────────

describe('setTagessatz', () => {
  it('speichert einen gültigen Wert in localStorage', () => {
    setTagessatz(1500);
    expect(localStorage.getItem(TAGESSATZ_STORAGE_KEY)).toBe('1500');
    expect(getTagessatz()).toBe(1500);
  });

  it('akzeptiert den Minimum-Grenzwert 1', () => {
    setTagessatz(1);
    expect(getTagessatz()).toBe(1);
  });

  it('akzeptiert den Maximum-Grenzwert MAX_TAGESSATZ', () => {
    setTagessatz(MAX_TAGESSATZ);
    expect(getTagessatz()).toBe(MAX_TAGESSATZ);
  });

  it('wirft RangeError bei 0', () => {
    expect(() => setTagessatz(0)).toThrow(RangeError);
  });

  it('wirft RangeError bei negativem Wert', () => {
    expect(() => setTagessatz(-100)).toThrow(RangeError);
  });

  it('wirft RangeError bei Wert > MAX_TAGESSATZ', () => {
    expect(() => setTagessatz(MAX_TAGESSATZ + 1)).toThrow(RangeError);
  });

  it('wirft TypeError bei nicht-numerischem Input', () => {
    expect(() => setTagessatz('1200')).toThrow(TypeError);
    expect(() => setTagessatz(null)).toThrow(TypeError);
    expect(() => setTagessatz(undefined)).toThrow(TypeError);
  });

  it('wirft TypeError bei NaN / Infinity', () => {
    expect(() => setTagessatz(NaN)).toThrow(TypeError);
    expect(() => setTagessatz(Infinity)).toThrow(TypeError);
  });

  it('überschreibt einen vorherigen Wert', () => {
    setTagessatz(1500);
    setTagessatz(2000);
    expect(getTagessatz()).toBe(2000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resetTagessatz
// ─────────────────────────────────────────────────────────────────────────────

describe('resetTagessatz', () => {
  it('entfernt den Storage-Eintrag', () => {
    setTagessatz(1500);
    resetTagessatz();
    expect(localStorage.getItem(TAGESSATZ_STORAGE_KEY)).toBeNull();
  });

  it('nach Reset liefert getTagessatz wieder DEFAULT', () => {
    setTagessatz(1500);
    resetTagessatz();
    expect(getTagessatz()).toBe(DEFAULT_TAGESSATZ);
  });

  it('ist no-op, wenn nichts gespeichert war', () => {
    expect(() => resetTagessatz()).not.toThrow();
    expect(getTagessatz()).toBe(DEFAULT_TAGESSATZ);
  });
});
