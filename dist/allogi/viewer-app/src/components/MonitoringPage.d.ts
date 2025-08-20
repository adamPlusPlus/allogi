import React from 'react';
import '../styles/MonitoringPage.css';
interface MonitoringStats {
    totalModules: number;
    totalScripts: number;
    totalVariables: number;
    totalStates: number;
    totalFunctions: number;
    totalProperties: number;
    totalEvents: number;
    lastUpdate: string;
}
interface ConnectionStatus {
    isConnected: boolean;
    lastConnected?: string;
    error?: string;
    retryCount: number;
}
interface MonitoringPageProps {
    onStatsUpdate?: (stats: MonitoringStats) => void;
    onConnectionUpdate?: (connection: ConnectionStatus) => void;
    saveSystemRef?: React.RefObject<{
        createHighlightFromData: (highlightData: {
            name: string;
            description: string;
            scriptId?: string;
            moduleId?: string;
            tags: string[];
            data?: any;
        }) => any;
        removeHighlightForElement: (elementData: {
            elementType: 'log' | 'variable' | 'state' | 'function' | 'property' | 'event';
            scriptId?: string;
            moduleId?: string;
            name?: string;
            logMessage?: string;
        }) => boolean;
    }>;
}
export default function MonitoringPage({ onStatsUpdate, onConnectionUpdate, saveSystemRef }: MonitoringPageProps): React.JSX.Element;
export {};
