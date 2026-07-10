import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export interface IElectronAPI {
  readDirectory: (dirPath: string) => Promise<any>;
  ensureDir: (dirPath: string) => Promise<any>;
  getHomeDir: () => Promise<string>;
  showOpenDialog: (options: any) => Promise<any>;
  showSaveDialog: (options: any) => Promise<any>;
  readFileContent: (filePath: string) => Promise<any>;
  writeFileContent: (filePath: string, content: string) => Promise<any>;
  proxyFetch: (url: string, options?: any) => Promise<any>;
  compileLatex: (options: { projectPath: string; rootDocument: string; engine: string; outputDir: string; bibTool?: string }) => Promise<any>;
  windowControls: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
  };
  windowState: {
    isMaximized: () => Promise<boolean>;
  };
  onWindowStateChange: (callback: (state: { isMaximized: boolean }) => void) => () => void;
  gitStatus: (cwd: string) => Promise<any>;
  gitStage: (params: { repoRoot: string; filePath: string }) => Promise<any>;
  gitUnstage: (params: { repoRoot: string; filePath: string }) => Promise<any>;
  gitDiscard: (params: { repoRoot: string; filePath: string }) => Promise<any>;
  gitCommit: (params: { repoRoot: string; message: string }) => Promise<any>;
  gitPush: (params: { repoRoot: string }) => Promise<any>;
  gitPull: (params: { repoRoot: string }) => Promise<any>;
}

contextBridge.exposeInMainWorld('api', {
  readDirectory: (dirPath: string) => ipcRenderer.invoke('readDirectory', dirPath),
  ensureDir: (dirPath: string) => ipcRenderer.invoke('ensureDirectory', dirPath),
  getHomeDir: () => ipcRenderer.invoke('getHomeDir'),
  showOpenDialog: (options: any) => ipcRenderer.invoke('show-open-dialog', options),
  showSaveDialog: (options: any) => ipcRenderer.invoke('show-save-dialog', options),
  readFileContent: (filePath: string) => ipcRenderer.invoke('read-file-content', filePath),
  writeFileContent: (filePath: string, content: string) => ipcRenderer.invoke('write-file-content', filePath, content),
  proxyFetch: (url: string, options?: any) => ipcRenderer.invoke('proxy-fetch', url, options),
  compileLatex: (options: any) => ipcRenderer.invoke('compile-latex', options),
  windowControls: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
  },
  windowState: {
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  },
  onWindowStateChange: (callback: (state: { isMaximized: boolean }) => void) => {
    const handler = (_event: IpcRendererEvent, state: { isMaximized: boolean }) => callback(state);
    ipcRenderer.on('window-state-changed', handler);
    return () => ipcRenderer.removeListener('window-state-changed', handler);
  },
  gitStatus: (cwd: string) => ipcRenderer.invoke('git-status', cwd),
  gitStage: (params: any) => ipcRenderer.invoke('git-stage', params),
  gitUnstage: (params: any) => ipcRenderer.invoke('git-unstage', params),
  gitDiscard: (params: any) => ipcRenderer.invoke('git-discard', params),
  gitCommit: (params: any) => ipcRenderer.invoke('git-commit', params),
  gitPush: (params: any) => ipcRenderer.invoke('git-push', params),
  gitPull: (params: any) => ipcRenderer.invoke('git-pull', params),
} as IElectronAPI);

declare global {
  interface Window {
    api: IElectronAPI;
  }
}

export {};
