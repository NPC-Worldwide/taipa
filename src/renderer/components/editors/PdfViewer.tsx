import React from 'react';

interface PdfViewerProps {
  filePath: string;
}

const PdfViewer: React.FC<PdfViewerProps> = ({ filePath }) => {
  // Use a file:// URL. The webview tag is enabled in the main BrowserWindow
  // so that Chromium's built-in PDF viewer can render the file.
  const src = filePath.startsWith('file://') ? filePath : `file://${filePath}`;

  // React doesn't know about the Electron <webview> intrinsic, so cast it.
  const WebViewTag = 'webview' as any;

  return (
    <div className="h-full w-full flex flex-col bg-gray-900">
      <div className="flex items-center justify-between px-3 py-1.5 border-b theme-border theme-bg-secondary shrink-0">
        <span className="text-xs text-gray-400 truncate flex-1">{filePath.replace(/^file:\/\//, '')}</span>
      </div>
      <div className="flex-1 min-h-0 relative">
        <WebViewTag
          src={src}
          className="absolute inset-0 w-full h-full"
        />
      </div>
    </div>
  );
};

export default PdfViewer;
