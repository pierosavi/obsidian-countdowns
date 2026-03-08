import {Plugin, Modal, App, Setting} from 'obsidian';
import {DEFAULT_SETTINGS, CountdownsSettings, CountdownsSettingTab} from "./settings";
import { safeCreateFile } from "./utils";

export default class CountdownsPlugin extends Plugin {
	settings: CountdownsSettings;

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new CountdownsSettingTab(this.app, this));

		this.addCommand({
			id: 'create-new-countdown',
			name: 'Create new countdown',
			editorCallback: () => {
				this.openCountdownCreationModal();
			}
		});
	}

	openCountdownCreationModal() {
		// Open a modal to create a new countdown
		new CountdownCreationModal(this.app, this.settings).open();
	}

	onunload() {
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

		const newCountdown = new Countdown('', '');

		new Setting(contentEl)
			.setName('Name')
			.setDesc('This will be used as the file name.')
			.addText(text => text
				.setPlaceholder('Countdown name')
				.onChange(value => { newCountdown.name = value; }));

		new Setting(contentEl)
			.setName('Content')
			.setDesc('The content of the countdown note you can use Markdown here')
			// eslint-disable-next-line no-undef
			.setDesc(createFragment((el) => {
				el.appendText("The content of the countdown note.");
				el.createEl("br");
				el.appendText("You can use markdown here.");
			}))
			.addTextArea(text => {
				text
					.setPlaceholder('Countdown content')
					.onChange(value => { newCountdown.content = value; })
				text.inputEl.rows = 6;
				text.inputEl.cols = 25;
			});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Create')
				.setCta()
				.onClick(async () => {
					this.close();
					await safeCreateFile(this.app.vault, `${this.settings.countdowns_folder}/${newCountdown.name}.md`, newCountdown.content);
				}));
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class Countdown {
	name: string;
	content: string;
	
	constructor(name: string, content: string) {
		this.name = name;
		this.content = content;
	}
}
