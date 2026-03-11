import fs from 'node:fs/promises';
import path from 'node:path';

export interface Config {
  passwordHash: string;
  savedSearches: Array<{ id: string; name: string; query: string }>;
  settings: {
    autoSaveDelay: number;
    showSnippets: boolean;
    editorWidth: number;
    fontSize: number;
    noteTemplate: string;
    indexExtensions: string[];
    darkMode: 'auto' | 'light' | 'dark';
    lineHeight: number;
  };
}

const DEFAULT_CONFIG: Config = {
  passwordHash: '',
  savedSearches: [],
  settings: {
    autoSaveDelay: 1000,
    showSnippets: false,
    editorWidth: 680,
    fontSize: 13,
    noteTemplate: '',
    indexExtensions: ['.md'],
    darkMode: 'auto',
    lineHeight: 1.6,
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

export async function readConfig(): Promise<Config> {
  const configPath = getConfigPath();
  try {
    const data = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(data);
    return { ...DEFAULT_CONFIG, ...parsed, settings: { ...DEFAULT_CONFIG.settings, ...parsed.settings } };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function writeConfig(config: Config): Promise<void> {
  const configPath = getConfigPath();
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}
