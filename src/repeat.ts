import { RRule } from 'rrule';

export const REPEAT_PRESETS: { label: string; value: string }[] = [
	{ label: 'No repeat', value: '' },
	{ label: 'Daily', value: 'FREQ=DAILY' },
	{ label: 'Weekly', value: 'FREQ=WEEKLY' },
	{ label: 'Monthly', value: 'FREQ=MONTHLY' },
	{ label: 'Yearly', value: 'FREQ=YEARLY' },
];

/**
 * Returns the next occurrence of a repeating countdown strictly after `after`.
 * Returns null if the rule is invalid or all occurrences are exhausted (COUNT/UNTIL).
 *
 * @param dtstart - The countdown's original date (the `date` frontmatter field).
 * @param rruleStr - The RRULE options string (the `repeat` frontmatter field).
 * @param after    - Find occurrences strictly after this date. Defaults to now.
 */
export function nextOccurrence(dtstart: Date, rruleStr: string, after: Date = new Date()): Date | null {
	try {
		const options = RRule.parseString(rruleStr);
		if (options?.freq === undefined) return null;
		return new RRule({ ...options, dtstart }).after(after, false);
	} catch {
		return null;
	}
}

/**
 * Returns the date the countdown should target right now.
 * - No repeat rule → the original date as-is.
 * - With repeat rule → the next occurrence after yesterday (so today still counts).
 * - Exhausted / invalid rule → the original date as fallback.
 */
export function effectiveDate(dtstart: Date, repeat: string | null, today: Date = new Date()): Date {
	if (!repeat) return dtstart;
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);
	return nextOccurrence(dtstart, repeat, yesterday) ?? dtstart;
}

export function isValidRRule(rruleStr: string): boolean {
	if (!rruleStr.trim()) return false;
	try {
		const options = RRule.parseString(rruleStr);
		return options !== null && options.freq !== undefined;
	} catch {
		return false;
	}
}
