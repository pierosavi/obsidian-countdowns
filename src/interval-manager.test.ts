import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TFile, MetadataCache, CachedMetadata } from 'obsidian';
import { intervalForDiff, tierCrossingIn, IntervalManager } from './interval-manager';

// Provide window.setTimeout/clearTimeout for Node environment
vi.stubGlobal('window', {
	setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
	clearTimeout: (id: number) => clearTimeout(id),
});

// Unit tests

describe('intervalForDiff', () => {
	it('returns 1s for < 1 minute', () => {
		expect(intervalForDiff(0)).toBe(1_000);
		expect(intervalForDiff(30_000)).toBe(1_000);
		expect(intervalForDiff(59_999)).toBe(1_000);
	});

	it('returns 1min for < 1 hour', () => {
		expect(intervalForDiff(60_000)).toBe(60_000);
		expect(intervalForDiff(3_599_999)).toBe(60_000);
	});

	it('returns 1hr for < 1 day', () => {
		expect(intervalForDiff(3_600_000)).toBe(3_600_000);
		expect(intervalForDiff(86_399_999)).toBe(3_600_000);
	});

	it('returns 1day for < 1 week', () => {
		expect(intervalForDiff(86_400_000)).toBe(86_400_000);
		expect(intervalForDiff(604_799_999)).toBe(86_400_000);
	});

	it('returns Infinity for >= 1 week', () => {
		expect(intervalForDiff(604_800_000)).toBe(Infinity);
		expect(intervalForDiff(999_999_999)).toBe(Infinity);
	});
});

describe('tierCrossingIn', () => {
	it('returns Infinity when already in fastest tier', () => {
		expect(tierCrossingIn(0)).toBe(Infinity);
		expect(tierCrossingIn(59_999)).toBe(Infinity);
	});

	it('returns ms until crossing into <1min tier', () => {
		expect(tierCrossingIn(90_000)).toBe(30_000);   // 90s - 60s = 30s
		expect(tierCrossingIn(60_000)).toBe(0);         // exact boundary
	});

	it('returns ms until crossing into <1hr tier', () => {
		expect(tierCrossingIn(7_200_000)).toBe(3_600_000); // 2hr - 1hr
	});

	it('returns ms until crossing into <1day tier', () => {
		expect(tierCrossingIn(172_800_000)).toBe(86_400_000); // 2days - 1day
	});

	it('returns ms until crossing into <1week tier from beyond', () => {
		expect(tierCrossingIn(691_200_000)).toBe(86_400_000); // 8days - 7days
	});
});

// Integration tests

/** Create a minimal TFile-like object. */
function mockFile(path: string): TFile {
	// eslint-disable-next-line obsidianmd/no-tfile-tfolder-cast
	return { path, basename: path.replace(/.*\//, '') } as unknown as TFile;
}

interface MockDepsResult {
	triggered: string[];
	deps: {
		getCountdownNotes: () => TFile[];
		metadataCache: MetadataCache;
	};
}

/** Create mock deps for IntervalManager. */
function createMockDeps(files: { file: TFile; nextDate?: string; date?: string }[]): MockDepsResult {
	const triggered: string[] = [];
	const cacheMap = new Map<string, CachedMetadata>();
	for (const f of files) {
		const fm: Record<string, string> = {};
		if (f.nextDate) fm.nextDate = f.nextDate;
		if (f.date) fm.date = f.date;
		cacheMap.set(f.file.path, { frontmatter: fm } as CachedMetadata);
	}

	return {
		triggered,
		deps: {
			getCountdownNotes: () => files.map(f => f.file),
			metadataCache: {
				getFileCache: (file: TFile) => cacheMap.get(file.path) ?? null,
				trigger: (_event: string, file: TFile) => { triggered.push(file.path); },
			} as MetadataCache,
		},
	};
}

describe('IntervalManager', () => {
	beforeEach(() => { vi.useFakeTimers(); });
	afterEach(() => { vi.useRealTimers(); });

	it('touches a file that is within 1 minute on construction', () => {
		const file = mockFile('countdown/soon.md');
		vi.setSystemTime(new Date('2026-03-15T23:59:30'));
		const { triggered, deps } = createMockDeps([
			{ file, nextDate: '2026-03-16' }, // ~30s until local midnight
		]);

		const manager = new IntervalManager(deps);
		expect(triggered).toContain(file.path);
		manager.stop();
	});

	it('does not touch files more than 1 week away', () => {
		vi.setSystemTime(new Date('2026-03-15T12:00:00'));
		const file = mockFile('countdown/far.md');
		const { triggered, deps } = createMockDeps([
			{ file, nextDate: '2026-04-15' }, // 1 month away
		]);

		const manager = new IntervalManager(deps);
		expect(triggered).not.toContain(file.path);
		manager.stop();
	});

	it('schedules next tick and touches again after interval elapses', () => {
		vi.setSystemTime(new Date('2026-03-15T23:00:00'));
		const file = mockFile('countdown/hourly.md');
		const { triggered, deps } = createMockDeps([
			{ file, nextDate: '2026-03-16' }, // ~1hr away → 1min interval
		]);

		const manager = new IntervalManager(deps);
		expect(triggered.length).toBe(1);

		// Advance past the interval
		vi.advanceTimersByTime(60_000);
		expect(triggered.length).toBeGreaterThan(1);
		manager.stop();
	});

	it('tracks paths and prunes stale entries on re-schedule', () => {
		vi.setSystemTime(new Date('2026-03-15T23:59:00'));
		const file1 = mockFile('countdown/a.md');
		const file2 = mockFile('countdown/b.md');

		const { deps } = createMockDeps([
			{ file: file1, nextDate: '2026-03-16' },
			{ file: file2, nextDate: '2026-03-16' },
		]);

		const manager = new IntervalManager(deps);
		expect(manager.isTracked(file1.path)).toBe(true);
		expect(manager.isTracked(file2.path)).toBe(true);

		// Remove file2 from the list
		deps.getCountdownNotes = () => [file1];
		manager.scheduleEvaluate();
		vi.advanceTimersByTime(1000); // debounce
		expect(manager.isTracked(file2.path)).toBe(false);
		manager.stop();
	});

	it('ignores scheduleEvaluate during ticking (re-entrant guard)', () => {
		vi.setSystemTime(new Date('2026-03-15T23:59:50'));
		const file = mockFile('countdown/x.md');

		const { deps } = createMockDeps([{ file, nextDate: '2026-03-16' }]);
		const manager = new IntervalManager(deps);

		// Monkey-patch trigger to call scheduleEvaluate during a tick (simulating
		// the metadataCache.on('changed') handler re-entering during a touch)
		let scheduleEvalCalled = false;
		const origTrigger = deps.metadataCache.trigger.bind(deps.metadataCache);
		deps.metadataCache.trigger = function (_event: string, ..._args: unknown[]) {
			origTrigger(_event, ..._args);
			scheduleEvalCalled = true;
			manager.scheduleEvaluate(); // should be no-op during ticking
		};

		// Advance to next tick so schedule() runs with the patched trigger
		vi.advanceTimersByTime(1_000);
		expect(scheduleEvalCalled).toBe(true);
		manager.stop();
	});

	it('falls back to date when nextDate is absent', () => {
		vi.setSystemTime(new Date('2026-03-15T23:59:30'));
		const file = mockFile('countdown/noNext.md');
		const { triggered, deps } = createMockDeps([
			{ file, date: '2026-03-16' }, // only date, no nextDate
		]);

		const manager = new IntervalManager(deps);
		expect(triggered).toContain(file.path);
		manager.stop();
	});

	it('handles datetime strings with time component', () => {
		vi.setSystemTime(new Date('2026-03-16T14:25:00'));
		const file = mockFile('countdown/timed.md');
		const { triggered, deps } = createMockDeps([
			{ file, nextDate: '2026-03-16T14:30' }, // 5 minutes away → 1min interval
		]);

		const manager = new IntervalManager(deps);
		expect(triggered).toContain(file.path);
		manager.stop();
	});

	it('does not touch datetime targets more than 1 week away', () => {
		vi.setSystemTime(new Date('2026-03-15T12:00:00'));
		const file = mockFile('countdown/far-timed.md');
		const { triggered, deps } = createMockDeps([
			{ file, nextDate: '2026-03-25T09:00' }, // ~10 days away
		]);

		const manager = new IntervalManager(deps);
		expect(triggered).not.toContain(file.path);
		manager.stop();
	});

	it('stop cancels pending timeouts', () => {
		vi.setSystemTime(new Date('2026-03-15T23:59:00'));
		const file = mockFile('countdown/s.md');
		const { triggered, deps } = createMockDeps([
			{ file, nextDate: '2026-03-16' },
		]);

		const manager = new IntervalManager(deps);
		const countAfterInit = triggered.length;
		manager.stop();

		vi.advanceTimersByTime(120_000);
		expect(triggered.length).toBe(countAfterInit); // no further touches
	});
});
