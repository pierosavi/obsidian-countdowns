import {Modal, App, Setting, Notice, moment} from "obsidian";
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

/**
 * Modal dialog for creating a new countdown note.
 * Collects name, target date, and optional content from the user,
 * then creates a Markdown note with YAML frontmatter in the configured folder.
 */
export class CountdownCreationModal extends Modal {
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
			.setDesc((() => {
				const frag = document.createDocumentFragment();
				const link = document.createElement('a');
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
			.addText(text => text
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				.setPlaceholder('FREQ=WEEKLY;INTERVAL=2')
				.onChange(value => {
					newCountdown.repeat = value.trim() || null;
				}));
		customRepeatSetting.settingEl.hide();

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
