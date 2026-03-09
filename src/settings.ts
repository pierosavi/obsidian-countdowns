import {App, ButtonComponent, Notice, PluginSettingTab, Setting} from "obsidian";
import type CountdownsPlugin from "./main";
import {recreateBaseFile} from "./bases";

export interface CountdownsSettings {
	countdownsFolder: string;
	basesFolder: string;
}

export const DEFAULT_SETTINGS: CountdownsSettings = {
	countdownsFolder: 'Countdowns',
	basesFolder: 'Countdowns/Bases',
}

export class CountdownsSettingTab extends PluginSettingTab {
	plugin: CountdownsPlugin;

	constructor(app: App, plugin: CountdownsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		// Save reference to toggle cta when folder settings are changed
		let recreateBtn: ButtonComponent;

		new Setting(containerEl)
			.setName('Folders')
			.setHeading();

		new Setting(containerEl)
			.setName('Countdowns folder')
			.setDesc('The folder where countdown notes will be created')
			.addText(text => text
				.setPlaceholder('Count down folder, e.g. "Countdowns/subfolder"')
				.setValue(this.plugin.settings.countdownsFolder)
				.onChange(async (value) => {
					this.plugin.settings.countdownsFolder = value;
					await this.plugin.saveSettings();
					recreateBtn.setCta();
				}));

		new Setting(containerEl)
			.setName('Bases folder')
			.setDesc('The folder where base notes will be created. Changing this will not delete the old base file automatically.')
			.addText(text => text
				.setPlaceholder('Bases folder, e.g. "Countdowns/Bases"')
				.setValue(this.plugin.settings.basesFolder)
				.onChange(async (value) => {
					this.plugin.settings.basesFolder = value;
					await this.plugin.saveSettings();
					recreateBtn.setCta();
				}));

		new Setting(containerEl)
			.setName('Base view')
			.setHeading();

		new Setting(containerEl)
			.setName('Recreate base view')
			.setDesc('Regenerates the countdowns base file using the current folder settings. Use this after changing either folder above.')
			.addButton(btn => {
				recreateBtn = btn;
				btn.setButtonText('Recreate')
					.onClick(async () => {
						await recreateBaseFile(this.app, this.plugin.settings);
						new Notice('Countdowns base view recreated.');
						btn.removeCta();
					});
			});
	}
}
