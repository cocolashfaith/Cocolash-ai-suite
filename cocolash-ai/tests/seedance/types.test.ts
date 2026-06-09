import { describe, it, expect } from 'vitest';
import type { SeedanceDuration } from '@/lib/seedance/types';

describe('SeedanceDuration enum', () => {
  it('should include all durations from 4 to 15 seconds', () => {
    // Define the expected values as a type-safe array
    const expectedDurations: SeedanceDuration[] = [
      '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'
    ];

    // Verify that we have all 12 values
    expect(expectedDurations).toHaveLength(12);

    // Verify that each expected value is within the valid range
    expectedDurations.forEach(duration => {
      const value = parseInt(duration, 10);
      expect(value).toBeGreaterThanOrEqual(4);
      expect(value).toBeLessThanOrEqual(15);
    });
  });

  it('should have duration values as strings', () => {
    const testDuration: SeedanceDuration = '10';
    expect(typeof testDuration).toBe('string');
  });

  it('should verify duration range covers all seconds 4-15', () => {
    // Create a type check: this will fail at compile-time if any value is missing
    const allDurations: Record<SeedanceDuration, true> = {
      '4': true,
      '5': true,
      '6': true,
      '7': true,
      '8': true,
      '9': true,
      '10': true,
      '11': true,
      '12': true,
      '13': true,
      '14': true,
      '15': true,
    };

    // Verify all keys are present
    expect(Object.keys(allDurations)).toHaveLength(12);
    expect(Object.values(allDurations)).toEqual([true, true, true, true, true, true, true, true, true, true, true, true]);
  });
});
