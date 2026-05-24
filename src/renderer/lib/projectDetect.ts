import { ProjectManifest, ProjectType, EditorType, ManifestChapter, MANIFEST_VERSION } from '../types/project';

/**
 * Detect project type and build manifest from a directory listing.
 */
export async function detectProject(
  rootPath: string,
  fileList: { name: string; isDirectory: boolean }[]
): Promise<{ type: ProjectType; manifest: Partial<ProjectManifest> } | null> {
  const names = fileList.map(f => f.name);

  // 1. Check for LaTeX book
  const texFiles = names.filter(n => n.endsWith('.tex'));
  const bibFiles = names.filter(n => n.endsWith('.bib'));
  const hasLatex = texFiles.length > 0;

  if (hasLatex) {
    const mainTex = texFiles.find(n =>
      n.toLowerCase() === 'main.tex' ||
      n.toLowerCase().includes('main')
    ) || texFiles[0];

    // Try to read the root tex to find chapters
    let chapters: ManifestChapter[] = [];
    try {
      const content = await window.api?.readFileContent?.(`${rootPath}/${mainTex}`);
      if (content?.content) {
        chapters = parseLatexInputs(content.content, rootPath, mainTex);
      }
    } catch { /* ignore */ }

    // Fallback: just list all .tex files
    if (chapters.length === 0) {
      chapters = texFiles
        .filter(n => n !== mainTex)
        .map((n, i) => ({
          id: `ch-${i}`,
          title: n.replace(/\.tex$/, '').replace(/_/g, ' '),
          file: n,
          order: i,
        }));
    }

    return {
      type: 'latex_book',
      manifest: {
        version: MANIFEST_VERSION,
        type: 'latex_book',
        name: rootPath.split('/').pop() || 'Untitled',
        rootDocument: mainTex,
        chapters: [
          { id: 'root', title: 'Main Document', file: mainTex, order: -1 },
          ...chapters,
        ],
        compile: {
          engine: 'pdflatex',
          outputDir: 'build',
          bibTool: bibFiles.length > 0 ? 'bibtex' : undefined,
          runs: 2,
        },
        editorOverrides: { '*.tex': 'code', '*.bib': 'code' },
      },
    };
  }

  // 2. Check for markdown collection
  const mdFiles = names.filter(n => n.endsWith('.md') || n.endsWith('.txt'));
  if (mdFiles.length > 0 && !hasLatex) {
    return {
      type: 'plain_text',
      manifest: {
        version: MANIFEST_VERSION,
        type: 'plain_text',
        name: rootPath.split('/').pop() || 'Untitled',
        chapters: mdFiles.map((n, i) => ({
          id: `ch-${i}`,
          title: n.replace(/\.(md|txt)$/, '').replace(/_/g, ' '),
          file: n,
          order: i,
        })),
        editorOverrides: { '*.md': 'code', '*.txt': 'code' },
      },
    };
  }

  // 3. Mixed / unknown
  return {
    type: 'mixed',
    manifest: {
      version: MANIFEST_VERSION,
      type: 'mixed',
      name: rootPath.split('/').pop() || 'Untitled',
      chapters: names
        .filter(n => !n.startsWith('.') && !n.endsWith('.pdf') && !n.endsWith('.epub'))
        .map((n, i) => ({
          id: `ch-${i}`,
          title: n,
          file: n,
          order: i,
        })),
    },
  };
}

/**
 * Parse \input{} and \include{} commands from LaTeX source.
 */
function parseLatexInputs(
  texContent: string,
  rootPath: string,
  mainFile: string
): ManifestChapter[] {
  const chapters: ManifestChapter[] = [];
  // Match \input{filename} or \include{filename} (with or without .tex)
  const regex = /\\(?:input|include)\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  let order = 0;

  while ((match = regex.exec(texContent)) !== null) {
    const fileName = match[1];
    const filePath = fileName.endsWith('.tex') ? fileName : `${fileName}.tex`;
    chapters.push({
      id: `latex-${order}`,
      title: filePath.replace(/\.tex$/, '').replace(/_/g, ' '),
      file: filePath,
      order: order++,
    });
  }

  return chapters;
}

/**
 * Determine editor type for a file based on extension and overrides.
 */
export function getEditorType(
  relativePath: string,
  projectType: ProjectType,
  overrides?: Record<string, EditorType>
): EditorType {
  const ext = relativePath.split('.').pop()?.toLowerCase() || '';

  // Check overrides first
  if (overrides) {
    for (const [pattern, editor] of Object.entries(overrides)) {
      if (matchGlob(relativePath, pattern)) return editor;
    }
  }

  // Default mappings
  if (ext === 'tex' || ext === 'bib' || ext === 'sty' || ext === 'cls') return 'code';
  if (ext === 'md' || ext === 'txt') return 'code';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';

  // Fiction-specific
  if (projectType === 'fiction_novel') return 'novel';
  if (projectType === 'fiction_screenplay') return 'screenplay';
  if (projectType === 'fiction_poetry') return 'poetry';
  if (projectType === 'fiction_journal') return 'journal';
  if (projectType === 'fiction_manga') return 'manga';

  return 'code';
}

function matchGlob(path: string, pattern: string): boolean {
  if (pattern === path) return true;
  if (pattern.startsWith('*.')) {
    const ext = pattern.slice(1);
    return path.endsWith(ext);
  }
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\./g, '\\.') + '$');
    return regex.test(path);
  }
  return false;
}
