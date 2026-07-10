import React, { useState, useEffect, useMemo } from 'react';
import { ProjectManifest, ManifestChapter } from '../types/project';

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

const INPUT_REGEX = /\\\\(?:input|include)\{([^}]+)\}/g;

function resolveChapterPath(
  rootDocument: string,
  rawReference: string
): string {
  const rootDir = rootDocument.includes('/')
    ? rootDocument.slice(0, rootDocument.lastIndexOf('/') + 1)
    : '';
  const withExt = rawReference.endsWith('.tex') ? rawReference : `${rawReference}.tex`;
  return `${rootDir}${withExt}`;
}

const BookReader: React.FC<BookReaderProps> = ({
  projectPath,
  manifest,
  readProjectFile,
  onSelectChapter,
}) => {
  const [segments, setSegments] = useState<BookSegment[]>([]);
  const [loading, setLoading] = useState(true);

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
        title: 'Main Document',
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
        setSegments(built);
        setLoading(false);
      }
    };

    buildBook();
    return () => { cancelled = true; };
  }, [projectPath, rootDocument, readProjectFile, chaptersByPath]);

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center text-gray-500 text-sm">
        Assembling book...
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-[#0b1120]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b theme-border theme-bg-secondary shrink-0">
        <span className="text-xs font-medium text-gray-300">Book view</span>
        <span className="text-[10px] text-gray-500">
          {segments.filter(s => s.type === 'chapter' || s.type === 'root').length} segments
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4">
        <div className="max-w-3xl mx-auto">
          {segments.map((segment, index) => {
            const isMissing = segment.type === 'missing';
            const chapterLabel = index === 0
              ? 'Root'
              : segment.title || `Chapter ${index}`;

            return (
              <div
                key={`${segment.relativePath}-${index}`}
                className="mb-6"
              >
                <div
                  className="flex items-center gap-2 mb-2 cursor-pointer group"
                  onClick={() => !isMissing && onSelectChapter(segment.relativePath)}
                >
                  <span className="text-[10px] uppercase tracking-wider text-indigo-400 font-semibold group-hover:text-indigo-300">
                    {chapterLabel}
                  </span>
                  <span className="text-[10px] text-gray-600 group-hover:text-gray-500 truncate flex-1">
                    {segment.relativePath}
                  </span>
                  {!isMissing && (
                    <span className="text-[10px] text-gray-600 opacity-0 group-hover:opacity-100">
                      Open →
                    </span>
                  )}
                </div>

                {isMissing ? (
                  <div className="p-3 rounded border border-dashed theme-border text-xs text-gray-500">
                    Missing file: {segment.relativePath}
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-gray-300 p-4 rounded theme-bg-secondary overflow-x-auto">
                    {segment.content}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BookReader;
