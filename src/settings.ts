import {App, PluginSettingTab, Setting} from "obsidian";
import CountdownsPlugin from "./main";

export interface CountdownsSettings {
	mySetting: string;
}

export const DEFAULT_SETTINGS: CountdownsSettings = {
	mySetting: 'default'
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
			.setName('Settings #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
