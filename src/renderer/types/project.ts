// Unified project types for filesystem-backed writing studio

export type ProjectType =
  | 'latex_book'
  | 'fiction_novel'
  | 'fiction_story'
  | 'fiction_screenplay'
  | 'fiction_poetry'
  | 'fiction_journal'
  | 'fiction_manga'
  | 'plain_text'
  | 'mixed';

export type EditorType =
  | 'code'
  | 'novel'
  | 'screenplay'
  | 'poetry'
  | 'journal'
  | 'manga'
  | 'pdf'
  | 'docx';

export interface ProjectManifest {
  version: string;
  name: string;
  type: ProjectType;
  title?: string;
  author?: string;
  synopsis?: string;
  genre?: string;
  coverColor?: string;
  /** Absolute or relative path to root document (e.g. "latex/main.tex") */
  rootDocument?: string;
  /** Ordered list of chapters/files in the project */
  chapters: ManifestChapter[];
  /** Characters for fiction projects */
  characters?: ManifestCharacter[];
  /** LaTeX compilation config */
  compile?: {
    engine: 'pdflatex' | 'xelatex' | 'lualatex' | 'latexmk';
    outputDir: string;
    bibTool?: 'bibtex' | 'biber';
    runs?: number;
  };
  /** Editor overrides by file glob */
  editorOverrides?: Record<string, EditorType>;
  /** Word goal for fiction projects */
  wordGoal?: number;
  /** Project notes */
  notes?: string;
  /** When the manifest was created/updated */
  updatedAt: string;
}

export interface ManifestChapter {
  id: string;
  title: string;
  file: string;
  order: number;
  wordCount?: number;
  status?: 'draft' | 'revision' | 'final';
  notes?: string;
  /** Override editor for this specific file */
  editor?: EditorType;
}

export interface ManifestCharacter {
  id: string;
  name: string;
  description: string;
  role: 'protagonist' | 'antagonist' | 'supporting' | 'minor';
  notes?: string;
}

export interface FileNode {
  name: string;
  path: string;
  relativePath: string;
  extension: string;
  isDirectory: boolean;
  children?: FileNode[];
  size?: number;
  modified?: string;
}

export interface Project {
  path: string;
  name: string;
  manifest: ProjectManifest;
  fileTree: FileNode[];
  activeFilePath?: string;
  activeChapterId?: string;
  isDirty: boolean;
}

export interface OpenFile {
  path: string;
  relativePath: string;
  content: string;
  diskContent: string;
  isDirty: boolean;
  extension: string;
  editorType: EditorType;
  chapterId?: string;
}

export interface CompileResult {
  success: boolean;
  pdfPath?: string;
  log: string;
  exitCode: number;
}

export const MANIFEST_VERSION = '1.0.0';
export const MANIFEST_DIR = '.taipa';
export const MANIFEST_FILE = 'project.json';
