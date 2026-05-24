import React from 'react';
import { OpenFile, ProjectManifest } from '../../types/project';

interface EditorSwitcherProps {
  file: OpenFile | null;
  projectManifest: ProjectManifest;
  onContentChange: (content: string) => void;
  onSave: () => void;
}

const EditorSwitcher: React.FC<EditorSwitcherProps> = ({ file, onContentChange, onSave }) => {
  if (!file) {
    return (
      <div className="h-full w-full flex items-center justify-center text-gray-500">
        <p>Select a file to edit</p>
      </div>
    );
  }

  if (file.editorType === 'pdf') {
    return (
      <div className="h-full w-full flex items-center justify-center text-gray-500">
        <p>PDF viewer not implemented yet</p>
      </div>
    );
  }

  if (file.editorType === 'docx') {
    return (
      <div className="h-full w-full flex items-center justify-center text-gray-500">
        <p>DOCX viewer not implemented yet</p>
      </div>
    );
  }

  // Default: plain text / code editor
  return (
    <div className="h-full w-full flex flex-col">
      <textarea
        value={file.content}
        onChange={(e) => onContentChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            onSave();
          }
        }}
        className="flex-1 w-full bg-transparent p-4 font-mono text-sm outline-none resize-none"
        spellCheck={false}
      />
    </div>
  );
};

export default EditorSwitcher;
