import { useState, useCallback } from 'react';
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

export function useContextMenu(options: UseContextMenuOptions = {}) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isVisible: false,
    x: 0,
    y: 0
  });

  const showContextMenu = useCallback((x: number, y: number, targetData?: any, targetElement?: HTMLElement) => {
    setContextMenu({
      isVisible: true,
      x,
      y,
      targetData,
      targetElement
    });
  }, []);

  const hideContextMenu = useCallback(() => {
    setContextMenu(prev => ({
      ...prev,
      isVisible: false
    }));
  }, []);

  const createHighlight = useCallback((highlightData: HighlightData) => {
    try {
      // Create a unique ID for the highlight
      const highlightId = `highlight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Create the highlight save item
      const highlightItem = {
        id: highlightId,
        name: `Highlight: ${highlightData.text?.substring(0, 30)}...` || 'Unnamed Highlight',
        type: 'highlight' as const,
        parentId: 'default-highlight', // Will be placed under default highlight category
        metadata: {
          description: 'Created from context menu',
          tags: highlightData.tags || [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          data: {
            text: highlightData.text,
            sourceType: highlightData.sourceType,
            timestamp: highlightData.timestamp,
            scriptId: highlightData.scriptId,
            moduleId: highlightData.moduleId,
            additionalData: highlightData.data
          }
        }
      };

      // If there's an onCreateHighlight callback, use it
      if (options.onCreateHighlight) {
        options.onCreateHighlight(highlightData);
      } else {
        // Fallback: directly save to localStorage
        const existingSaveData = localStorage.getItem('allog-save-system');
        let saveData = existingSaveData ? JSON.parse(existingSaveData) : { items: [] };
        
        // Add the highlight item
        saveData.items.push(highlightItem);
        
        // Save back to localStorage
        localStorage.setItem('allog-save-system', JSON.stringify(saveData));
        
        console.log('Highlight created and saved:', highlightItem.name);
      }
      
      return highlightData;
    } catch (error) {
      console.error('Failed to create highlight:', error);
      return highlightData;
    }
  }, [options.onCreateHighlight]);

  const createHighlightMenuItem = useCallback((highlightData: HighlightData): ContextMenuItem => ({
    id: 'highlight',
    label: 'Highlight',
    icon: '💡',
    action: () => createHighlight(highlightData)
  }), [createHighlight]);

  return {
    contextMenu,
    showContextMenu,
    hideContextMenu,
    createHighlight,
    createHighlightMenuItem
  };
} 