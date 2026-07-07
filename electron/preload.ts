import { contextBridge, ipcRenderer } from 'electron';

const api = {
  updateBounds: (bounds: { x: number; y: number; w: number; h: number }): void =>
    ipcRenderer.send('pet:updateBounds', bounds),
  setForceInteractive: (force: boolean): void =>
    ipcRenderer.send('pet:setForceInteractive', force),
  setDragMode: (drag: boolean): void =>
    ipcRenderer.send('pet:setDragMode', drag),
  quit: (): Promise<void> => ipcRenderer.invoke('pet:quit'),
  hideWindow: (): void => ipcRenderer.send('pet:hide'),
  getWorkArea: (): Promise<{ x: number; y: number; width: number; height: number }> =>
    ipcRenderer.invoke('pet:getWorkArea'),
  onDebug: (cb: (msg: string) => void): (() => void) => {
    const listener = (_e: unknown, msg: string) => cb(msg);
    ipcRenderer.on('debug', listener);
    return () => ipcRenderer.removeListener('debug', listener);
  },
  onToggleDebug: (cb: () => void): (() => void) => {
    const listener = () => cb();
    ipcRenderer.on('ui:toggleDebug', listener);
    return () => ipcRenderer.removeListener('ui:toggleDebug', listener);
  },
  onDragCursor: (cb: (pos: { x: number; y: number }) => void): (() => void) => {
    const listener = (_e: unknown, pos: { x: number; y: number }) => cb(pos);
    ipcRenderer.on('drag:cursor', listener);
    return () => ipcRenderer.removeListener('drag:cursor', listener);
  },
};

contextBridge.exposeInMainWorld('pet', api);

export type PetApi = typeof api;
