import { ipcMain } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Settings file stores only user-selected model preferences.
// System-level config (API keys, base URLs, storage paths) is managed
// exclusively by the backend via environment variables.
const SETTINGS_FILE = join(homedir(), '.videorag-settings.json');

/**
 * Register all settings-related IPC handlers
 */
export function registerSettingsHandlers(): void {
  // Save settings handler — persists model selections chosen by the user.
  ipcMain.handle('save-settings', async (_, settings: any) => {
    try {
      await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  });

  // Load settings handler
  ipcMain.handle('load-settings', async () => {
    try {
      let settings: any = {
        processingModel: '',
        analysisModel: '',
        captionModel: '',
        asrModel: '',
      };

      try {
        const content = await readFile(SETTINGS_FILE, 'utf-8');
        const saved = JSON.parse(content);
        settings = { ...settings, ...saved };
      } catch {
        // File doesn't exist yet — use defaults
      }

      return { success: true, settings };
    } catch (error) {
      return {
        success: true,
        settings: {
          processingModel: '',
          analysisModel: '',
          captionModel: '',
          asrModel: '',
        },
      };
    }
  });

  // Test API Key handler
  ipcMain.handle('test-api-key', async (_, apiKey: string) => {
    try {
      if (!apiKey || !apiKey.startsWith('sk-')) {
        return { success: false, error: 'Invalid API key format' };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
} 