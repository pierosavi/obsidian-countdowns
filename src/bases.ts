import type { App } from 'obsidian';
import type { CountdownsSettings } from './settings';

const BASE_FILE_NAME = 'Countdowns.base';

/**
 * Generates the YAML content for the default Countdowns base file.
 *
 * Formulas:
 * - `daysRemaining`: days from today to the target `date` (negative = past)
 * - `percentElapsed`: % of time elapsed from file creation to target date (capped display via status)
 * - `status`: "upcoming" or "past" based on target date vs today
 */
function buildBaseContent(settings: CountdownsSettings): string {
	const filterSection = settings.countdownTag
		? `filters:
  and:
    - file.inFolder("${settings.countdownsFolder}")
    - file.hasTag("${settings.countdownTag}")`
		: `filters:
  file.inFolder("${settings.countdownsFolder}")`;
	return `${filterSection}
formulas:
  daysRemaining: "((number(date(date)) - number(today())) / 86400000).floor()"
  percentElapsed: "((number(today()) - number(file.ctime)) / (number(date(date)) - number(file.ctime)) * 100).round(1)"
  status: 'if(date(date) > today(), "upcoming", "past")'
properties:
  date:
    displayName: Target date
  formula.daysRemaining:
    displayName: Days remaining
  formula.percentElapsed:
    displayName: "% elapsed"
  formula.status:
    displayName: Status
views:
  - type: cards
    name: Countdowns
    order:
      - file.name
      - note.date
      - formula.daysRemaining
      - formula.percentElapsed
      - formula.status
`;
}

const getBasePath = (settings: CountdownsSettings) => `${settings.basesFolder}/${BASE_FILE_NAME}`;

/** Ensures the bases folder exists and writes the base file at `path`. */
async function writeBaseFile(app: App, path: string, settings: CountdownsSettings): Promise<void> {
	if (!app.vault.getAbstractFileByPath(settings.basesFolder))
		await app.vault.createFolder(settings.basesFolder);
	await app.vault.create(path, buildBaseContent(settings));
}

/**
 * Creates the Countdowns base file if it doesn't already exist.
 * @returns true if the file was created, false if it already existed.
 */
export async function ensureBaseFile(app: App, settings: CountdownsSettings): Promise<boolean> {
	const path = getBasePath(settings);
	if (app.vault.getAbstractFileByPath(path)) return false;
	await writeBaseFile(app, path, settings);
	return true;
}

/**
 * Deletes and recreates the Countdowns base file using the current settings.
 * Use this after changing the countdowns or bases folder.
 */
export async function recreateBaseFile(app: App, settings: CountdownsSettings): Promise<void> {
	const path = getBasePath(settings);
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing) await app.fileManager.trashFile(existing);
	await writeBaseFile(app, path, settings);
}
