# Countdowns

An [Obsidian](https://obsidian.md) plugin that lets you create and manage countdowns using [Bases](https://obsidian.md/blog/bases/).

## Features

- **Create countdowns** from the command palette with a name, target date, optional time, and markdown content
- **Recurring countdowns** with presets (daily, weekly, monthly, yearly) or custom recurrence rules, using [RRule](https://github.com/jakubroztocil/rrule)
- **Bases integration** to view all your countdowns with filtering, sorting, searching and computed fields like remaining time and relative labels
- **Smart refresh** that keeps countdown data up to date based on proximity to the target date

## Usage

1. Open the command palette and run **Create new countdown**
2. Fill in the name, target date, and optionally a time, recurrence rule, and content
3. The plugin creates a note with the appropriate frontmatter in your configured countdowns folder
4. Open the generated base view to see all your countdowns at a glance

## Settings

| Setting | Description | Default |
|---|---|---|
| Countdowns folder | Where countdown notes are stored | `Countdowns` |
| Bases folder | Where the base view file is created | `Countdowns/Bases` |
| Countdown tag | Frontmatter tag to identify countdown notes | `countdown` |

You can also regenerate the base view from settings or via the **Regenerate base** command.

## Installing

### With BRAT

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin
2. Open **Settings > BRAT > Add Beta plugin**
3. Enter `pierosavi/obsidian-countdowns` and select **Add Plugin**
4. Enable the plugin in **Settings > Community plugins**

### Manual installation

1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/pierosavi/obsidian-countdowns/releases)
2. Create a folder called `countdowns` inside `<your-vault>/.obsidian/plugins/`
3. Copy the downloaded files into that folder
4. Restart Obsidian and enable the plugin in **Settings > Community plugins**

## Development

```bash
npm install
npm run dev     # watch mode
npm run build   # production build
npm run test    # run tests
npm run lint    # lint source files
```
