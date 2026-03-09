import {Plugin, Modal, App, Setting, Notice, moment} from 'obsidian';
import {DEFAULT_SETTINGS, CountdownsSettings, CountdownsSettingTab} from "./settings";

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
			.addButton(btn => btn
				.setButtonText('Create')
				.setCta()
				.onClick(async () => {
					const path = `${this.settings.countdownsFolder}/${newCountdown.name}.md`;
					try {
						if (!this.app.vault.getAbstractFileByPath(this.settings.countdownsFolder))
						await this.app.vault.createFolder(this.settings.countdownsFolder);
						const file = await this.app.vault.create(path, newCountdown.content);
						await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
							fm.date = moment(newCountdown.date).format('YYYY-MM-DD');
							if (newCountdown.repeat) fm.repeat = newCountdown.repeat;
						});
						this.close();
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

interface Countdown {
	name: string;
	content: string;
	date: Date;
	repeat: string | null;
}
