import {Plugin, Modal, App, Setting, Notice, TFile, TFolder, moment} from 'obsidian';
import {DEFAULT_SETTINGS, CountdownsSettings, CountdownsSettingTab} from "./settings";
import {ensureBaseFile, recreateBaseFile} from "./bases";
import {REPEAT_PRESETS, isValidRRule, effectiveDate} from "./repeat";
import {IntervalManager} from "./interval-manager";

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

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new CountdownsSettingTab(this.app, this));
		this.addCommand({
			id: 'create-new-countdown',
			name: 'Create new countdown',
			callback: () => new CountdownCreationModal(this.app, this.settings).open(),
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

/**
 * Modal dialog for creating a new countdown note.
 * Collects name, target date, and optional content from the user,
 * then creates a Markdown note with YAML frontmatter in the configured folder.
 */
class CountdownCreationModal extends Modal {
	settings: CountdownsSettings;
	constructor(app: App, settings: CountdownsSettings) {
		super(app);
		this.settings = settings;
	}

	onOpen() {
		const {contentEl} = this;

		contentEl.createEl('h2', {text: 'Create a new countdown'});

		const today = moment().format('YYYY-MM-DD');
		const nowFull = moment().format('YYYY-MM-DDTHH:mm');
		const newCountdown: Countdown = { name: '', content: '', date: new Date(), time: null, repeat: null };

		new Setting(contentEl)
			.setName('Name')
			.setDesc('This will be used as the file name.')
			.addText(text => text
				.setPlaceholder('Countdown name')
				.onChange(value => { newCountdown.name = value.trim(); }));

		let dateInput: HTMLInputElement;

		new Setting(contentEl)
			.setName('Date')
			.setDesc('The target date for this countdown.')
			.addText(text => {
				dateInput = text.inputEl;
				dateInput.type = 'date';
				dateInput.value = today;
				text.onChange(value => {
					const m = moment(value);
					newCountdown.date = m.toDate();
					newCountdown.time = value.includes('T') ? m.format('HH:mm') : null;
				});
			});

		new Setting(contentEl)
			.setName('Include time')
			.setDesc('Set a specific time for the countdown.')
			.addToggle(toggle => toggle.onChange(enabled => {
				if (enabled) {
					dateInput.type = 'datetime-local';
					dateInput.value = nowFull;
					const m = moment(nowFull);
					newCountdown.date = m.toDate();
					newCountdown.time = m.format('HH:mm');
				} else {
					const currentDate = moment(dateInput.value).format('YYYY-MM-DD');
					dateInput.type = 'date';
					dateInput.value = currentDate;
					newCountdown.date = moment(currentDate).toDate();
					newCountdown.time = null;
				}
			}));

		new Setting(contentEl)
			.setName('Content')
			.setDesc((() => {
				const frag = document.createDocumentFragment();
				frag.append(
					'The content of the countdown note.',
					document.createElement('br'),
					'You can use Markdown here.'
				);
				return frag;
			})())
			.addTextArea(text => {
				text
					.setPlaceholder('Countdown content')
					.onChange(value => { newCountdown.content = value; });
				text.inputEl.rows = 6;
				text.inputEl.cols = 25;
			});

		let customRepeatSetting: Setting;

		new Setting(contentEl)
			.setName('Repeat')
			.setDesc('How often this countdown recurs.')
			.addDropdown(dd => {
				for (const p of REPEAT_PRESETS) dd.addOption(p.value, p.label);
				dd.addOption('custom', 'Custom...');
				dd.onChange(value => {
					if (value === 'custom') {
						newCountdown.repeat = '';
						customRepeatSetting.settingEl.show();
					} else {
						newCountdown.repeat = value || null;
						customRepeatSetting.settingEl.hide();
					}
				});
			});

		customRepeatSetting = new Setting(contentEl)
			.setName('Custom rule')
			.setDesc('Enter a valid recurrence rule string.')
			.addText(text => text
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				.setPlaceholder('FREQ=WEEKLY;INTERVAL=2')
				.onChange(value => {
					newCountdown.repeat = value.trim() || null;
				}));
		customRepeatSetting.settingEl.hide();

		new Setting(contentEl)
			.setDesc('A base view will be created in your bases folder on first use.')
			.addButton(btn => btn
				.setButtonText('Create')
				.setCta()
				.onClick(async () => {
					if (!newCountdown.name) {
						new Notice('Please enter a name for the countdown.');
						return;
					}
					if (newCountdown.repeat !== null && !isValidRRule(newCountdown.repeat)) {
						new Notice('Invalid repeat rule. Please enter a valid recurrence rule string.');
						return;
					}
					const path = `${this.settings.countdownsFolder}/${newCountdown.name}.md`;
					try {
						// Create the folder if it doesn't exist yet
						if (!this.app.vault.getAbstractFileByPath(this.settings.countdownsFolder))
							await this.app.vault.createFolder(this.settings.countdownsFolder);

						const file = await this.app.vault.create(path, newCountdown.content);

						// Write frontmatter via Obsidian's API so it handles YAML serialisation correctly.
						// date is stored as a YYYY-MM-DD string — YAML has no native date type.
						// Obsidian infers the property as a date from this format, enabling Bases date queries.
						// repeat stores an RRULE string (RFC 5545) for recurring countdowns.
						await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
							fm.date = formatDateForFrontmatter(newCountdown.date, newCountdown.time);
							if (newCountdown.repeat) fm.repeat = newCountdown.repeat;
							fm.nextDate = formatDateForFrontmatter(effectiveDate(newCountdown.date, newCountdown.repeat), newCountdown.time);
							if (this.settings.countdownTag) fm.tags = [this.settings.countdownTag];
						});
						this.close();
						if (await ensureBaseFile(this.app, this.settings))
							new Notice(`Created a Countdowns base view in "${this.settings.basesFolder}".`);
					} catch {
						new Notice(`A countdown named "${newCountdown.name}" already exists.`);
					}
				}));
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

/**
 * Represents a countdown event.
 * Serialised as a Markdown note with YAML frontmatter in the countdowns folder.
 */
interface Countdown {
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

/** Format a Date for frontmatter, including time if `time` is set. */
function formatDateForFrontmatter(d: Date, time: string | null): string {
	return time
		? moment(d).format('YYYY-MM-DDTHH:mm')
		: moment(d).format('YYYY-MM-DD');
}

/** Detect whether a frontmatter date string includes a time component. */
function hasTime(dateStr: string): boolean {
	return dateStr.includes('T');
}
