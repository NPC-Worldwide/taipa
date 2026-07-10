import React, { useState, useEffect } from 'react';
import { useProject } from '../hooks/useProject';
import EditorSwitcher from './editors/EditorSwitcher';
import PdfViewer from './editors/PdfViewer';
import LatexActionBar from './LatexActionBar';
import GitPanel from './GitPanel';
import BookReader from './BookReader';
import WholeBookEditor from './WholeBookEditor';
import {
  FolderOpen, ChevronRight, ChevronDown, FileText,
  Save, RefreshCw, BookOpen, PenTool, Folder, Hash,
  Columns, BookText, FileEdit
} from 'lucide-react';

interface FileTreeNodeProps {
  node: {
    name: string;
    path: string;
    relativePath: string;
    extension: string;
    isDirectory: boolean;
    children?: FileTreeNodeProps['node'][];
  };
  level: number;
  activePath: string | null;
  onSelect: (relativePath: string) => void;
  projectType: string;
}

const FileTreeNode: React.FC<FileTreeNodeProps> = ({ node, level, activePath, onSelect, projectType }) => {
  const [expanded, setExpanded] = useState(true);

  const isActive = activePath === node.path;
  const indent = level * 12;

  if (node.isDirectory) {
    return (
      <div>
        <div
          className={`flex items-center gap-1 py-0.5 pr-2 cursor-pointer text-xs ${
            isActive ? 'bg-indigo-600/20 text-indigo-300' : 'theme-text-secondary hover:theme-bg-secondary'
          }`}
          style={{ paddingLeft: `${indent + 4}px` }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown size={12} className="shrink-0" /> : <ChevronRight size={12} className="shrink-0" />}
          <Folder size={12} className="shrink-0 text-yellow-600" />
          <span className="truncate">{node.name}</span>
        </div>
        {expanded && node.children?.map(child => (
          <FileTreeNode key={child.path} node={child} level={level + 1} activePath={activePath} onSelect={onSelect} projectType={projectType} />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-1.5 py-0.5 pr-2 cursor-pointer text-xs ${
        isActive ? 'bg-indigo-600/20 text-indigo-300' : 'theme-text-secondary hover:theme-bg-secondary'
      }`}
      style={{ paddingLeft: `${indent + 20}px` }}
      onClick={() => onSelect(node.relativePath)}
    >
      <FileText size={10} className="shrink-0 text-gray-500" />
      <span className="truncate">{node.name}</span>
    </div>
  );
};

interface ChapterTreeProps {
  project: {
    manifest: { chapters: { id: string; title: string; file: string; order: number }[] };
    activeChapterId?: string;
  } | null;
  onSelectChapter: (filePath: string) => void;
}

const ChapterTree: React.FC<ChapterTreeProps> = ({ project, onSelectChapter }) => {
  if (!project || project.manifest.chapters.length === 0) return null;

  return (
    <div className="mb-2">
      <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
        Chapters
      </div>
      {project.manifest.chapters.map(ch => (
        <div
          key={ch.id}
          className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer text-xs ${
            project.activeChapterId === ch.id ? 'bg-indigo-600/20 text-indigo-300' : 'theme-text-secondary hover:theme-bg-secondary'
          }`}
          onClick={() => onSelectChapter(ch.file)}
        >
          <Hash size={10} className="shrink-0 text-gray-500" />
          <span className="truncate">{ch.title}</span>
        </div>
      ))}
    </div>
  );
};

interface ProjectShellProps {
  initialPath?: string;
}

const ProjectShell: React.FC<ProjectShellProps> = ({ initialPath }) => {
  const {
    project,
    openFiles,
    activeFile,
    activeFilePath,
    loading,
    openProject,
    openFile,
    closeFile,
    updateFileContent,
    saveFile,
    saveAll,
    refreshFileTree,
    readProjectFile,
  } = useProject();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [previewPdfPath, setPreviewPdfPath] = useState<string | null>(null);
  const [splitView, setSplitView] = useState(true);
  const [viewMode, setViewMode] = useState<'edit' | 'book'>('edit');
  const [isGitRepo, setIsGitRepo] = useState(false);

  React.useEffect(() => {
    if (initialPath && !project) {
      openProject(initialPath);
    }
  }, [initialPath, project, openProject]);

  // Detect whether this project is inside a Git repo.
  useEffect(() => {
    if (!project) {
      setIsGitRepo(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await window.api?.gitStatus?.(project.path);
        if (!cancelled) setIsGitRepo(result?.isRepo ?? false);
      } catch {
        if (!cancelled) setIsGitRepo(false);
      }
    })();
    return () => { cancelled = true; };
  }, [project?.path]);

  const handleOpenProject = async () => {
    const result = await window.api?.showOpenDialog?.({
      properties: ['openDirectory'],
      title: 'Open Writing Project',
    });
    if (result?.filePaths?.[0]) {
      openProject(result.filePaths[0]);
    }
  };

  const handleSelectFile = (relativePath: string) => {
    setViewMode('edit');
    openFile(relativePath);
  };

  const handleContentChange = (content: string) => {
    if (activeFilePath) {
      updateFileContent(activeFilePath, content);
    }
  };

  const handleSave = () => {
    if (activeFilePath) {
      saveFile(activeFilePath);
    }
  };

  const hasUnsavedChanges = openFiles.some(f => f.isDirty);

  if (!project) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-gray-500">
        <BookOpen size={48} className="opacity-30 mb-4" />
        <p className="text-sm mb-4">No project open</p>
        <button
          onClick={handleOpenProject}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-sm flex items-center gap-2"
        >
          <FolderOpen size={14} />
          Open Project Folder
        </button>
        {loading && <p className="text-xs mt-4">Loading...</p>}
      </div>
    );
  }

  return (
    <div className="h-full w-full flex min-h-0">
      {/* Sidebar */}
      {sidebarOpen && (
        <div className="w-64 flex flex-col border-r theme-border theme-bg-secondary shrink-0">
          {/* Project header */}
          <div className="flex items-center gap-2 p-2 border-b theme-border">
            <BookOpen size={14} className="text-indigo-400 shrink-0" />
            <span className="text-xs font-medium truncate flex-1">{project.name}</span>
            <button onClick={handleOpenProject} className="p-1 theme-hover rounded" title="Open different project">
              <FolderOpen size={12} />
            </button>
            <button onClick={refreshFileTree} className="p-1 theme-hover rounded" title="Refresh">
              <RefreshCw size={12} />
            </button>
          </div>

          {/* Chapter tree (for structured projects) */}
          {project.manifest.chapters.length > 0 && (
            <div className="border-b theme-border pb-2">
              <ChapterTree
                project={{
                  manifest: project.manifest,
                  activeChapterId: activeFile?.relativePath,
                }}
                onSelectChapter={handleSelectFile}
              />
            </div>
          )}

          {/* File tree */}
          <div className="flex-1 overflow-auto py-1">
            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              Files
            </div>
            {project.fileTree.map(node => (
              <FileTreeNode
                key={node.path}
                node={node}
                level={0}
                activePath={activeFilePath}
                onSelect={handleSelectFile}
                projectType={project.manifest.type}
              />
            ))}
          </div>

          {/* Git panel */}
          {isGitRepo && (
            <div className="border-t theme-border flex-1 min-h-0 flex flex-col">
              <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                Source
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <GitPanel projectPath={project.path} />
              </div>
            </div>
          )}

          {/* Save status */}
          <div className="p-2 border-t theme-border text-[10px] text-gray-500 flex items-center justify-between shrink-0">
            <span>{openFiles.filter(f => f.isDirty).length} unsaved</span>
            {openFiles.some(f => f.isDirty) && (
              <button onClick={saveAll} className="p-1 theme-hover rounded" title="Save all">
                <Save size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main editor area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Tab bar */}
        <div className="flex items-center border-b theme-border theme-bg-secondary shrink-0 overflow-x-auto">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 theme-hover shrink-0"
            title="Toggle sidebar"
          >
            {sidebarOpen ? <ChevronDown size={14} className="rotate-90" /> : <ChevronRight size={14} className="rotate-90" />}
          </button>

          {openFiles.map(file => (
            <div
              key={file.path}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs cursor-pointer border-r theme-border shrink-0 ${
                activeFilePath === file.path
                  ? 'theme-bg-primary border-b-2 border-b-indigo-500'
                  : 'theme-bg-secondary opacity-70 hover:opacity-100'
              }`}
              onClick={() => openFile(file.relativePath)}
            >
              <FileText size={10} />
              <span>{file.relativePath.split('/').pop()}</span>
              {file.isDirty && <span className="text-yellow-500">●</span>}
              <button
                onClick={(e) => { e.stopPropagation(); closeFile(file.path); }}
                className="ml-1 p-0.5 hover:text-red-400 rounded"
              >
                ×
              </button>
            </div>
          ))}

          {openFiles.length === 0 && viewMode === 'edit' && (
            <span className="px-3 py-2 text-xs text-gray-500">No files open</span>
          )}

          {project.manifest.type === 'latex_book' && (
            <div className="flex items-center gap-0.5 ml-2 mr-auto border-l theme-border pl-2">
              <button
                onClick={() => setViewMode('edit')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] ${
                  viewMode === 'edit' ? 'bg-indigo-600/20 text-indigo-300' : 'theme-hover text-gray-500'
                }`}
                title="Edit individual files"
              >
                <FileEdit size={12} />
                Edit
              </button>
              <button
                onClick={() => setViewMode('book')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] ${
                  viewMode === 'book' ? 'bg-indigo-600/20 text-indigo-300' : 'theme-hover text-gray-500'
                }`}
                title="Read and search the whole book"
              >
                <BookText size={12} />
                Book
              </button>
            </div>
          )}

          {previewPdfPath && (
            <button
              onClick={() => setSplitView(v => !v)}
              className={`ml-auto mr-2 p-1.5 rounded theme-hover ${splitView ? 'text-indigo-400' : 'text-gray-500'}`}
              title={splitView ? 'Hide PDF preview' : 'Show PDF preview'}
            >
              <Columns size={14} />
            </button>
          )}
        </div>

        {/* LaTeX compile bar */}
        {project.manifest.type === 'latex_book' && project.manifest.compile && (
          <LatexActionBar
            projectPath={project.path}
            rootDocument={project.manifest.rootDocument || 'main.tex'}
            engine={project.manifest.compile.engine}
            outputDir={project.manifest.compile.outputDir}
            bibTool={project.manifest.compile.bibTool}
            hasUnsavedChanges={hasUnsavedChanges}
            onSaveAll={saveAll}
            onCompileComplete={(result) => {
              if (result.pdfPath) {
                setPreviewPdfPath(result.pdfPath);
                setSplitView(true);
              }
            }}
          />
        )}

        {/* Editor + optional PDF side-by-side */}
        <div className={`flex-1 min-h-0 overflow-hidden ${splitView && previewPdfPath ? 'flex' : ''}`}>
          <div className={`${splitView && previewPdfPath ? 'w-1/2 border-r theme-border' : 'h-full'} min-h-0 overflow-hidden`}>
            {viewMode === 'book' ? (
              <BookReader
                projectPath={project.path}
                manifest={project.manifest}
                readProjectFile={readProjectFile}
                onSelectChapter={handleSelectFile}
              />
            ) : project.manifest.type === 'latex_book' ? (
              <WholeBookEditor
                projectPath={project.path}
                manifest={project.manifest}
                readProjectFile={readProjectFile}
                focusRelativePath={activeFile?.relativePath}
              />
            ) : (
              <EditorSwitcher
                file={activeFile}
                projectManifest={project.manifest}
                onContentChange={handleContentChange}
                onSave={handleSave}
              />
            )}
          </div>
          {splitView && previewPdfPath && (
            <div className="w-1/2 min-h-0 overflow-hidden">
              <PdfViewer filePath={previewPdfPath} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectShell;
