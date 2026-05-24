import React, { useCallback } from 'react';
import { OpenFile, ProjectManifest } from '../../types/project';
import { NovelEditor, ScreenplayEditor, PoetryEditor, JournalEditor, MangaEditor } from 'npcts';

interface EditorSwitcherProps {
  file: OpenFile | null;
  projectManifest: ProjectManifest | null;
  onContentChange: (content: string) => void;
  onSave?: () => void;
}

/**
 * Build a WritingChapter shape for npcts fiction editors.
 */
function toWritingChapter(file: OpenFile) {
  return {
    id: file.path,
    title: file.relativePath,
    content: file.content,
    number: 1,
    wordCount: file.content?.trim().split(/\s+/).filter(Boolean).length || 0,
    status: 'draft' as const,
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const EditorSwitcher: React.FC<EditorSwitcherProps> = ({
  file,
  projectManifest,
  onContentChange,
  onSave,
}) => {
  const handleContentChange = useCallback(
    (content: string) => onContentChange(content),
    [onContentChange]
  );

  if (!file) {
    return (
      <div className="h-full w-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <p className="text-sm mb-2">Select a file to edit</p>
          <p className="text-xs text-gray-600">Open a project from the sidebar</p>
        </div>
      </div>
    );
  }

  const chapter = toWritingChapter(file);

  switch (file.editorType) {
    case 'novel':
      return (
        <div className="h-full w-full overflow-auto p-4">
          <NovelEditor
            chapter={chapter}
            onContentChange={handleContentChange}
            wordGoal={projectManifest?.wordGoal || 0}
          />
        </div>
      );

    case 'screenplay':
      return (
        <div className="h-full w-full overflow-auto p-4">
          <ScreenplayEditor chapter={chapter} onContentChange={handleContentChange} />
        </div>
      );

    case 'poetry':
      return (
        <div className="h-full w-full overflow-auto p-4">
          <PoetryEditor chapter={chapter} onContentChange={handleContentChange} />
        </div>
      );

    case 'journal':
      return (
        <div className="h-full w-full overflow-auto p-4">
          <JournalEditor
            chapter={chapter}
            onContentChange={handleContentChange}
            onUpdateChapter={() => {}}
          />
        </div>
      );

    case 'manga':
      return (
        <div className="h-full w-full overflow-auto p-4">
          <MangaEditor chapter={chapter} onUpdateChapter={() => {}} />
        </div>
      );

    case 'pdf':
      return (
        <div className="h-full w-full flex items-center justify-center text-gray-500">
          <p className="text-sm">PDF preview not yet implemented</p>
        </div>
      );

    case 'docx':
      return (
        <div className="h-full w-full flex items-center justify-center text-gray-500">
          <p className="text-sm">DOCX files are editable as plain text via conversion</p>
        </div>
      );

    case 'code':
    default:
      // Simple textarea editor for now — CodeEditor from npcts can be swapped in later
      return (
        <div className="h-full w-full flex flex-col">
          <div className="flex items-center justify-between px-3 py-1.5 border-b theme-border theme-bg-secondary">
            <span className="text-xs text-gray-500">{file.relativePath}</span>
            {file.isDirty && (
              <span className="text-[10px] text-yellow-500">● unsaved</span>
            )}
          </div>
          <textarea
            value={file.content}
            onChange={(e) => handleContentChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                onSave?.();
              }
            }}
            className="flex-1 w-full p-4 bg-transparent resize-none outline-none font-mono text-sm leading-relaxed"
            spellCheck={false}
            style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace' }}
          />
        </div>
      );
  }
};

export default EditorSwitcher;
