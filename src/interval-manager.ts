import {moment} from 'obsidian';
import type {TFile, MetadataCache} from 'obsidian';

interface IntervalManagerDeps {
	getCountdownNotes: () => TFile[];
	metadataCache: MetadataCache;
}

/** Proximity → touch interval. Sorted fastest first. */
const TIERS = [
	{maxMs: 60_000, intervalMs: 1_000},       // < 1 min  → 1s
	{maxMs: 3_600_000, intervalMs: 60_000},    // < 1 hour → 1min
	{maxMs: 86_400_000, intervalMs: 3_600_000},  // < 1 day  → 1hr
	{maxMs: 604_800_000, intervalMs: 86_400_000}, // < 1 week → 1day
] as const;

/** Returns the touch interval for a given proximity, or Infinity if > 1 week. */
export function intervalForDiff(diffMs: number): number {
	for (const t of TIERS) {
		if (diffMs < t.maxMs) return t.intervalMs;
	}
	return Infinity;
}

/** Returns ms until this proximity crosses into the next faster tier, or Infinity. */
export function tierCrossingIn(diffMs: number): number {
	// Already in fastest tier
	if (diffMs < TIERS[0].maxMs) return Infinity;
	for (let i = 1; i < TIERS.length; i++) {
		if (diffMs < TIERS[i]!.maxMs) return diffMs - TIERS[i - 1]!.maxMs;
	}
	// > 1 week — will cross into <1 week tier
	return diffMs - TIERS[TIERS.length - 1]!.maxMs;
}

/**
 * Adaptive scheduler that touches countdown notes at frequencies based on
 * proximity to their target date. Uses a single setTimeout chain that
 * recomputes the schedule on every tick.
 */
export class IntervalManager {
	private timeoutId: number | null = null;
	private debounceId: number | null = null;
	private lastTouch = new Map<string, {time: number, interval: number}>();
	private trackedPaths = new Set<string>();
	private ticking = false;

	constructor(private deps: IntervalManagerDeps) {
		this.schedule();
	}

	/** Whether the given path was a tracked countdown at last evaluation. */
	isTracked(path: string): boolean {
		return this.trackedPaths.has(path);
	}

	/** Debounced re-schedule, safe to call on every create/delete/change event. */
	scheduleEvaluate() {
		if (this.ticking) return;
		if (this.debounceId !== null) window.clearTimeout(this.debounceId);
		this.debounceId = window.setTimeout(() => {
			this.debounceId = null;
			this.schedule();
		}, 1000);
	}

	/** Core loop: touch due files, then schedule next call. */
	private schedule() {
		this.stop();
		const now = Date.now();
		let nextTickIn = Infinity;

		this.trackedPaths.clear();
		this.ticking = true;

		for (const file of this.deps.getCountdownNotes()) {
			this.trackedPaths.add(file.path);

			const cache = this.deps.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter;
			const dateStr = (fm?.nextDate ?? fm?.date) as string | undefined;
			if (!dateStr) continue;

			const rawDiff = moment(dateStr, 'YYYY-MM-DD').valueOf() - now;
			const diffMs = Math.abs(rawDiff);
			const interval = intervalForDiff(diffMs);

			// Only check tier crossing for future targets (diffMs shrinking)
			if (rawDiff > 0) {
				const crossIn = tierCrossingIn(diffMs);
				if (crossIn !== Infinity) nextTickIn = Math.min(nextTickIn, crossIn);
			}

			if (interval === Infinity) continue; // > 1 week

			const last = this.lastTouch.get(file.path);
			const elapsed = now - (last?.time ?? 0);
			const tierChanged = last !== undefined && last.interval !== interval;

			if (elapsed >= interval || tierChanged) {
				if (cache) this.deps.metadataCache.trigger('changed', file, '', cache);
				this.lastTouch.set(file.path, {time: now, interval});
				nextTickIn = Math.min(nextTickIn, interval);
			} else {
				nextTickIn = Math.min(nextTickIn, interval - elapsed);
			}
		}

		this.ticking = false;

		// Prune stale entries, deleting during Map iteration is safe per ES6 spec
		for (const path of this.lastTouch.keys()) {
			if (!this.trackedPaths.has(path)) this.lastTouch.delete(path);
		}

		if (nextTickIn < Infinity) {
			this.timeoutId = window.setTimeout(() => this.schedule(), Math.max(nextTickIn, 50));
		}
	}

	stop() {
		if (this.timeoutId !== null) {
			window.clearTimeout(this.timeoutId);
			this.timeoutId = null;
		}
		if (this.debounceId !== null) {
			window.clearTimeout(this.debounceId);
			this.debounceId = null;
		}
	}
}
