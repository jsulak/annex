import fs from 'node:fs/promises';
import path from 'node:path';

export interface Config {
  passwordHash: string;
  settings: {
    autoSaveDelay: number;
    fontSize: number;
    noteTemplate: string;
    darkMode: 'auto' | 'light' | 'dark';
    lineHeight: number;
    hideMarkdownMarkup: boolean;
  };
}

const DEFAULT_CONFIG: Config = {
  passwordHash: '',
  settings: {
    autoSaveDelay: 1000,
    fontSize: 13,
    noteTemplate: 'Title:\t\t{title}\nDate:\t\t{date}\nKeywords:\t\n\n\n\n\nBacklinks: [[{id}]]\n',
    darkMode: 'auto',
    lineHeight: 1.6,
    hideMarkdownMarkup: false,
  },
};

function getConfigPath(): string {
  const notesDir = process.env.NOTES_DIR;
  if (notesDir) {
    return path.join(notesDir, '_annex.json');
  }
  const configDir = process.env.CONFIG_DIR || path.join(process.env.HOME || '~', '.annex');
  return path.join(configDir, 'config.json');
}

function normalizeConfig(parsed: Partial<Config> | Record<string, unknown>): Config {
  const rawSettings =
    parsed.settings && typeof parsed.settings === 'object'
      ? parsed.settings as Partial<Config['settings']>
      : {};

  return {
    passwordHash: typeof parsed.passwordHash === 'string' ? parsed.passwordHash : '',
    settings: {
      ...DEFAULT_CONFIG.settings,
      autoSaveDelay: typeof rawSettings.autoSaveDelay === 'number'
        ? rawSettings.autoSaveDelay
        : DEFAULT_CONFIG.settings.autoSaveDelay,
      fontSize: typeof rawSettings.fontSize === 'number'
        ? rawSettings.fontSize
        : DEFAULT_CONFIG.settings.fontSize,
      noteTemplate: typeof rawSettings.noteTemplate === 'string' && rawSettings.noteTemplate.trim().length > 0
        ? rawSettings.noteTemplate
        : DEFAULT_CONFIG.settings.noteTemplate,
      darkMode:
        rawSettings.darkMode === 'light' || rawSettings.darkMode === 'dark' || rawSettings.darkMode === 'auto'
          ? rawSettings.darkMode
          : DEFAULT_CONFIG.settings.darkMode,
      lineHeight: typeof rawSettings.lineHeight === 'number'
        ? rawSettings.lineHeight
        : DEFAULT_CONFIG.settings.lineHeight,
      hideMarkdownMarkup: typeof rawSettings.hideMarkdownMarkup === 'boolean'
        ? rawSettings.hideMarkdownMarkup
        : DEFAULT_CONFIG.settings.hideMarkdownMarkup,
    },
  };
}

export async function readConfig(): Promise<Config> {
  const configPath = getConfigPath();
  try {
    const data = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(data);
    return normalizeConfig(parsed);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function writeConfig(config: Config): Promise<void> {
  const configPath = getConfigPath();
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(normalizeConfig(config), null, 2), 'utf-8');
}
