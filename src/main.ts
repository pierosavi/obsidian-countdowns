import {Plugin, Modal, App, Setting, Notice, moment} from 'obsidian';
import {DEFAULT_SETTINGS, CountdownsSettings, CountdownsSettingTab} from "./settings";
import {ensureBaseFile} from "./bases";

export default class CountdownsPlugin extends Plugin {
	settings: CountdownsSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new CountdownsSettingTab(this.app, this));
		this.addCommand({
			id: 'create-new-countdown',
			name: 'Create new countdown',
			callback: () => new CountdownCreationModal(this.app, this.settings).open(),
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

		const newCountdown: Countdown = { name: '', content: '', date: new Date(), repeat: null };

		new Setting(contentEl)
			.setName('Name')
			.setDesc('This will be used as the file name.')
			.addText(text => text
				.setPlaceholder('Countdown name')
				.onChange(value => { newCountdown.name = value; }));

		new Setting(contentEl)
			.setName('Date')
			.setDesc('The target date for this countdown.')
			.addText(text => {
				text.inputEl.type = 'date';
				text.onChange(value => { newCountdown.date = new Date(value); });
			});

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
							fm.date = moment(newCountdown.date).format('YYYY-MM-DD');
							if (newCountdown.repeat) fm.repeat = newCountdown.repeat;
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
	/** Target date of the countdown. Serialised as a YYYY-MM-DD string in frontmatter (YAML has no native date type). */
	date: Date;
	/** Optional RRULE string (RFC 5545) for recurring countdowns, e.g. "RRULE:FREQ=YEARLY". */
	repeat: string | null;
}
