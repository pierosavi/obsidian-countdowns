import {Plugin, Notice, TFile, TFolder, moment, getFrontMatterInfo} from 'obsidian';
import {DEFAULT_SETTINGS, CountdownsSettings, CountdownsSettingTab} from "./settings";
import {recreateBaseFile} from "./bases";
import {effectiveDate} from "./repeat";
import {IntervalManager} from "./interval-manager";
import {CountdownCreationModal} from "./creationModal";


/**
 * Represents a countdown event.
 * Serialised as a Markdown note with YAML frontmatter in the countdowns folder.
 */
export interface Countdown {
	/** Note file name and display title. */
	name: string;
	/** Markdown body of the note. */
	content: string;
	/** Target date of the countdown. */
	date: Date;
	/** Optional time string in HH:mm format, or null for date-only countdowns. */
	time: string | null;
	/** Optional RRULE string (RFC 5545) for recurring countdowns, e.g. "RRULE:FREQ=YEARLY". */
	repeat: string | null;
}

export default class CountdownsPlugin extends Plugin {
	settings: CountdownsSettings;
	private intervalManager: IntervalManager | null = null;

	/** Check whether a file has satisfies tag requirement. */
	private hasCountdownTag(file: TFile): boolean {
		if (!this.settings.countdownTag) return true;
		const tags = this.app.metadataCache.getFileCache(file)?.frontmatter?.tags as string[] | undefined;
		return Array.isArray(tags) && tags.includes(this.settings.countdownTag);
	}

	/** Check whether a file is a countdown note (correct folder + tag if configured). */
	isCountdownNote(file: TFile): boolean {
		return file.path.startsWith(this.settings.countdownsFolder + '/') && this.hasCountdownTag(file);
	}

	/** Recursively get all countdown notes from the configured folder, filtered by tag if set. */
	getCountdownNotes(): TFile[] {
		const folder = this.app.vault.getFolderByPath(this.settings.countdownsFolder);
		if (!folder) return [];
		const files: TFile[] = [];
		const collect = (f: TFolder) => {
			for (const child of f.children) {
				if (child instanceof TFile && child.extension === 'md') {
					if (this.hasCountdownTag(child)) files.push(child);
				} else if (child instanceof TFolder) {
					collect(child);
				}
			}
		};
		collect(folder);
		return files;
	}

	/** Read a countdown note and open the edit modal with prefilled values. */
	private async openEditModal(file: TFile) {
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm?.date) {
			new Notice('Could not read countdown data from this note.');
			return;
		}
		const dateStr = fm.date as string;
		const hasTimeComponent = dateStr.includes('T');
		const m = moment(dateStr);
		const raw = await this.app.vault.read(file);
		const content = raw.slice(getFrontMatterInfo(raw).contentStart).trimStart();
		const countdown: Countdown = {
			name: file.basename,
			content,
			date: m.toDate(),
			time: hasTimeComponent ? m.format('HH:mm') : null,
			repeat: (fm.repeat as string) ?? null,
		};
		new CountdownCreationModal(this.app, this.settings, file, countdown).open();
	}

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new CountdownsSettingTab(this.app, this));
		this.addCommand({
			id: 'create-new-countdown',
			name: 'Create new countdown',
			callback: () => new CountdownCreationModal(this.app, this.settings).open(),
		});
		this.addCommand({
			id: 'edit-countdown',
			name: 'Edit countdown',
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || !this.isCountdownNote(file)) {
					if (!checking) new Notice('The active note is not a countdown.');
					return false;
				}
				if (!checking) void this.openEditModal(file);
				return true;
			},
		});
		this.addCommand({
			id: 'regenerate-base',
			name: 'Regenerate base view',
			callback: async () => {
				await recreateBaseFile(this.app, this.settings);
				new Notice('Countdowns base view regenerated.');
			},
		});

		// Keep nextDate in sync when date or repeat changes, and re-evaluate interval tiers
		this.registerEvent(
			this.app.metadataCache.on('changed', (file) => {
				if (this.isCountdownNote(file)) {
					void this.refreshNextDate(file);
					this.intervalManager?.scheduleEvaluate();
				}
			})
		);

		// Refresh stale notes on startup, then every hour at :00
		this.app.workspace.onLayoutReady(() => {
			void this.refreshStaleNotes();
			const msToNextHour = moment().endOf('hour').diff(moment()) + 1;
			const timeout = window.setTimeout(() => {
				void this.refreshStaleNotes();
				this.registerInterval(window.setInterval(() => void this.refreshStaleNotes(), 3600000));
			}, msToNextHour);
			this.register(() => window.clearTimeout(timeout));

			this.intervalManager = new IntervalManager({
				getCountdownNotes: () => this.getCountdownNotes(),
				metadataCache: this.app.metadataCache,
			});
			this.registerEvent(this.app.vault.on('delete', (file) => {
				if (file instanceof TFile && this.intervalManager?.isTracked(file.path)) {
					this.intervalManager.scheduleEvaluate();
				}
			}));
			this.register(() => this.intervalManager?.stop());
		});
	}

	/** Scan all countdown notes and update any with a stale nextDate. */
	async refreshStaleNotes() {
		for (const file of this.getCountdownNotes()) {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!fm?.date || !fm.repeat) continue;
			if (!fm.nextDate || moment(fm.nextDate as string).isBefore(moment(), 'minute'))
				await this.refreshNextDate(file);
		}
	}

	/** Recompute nextDate for a single file if date or repeat changed. */
	async refreshNextDate(file: TFile) {
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			if (!fm.date) return;
			const dateStr = fm.date as string;
			const dtstart = moment(dateStr).toDate();
			const next = effectiveDate(dtstart, (fm.repeat as string) ?? null);
			const fmt = hasTime(dateStr) ? 'YYYY-MM-DDTHH:mm' : 'YYYY-MM-DD';
			const nextStr = moment(next).format(fmt);
			if (fm.nextDate === nextStr) return;
			fm.nextDate = nextStr;
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<CountdownsSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

/** Detect whether a frontmatter date string includes a time component. */
function hasTime(dateStr: string): boolean {
	return dateStr.includes('T');
}
