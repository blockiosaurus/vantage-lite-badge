import { describe, expect, it } from 'vitest';
import { amount, compact, pct, price, units, usd } from '../src/format';

describe('format', () => {
  it('compacts big numbers', () => {
    expect(compact(1_612_000_000)).toBe('1.61B');
    expect(compact(12_400_000)).toBe('12.4M');
    expect(compact(950)).toBe('950');
    expect(compact(undefined)).toBe('-');
  });

  it('prints prices in plain decimals however small', () => {
    expect(price(0.000023141)).toBe('$0.00002314');
    expect(price(187.4234)).toBe('$187.42');
    expect(price(0.5)).toBe('$0.5');
    expect(price(64_000)).toBe('$64K');
    expect(usd(1_612_000_000)).toBe('$1.61B');
  });

  it('signs percentages', () => {
    expect(pct(12.345)).toBe('+12.3%');
    expect(pct(-0.04)).toBe('-0.04%');
    expect(pct(250)).toBe('+250%');
  });

  it('converts base units exactly, past 32 bits', () => {
    expect(units('1500000000', 9)).toBe('1.5');
    expect(units('5000000000', 9)).toBe('5');
    expect(units(123n, 0)).toBe('123');
    expect(amount('432100000000', 5)).toBe('4.32M');
    expect(amount('21300', 6)).toBe('0.0213');
  });
});
