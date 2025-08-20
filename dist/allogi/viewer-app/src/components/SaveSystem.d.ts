import React from 'react';
import '../styles/SaveSystem.css';
export interface SaveNode {
    id: string;
    name: string;
    type: 'profile-settings' | 'last-ui' | 'highlight-script' | 'highlight-module' | 'highlight-method' | 'highlight-value' | 'comparison';
    parentId?: string;
    metadata?: {
        description?: string;
        tags?: string[];
        createdAt: string;
        updatedAt: string;
        data?: any;
        target?: string;
        comparisonData?: {
            operation: string;
            leftOperand: any;
            rightOperand: any;
            result?: any;
            isValid: boolean;
            error?: string;
        };
        highlightData?: {
            scriptId?: string;
            moduleId?: string;
            methodId?: string;
            valueId?: string;
            color: string;
            pattern: string;
        };
    };
}
export interface SaveFolder {
    id: string;
    name: string;
    type: 'profile' | 'highlight' | 'comparison' | 'filter-preset' | 'view-preset' | 'log-session' | 'monitoring-session';
    parentId?: string;
    children?: (SaveFolder | SaveNode)[];
    metadata?: {
        description?: string;
        tags?: string[];
        createdAt: string;
        updatedAt: string;
    };
}
export type SaveItem = SaveFolder | SaveNode;
export interface SaveSystemState {
    items: SaveItem[];
    expandedFolders: Set<string>;
    selectedItem: SaveItem | null;
    editingItem: SaveItem | null;
    activeProfile: SaveItem | null;
}
interface SaveSystemProps {
    isOpen: boolean;
    onToggle: () => void;
    onSave: (item: SaveItem) => void;
    onLoad: (item: SaveItem) => void;
    onDelete: (itemId: string) => void;
    onExport: (item: SaveItem) => void;
    onImport: (data: any) => void;
    currentData?: any;
    currentView: 'logs' | 'monitoring' | 'recursive' | 'instrumentation';
    onCreateHighlight?: (highlightData: {
        name: string;
        description: string;
        scriptId?: string;
        moduleId?: string;
        tags: string[];
        data?: any;
    }) => void;
}
export interface SaveSystemRef {
    createHighlightFromData: (highlightData: {
        name: string;
        description: string;
        scriptId?: string;
        moduleId?: string;
        tags: string[];
        data?: any;
    }) => SaveNode;
    removeHighlightForElement: (elementData: {
        elementType: 'log' | 'variable' | 'state' | 'function' | 'property' | 'event';
        scriptId?: string;
        moduleId?: string;
        name?: string;
        logMessage?: string;
    }) => boolean;
}
declare const SaveSystem: React.ForwardRefExoticComponent<SaveSystemProps & React.RefAttributes<SaveSystemRef>>;
export default SaveSystem;
