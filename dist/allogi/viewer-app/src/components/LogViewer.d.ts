import React from 'react';
import { AllogLogEntry } from '../lib/allog-api-client';
interface LogViewerProps {
    logs: AllogLogEntry[];
    highlights: any[];
    onHighlight: any;
    onRemoveHighlight: any;
    isElementHighlighted: any;
    onContextMenu: any;
    isLoading: boolean;
    error: string | null;
    onRefresh: () => void;
    onClear: () => void;
}
declare const LogViewer: React.FC<LogViewerProps>;
export default LogViewer;
