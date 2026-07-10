import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const IS_DEV = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
const BACKEND_PORT = IS_DEV ? '7138' : '5138';
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

protocol.registerSchemesAsPrivileged([{
  scheme: 'media',
  privileges: { standard: true, supportFetchAPI: true, stream: true, secure: true, corsEnabled: true }
}]);

let backendProcess: ReturnType<typeof spawn> | null = null;
let mainWindow: BrowserWindow | null = null;

// Window control IPC handlers
ipcMain.on('window-minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('window-close', () => {
  mainWindow?.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow?.isMaximized() ?? false;
});

function killBackendProcess() {
  if (!backendProcess) return;
  console.log('[Main] Killing backend process');
  const pid = backendProcess.pid;
  if (!pid) {
    backendProcess = null;
    return;
  }
  if (process.platform === 'win32') {
    try { require('child_process').execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' }); } catch {}
  } else {
    try { process.kill(-pid, 'SIGTERM'); } catch {}
  }
  backendProcess = null;
}

function spawnBackendProcess(pythonPath: string, args: string[], env: Record<string, string>) {
  console.log(`[Main] Spawning backend: ${pythonPath} ${args.join(' ')}`);
  const proc = spawn(pythonPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
    env,
  });
  proc.stdout.on('data', (d) => console.log('[Backend stdout]', d.toString().trim()));
  proc.stderr.on('data', (d) => console.error('[Backend stderr]', d.toString().trim()));
  proc.on('error', (err) => console.error('[Backend error]', err.message));
  proc.on('close', (code) => console.log(`[Backend] exited with code ${code}`));
  return proc;
}

async function waitForServer(maxAttempts = 60, delay = 1000) {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${BACKEND_URL}/api/health`, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) { console.log(`[Main] Backend ready (attempt ${i})`); return true; }
    } catch {}
    await new Promise(r => setTimeout(r, delay));
  }
  console.error('[Main] Backend failed to start');
  return false;
}

function getPythonPath(): string | null {
  const candidates = [
    path.join(os.homedir(), '.npcsh', 'venv', 'bin', 'python3'),
    path.join(os.homedir(), '.npcsh', 'venv', 'Scripts', 'python.exe'),
    path.join(os.homedir(), '.venv', 'bin', 'python3'),
    path.join(os.homedir(), '.venv', 'Scripts', 'python.exe'),
  ];
  for (const p of candidates) { if (fs.existsSync(p)) return p; }
  try {
    const which = require('child_process').execSync('which python3 || which python', { encoding: 'utf8' }).trim();
    if (which) return which;
  } catch {}
  return null;
}

function getBackendPythonPath(): string | null {
  const rc = path.join(os.homedir(), '.npcshrc');
  try {
    if (fs.existsSync(rc)) {
      const content = fs.readFileSync(rc, 'utf8');
      const m = content.match(/BACKEND_PYTHON_PATH=["']?([^"'\n]+)["']?/);
      if (m?.[1]?.trim()) {
        const p = m[1].trim().replace(/^~/, os.homedir());
        if (fs.existsSync(p)) return p;
      }
    }
  } catch {}
  return getPythonPath();
}

async function startBackend() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${BACKEND_URL}/api/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) { console.log('[Main] Backend already running'); return true; }
  } catch {}

  const python = getBackendPythonPath();
  if (!python) {
    console.error('[Main] No Python found for backend');
    return false;
  }

  const backendEnv = {
    ...process.env,
    TAIPA_PORT: BACKEND_PORT,
    FRONTEND_PORT: IS_DEV ? '7338' : '6338',
    FLASK_DEBUG: IS_DEV ? '1' : '0',
    PYTHONUNBUFFERED: '1',
    PYTHONIOENCODING: 'utf-8',
    HOME: os.homedir(),
    NPCSH_BASE: path.join(os.homedir(), '.npcsh'),
  };

  const scriptPath = path.join(__dirname, '..', 'resources', 'taipa_serve.py');
  backendProcess = spawnBackendProcess(python, [scriptPath], backendEnv);
  return await waitForServer();
}

app.on('before-quit', () => killBackendProcess());

function createWindow() {
  const isMac = process.platform === 'darwin';
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac ? { trafficLightPosition: { x: 12, y: 8 } } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      webviewTag: true,
    },
  });
  mainWindow = win;

  // Track maximize state changes
  win.on('maximize', () => {
    win.webContents.send('window-state-changed', { isMaximized: true });
  });
  win.on('unmaximize', () => {
    win.webContents.send('window-state-changed', { isMaximized: false });
  });

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  if (IS_DEV) {
    win.loadURL('http://localhost:7338');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  await startBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers ---

ipcMain.handle('readDirectory', async (_, dirPath: string) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    return entries.map(e => ({
      name: e.name,
      path: path.join(dirPath, e.name),
      isDirectory: e.isDirectory(),
      size: e.isFile() ? (fs.statSync(path.join(dirPath, e.name)).size) : 0,
      modified: e.isFile() ? fs.statSync(path.join(dirPath, e.name)).mtime.toISOString() : '',
    }));
  } catch (e) {
    return { error: (e as Error).message };
  }
});

ipcMain.handle('ensureDirectory', async (_, dirPath: string) => {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true });
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
});

ipcMain.handle('getHomeDir', async () => os.homedir());

ipcMain.handle('show-open-dialog', async (_, options) => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return { canceled: true };
  const result = await dialog.showOpenDialog(win, options);
  return result;
});

ipcMain.handle('show-save-dialog', async (_, options) => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return { canceled: true };
  const result = await dialog.showSaveDialog(win, options);
  return result;
});

ipcMain.handle('read-file-content', async (_, filePath: string) => {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return { content };
  } catch (e) {
    return { error: (e as Error).message };
  }
});

ipcMain.handle('write-file-content', async (_, filePath: string, content: string) => {
  try {
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
});

ipcMain.handle('proxy-fetch', async (_event, url, options = {}) => {
  try {
    const resp = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body || undefined,
    });
    const contentType = resp.headers.get('content-type') || '';
    let data;
    if (contentType.includes('json')) {
      data = await resp.json();
    } else {
      data = await resp.text();
    }
    return { ok: resp.ok, status: resp.status, data };
  } catch (err) {
    return { ok: false, status: 0, error: (err as Error).message };
  }
});

// LaTeX compilation helper
function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv
): Promise<{ exitCode: number; log: string; success: boolean }> {
  return new Promise((resolve) => {
    let log = '';
    const proc = spawn(command, args, { cwd, env: env || process.env });
    proc.stdout?.on('data', (d: Buffer) => { log += d.toString(); });
    proc.stderr?.on('data', (d: Buffer) => { log += d.toString(); });
    proc.on('error', (err) => {
      resolve({ exitCode: 1, log: `Failed to start ${command}: ${err.message}`, success: false });
    });
    proc.on('close', (code) => {
      resolve({ exitCode: code ?? 1, log, success: code === 0 });
    });
  });
}

function findEngine(engine: string): string | null {
  const candidates = [engine];
  if (process.platform === 'darwin') {
    // Common Mac TeX Live path
    candidates.push(`/Library/TeX/texbin/${engine}`);
  }
  for (const c of candidates) {
    try {
      execSync(`which ${c}`, { stdio: 'ignore' });
      return c;
    } catch {}
  }
  return null;
}

ipcMain.handle('compile-latex', async (_event, options) => {
  const {
    projectPath,
    rootDocument,
    engine = 'pdflatex',
    outputDir = 'build',
    bibTool,
    runs = 2,
  } = options || {};

  if (!projectPath || !rootDocument) {
    return { success: false, log: 'Missing projectPath or rootDocument', exitCode: 1 };
  }

  const rootDocPath = path.resolve(projectPath, rootDocument);
  const workDir = path.dirname(rootDocPath);
  const rootDocName = path.basename(rootDocPath);
  const outDir = path.isAbsolute(outputDir) ? outputDir : path.resolve(workDir, outputDir);

  try {
    await fs.promises.mkdir(outDir, { recursive: true });
  } catch (err) {
    return { success: false, log: `Could not create output dir: ${(err as Error).message}`, exitCode: 1 };
  }

  const engineBin = findEngine(engine);
  if (!engineBin) {
    return { success: false, log: `LaTeX engine not found: ${engine}. Install TeX Live or MacTeX.`, exitCode: 1 };
  }

  let combinedLog = `Compiling ${rootDocument} with ${engine}...\n`;
  let lastExitCode = 0;
  let success = false;

  const latexRuns = Math.max(1, Math.min(runs || 2, 4));

  for (let i = 0; i < latexRuns; i++) {
    combinedLog += `\n--- Pass ${i + 1}/${latexRuns} ---\n`;

    if (i === 1 && bibTool) {
      combinedLog += `\n--- Running ${bibTool} ---\n`;
      const baseName = rootDocName.replace(/\.tex$/i, '');
      let bibResult;
      if (bibTool === 'biber') {
        bibResult = await runCommand('biber', ['--output-directory', outDir, baseName], workDir);
      } else {
        // bibtex expects the .aux to be reachable; with -output-directory the aux lives in outDir
        bibResult = await runCommand('bibtex', [baseName], outDir);
      }
      combinedLog += bibResult.log;
      if (!bibResult.success) {
        combinedLog += `\n${bibTool} failed, continuing...\n`;
      }
    }

    let result;
    if (engine === 'latexmk') {
      result = await runCommand(engineBin, [
        '-pdf',
        '-interaction=nonstopmode',
        `-output-directory=${outDir}`,
        rootDocName,
      ], workDir);
    } else {
      result = await runCommand(engineBin, [
        '-interaction=nonstopmode',
        `-output-directory=${outDir}`,
        rootDocName,
      ], workDir);
    }

    combinedLog += result.log;
    lastExitCode = result.exitCode;
    success = result.success;
    if (!success) break;
  }

  // Append the generated .log file if it exists
  const logFile = path.join(outDir, rootDocName.replace(/\.tex$/i, '.log'));
  try {
    if (fs.existsSync(logFile)) {
      combinedLog += '\n--- Generated log file ---\n' + fs.readFileSync(logFile, 'utf-8');
    }
  } catch {}

  const pdfName = rootDocName.replace(/\.tex$/i, '.pdf');
  const pdfPath = path.join(outDir, pdfName);
  const pdfExists = fs.existsSync(pdfPath);

  return {
    success: success && pdfExists,
    pdfPath: pdfExists ? pdfPath : undefined,
    log: combinedLog,
    exitCode: lastExitCode,
  };
});

// ── Git helpers ──────────────────────────────────────────────

interface GitStatusFile {
  path: string;
  status: string;
  staged: boolean;
}

interface GitStatusResult {
  isRepo: boolean;
  repoRoot?: string;
  branch?: string;
  ahead?: number;
  behind?: number;
  modified: GitStatusFile[];
  error?: string;
}

function runGit(cwd: string, args: string[]): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    let output = '';
    let errorOutput = '';
    const proc = spawn('git', args, { cwd, env: process.env });
    proc.stdout?.on('data', (d: Buffer) => { output += d.toString(); });
    proc.stderr?.on('data', (d: Buffer) => { errorOutput += d.toString(); });
    proc.on('error', (err) => {
      resolve({ success: false, output: '', error: `Failed to run git: ${err.message}` });
    });
    proc.on('close', (code) => {
      resolve({ success: code === 0, output, error: errorOutput || undefined });
    });
  });
}

async function getGitRepoRoot(cwd: string): Promise<string | null> {
  const result = await runGit(cwd, ['rev-parse', '--show-toplevel']);
  if (!result.success) return null;
  return result.output.trim();
}

ipcMain.handle('git-status', async (_event, cwd: string): Promise<GitStatusResult> => {
  const repoRoot = await getGitRepoRoot(cwd);
  if (!repoRoot) {
    return { isRepo: false, modified: [] };
  }

  const result = await runGit(repoRoot, ['status', '--porcelain=v1', '-b']);
  if (!result.success) {
    return { isRepo: true, repoRoot, modified: [], error: result.error };
  }

  const lines = result.output.split('\n').filter(Boolean);
  let branch = 'HEAD';
  let ahead = 0;
  let behind = 0;
  const modified: GitStatusFile[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      const header = line.slice(3);
      // Format examples:
      //   main...origin/main [ahead 2, behind 1]
      //   main
      const branchMatch = header.match(/^([^\.\s]+)(?:\.\.\.)?/);
      if (branchMatch) branch = branchMatch[1];
      const aheadMatch = header.match(/ahead\s+(\d+)/);
      const behindMatch = header.match(/behind\s+(\d+)/);
      if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
      if (behindMatch) behind = parseInt(behindMatch[1], 10);
      continue;
    }

    // Two-character status code + optional " original -> renamed "
    const indexStatus = line[0];
    const workTreeStatus = line[1];
    const rest = line.slice(3);

    // Handle rename: "R  original -> renamed"
    const path = rest.includes(' -> ') ? rest.split(' -> ')[1] : rest;

    const statusCode = indexStatus !== ' ' ? indexStatus : workTreeStatus;
    const staged = indexStatus !== ' ' && indexStatus !== '?';

    const statusMap: Record<string, string> = {
      M: 'modified',
      A: 'added',
      D: 'deleted',
      R: 'renamed',
      C: 'copied',
      U: 'updated',
      '?': 'untracked',
      '!': 'ignored',
    };

    modified.push({
      path,
      status: statusMap[statusCode] || statusCode,
      staged,
    });
  }

  return { isRepo: true, repoRoot, branch, ahead, behind, modified };
});

ipcMain.handle('git-stage', async (_event, { repoRoot, filePath }: { repoRoot: string; filePath: string }) => {
  const result = await runGit(repoRoot, ['add', filePath]);
  return { success: result.success, error: result.error };
});

ipcMain.handle('git-unstage', async (_event, { repoRoot, filePath }: { repoRoot: string; filePath: string }) => {
  const result = await runGit(repoRoot, ['reset', 'HEAD', filePath]);
  return { success: result.success, error: result.error };
});

ipcMain.handle('git-discard', async (_event, { repoRoot, filePath }: { repoRoot: string; filePath: string }) => {
  const result = await runGit(repoRoot, ['checkout', '--', filePath]);
  return { success: result.success, error: result.error };
});

ipcMain.handle('git-commit', async (_event, { repoRoot, message }: { repoRoot: string; message: string }) => {
  if (!message.trim()) {
    return { success: false, error: 'Commit message cannot be empty' };
  }
  const result = await runGit(repoRoot, ['commit', '-m', message.trim()]);
  return { success: result.success, output: result.output, error: result.error };
});

ipcMain.handle('git-push', async (_event, { repoRoot }: { repoRoot: string }) => {
  const result = await runGit(repoRoot, ['push']);
  return { success: result.success, output: result.output, error: result.error };
});

ipcMain.handle('git-pull', async (_event, { repoRoot }: { repoRoot: string }) => {
  const result = await runGit(repoRoot, ['pull', '--ff-only']);
  return { success: result.success, output: result.output, error: result.error };
});

