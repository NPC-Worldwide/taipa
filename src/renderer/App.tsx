import React, { useState, useCallback } from 'react';
import Taipa from './components/Taipa';
import ProjectShell from './components/ProjectShell';
import TitleBar from './components/TitleBar';
import { getHomeDir } from './lib/utils';

type AppMode = 'taipa' | 'project';

export default function App() {
  const [mode, setMode] = useState<AppMode>('taipa');
  const [projectPath, setProjectPath] = useState<string>('');
  const [homeDir, setHomeDir] = useState<string>('');

  React.useEffect(() => {
    getHomeDir().then((dir) => setHomeDir(dir));
  }, []);

  const handleOpenProject = useCallback((path: string) => {
    setProjectPath(path);
    setMode('project');
  }, []);

  const handleBackTotaipa = useCallback(() => {
    setMode('taipa');
    setProjectPath('');
  }, []);

  if (!homeDir) {
    return (
      <div className="h-screen w-screen theme-bg-primary flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen theme-bg-primary overflow-hidden flex flex-col">
      <TitleBar />
      <div className="flex-1 min-h-0 flex">
        {mode === 'taipa' && (
          <Taipa
            currentPath={homeDir}
            onOpenDocument={() => {}}
            onOpenProject={handleOpenProject}
          />
        )}
        {mode === 'project' && (
          <div className="flex-1 flex flex-col">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b theme-border theme-bg-secondary shrink-0">
              <button
                onClick={handleBackTotaipa}
                className="text-xs theme-hover px-2 py-1 rounded flex items-center gap-1"
              >
                ← Back to Library
              </button>
              <span className="text-[10px] text-gray-500">|</span>
              <span className="text-xs text-gray-400 truncate">{projectPath}</span>
            </div>
            <div className="flex-1 min-h-0">
              <ProjectShell initialPath={projectPath} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
