import { ContextMenuItem } from '../components/ContextMenu';
export interface ContextMenuState {
    isVisible: boolean;
    x: number;
    y: number;
    targetData?: any;
    targetElement?: HTMLElement;
}
export interface HighlightData {
    name: string;
    description: string;
    scriptId?: string;
    moduleId?: string;
    tags: string[];
    data?: any;
}
interface UseContextMenuOptions {
    onCreateHighlight?: (highlightData: HighlightData) => void;
}
export declare function useContextMenu(options?: UseContextMenuOptions): {
    contextMenu: ContextMenuState;
    showContextMenu: (x: number, y: number, targetData?: any, targetElement?: HTMLElement) => void;
    hideContextMenu: () => void;
    createHighlight: (highlightData: HighlightData) => HighlightData;
    createHighlightMenuItem: (highlightData: HighlightData) => ContextMenuItem;
};
export {};
