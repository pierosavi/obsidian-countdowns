import type { App } from 'obsidian';
import type { CountdownsSettings } from './settings';

const BASE_FILE_NAME = 'Countdowns.base';

/**
 * Generates the YAML content for the default Countdowns base file.
 *
 * Formulas:
 * - `daysRemaining`: days from today to the target `date` (negative = past)
 * - `isOverdue`, `isToday`, `isThisWeek`, `isThisMonth`, `isFuture`: boolean urgency categories
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
  isOverdue: "formula.daysRemaining < 0"
  isToday: "formula.daysRemaining == 0"
  isThisWeek: "formula.daysRemaining >= 0 && formula.daysRemaining <= 7"
  isThisMonth: "formula.daysRemaining >= 0 && formula.daysRemaining <= 30"
  isFuture: "formula.daysRemaining > 30"
properties:
  date:
    displayName: Target date
  formula.daysRemaining:
    displayName: Days remaining
  formula.isOverdue:
    displayName: Overdue
  formula.isToday:
    displayName: Today
  formula.isThisWeek:
    displayName: This week
  formula.isThisMonth:
    displayName: This month
  formula.isFuture:
    displayName: Future
views:
  - type: cards
    name: Countdowns
    order:
      - file.name
      - note.date
      - formula.daysRemaining
      - formula.isOverdue
      - formula.isToday
      - formula.isThisWeek
      - formula.isThisMonth
      - formula.isFuture
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
