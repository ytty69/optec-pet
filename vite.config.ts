import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';

// VS Code's integrated terminal sets ELECTRON_RUN_AS_NODE=1 because VS Code
// itself is an Electron app that hosts its extension processes as pure Node.
// Any child Electron we spawn from this terminal would inherit it and boot
// without the app runtime (no ipcMain, no BrowserWindow, etc). Strip it.
delete process.env.ELECTRON_RUN_AS_NODE;

export default defineConfig({
  // Use relative asset paths so the built index.html can load its assets when
  // Electron serves it from file:// in a packaged build.
  base: './',
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
      },
      preload: {
        input: 'electron/preload.ts',
      },
      renderer: {},
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
  clearScreen: false,
});
