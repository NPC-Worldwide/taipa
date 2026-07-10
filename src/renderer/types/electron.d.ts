export interface IElectronAPI {
  readDirectory: (dirPath: string) => Promise<any>;
  ensureDir: (dirPath: string) => Promise<any>;
  getHomeDir: () => Promise<string>;
  showOpenDialog: (options: any) => Promise<any>;
  showSaveDialog: (options: any) => Promise<any>;
  readFileContent: (filePath: string) => Promise<any>;
  writeFileContent: (filePath: string, content: string) => Promise<any>;
  proxyFetch: (url: string, options?: any) => Promise<any>;
  compileLatex: (options: {
    projectPath: string;
    rootDocument: string;
    engine: string;
    outputDir: string;
    bibTool?: string;
  }) => Promise<any>;
  windowControls: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
  };
  windowState: {
    isMaximized: () => Promise<boolean>;
  };
  onWindowStateChange: (callback: (state: { isMaximized: boolean }) => void) => () => void;
}

declare global {
  interface Window {
    api: IElectronAPI;
  }
}

export {};
