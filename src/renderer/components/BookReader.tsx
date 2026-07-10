import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ProjectManifest, ManifestChapter } from '../types/project';
import { Search, FileText, ChevronLeft, ChevronRight, X, BookOpen } from 'lucide-react';

interface BookReaderProps {
  projectPath: string;
  manifest: ProjectManifest;
  readProjectFile: (relativePath: string) => Promise<string>;
  onSelectChapter: (relativePath: string) => void;
}

interface BookSegment {
  type: 'root' | 'chapter' | 'missing';
  relativePath: string;
  title: string;
  content: string;
}

interface ProcessedSegment extends BookSegment {
  html: string;
  plainText: string;
  wordCount: number;
}

const INPUT_REGEX = /\\(?:input|include)\{([^}]+)\}/g;

function resolveChapterPath(rootDocument: string, rawReference: string): string {
  const rootDir = rootDocument.includes('/')
    ? rootDocument.slice(0, rootDocument.lastIndexOf('/') + 1)
    : '';
  const withExt = rawReference.endsWith('.tex') ? rawReference : `${rawReference}.tex`;
  return `${rootDir}${withExt}`;
}

// ─── LaTeX → readable HTML converter ───

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function stripComments(source: string): string {
  return source.replace(/(^|[^\\])%.*$/gm, '$1');
}

function extractTitlePage(source: string): { title?: string; author?: string; body: string } {
  const titlepageMatch = source.match(/\\begin\{titlepage\}([\s\S]*?)\\end\{titlepage\}/);
  if (!titlepageMatch) return { body: source };

  const inner = titlepageMatch[1];
  const title = inner.match(/\\(?:Huge|huge|LARGE|Large|large)\s*\{?\\bfseries\s*([^}]+)\}?/)?.[1]
    || inner.match(/\\Huge\s*([^\n]+)/)?.[1];
  const author = inner.match(/\\Large\s*([^\n]+)/)?.[1];

  return {
    title: title?.replace(/\\[a-zA-Z]+\*?\{?\}?/g, '').trim(),
    author: author?.replace(/\\[a-zA-Z]+\*?\{?\}?/g, '').trim(),
    body: source.replace(titlepageMatch[0], ''),
  };
}

function convertToHtml(source: string): { html: string; plainText: string; wordCount: number } {
  let text = stripComments(source);

  // Drop preamble and document environment wrappers.
  text = text.replace(/[\s\S]*?\\begin\{document\}/, '');
  text = text.replace(/\\end\{document\}[\s\S]*$/, '');

  // Extract title page info and remove the environment.
  const { title, author, body } = extractTitlePage(text);
  text = body;

  // Escaped characters.
  text = text.replace(/\\%/g, '&#37;');
  text = text.replace(/\\&/g, '&amp;');
  text = text.replace(/\\#/g, '#');
  text = text.replace(/\\\$/g, '$');
  text = text.replace(/\\_/g, '_');
  text = text.replace(/\\textbackslash\{\}/g, '\\');
  text = text.replace(/\\dots/g, '…');
  text = text.replace(/\\ldots/g, '…');
  text = text.replace(/\\---/g, '—');
  text = text.replace(/\\--/g, '–');
  text = text.replace(/\\~/g, ' ');

  // Smart quotes.
  text = text.replace(/``([^']*?)''/g, '“$1”');
  text = text.replace(/`([^']*?)'/g, '‘$1’');

  // Scene breaks / separators.
  text = text.replace(/\n\s*\\?\*\s*\n/g, '\n\n* * *\n\n');

  // Block environments: itemize / enumerate.
  text = text.replace(
    /\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g,
    (_, inner) => {
      const items = inner
        .split(/\\item\s/)
        .filter(Boolean)
        .map((item: string) => `<li>${inlineFormat(item.trim())}</li>`)
        .join('');
      return `<ul class="list-disc pl-5 my-3 space-y-1">${items}</ul>`;
    }
  );
  text = text.replace(
    /\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g,
    (_, inner) => {
      const items = inner
        .split(/\\item\s/)
        .filter(Boolean)
        .map((item: string) => `<li>${inlineFormat(item.trim())}</li>`)
        .join('');
      return `<ol class="list-decimal pl-5 my-3 space-y-1">${items}</ol>`;
    }
  );

  // Chapter / section headings.
  text = text.replace(/\\chapter\*?\{([^}]+)\}/g, (_, t) => `<h1 class="book-chapter">${inlineFormat(t)}</h1>`);
  text = text.replace(/\\section\*?\{([^}]+)\}/g, (_, t) => `<h2 class="book-section">${inlineFormat(t)}</h2>`);
  text = text.replace(/\\subsection\*?\{([^}]+)\}/g, (_, t) => `<h3 class="book-subsection">${inlineFormat(t)}</h3>`);
  text = text.replace(/\\subsubsection\*?\{([^}]+)\}/g, (_, t) => `<h4 class="book-subsubsection">${inlineFormat(t)}</h4>`);

  // Remove common commands that don't render meaningfully in prose.
  text = text.replace(/\\label\{[^}]+\}/g, '');
  text = text.replace(/\\ref\{[^}]+\}/g, '');
  text = text.replace(/\\pageref\{[^}]+\}/g, '');
  text = text.replace(/\\cite(?:\[[^\]]*\])?\{[^}]+\}/g, '');
  text = text.replace(/\\index\{[^}]+\}/g, '');
  text = text.replace(/\\mainmatter/g, '');
  text = text.replace(/\\frontmatter/g, '');
  text = text.replace(/\\backmatter/g, '');
  text = text.replace(/\\maketitle/g, '');
  text = text.replace(/\\tableofcontents/g, '');
  text = text.replace(/\\clearpage/g, '\n');
  text = text.replace(/\\newpage/g, '\n');
  text = text.replace(/\\pagebreak\*?/g, '\n');
  text = text.replace(/\\vspace\*?\{[^}]+\}/g, '');
  text = text.replace(/\\hspace\*?\{[^}]+\}/g, ' ');
  text = text.replace(/\\vfill/g, '');
  text = text.replace(/\\hfill/g, '');
  text = text.replace(/\\centering/g, '');
  text = text.replace(/\\raggedright/g, '');
  text = text.replace(/\\par\b/g, '\n');
  text = text.replace(/\\noindent\b/g, '');
  text = text.replace(/\\indent\b/g, '');
  text = text.replace(/\\bigskip\b/g, '\n');
  text = text.replace(/\\medskip\b/g, '\n');
  text = text.replace(/\\smallskip\b/g, '\n');

  // Math: wrap inline/display as pretty code blocks, not raw source.
  text = text.replace(/\\\$([^$]+)\\\$/g, (_, m) => `<code class="math-inline">${escapeHtml(m)}</code>`);
  text = text.replace(/\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}/g, (_, m) => `<pre class="math-block">${escapeHtml(m)}</pre>`);
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `<pre class="math-block">${escapeHtml(m)}</pre>`);

  // Drop other environment wrappers entirely.
  text = text.replace(/\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\}/g, '');

  // Drop remaining standalone commands with arguments we can't render.
  text = text.replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{[^}]*\})?/g, '');

  // Line breaks inside paragraphs become spaces; explicit \\ becomes breaks.
  text = text.replace(/([^\n])\\\n/g, '$1 ');
  text = text.replace(/\\\s*\\/g, '</p><p>');
  text = text.replace(/\\newline/g, '<br/>');
  text = text.replace(/\\linebreak/g, '<br/>');

  // Build paragraphs.
  const paragraphs = text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${inlineFormat(p)}</p>`)
    .join('\n');

  const htmlParts: string[] = [];
  if (title) htmlParts.push(`<h1 class="book-title">${inlineFormat(title)}</h1>`);
  if (author) htmlParts.push(`<p class="book-author">by ${inlineFormat(author)}</p>`);
  htmlParts.push(paragraphs);

  const html = htmlParts.join('\n');
  const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = plainText.split(/\s+/).filter(Boolean).length;

  return { html, plainText, wordCount };
}

function inlineFormat(text: string): string {
  let s = escapeHtml(text);
  // Nested emphasis: handle simple nesting by repeated replacement (limited).
  for (let i = 0; i < 3; i++) {
    s = s.replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>');
    s = s.replace(/\\textit\{([^}]+)\}/g, '<em>$1</em>');
    s = s.replace(/\\emph\{([^}]+)\}/g, '<em>$1</em>');
    s = s.replace(/\\texttt\{([^}]+)\}/g, '<code>$1</code>');
    s = s.replace(/\\textsc\{([^}]+)\}/g, '<span class="small-caps">$1</span>');
    s = s.replace(/\\underline\{([^}]+)\}/g, '<u>$1</u>');
  }
  // Convert literal line breaks inside paragraph to <br/>.
  s = s.replace(/\n/g, '<br/>');
  return s;
}

const BookReader: React.FC<BookReaderProps> = ({
  projectPath,
  manifest,
  readProjectFile,
  onSelectChapter,
}) => {
  const [segments, setSegments] = useState<ProcessedSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const rootDocument = manifest.rootDocument || 'main.tex';

  const chaptersByPath = useMemo(() => {
    const map = new Map<string, ManifestChapter>();
    for (const ch of manifest.chapters) {
      map.set(ch.file, ch);
    }
    return map;
  }, [manifest.chapters]);

  useEffect(() => {
    let cancelled = false;

    const buildBook = async () => {
      setLoading(true);
      const rootContent = await readProjectFile(rootDocument);
      const built: BookSegment[] = [];

      built.push({
        type: 'root',
        relativePath: rootDocument,
        title: manifest.title || 'Main Document',
        content: rootContent,
      });

      let match: RegExpExecArray | null;
      while ((match = INPUT_REGEX.exec(rootContent)) !== null) {
        const rawReference = match[1];
        const chapterPath = resolveChapterPath(rootDocument, rawReference);
        const chapter = chaptersByPath.get(chapterPath);
        const chapterContent = await readProjectFile(chapterPath);

        if (chapterContent) {
          built.push({
            type: 'chapter',
            relativePath: chapterPath,
            title: chapter?.title || chapterPath.replace(/\.tex$/, '').replace(/_/g, ' '),
            content: chapterContent,
          });
        } else {
          built.push({
            type: 'missing',
            relativePath: chapterPath,
            title: chapter?.title || chapterPath,
            content: '',
          });
        }
      }

      if (!cancelled) {
        const processed = built.map(seg => {
          const converted = seg.type === 'missing'
            ? { html: '', plainText: '', wordCount: 0 }
            : convertToHtml(seg.content);
          return { ...seg, ...converted };
        });
        setSegments(processed);
        setLoading(false);
      }
    };

    buildBook();
    return () => { cancelled = true; };
  }, [projectPath, rootDocument, readProjectFile, chaptersByPath, manifest.title]);

  const filteredSegments = useMemo(() => {
    if (!query.trim()) return segments;
    const q = query.toLowerCase();
    return segments.filter(seg => seg.plainText.toLowerCase().includes(q));
  }, [segments, query]);

  const allMatches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const matches: { segmentIndex: number; segment: ProcessedSegment }[] = [];
    filteredSegments.forEach((seg, idx) => {
      if (seg.plainText.toLowerCase().includes(q)) {
        matches.push({ segmentIndex: idx, segment: seg });
      }
    });
    return matches;
  }, [filteredSegments, query]);

  const totalWords = useMemo(
    () => segments.reduce((sum, s) => sum + s.wordCount, 0),
    [segments]
  );

  const scrollToMatch = useCallback((idx: number) => {
    if (!contentRef.current) return;
    const safeIdx = ((idx % allMatches.length) + allMatches.length) % allMatches.length;
    setMatchIndex(safeIdx);

    const segmentRelativePath = allMatches[safeIdx].segment.relativePath;
    const el = contentRef.current.querySelector(`[data-segment="${CSS.escape(segmentRelativePath)}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [allMatches]);

  useEffect(() => {
    setMatchIndex(0);
  }, [query]);

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center text-gray-500 text-sm">
        Assembling book…
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col theme-bg-primary">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b theme-border theme-bg-secondary shrink-0">
        <BookOpen size={16} className="text-indigo-400 shrink-0" />
        <span className="text-xs font-medium text-gray-300 truncate">{manifest.title || 'Book view'}</span>

        <div className="flex-1" />

        <div className="flex items-center gap-1.5 min-w-0">
          <div className="relative flex items-center">
            <Search size={12} className="absolute left-2 text-gray-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search book…"
              className="pl-7 pr-16 py-1.5 w-56 text-xs rounded theme-bg-tertiary border theme-border focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {query && (
              <div className="absolute right-1 flex items-center gap-0.5">
                <span className="text-[10px] text-gray-500 px-1">
                  {allMatches.length > 0 ? `${matchIndex + 1}/${allMatches.length}` : '0/0'}
                </span>
                <button
                  onClick={() => allMatches.length > 0 && scrollToMatch(matchIndex - 1)}
                  disabled={allMatches.length === 0}
                  className="p-0.5 rounded theme-hover disabled:opacity-30"
                >
                  <ChevronLeft size={12} />
                </button>
                <button
                  onClick={() => allMatches.length > 0 && scrollToMatch(matchIndex + 1)}
                  disabled={allMatches.length === 0}
                  className="p-0.5 rounded theme-hover disabled:opacity-30"
                >
                  <ChevronRight size={12} />
                </button>
                <button onClick={() => setQuery('')} className="p-0.5 rounded theme-hover">
                  <X size={12} />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-3 text-[10px] text-gray-500 ml-2">
          <span>{segments.length} parts</span>
          <span>{totalWords.toLocaleString()} words</span>
        </div>
      </div>

      {/* Content */}
      <div ref={contentRef} className="flex-1 min-h-0 overflow-auto">
        <article className="max-w-2xl mx-auto py-8 px-6 sm:px-8 book-reader">
          {filteredSegments.length === 0 && query && (
            <div className="text-center text-gray-500 text-sm py-12">
              No matches for “{query}”
            </div>
          )}

          {filteredSegments.map((segment, index) => {
            const isMissing = segment.type === 'missing';
            const chapterNumber = index;

            return (
              <section
                key={`${segment.relativePath}-${index}`}
                data-segment={segment.relativePath}
                className="mb-10"
              >
                {!isMissing && segment.type === 'chapter' && (
                  <div className="flex items-center gap-2 mb-4 pb-2 border-b theme-border">
                    <FileText size={12} className="text-gray-500" />
                    <span className="text-[10px] uppercase tracking-wider text-indigo-400 font-semibold">
                      Chapter {chapterNumber}
                    </span>
                    <span className="text-[10px] text-gray-600">
                      {segment.wordCount.toLocaleString()} words
                    </span>
                    <button
                      onClick={() => onSelectChapter(segment.relativePath)}
                      className="ml-auto text-[10px] text-indigo-400 hover:text-indigo-300"
                    >
                      Edit →
                    </button>
                  </div>
                )}

                {isMissing ? (
                  <div className="p-4 rounded border border-dashed theme-border text-xs text-gray-500">
                    Missing file: {segment.relativePath}
                  </div>
                ) : (
                  <div
                    className="book-segment"
                    dangerouslySetInnerHTML={{ __html: segment.html }}
                  />
                )}
              </section>
            );
          })}
        </article>
      </div>
    </div>
  );
};

export default BookReader;
