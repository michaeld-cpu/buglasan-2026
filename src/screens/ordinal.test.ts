/**
 * The ordinal suffix has irregular cases that a visual check will not catch:
 * a screenshot only ever shows the placings that roster happened to produce.
 * The 23-entry booth roster reaches both irregularities, so they are pinned
 * here.
 */
import { describe, expect, it } from 'vitest';

import { ordinal } from './JudgeSegment';

describe('ordinal', () => {
  it('labels the podium placings', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
  });

  it('uses "th" for 4 through 10', () => {
    expect([4, 5, 6, 7, 8, 9, 10].map(ordinal)).toEqual([
      '4th',
      '5th',
      '6th',
      '7th',
      '8th',
      '9th',
      '10th',
    ]);
  });

  /* The case a naive last-digit switch gets wrong: 11 would become "11st". */
  it('uses "th" for the teens, not the last digit', () => {
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
  });

  /* Above 20 the pattern resumes, which is why the last digit decides. A
     23-candidate roster reaches every one of these. */
  it('resumes the pattern above twenty', () => {
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(22)).toBe('22nd');
    expect(ordinal(23)).toBe('23rd');
    expect(ordinal(24)).toBe('24th');
  });
});
