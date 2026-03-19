import { app, BrowserWindow } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { join } from 'node:path';
import dotenv from 'dotenv';
import { createMainWindow } from './handlers/window'
import { setupVideoRAGHandlers, stopVideoRAGService } from './handlers/videorag-handlers';
import { registerFileHandlers } from './handlers/file-handlers';
import { registerSettingsHandlers } from './handlers/settings';
import { registerChatSessionHandlers } from './handlers/chat-session-handlers';

// Load .env file before reading any environment variables.
// In production the .env lives next to the bundled resources; in development
// it lives at the project root (process.cwd() when electron-vite dev runs).
dotenv.config({
  path: app.isPackaged
    ? join(process.resourcesPath, '.env')
    : join(process.cwd(), '.env'),
});

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
