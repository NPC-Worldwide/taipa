import React, { useState, useEffect, useCallback } from 'react';
import {
  GitBranch, Check, RotateCcw, ArrowUp, ArrowDown,
  AlertCircle, Loader2, FileText, Trash2
} from 'lucide-react';

interface GitStatusFile {
  path: string;
  status: string;
  staged: boolean;
}

interface GitStatus {
  isRepo: boolean;
  repoRoot?: string;
  branch?: string;
  ahead?: number;
  behind?: number;
  modified: GitStatusFile[];
  error?: string;
}

interface GitPanelProps {
  projectPath: string;
}

const statusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    modified: 'Modified',
    added: 'Added',
    deleted: 'Deleted',
    renamed: 'Renamed',
    copied: 'Copied',
    updated: 'Updated',
    untracked: 'Untracked',
    ignored: 'Ignored',
  };
  return labels[status] || status;
};

const statusColor = (status: string): string => {
  const colors: Record<string, string> = {
    modified: 'text-yellow-400',
    added: 'text-green-400',
    deleted: 'text-red-400',
    renamed: 'text-blue-400',
    copied: 'text-blue-400',
    updated: 'text-orange-400',
    untracked: 'text-gray-400',
  };
  return colors[status] || 'text-gray-400';
};

const GitPanel: React.FC<GitPanelProps> = ({ projectPath }) => {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [actionLog, setActionLog] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.api?.gitStatus?.(projectPath);
      setStatus(result || { isRepo: false, modified: [] });
    } catch (e) {
      setStatus({ isRepo: false, modified: [], error: String(e) });
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  if (!status) {
    return (
      <div className="p-3 text-xs text-gray-500 flex items-center gap-2">
        <Loader2 size={12} className="animate-spin" />
        Checking Git...
      </div>
    );
  }

  if (!status.isRepo) {
    return (
      <div className="p-3 text-xs text-gray-500">
        {status.error || 'Not a Git repository'}
      </div>
    );
  }

  const repoRoot = status.repoRoot || projectPath;

  const runAction = async (label: string, action: () => Promise<void>) => {
    setBusy(true);
    setActionLog(`${label}...`);
    try {
      await action();
      setActionLog(`${label} done`);
      await loadStatus();
    } catch (e) {
      setActionLog(`${label} failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleStage = (filePath: string) => runAction('Staging', async () => {
    const result = await window.api?.gitStage?.({ repoRoot, filePath });
    if (!result?.success) throw new Error(result?.error || 'Stage failed');
  });

  const handleUnstage = (filePath: string) => runAction('Unstaging', async () => {
    const result = await window.api?.gitUnstage?.({ repoRoot, filePath });
    if (!result?.success) throw new Error(result?.error || 'Unstage failed');
  });

  const handleDiscard = (filePath: string) => runAction('Discarding', async () => {
    const result = await window.api?.gitDiscard?.({ repoRoot, filePath });
    if (!result?.success) throw new Error(result?.error || 'Discard failed');
  });

  const handleCommit = () => runAction('Committing', async () => {
    const result = await window.api?.gitCommit?.({ repoRoot, message });
    if (!result?.success) throw new Error(result?.error || 'Commit failed');
    setMessage('');
  });

  const handlePush = () => runAction('Pushing', async () => {
    const result = await window.api?.gitPush?.({ repoRoot });
    if (!result?.success) throw new Error(result?.error || 'Push failed');
  });

  const handlePull = () => runAction('Pulling', async () => {
    const result = await window.api?.gitPull?.({ repoRoot });
    if (!result?.success) throw new Error(result?.error || 'Pull failed');
  });

  const staged = status.modified.filter(f => f.staged);
  const unstaged = status.modified.filter(f => !f.staged);
  const hasChanges = status.modified.length > 0;
  const canCommit = staged.length > 0 && message.trim();

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex items-center gap-2 px-3 py-2 border-b theme-border">
        <GitBranch size={14} className="text-indigo-400" />
        <span className="font-medium truncate">{status.branch || 'unknown'}</span>
        {status.ahead ? <span className="text-green-400 flex items-center gap-0.5"><ArrowUp size={10} />{status.ahead}</span> : null}
        {status.behind ? <span className="text-yellow-400 flex items-center gap-0.5"><ArrowDown size={10} />{status.behind}</span> : null}
        <button
          onClick={loadStatus}
          disabled={loading}
          className="ml-auto p-1 theme-hover rounded"
          title="Refresh"
        >
          <RotateCcw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-2 space-y-3">
        {unstaged.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1 px-1">
              Changes
            </div>
            {unstaged.map((f) => (
              <div key={f.path} className="flex items-center gap-1.5 py-0.5 px-1 rounded hover:theme-bg-secondary group">
                <button
                  onClick={() => handleStage(f.path)}
                  disabled={busy}
                  className="p-0.5 rounded theme-hover opacity-0 group-hover:opacity-100"
                  title="Stage"
                >
                  <Check size={10} />
                </button>
                <FileText size={10} className={`shrink-0 ${statusColor(f.status)}`} />
                <span className="flex-1 truncate">{f.path}</span>
                <span className={`text-[10px] shrink-0 ${statusColor(f.status)}`}>{statusLabel(f.status)}</span>
                {f.status === 'modified' && (
                  <button
                    onClick={() => handleDiscard(f.path)}
                    disabled={busy}
                    className="p-0.5 rounded theme-hover opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400"
                    title="Discard changes"
                  >
                    <Trash2 size={10} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {staged.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-green-500 font-semibold mb-1 px-1">
              Staged
            </div>
            {staged.map((f) => (
              <div key={f.path} className="flex items-center gap-1.5 py-0.5 px-1 rounded hover:theme-bg-secondary group">
                <button
                  onClick={() => handleUnstage(f.path)}
                  disabled={busy}
                  className="p-0.5 rounded theme-hover opacity-0 group-hover:opacity-100"
                  title="Unstage"
                >
                  <Check size={10} className="text-green-400" />
                </button>
                <FileText size={10} className={`shrink-0 ${statusColor(f.status)}`} />
                <span className="flex-1 truncate">{f.path}</span>
                <span className={`text-[10px] shrink-0 ${statusColor(f.status)}`}>{statusLabel(f.status)}</span>
              </div>
            ))}
          </div>
        )}

        {!hasChanges && !loading && (
          <div className="flex items-center gap-1.5 text-gray-500 px-1">
            <Check size={12} className="text-green-400" />
            Working tree clean
          </div>
        )}
      </div>

      <div className="p-2 border-t theme-border space-y-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Commit message..."
          className="w-full h-16 p-2 rounded theme-bg-tertiary border theme-border text-xs resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />

        <div className="flex items-center gap-2">
          <button
            onClick={handleCommit}
            disabled={busy || !canCommit}
            className="flex-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded text-xs font-medium"
          >
            Commit
          </button>
          <button
            onClick={handlePull}
            disabled={busy}
            className="p-1.5 theme-bg-tertiary theme-hover rounded"
            title="Pull"
          >
            <ArrowDown size={12} />
          </button>
          <button
            onClick={handlePush}
            disabled={busy}
            className="p-1.5 theme-bg-tertiary theme-hover rounded"
            title="Push"
          >
            <ArrowUp size={12} />
          </button>
        </div>

        {actionLog && (
          <div className="flex items-start gap-1.5 text-[10px] text-gray-400">
            <AlertCircle size={10} className="shrink-0 mt-0.5" />
            <span className="break-all">{actionLog}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default GitPanel;
