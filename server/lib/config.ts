import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface Settings {
  autoSaveDelay: number;
  fontSize: number;
  noteTemplate: string;
  darkMode: 'auto' | 'light' | 'dark';
  lineHeight: number;
  hideMarkdownMarkup: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  autoSaveDelay: 1000,
  fontSize: 13,
  noteTemplate: 'Title:\t\t{title}\nDate:\t\t{date}\nKeywords:\t\n\n\n\n\nBacklinks: [[{id}]]\n',
  darkMode: 'auto',
  lineHeight: 1.6,
  hideMarkdownMarkup: false,
};

function getConfigDir(): string {
  return path.resolve(process.env.CONFIG_DIR || path.join(os.homedir(), '.annex'));
}

function getSettingsPath(): string {
  const notesDir = process.env.NOTES_DIR;
  return notesDir ? path.resolve(notesDir, '_annex.json') : path.join(getConfigDir(), 'config.json');
}

function hasCode(error: unknown, code: string): boolean {
  return (error as NodeJS.ErrnoException).code === code;
}

// Resolve existing ancestors before creating any directories, including symlinked parents.
async function resolveLocation(location: string): Promise<string> {
  try {
    return await fs.realpath(location);
  } catch (error) {
    if (!hasCode(error, 'ENOENT') || path.dirname(location) === location) throw error;
    return path.join(await resolveLocation(path.dirname(location)), path.basename(location));
  }
}

function contains(directory: string, location: string): boolean {
  const relative = path.relative(directory, location);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function getAuthPath(): Promise<string> {
  const configDir = getConfigDir();
  const notesDir = process.env.NOTES_DIR;
  if (!notesDir) return path.join(configDir, 'auth.json');

  const [realConfigDir, realNotesDir] = await Promise.all([
    resolveLocation(configDir), resolveLocation(path.resolve(notesDir)),
  ]);
  if (contains(path.resolve(notesDir), configDir) || contains(realNotesDir, realConfigDir)) {
    throw new Error('CONFIG_DIR must be outside NOTES_DIR.');
  }
  return path.join(realConfigDir, 'auth.json');
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

async function readJson(filePath: string, privateFile = false): Promise<Record<string, unknown> | undefined> {
  const file = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    .catch((error: unknown) => {
      if (!hasCode(error, 'ENOENT')) throw error;
      return undefined;
    });
  if (!file) return undefined;
  try {
    const stat = await file.stat();
    if (!stat.isFile() || (privateFile && (stat.mode & 0o777) !== 0o600)) {
      throw new Error(`Invalid file type or permissions for ${path.basename(filePath)}.`);
    }
    const data = await file.readFile('utf8');
    let parsed: Record<string, unknown> | undefined;
    try {
      parsed = asObject(JSON.parse(data));
    } catch {
      // JSON.parse errors can include credential material from the source file.
    }
    if (!parsed) throw new Error(`Invalid JSON object in ${path.basename(filePath)}.`);
    return parsed;
  } finally {
    await file.close();
  }
}

async function writeJson(filePath: string, data: object, exclusive = false): Promise<void> {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const tempPath = path.join(directory, `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  const file = await fs.open(tempPath, 'wx', 0o600);
  try {
    try {
      await file.chmod(0o600);
      await file.writeFile(JSON.stringify(data, null, 2), 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    if (exclusive) await fs.link(tempPath, filePath);
    else await fs.rename(tempPath, filePath);

    const directoryHandle = await fs.open(directory, 'r');
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } finally {
    await fs.unlink(tempPath).catch((error: unknown) => {
      if (!hasCode(error, 'ENOENT')) throw error;
    });
  }
}

function normalizeSettings(raw: unknown): Settings {
  const settings = asObject(raw) ?? {};
  return {
    autoSaveDelay: typeof settings.autoSaveDelay === 'number' ? settings.autoSaveDelay : DEFAULT_SETTINGS.autoSaveDelay,
    fontSize: typeof settings.fontSize === 'number' ? settings.fontSize : DEFAULT_SETTINGS.fontSize,
    noteTemplate: typeof settings.noteTemplate === 'string' && settings.noteTemplate.trim().length > 0
      ? settings.noteTemplate : DEFAULT_SETTINGS.noteTemplate,
    darkMode: settings.darkMode === 'light' || settings.darkMode === 'dark' || settings.darkMode === 'auto'
      ? settings.darkMode : DEFAULT_SETTINGS.darkMode,
    lineHeight: typeof settings.lineHeight === 'number' ? settings.lineHeight : DEFAULT_SETTINGS.lineHeight,
    hideMarkdownMarkup: typeof settings.hideMarkdownMarkup === 'boolean'
      ? settings.hideMarkdownMarkup : DEFAULT_SETTINGS.hideMarkdownMarkup,
  };
}

async function readSettingsAt(filePath: string): Promise<Settings> {
  try {
    return normalizeSettings((await readJson(filePath))?.settings);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function readSettings(): Promise<Settings> {
  return readSettingsAt(getSettingsPath());
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const settingsPath = getSettingsPath();
  const settings = normalizeSettings({ ...await readSettingsAt(settingsPath), ...patch });
  await writeJson(settingsPath, { settings });
  return settings;
}

function isPasswordHash(value: unknown): value is string {
  return typeof value === 'string' && /^\$2[ab]\$(0[4-9]|[12]\d|3[01])\$[./A-Za-z0-9]{53}$/.test(value);
}

async function readPasswordHashAt(authPath: string): Promise<string> {
  const auth = await readJson(authPath, true);
  if (!auth) return '';
  if (!isPasswordHash(auth.passwordHash)) throw new Error('Invalid password hash in auth.json.');
  return auth.passwordHash;
}

export async function readPasswordHash(): Promise<string> {
  return readPasswordHashAt(await getAuthPath());
}

async function disableLegacyImport(authPath: string, requireNew = false): Promise<void> {
  // Retain an independent marker so loss of auth.json cannot reactivate legacy import.
  const marker = path.join(path.dirname(authPath), 'auth-migrated');
  try {
    await writeJson(marker, {}, true);
  } catch (error) {
    if (!hasCode(error, 'EEXIST')) throw error;
    if (requireNew) throw new Error('Legacy auth import is already disabled. Restore private auth or run setup.');
  }
}

export async function writePasswordHash(passwordHash: string): Promise<void> {
  if (!isPasswordHash(passwordHash)) throw new Error('Invalid password hash.');
  const authPath = await getAuthPath();
  await disableLegacyImport(authPath);
  await writeJson(authPath, { passwordHash });
}

/** Offline operator action. The running server never imports legacy authentication state. */
export async function migrateLegacyAuth(): Promise<void> {
  const authPath = await getAuthPath();
  const settingsPath = getSettingsPath();
  const existingHash = await readPasswordHashAt(authPath);
  const legacy = await readJson(settingsPath);
  if (existingHash) {
    await disableLegacyImport(authPath);
  } else {
    const passwordHash = legacy?.passwordHash;
    if (!isPasswordHash(passwordHash)) throw new Error('No valid legacy password hash found. Run setup to set a password.');
    await disableLegacyImport(authPath, true);
    await writeJson(authPath, { passwordHash }, true);
  }

  // Remove the synced hash only after private state is durable. Repeating cleanup is safe.
  if (legacy && Object.hasOwn(legacy, 'passwordHash')) {
    delete legacy.passwordHash;
    await writeJson(settingsPath, legacy);
  }
}
