import React, { useState } from 'react';
import { CompileResult } from '../types/project';
import { Play, FileText, AlertCircle, CheckCircle } from 'lucide-react';

interface LatexActionBarProps {
  projectPath: string;
  rootDocument: string;
  engine: string;
  outputDir: string;
  bibTool?: string;
  onCompileComplete?: (result: CompileResult) => void;
}

const LatexActionBar: React.FC<LatexActionBarProps> = ({
  projectPath,
  rootDocument,
  engine,
  outputDir,
  bibTool,
  onCompileComplete,
}) => {
  const [compiling, setCompiling] = useState(false);
  const [lastResult, setLastResult] = useState<CompileResult | null>(null);
  const [showLog, setShowLog] = useState(false);

  const handleCompile = async () => {
    setCompiling(true);
    setLastResult(null);
    try {
      const result = await window.api?.compileLatex?.({
        projectPath,
        rootDocument,
        engine,
        outputDir,
        bibTool,
      });
      const compileResult: CompileResult = {
        success: result?.success ?? false,
        pdfPath: result?.pdfPath,
        log: result?.log || '',
        exitCode: result?.exitCode ?? 1,
      };
      setLastResult(compileResult);
      onCompileComplete?.(compileResult);
    } catch (e) {
      setLastResult({
        success: false,
        log: String(e),
        exitCode: 1,
      });
    } finally {
      setCompiling(false);
    }
  };

  return (
    <div className="border-b theme-border theme-bg-secondary">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">LaTeX</span>
        <button
          onClick={handleCompile}
          disabled={compiling}
          className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded text-xs"
        >
          <Play size={10} />
          {compiling ? 'Compiling...' : 'Compile'}
        </button>
        <button
          onClick={() => setShowLog(!showLog)}
          className="flex items-center gap-1 px-2 py-1 theme-bg-tertiary theme-hover rounded text-xs"
        >
          <FileText size={10} />
          Log
        </button>
        {lastResult && (
          <div className="flex items-center gap-1 text-xs">
            {lastResult.success ? (
              <>
                <CheckCircle size={12} className="text-green-400" />
                <span className="text-green-400">Success</span>
                {lastResult.pdfPath && (
                  <span className="text-[10px] text-gray-500 truncate max-w-[200px]">{lastResult.pdfPath}</span>
                )}
              </>
            ) : (
              <>
                <AlertCircle size={12} className="text-red-400" />
                <span className="text-red-400">Failed</span>
              </>
            )}
          </div>
        )}
      </div>
      {showLog && lastResult && (
        <div className="px-3 py-2 border-t theme-border">
          <pre className="text-[10px] text-gray-400 font-mono whitespace-pre-wrap max-h-32 overflow-auto">
            {lastResult.log}
          </pre>
        </div>
      )}
    </div>
  );
};

export default LatexActionBar;
