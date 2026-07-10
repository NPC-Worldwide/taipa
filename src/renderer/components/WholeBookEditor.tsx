import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ProjectManifest } from '../types/project';
import { FileText, Save, ChevronRight, ChevronDown, Search, X } from 'lucide-react';

interface WholeBookEditorProps {
  projectPath: string;
  manifest: ProjectManifest;
  readProjectFile: (relativePath: string) => Promise<string>;
  focusRelativePath?: string | null;
}

interface BookFile {
  relativePath: string;
  title: string;
  content: string;
  diskContent: string;
  isRoot: boolean;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countWords(text: string): number {
  if (!text) return 0;
  const cleaned = text
    .replace(/(^|[^\\])%.*$/gm, '$1')
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, ' ')
    .replace(/[{}\\]/g, ' ');
  return cleaned.trim().split(/\s+/).filter(Boolean).length;
}

const SAVE_DEBOUNCE_MS = 1200;

const WholeBookEditor: React.FC<WholeBookEditorProps> = ({
  projectPath,
  manifest,
  readProjectFile,
  focusRelativePath,
}) => {
  const [files, setFiles] = useState<BookFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const chapterFiles = useMemo(() => {
    const seen = new Set<string>();
    const list = manifest.chapters
      .filter(ch => ch.file.endsWith('.tex'))
      .map(ch => ({ relativePath: ch.file, title: ch.title, isRoot: ch.id === 'root' }));
    return list.filter(f => {
      if (seen.has(f.relativePath)) return false;
      seen.add(f.relativePath);
      return true;
    });
  }, [manifest.chapters]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const loaded: BookFile[] = [];
      for (const f of chapterFiles) {
        const content = await readProjectFile(f.relativePath);
        if (cancelled) return;
        loaded.push({
          relativePath: f.relativePath,
          title: f.title,
          content,
          diskContent: content,
          isRoot: f.isRoot,
        });
      }
      if (!cancelled) {
        setFiles(loaded);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [chapterFiles, readProjectFile]);

  // ── Search index across all chapters (collapsed ones included) ──
  const fileMeta = useMemo(() => {
    const q = query.trim();
    let start = 0;
    return files.map(f => {
      const escaped = escapeHtml(f.content);
      let count = 0;
      if (q) {
        try {
          const re = new RegExp(escapeRegex(escapeHtml(q)), 'gi');
          count = (escaped.match(re) || []).length;
        } catch { count = 0; }
      }
      const meta = { escaped, count, start };
      start += count;
      return meta;
    });
  }, [files, query]);

  const totalMatches = useMemo(
    () => fileMeta.reduce((s, m) => s + m.count, 0),
    [fileMeta]
  );

  useEffect(() => { setMatchIndex(0); }, [query]);

  // Keep matchIndex in range.
  useEffect(() => {
    if (totalMatches === 0) return;
    if (matchIndex >= totalMatches) setMatchIndex(0);
  }, [matchIndex, totalMatches]);

  // Highlight + scroll to the current match.
  useEffect(() => {
    document.querySelectorAll('.taipa-mark-current').forEach(el =>
      el.classList.remove('taipa-mark-current')
    );
    if (!query.trim() || totalMatches === 0) return;
    const el = document.querySelector(`mark[data-idx="${matchIndex}"]`);
    if (el) {
      el.classList.add('taipa-mark-current');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [matchIndex, query, totalMatches, files]);

  // Focus a section when a file is selected from the sidebar.
  useEffect(() => {
    if (!focusRelativePath || loading) return;
    setExpanded(prev => prev.has(focusRelativePath) ? prev : new Set(prev).add(focusRelativePath));
    const el = sectionRefs.current.get(focusRelativePath);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('ring-1', 'ring-indigo-500');
      setTimeout(() => el.classList.remove('ring-1', 'ring-indigo-500'), 1200);
    }
  }, [focusRelativePath, loading]);

  const dirtyCount = files.filter(f => f.content !== f.diskContent).length;

  const writeBack = useCallback(async (relativePath: string, content: string) => {
    setSaving(true);
    try {
      await window.api?.writeFileContent?.(`${projectPath}/${relativePath}`, content);
      setFiles(prev =>
        prev.map(f => (f.relativePath === relativePath ? { ...f, diskContent: content } : f))
      );
    } catch (e) {
      console.error('Failed to save', relativePath, e);
    } finally {
      setSaving(false);
    }
  }, [projectPath]);

  const scheduleSave = useCallback((relativePath: string, content: string) => {
    const existing = saveTimers.current.get(relativePath);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      writeBack(relativePath, content);
      saveTimers.current.delete(relativePath);
    }, SAVE_DEBOUNCE_MS);
    saveTimers.current.set(relativePath, timer);
  }, [writeBack]);

  const handleChange = useCallback((relativePath: string, content: string) => {
    setFiles(prev =>
      prev.map(f => (f.relativePath === relativePath ? { ...f, content } : f))
    );
    scheduleSave(relativePath, content);
  }, [scheduleSave]);

  const saveAllNow = useCallback(async () => {
    for (const [, timer] of saveTimers.current) clearTimeout(timer);
    saveTimers.current.clear();
    const dirty = files.filter(f => f.content !== f.diskContent);
    if (dirty.length === 0) return;
    setSaving(true);
    try {
      for (const f of dirty) await writeBack(f.relativePath, f.content);
    } finally {
      setSaving(false);
    }
  }, [files, writeBack]);

  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      for (const [, t] of timers) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const toggleExpand = useCallback((relativePath: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(relativePath)) next.delete(relativePath);
      else next.add(relativePath);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpanded(new Set(files.map(f => f.relativePath)));
  }, [files]);
  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  const stepMatch = useCallback((dir: 1 | -1) => {
    if (totalMatches === 0) return;
    setMatchIndex(i => ((i + dir) % totalMatches + totalMatches) % totalMatches);
  }, [totalMatches]);

  const isExpanded = useCallback((relativePath: string, idx: number) =>
    expanded.has(relativePath) || (query.trim() !== '' && fileMeta[idx]?.count > 0),
  [expanded, query, fileMeta]);

  // Build the highlighted backdrop HTML for a chapter.
  const renderBackdrop = (idx: number) => {
    const meta = fileMeta[idx];
    if (!meta) return '';
    const q = query.trim();
    if (!q || meta.count === 0) return meta.escaped;
    try {
      const re = new RegExp(escapeRegex(escapeHtml(q)), 'gi');
      let out = '';
      let last = 0;
      let localIdx = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(meta.escaped)) !== null) {
        out += meta.escaped.slice(last, m.index);
        out += `<mark class="taipa-mark" data-idx="${meta.start + localIdx}">${m[0]}</mark>`;
        localIdx++;
        last = m.index + m[0].length;
        if (m[0].length === 0) re.lastIndex++;
      }
      out += meta.escaped.slice(last);
      return out;
    } catch {
      return meta.escaped;
    }
  };

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center text-gray-500 text-sm">
        Loading book…
      </div>
    );
  }

  const totalWords = files.reduce((sum, f) => sum + countWords(f.content), 0);
  const q = query.trim();

  return (
    <div
      className="h-full w-full flex flex-col theme-bg-primary"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
          e.preventDefault();
          saveAllNow();
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
          e.preventDefault();
          const input = document.querySelector<HTMLInputElement>('.book-search-input');
          input?.focus();
          input?.select();
        }
      }}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b theme-border theme-bg-secondary shrink-0">
        <FileText size={14} className="text-indigo-400 shrink-0" />
        <span className="text-xs font-medium text-gray-300 truncate">
          {manifest.title || 'Book'} — {files.length} files
        </span>

        <div className="flex-1" />

        <div className="flex items-center gap-0.5 mr-1">
          <button onClick={expandAll} className="px-1.5 py-1 text-[10px] theme-hover rounded text-gray-400">
            Expand all
          </button>
          <button onClick={collapseAll} className="px-1.5 py-1 text-[10px] theme-hover rounded text-gray-400">
            Collapse all
          </button>
        </div>

        <div className="relative flex items-center">
          <Search size={12} className="absolute left-2 text-gray-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all chapters…  (⌘F)"
            className="book-search-input pl-7 pr-20 py-1.5 w-64 text-xs rounded theme-bg-tertiary border theme-border focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {q && (
            <div className="absolute right-1 flex items-center gap-0.5">
              <span className="text-[10px] text-gray-500 px-1">
                {totalMatches > 0 ? `${matchIndex + 1}/${totalMatches}` : '0/0'}
              </span>
              <button onClick={() => stepMatch(-1)} disabled={totalMatches === 0}
                className="p-0.5 rounded theme-hover disabled:opacity-30" title="Previous (⇧⌘G)">
                <ChevronDown size={12} className="rotate-90" />
              </button>
              <button onClick={() => stepMatch(1)} disabled={totalMatches === 0}
                className="p-0.5 rounded theme-hover disabled:opacity-30" title="Next (⌘G)">
                <ChevronRight size={12} />
              </button>
              <button onClick={() => setQuery('')} className="p-0.5 rounded theme-hover">
                <X size={12} />
              </button>
            </div>
          )}
        </div>

        {dirtyCount > 0 && (
          <span className="text-[10px] text-yellow-500 flex items-center gap-1 ml-1">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
            {dirtyCount}
          </span>
        )}
        <button
          onClick={saveAllNow}
          disabled={dirtyCount === 0 && !saving}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40"
          title="Save all (⌘S)"
        >
          <Save size={11} className={saving ? 'animate-spin' : ''} />
          Save
        </button>
      </div>

      {/* Chapter accordion */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-3xl mx-auto py-4">
          {files.map((file, index) => {
            const isOpen = isExpanded(file.relativePath, index);
            const isDirty = file.content !== file.diskContent;
            const words = countWords(file.content);
            const meta = fileMeta[index];
            const matchCount = meta?.count || 0;

            return (
              <div
                key={file.relativePath}
                ref={(el) => {
                  if (el) sectionRefs.current.set(file.relativePath, el);
                }}
                className="mb-2 rounded-lg theme-bg-secondary border theme-border overflow-hidden transition-shadow"
              >
                {/* Header / collapse toggle */}
                <div
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:theme-bg-tertiary select-none"
                  onClick={() => toggleExpand(file.relativePath)}
                >
                  {isOpen ? <ChevronDown size={13} className="text-gray-400 shrink-0" /> : <ChevronRight size={13} className="text-gray-400 shrink-0" />}
                  <span className="text-[10px] uppercase tracking-wider text-indigo-400 font-semibold">
                    {file.isRoot ? 'Main' : `Chapter ${index}`}
                  </span>
                  <span className="text-xs font-medium text-gray-200 truncate flex-1">{file.title}</span>
                  {q && matchCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                      {matchCount} match{matchCount !== 1 ? 'es' : ''}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-500">{words.toLocaleString()} w</span>
                  {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" title="Unsaved" />}
                </div>

                {/* Editor with highlight overlay */}
                {isOpen && (
                  <div className="book-edit-overlay relative border-t theme-border">
                    <pre
                      className="book-edit-backdrop m-0 p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words text-gray-200 pointer-events-none"
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{ __html: renderBackdrop(index) }}
                    />
                    <textarea
                      value={file.content}
                      onChange={(e) => handleChange(file.relativePath, e.target.value)}
                      spellCheck={false}
                      className="book-edit-textarea absolute inset-0 w-full h-full p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words bg-transparent outline-none resize-none"
                    />
                  </div>
                )}
              </div>
            );
          })}
          <div className="text-[10px] text-gray-600 text-center py-2">
            {totalWords.toLocaleString()} words total · {files.length} files
          </div>
        </div>
      </div>
    </div>
  );
};

export default WholeBookEditor;