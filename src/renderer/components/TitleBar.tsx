import React, { useState, useEffect } from 'react';
import { Minus, Square, X, Maximize2 } from 'lucide-react';

const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(navigator.platform.startsWith('Mac'));

    // Check initial maximize state
    if (window.api?.windowState) {
      window.api.windowState.isMaximized().then(setIsMaximized);
    }

    // Listen for state changes
    const unsubscribe = window.api?.onWindowStateChange?.((state) => {
      setIsMaximized(state.isMaximized);
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  const handleMinimize = () => {
    window.api?.windowControls?.minimize?.();
  };

  const handleMaximize = () => {
    window.api?.windowControls?.maximize?.();
  };

  const handleClose = () => {
    window.api?.windowControls?.close?.();
  };

  // On macOS with native traffic lights, we only show the title bar area for dragging
  // but hide the custom buttons since macOS provides them
  if (isMac) {
    return (
      <div
        className="h-8 flex-shrink-0 flex items-center justify-center select-none"
        style={{ WebkitAppRegion: 'drag' as any }}
      >
        <span className="text-xs font-medium text-gray-400">Taipa</span>
      </div>
    );
  }

  return (
    <div
      className="h-9 flex-shrink-0 flex items-center justify-between theme-bg-secondary border-b theme-border select-none"
      style={{ WebkitAppRegion: 'drag' as any }}
    >
      {/* Left: app icon / title */}
      <div className="flex items-center gap-2 px-3" style={{ WebkitAppRegion: 'no-drag' as any }}>
        <div className="w-4 h-4 rounded-sm bg-blue-500 flex items-center justify-center">
          <span className="text-[8px] font-bold text-white">T</span>
        </div>
        <span className="text-xs font-medium text-gray-300">Taipa</span>
      </div>

      {/* Center: draggable area with title */}
      <div className="flex-1 flex items-center justify-center">
        <span className="text-xs text-gray-500">Taipa</span>
      </div>

      {/* Right: window controls */}
      <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' as any }}>
        <button
          onClick={handleMinimize}
          className="w-12 h-9 flex items-center justify-center text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors"
          title="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={handleMaximize}
          className="w-12 h-9 flex items-center justify-center text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors"
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? <Square size={12} /> : <Maximize2 size={12} />}
        </button>
        <button
          onClick={handleClose}
          className="w-12 h-9 flex items-center justify-center text-gray-400 hover:bg-red-600 hover:text-white transition-colors"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
