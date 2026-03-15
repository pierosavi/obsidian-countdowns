import {Modal, App, Setting, Notice, TFile, moment, getFrontMatterInfo} from "obsidian";
import {ensureBaseFile} from "./bases";
import {REPEAT_PRESETS, isValidRRule, effectiveDate} from "./repeat";
import {CountdownsSettings} from "./settings";
import {Countdown} from "./main";

/** Format a Date for frontmatter, including time if `time` is set. */
function formatDateForFrontmatter(d: Date, time: string | null): string {
	return time
		? moment(d).format('YYYY-MM-DDTHH:mm')
		: moment(d).format('YYYY-MM-DD');
}

/** Find which REPEAT_PRESETS value matches the stored rule, or 'custom' / '' if none. */
function matchRepeatPreset(repeat: string | null): string {
	if (!repeat) return '';
	for (const p of REPEAT_PRESETS) {
		if (p.value === repeat) return p.value;
	}
	return 'custom';
}

/**
 * Modal dialog for creating or editing a countdown note.
 * Collects name, target date, and optional content from the user,
 * then creates or updates a Markdown note with YAML frontmatter in the configured folder.
 */
export class CountdownCreationModal extends Modal {
	settings: CountdownsSettings;
	/** When set, the modal operates in edit mode on this file. */
	private editFile: TFile | null;
	private editDefaults: Countdown | null;

	constructor(app: App, settings: CountdownsSettings, editFile?: TFile, editDefaults?: Countdown) {
		super(app);
		this.settings = settings;
		this.editFile = editFile ?? null;
		this.editDefaults = editDefaults ?? null;
	}

	onOpen() {
		const {contentEl} = this;
		const isEdit = this.editFile !== null;

		contentEl.createEl('h2', {text: isEdit ? 'Edit countdown' : 'Create a new countdown'});

		const today = moment().format('YYYY-MM-DD');
		const nowFull = moment().format('YYYY-MM-DDTHH:mm');
		const countdown: Countdown = this.editDefaults
			? {...this.editDefaults}
			: { name: '', content: '', date: new Date(), time: null, repeat: null };

		new Setting(contentEl)
			.setName('Name')
			.setDesc('This will be used as the file name.')
			.addText(text => {
				text.setPlaceholder('Countdown name')
					.setValue(countdown.name)
					.onChange(value => { countdown.name = value.trim(); });
				if (isEdit) text.setDisabled(true);
			});

		let dateInput: HTMLInputElement;
		const initialHasTime = countdown.time !== null;
		const initialDateValue = initialHasTime
			? moment(countdown.date).format('YYYY-MM-DDTHH:mm')
			: moment(countdown.date).format('YYYY-MM-DD');

		new Setting(contentEl)
			.setName('Date')
			.setDesc('The target date for this countdown.')
			.addText(text => {
				dateInput = text.inputEl;
				dateInput.type = initialHasTime ? 'datetime-local' : 'date';
				dateInput.value = isEdit ? initialDateValue : today;
				text.onChange(value => {
					const m = moment(value);
					countdown.date = m.toDate();
					countdown.time = value.includes('T') ? m.format('HH:mm') : null;
				});
			});

		new Setting(contentEl)
			.setName('Include time')
			.setDesc('Set a specific time for the countdown.')
			.addToggle(toggle => {
				toggle.setValue(initialHasTime);
				toggle.onChange(enabled => {
					if (enabled) {
						dateInput.type = 'datetime-local';
						dateInput.value = nowFull;
						const m = moment(nowFull);
						countdown.date = m.toDate();
						countdown.time = m.format('HH:mm');
					} else {
						const currentDate = moment(dateInput.value).format('YYYY-MM-DD');
						dateInput.type = 'date';
						dateInput.value = currentDate;
						countdown.date = moment(currentDate).toDate();
						countdown.time = null;
					}
				});
			});

		let customRepeatSetting: Setting;
		const presetMatch = matchRepeatPreset(countdown.repeat);

		new Setting(contentEl)
			.setName('Repeat')
			.setDesc('How often this countdown recurs.')
			.addDropdown(dd => {
				for (const p of REPEAT_PRESETS) dd.addOption(p.value, p.label);
				dd.addOption('custom', 'Custom...');
				dd.setValue(presetMatch);
				dd.onChange(value => {
					if (value === 'custom') {
						countdown.repeat = '';
						customRepeatSetting.settingEl.show();
					} else {
						countdown.repeat = value || null;
						customRepeatSetting.settingEl.hide();
					}
				});
			});

		customRepeatSetting = new Setting(contentEl)
			.setName('Custom rule')
			.setDesc((() => {
				const frag = document.createDocumentFragment();
				const link = document.createElement('a');
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				link.textContent = 'RRULEs demo editor.';
				link.href = 'https://jkbrzt.github.io/rrule/';
				link.target = '_blank';
				frag.append(
					'Enter a custom RRULE.',
					document.createElement('br'),
					link,
					document.createElement('br'),
					'Example: FREQ=WEEKLY;INTERVAL=2 for every 2 weeks.'
				);
				return frag;
			})())
			.addText(text => {
				text
					// eslint-disable-next-line obsidianmd/ui/sentence-case
					.setPlaceholder('FREQ=WEEKLY;INTERVAL=2')
					.onChange(value => {
						countdown.repeat = value.trim() || null;
					});
				if (presetMatch === 'custom') text.setValue(countdown.repeat ?? '');
			});
		if (presetMatch !== 'custom') customRepeatSetting.settingEl.hide();

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
					.setValue(countdown.content)
					.onChange(value => { countdown.content = value; });
				text.inputEl.rows = 6;
				text.inputEl.cols = 25;
			});

		new Setting(contentEl)
			.setDesc(isEdit ? '' : 'A base view will be created in your bases folder on first use.')
			.addButton(btn => btn
				.setButtonText(isEdit ? 'Save' : 'Create')
				.setCta()
				.onClick(async () => {
					if (!countdown.name) {
						new Notice('Please enter a name for the countdown.');
						return;
					}
					if (countdown.repeat !== null && !isValidRRule(countdown.repeat)) {
						new Notice('Invalid repeat rule. Please enter a valid recurrence rule string.');
						return;
					}

					if (isEdit) {
						await this.saveEdit(this.editFile!, countdown);
					} else {
						await this.saveNew(countdown);
					}
				}));
	}

	/** Create a new countdown note. */
	private async saveNew(countdown: Countdown) {
		const path = `${this.settings.countdownsFolder}/${countdown.name}.md`;
		try {
			if (!this.app.vault.getAbstractFileByPath(this.settings.countdownsFolder))
				await this.app.vault.createFolder(this.settings.countdownsFolder);

			const file = await this.app.vault.create(path, countdown.content);
			await this.writeFrontmatter(file, countdown);
			this.close();
			if (await ensureBaseFile(this.app, this.settings))
				new Notice(`Created a Countdowns base view in "${this.settings.basesFolder}".`);
		} catch {
			new Notice(`A countdown named "${countdown.name}" already exists.`);
		}
	}

	/** Update an existing countdown note in-place. */
	private async saveEdit(file: TFile, countdown: Countdown) {
		const raw = await this.app.vault.read(file);
		const {contentStart} = getFrontMatterInfo(raw);
		const newRaw = raw.slice(0, contentStart) + countdown.content;
		await this.app.vault.modify(file, newRaw);

		await this.writeFrontmatter(file, countdown);
		this.close();
		new Notice('Countdown updated.');
	}

	/** Write standard frontmatter fields to a countdown file. */
	private async writeFrontmatter(file: TFile, countdown: Countdown) {
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			fm.date = formatDateForFrontmatter(countdown.date, countdown.time);
			if (countdown.repeat) {
				fm.repeat = countdown.repeat;
			} else {
				delete fm.repeat;
			}
			fm.nextDate = formatDateForFrontmatter(effectiveDate(countdown.date, countdown.repeat), countdown.time);
			if (this.settings.countdownTag) fm.tags = [this.settings.countdownTag];
		});
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}
