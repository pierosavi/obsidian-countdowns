import type { App } from 'obsidian';
import type { CountdownsSettings } from './settings';

const BASE_FILE_NAME = 'Countdowns.base';

/**
 * Generates the YAML content for the default Countdowns base file.
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
  target: "date(if(nextDate, nextDate, date))"
  diffMs: "(number(formula.target) - number(now()))"
  absDiffMs: "formula.diffMs.abs()"
  totalSeconds: "(formula.absDiffMs / 1000).floor()"
  totalMinutes: "(formula.absDiffMs / 60000).floor()"
  totalHours: "(formula.absDiffMs / 3600000).floor()"
  totalDays: "(formula.absDiffMs / 86400000).floor()"
  totalMonths: "(formula.totalDays / 30).floor()"
  totalYears: "(formula.totalDays / 365).floor()"
  label: 'if(formula.totalYears >= 1, formula.totalYears + if(formula.totalYears == 1, " year", " years"), if(formula.totalMonths >= 1, formula.totalMonths + if(formula.totalMonths == 1, " month", " months"), if(formula.totalDays >= 1, formula.totalDays + if(formula.totalDays == 1, " day", " days"), if(formula.totalHours >= 1, formula.totalHours + if(formula.totalHours == 1, " hour", " hours"), if(formula.totalMinutes >= 1, formula.totalMinutes + if(formula.totalMinutes == 1, " minute", " minutes"), formula.totalSeconds + if(formula.totalSeconds == 1, " second", " seconds"))))))'
  isPast: "formula.diffMs < 0"
  isFuture: "!formula.isPast"
  isToday: "formula.totalDays == 0 && !formula.isPast"
  isThisWeek: "formula.totalDays >= 0 && formula.totalDays <= 7 && !formula.isPast"
  isThisMonth: "formula.totalDays >= 0 && formula.totalDays <= 30 && !formula.isPast"
  relative: 'if(formula.isPast, formula.label + " ago", "in " + formula.label)'
properties:
  formula.relative:
    displayName: Relative
  nextDate:
    displayName: Next Date
views:
  - type: cards
    name: Countdowns
    order:
      - file.name
      - formula.relative
    sort:
      - property: formula.diffMs
        direction: ASC
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
