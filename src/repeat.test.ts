import { describe, it, expect } from 'vitest';
import { nextOccurrence, effectiveDate, isValidRRule } from './repeat';

const TODAY = new Date('2026-03-10T00:00:00.000Z');

// Helper: build a UTC midnight date from parts, same as new Date('YYYY-MM-DD')
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('nextOccurrence', () => {
	it('advances past today when dtstart is in the past', () => {
		const result = nextOccurrence(d('2025-03-01'), 'FREQ=YEARLY', TODAY);
		expect(result).toEqual(d('2027-03-01'));
	});

	it('returns dtstart when it is still in the future', () => {
		const result = nextOccurrence(d('2026-12-25'), 'FREQ=YEARLY', TODAY);
		expect(result).toEqual(d('2026-12-25'));
	});

	it('returns null when COUNT occurrences are all in the past', () => {
		const result = nextOccurrence(d('2026-01-01'), 'FREQ=MONTHLY;COUNT=2', TODAY);
		expect(result).toBeNull();
	});

	it('returns null when UNTIL is in the past', () => {
		const result = nextOccurrence(d('2025-01-01'), 'FREQ=MONTHLY;UNTIL=20260101T000000Z', TODAY);
		expect(result).toBeNull();
	});

	it('returns null for invalid input', () => {
		expect(nextOccurrence(d('2026-01-01'), '', TODAY)).toBeNull();
		expect(nextOccurrence(d('2026-01-01'), 'every year', TODAY)).toBeNull();
		expect(nextOccurrence(d('2026-01-01'), 'INTERVAL=2', TODAY)).toBeNull();
	});
});

describe('effectiveDate', () => {
	it('returns the original date when there is no repeat', () => {
		expect(effectiveDate(d('1990-05-15'), null, TODAY)).toEqual(d('1990-05-15'));
	});

	it('returns the next occurrence (birthday scenario)', () => {
		expect(effectiveDate(d('1990-05-15'), 'FREQ=YEARLY', TODAY)).toEqual(d('2026-05-15'));
	});

	it('falls back to original date when rule is exhausted', () => {
		expect(effectiveDate(d('2025-01-01'), 'FREQ=YEARLY;COUNT=1', TODAY)).toEqual(d('2025-01-01'));
	});
});

describe('isValidRRule', () => {
	it('accepts valid rules', () => {
		expect(isValidRRule('FREQ=DAILY')).toBe(true);
		expect(isValidRRule('FREQ=WEEKLY')).toBe(true);
		expect(isValidRRule('FREQ=MONTHLY')).toBe(true);
		expect(isValidRRule('FREQ=YEARLY')).toBe(true);
		expect(isValidRRule('FREQ=WEEKLY;INTERVAL=2')).toBe(true);
	});

	it('rejects invalid rules', () => {
		expect(isValidRRule('')).toBe(false);
		expect(isValidRRule('   ')).toBe(false);
		expect(isValidRRule('INTERVAL=2')).toBe(false);
		expect(isValidRRule('FREQ=FORTNIGHTLY')).toBe(false);
		expect(isValidRRule('every year')).toBe(false);
	});
});
