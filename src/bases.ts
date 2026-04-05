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
  hasTime: "number(nextDate) != number(nextDate.date())"
  calendarDays: "(number(nextDate.date()) - number(today())) / 86400000"
  absCalendarDays: "formula.calendarDays.abs()"
  calendarMonths: "(formula.absCalendarDays / 30).floor()"
  calendarYears: "(formula.absCalendarDays / 365).floor()"
  calendarDaysLabel: 'formula.absCalendarDays + if(formula.absCalendarDays == 1, " day", " days")'
  calendarLabel: 'if(formula.calendarYears >= 1, formula.calendarYears + if(formula.calendarYears == 1, " year", " years"), if(formula.calendarMonths >= 1, formula.calendarMonths + if(formula.calendarMonths == 1, " month", " months"), formula.calendarDaysLabel))'
  isToday: "formula.calendarDays == 0"
  isThisWeek: "formula.calendarDays >= 0 && formula.calendarDays <= 7"
  isThisMonth: "formula.calendarDays >= 0 && formula.calendarDays <= 30"
  relative: 'if(!formula.hasTime && formula.calendarDays == 0, "Today", if(!formula.hasTime, if(formula.calendarDays < 0, formula.calendarLabel + " ago", "In " + formula.calendarLabel), if(formula.isPast, formula.label + " ago", "In " + formula.label)))'
  relativeDays: 'if(formula.calendarDays == 0, "Today", if(formula.calendarDays < 0, formula.calendarDaysLabel + " ago", "In " + formula.calendarDaysLabel))'
properties:
  formula.relative:
    displayName: Relative
  formula.relativeDays:
    displayName: Relative Days
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

export const getBasePath = (settings: CountdownsSettings) => `${settings.basesFolder}/${BASE_FILE_NAME}`;

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
