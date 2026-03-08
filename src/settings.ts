import {App, PluginSettingTab, Setting} from "obsidian";
import CountdownsPlugin from "./main";

export interface CountdownsSettings {
	countdowns_folder: string;
	bases_folder: string;
}

export const DEFAULT_SETTINGS: CountdownsSettings = {
	countdowns_folder: 'Countdowns',
	bases_folder: 'Countdowns/Bases',
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

		new Setting(containerEl)
			.setName('Folders')
			.setHeading();

		new Setting(containerEl)
			.setName('Countdowns folder')
			.setDesc('The folder where countdown notes will be created')
			.addText(text => text
				.setPlaceholder('Count down folder, e.g. "Countdowns/subfolder"')
				.setValue(this.plugin.settings.countdowns_folder)
				.onChange(async (value) => {
					this.plugin.settings.countdowns_folder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Bases folder')
			.setDesc('The folder where base notes will be created')
			.addText(text => text
				.setPlaceholder('Bases folder, e.g. "Countdowns/Bases"')
				.setValue(this.plugin.settings.bases_folder)
				.onChange(async (value) => {
					this.plugin.settings.bases_folder = value;
					await this.plugin.saveSettings();
				}));
	}
}
