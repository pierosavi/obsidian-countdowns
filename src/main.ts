import {Plugin} from 'obsidian';
import {DEFAULT_SETTINGS, CountdownsSettings, CountdownsSettingTab} from "./settings";

export default class CountdownsPlugin extends Plugin {
	settings: CountdownsSettings;

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new CountdownsSettingTab(this.app, this));
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
