import React from 'react';
import '../styles/RecursiveLogsPage.css';
interface RecursiveLogsPageProps {
    serverUrl: string;
    autoRefresh: boolean;
    refreshInterval: number;
}
export default function RecursiveLogsPage({ serverUrl, autoRefresh, refreshInterval }: RecursiveLogsPageProps): React.JSX.Element;
export {};
