import { app, BrowserWindow } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { ipcMain } from 'electron';
import axios from 'axios';
import { createMainWindow } from './handlers/window'
import { setupVideoRAGHandlers, stopVideoRAGService } from './handlers/videorag-handlers';
import { registerFileHandlers } from './handlers/file-handlers';
import { registerSettingsHandlers } from './handlers/settings';
import { registerChatSessionHandlers } from './handlers/chat-session-handlers';

// Fix for GPU process crash on Linux and some other systems
// See: https://github.com/electron/electron/issues/13936
app.disableHardwareAcceleration();

// Create window when app is ready
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.videorag.app');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Register all IPC handlers
  registerFileHandlers();
  registerSettingsHandlers();
  registerChatSessionHandlers();
  setupVideoRAGHandlers();
  registerModelHandlers();

  // VideoRAG API service is now started manually via UI button
  // Users can start it after configuring their environment
  console.log('VideoRAG API service will be started manually via UI');

  createMainWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

// Quit app when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Clean up VideoRAG service when app quits
app.on('before-quit', () => {
  stopVideoRAGService();
});

/**
 * Register model-related IPC handlers.
 * Model management is delegated to the backend: the frontend queries and
 * triggers downloads via the backend API rather than touching the local filesystem.
 */
function registerModelHandlers(): void {
  // Check model files by querying the backend /api/config endpoint.
  // The backend reports whether its own ImageBind model file exists.
  // No filesystem path needs to be passed from the frontend.
  ipcMain.handle('check-model-files', async () => {
    try {
      const response = await axios.get('http://localhost:64451/api/config', { timeout: 10000 });
      const data = response.data;
      return { imagebind: data?.imagebind_model_exists === true };
    } catch (error) {
      // Backend not reachable – report model as absent
      return { imagebind: false };
    }
  });

  // Trigger the backend to download the ImageBind model to its own storage.
  // The frontend no longer downloads the model itself; it delegates to the
  // backend which stores the file at its own IMAGEBIND_MODEL_PATH.
  // Callers should poll check-model-files to detect completion.
  ipcMain.handle('download-imagebind', async (event) => {
    try {
      const response = await axios.post(
        'http://localhost:64451/api/imagebind/download',
        {},
        { timeout: 30000 }
      );
      const data = response.data;
      if (data.success) {
        // Poll for completion and emit progress events so existing UI still works
        const poll = async () => {
          try {
            const cfg = await axios.get('http://localhost:64451/api/config', { timeout: 10000 });
            if (cfg.data?.imagebind_model_exists) {
              event.sender.send('download-progress', { type: 'imagebind', progress: 100 });
            } else {
              event.sender.send('download-progress', { type: 'imagebind', progress: 50 });
              setTimeout(poll, 3000);
            }
          } catch {
            setTimeout(poll, 5000);
          }
        };
        event.sender.send('download-progress', { type: 'imagebind', progress: 0 });
        setTimeout(poll, 3000);
        return { success: true, message: 'Download started on backend' };
      } else {
        return { success: false, error: data.error || 'Backend download failed' };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return { success: false, error: errorMessage };
    }
  });
}
