import { ProjectManifest, ProjectType, EditorType, ManifestChapter, MANIFEST_VERSION } from '../types/project';

/**
 * Locate .tex files either at the root or inside an immediate subdirectory
 * (e.g. "latex/"). Returns the tex filenames and a path prefix relative to root.
 */
async function findLatexRoot(
  rootPath: string,
  fileList: { name: string; isDirectory: boolean }[]
): Promise<{ texFiles: string[]; prefix: string; bibFiles: string[] } | null> {
  const rootTex = fileList
    .filter(f => !f.isDirectory && f.name.endsWith('.tex'))
    .map(f => f.name);
  const rootBib = fileList
    .filter(f => !f.isDirectory && f.name.endsWith('.bib'))
    .map(f => f.name);

  if (rootTex.length > 0) {
    return { texFiles: rootTex, prefix: '', bibFiles: rootBib };
  }

  // Search immediate subdirectories for a LaTeX layout
  const subdirs = fileList.filter(f => f.isDirectory && !f.name.startsWith('.') && f.name !== 'node_modules');
  // Prefer a directory literally named "latex" if it contains tex
  const latexDir = subdirs.find(d => d.name.toLowerCase() === 'latex');
  const orderedDirs = latexDir ? [latexDir, ...subdirs.filter(d => d !== latexDir)] : subdirs;

  for (const dir of orderedDirs) {
    try {
      const subItems = await window.api?.readDirectory?.(`${rootPath}/${dir.name}`);
      if (!subItems || !Array.isArray(subItems)) continue;
      const subTex = subItems
        .filter((f: any) => !f.isDirectory && f.name.endsWith('.tex'))
        .map((f: any) => f.name);
      const subBib = subItems
        .filter((f: any) => !f.isDirectory && f.name.endsWith('.bib'))
        .map((f: any) => f.name);
      if (subTex.length > 0) {
        return { texFiles: subTex, prefix: `${dir.name}/`, bibFiles: subBib };
      }
    } catch { /* ignore */ }
  }

  return null;
}

/**
 * Detect project type and build manifest from a directory listing.
 */
export async function detectProject(
  rootPath: string,
  fileList: { name: string; isDirectory: boolean }[]
): Promise<{ type: ProjectType; manifest: Partial<ProjectManifest> } | null> {
  const latexRoot = await findLatexRoot(rootPath, fileList);

  if (latexRoot) {
    const { texFiles, prefix, bibFiles } = latexRoot;

    const mainTex = texFiles.find(n =>
      n.toLowerCase() === 'main.tex' ||
      n.toLowerCase().includes('main')
    ) || texFiles[0];
    const rootDocument = `${prefix}${mainTex}`;

    // Try to read the root tex to find chapters
    let chapters: ManifestChapter[] = [];
    try {
      const content = await window.api?.readFileContent?.(`${rootPath}/${rootDocument}`);
      if (content?.content) {
        chapters = parseLatexInputs(content.content, prefix);
      }
    } catch { /* ignore */ }

    // Fallback: just list all .tex files
    if (chapters.length === 0) {
      chapters = texFiles
        .filter(n => n !== mainTex)
        .map((n, i) => ({
          id: `ch-${i}`,
          title: n.replace(/\.tex$/, '').replace(/_/g, ' '),
          file: `${prefix}${n}`,
          order: i,
        }));
    }

    return {
      type: 'latex_book',
      manifest: {
        version: MANIFEST_VERSION,
        type: 'latex_book',
        name: rootPath.split('/').pop() || 'Untitled',
        rootDocument,
        chapters: [
          { id: 'root', title: 'Main Document', file: rootDocument, order: -1 },
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
  const names = fileList.map(f => f.name);
  const mdFiles = names.filter(n => n.endsWith('.md') || n.endsWith('.txt'));
  if (mdFiles.length > 0) {
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
 * `prefix` is a subdirectory like "latex/" when the root document lives there.
 */
function parseLatexInputs(
  texContent: string,
  prefix: string
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
      file: `${prefix}${filePath}`,
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
