import { useState, useCallback, useEffect } from 'react';
import {
  Project,
  ProjectManifest,
  FileNode,
  OpenFile,
  EditorType,
} from '../types/project';
import { readManifest, writeManifest } from '../lib/manifest';
import { detectProject, getEditorType } from '../lib/projectDetect';

async function buildFileTree(dirPath: string): Promise<FileNode[]> {
  const items = await window.api?.readDirectory?.(dirPath);
  if (!items || !Array.isArray(items)) return [];

  const nodes: FileNode[] = [];
  for (const item of items) {
    const node: FileNode = {
      name: item.name,
      path: item.path,
      relativePath: item.path.replace(dirPath + '/', ''),
      extension: item.name.split('.').pop()?.toLowerCase() || '',
      isDirectory: item.isDirectory,
      size: item.size || 0,
      modified: item.modified || '',
    };

    if (item.isDirectory && !item.name.startsWith('.') && item.name !== 'node_modules') {
      node.children = await buildFileTree(item.path);
    }

    nodes.push(node);
  }

  // Sort: directories first, then alphabetically
  return nodes.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
}

export function useProject() {
  const [project, setProject] = useState<Project | null>(null);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const openProject = useCallback(async (rootPath: string) => {
    setLoading(true);
    try {
      // Try to read existing manifest
      let manifest = await readManifest(rootPath);

      // If no manifest, detect from directory
      if (!manifest) {
        const items = await window.api?.readDirectory?.(rootPath);
        if (!items) {
          setLoading(false);
          return;
        }
        const detected = await detectProject(rootPath, items);
        if (detected) {
          manifest = detected.manifest as ProjectManifest;
          await writeManifest(rootPath, manifest);
        }
      }

      if (!manifest) {
        setLoading(false);
        return;
      }

      const fileTree = await buildFileTree(rootPath);

      setProject({
        path: rootPath,
        name: manifest.name || rootPath.split('/').pop() || 'Untitled',
        manifest,
        fileTree,
        isDirty: false,
      });

      setOpenFiles([]);
      setActiveFilePath(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const openFile = useCallback(async (relativePath: string) => {
    if (!project) return;

    const fullPath = `${project.path}/${relativePath}`;

    // Check if already open
    const existing = openFiles.find(f => f.path === fullPath);
    if (existing) {
      setActiveFilePath(fullPath);
      return;
    }

    try {
      const result = await window.api?.readFileContent?.(fullPath);
      const content = result?.content || '';
      const ext = relativePath.split('.').pop()?.toLowerCase() || '';
      const editorType = getEditorType(relativePath, project.manifest.type, project.manifest.editorOverrides);

      const openFile: OpenFile = {
        path: fullPath,
        relativePath,
        content,
        diskContent: content,
        isDirty: false,
        extension: ext,
        editorType,
      };

      setOpenFiles(prev => [...prev, openFile]);
      setActiveFilePath(fullPath);
    } catch (e) {
      console.error('Failed to open file:', e);
    }
  }, [project, openFiles]);

  const closeFile = useCallback((filePath: string) => {
    setOpenFiles(prev => {
      const filtered = prev.filter(f => f.path !== filePath);
      if (activeFilePath === filePath) {
        setActiveFilePath(filtered[filtered.length - 1]?.path || null);
      }
      return filtered;
    });
  }, [activeFilePath]);

  const updateFileContent = useCallback((filePath: string, newContent: string) => {
    setOpenFiles(prev =>
      prev.map(f =>
        f.path === filePath
          ? { ...f, content: newContent, isDirty: newContent !== f.diskContent }
          : f
      )
    );
  }, []);

  const saveFile = useCallback(async (filePath: string) => {
    const file = openFiles.find(f => f.path === filePath);
    if (!file || !file.isDirty) return;

    try {
      await window.api?.writeFileContent?.(filePath, file.content);
      setOpenFiles(prev =>
        prev.map(f =>
          f.path === filePath ? { ...f, diskContent: file.content, isDirty: false } : f
        )
      );
    } catch (e) {
      console.error('Failed to save file:', e);
    }
  }, [openFiles]);

  const saveAll = useCallback(async () => {
    for (const file of openFiles.filter(f => f.isDirty)) {
      await saveFile(file.path);
    }
  }, [openFiles, saveFile]);

  const refreshFileTree = useCallback(async () => {
    if (!project) return;
    const fileTree = await buildFileTree(project.path);
    setProject(prev => prev ? { ...prev, fileTree } : null);
  }, [project?.path]);

  const activeFile = openFiles.find(f => f.path === activeFilePath) || null;

  return {
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
  };
}
