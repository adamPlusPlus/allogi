import { useState, useEffect, useCallback } from 'react';

export interface Highlight {
  id: string;
  name: string;
  scriptId?: string;
  moduleId?: string;
  methodId?: string;
  valueId?: string;
  color: string;
  pattern: string;
  target: string; // For datatype-name convention
}

export interface HighlightMatch {
  highlight: Highlight;
  elementId: string;
  elementType: 'log' | 'variable' | 'state' | 'function' | 'property' | 'event';
}

export function useHighlights() {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [highlightMatches, setHighlightMatches] = useState<Map<string, HighlightMatch>>(new Map());

  // Load highlights from localStorage
  useEffect(() => {
    const loadHighlights = () => {
      try {
        const savedData = localStorage.getItem('allog-save-system');
        if (savedData) {
          const data = JSON.parse(savedData);
          const highlightItems = data.items?.filter((item: any) => 
            item.type?.startsWith('highlight-') && item.metadata?.highlightData
          ) || [];
          
          const extractedHighlights: Highlight[] = highlightItems.map((item: any) => ({
            id: item.id,
            name: item.name,
            scriptId: item.metadata.highlightData.scriptId,
            moduleId: item.metadata.highlightData.moduleId,
            methodId: item.metadata.highlightData.methodId,
            valueId: item.metadata.highlightData.valueId,
            color: item.metadata.highlightData.color || '#ffff00',
            pattern: item.metadata.highlightData.pattern || 'default',
            // Use the target field if available, otherwise fall back to the name for backward compatibility
            target: item.metadata.target || item.name || ''
          }));
          
          setHighlights(extractedHighlights);
        }
          } catch (error) {
      // TODO: Replace with Allog coordinator logging when available
      // console.error('Failed to load highlights:', error);
    }
    };

    loadHighlights();

    // Listen for storage changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'allog-save-system') {
        loadHighlights();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    // Listen for highlight update events
    const handleHighlightUpdate = () => {
      loadHighlights();
    };
    
    window.addEventListener('highlight-updated', handleHighlightUpdate);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('highlight-updated', handleHighlightUpdate);
    };
  }, []);

  // Check if an element should be highlighted
  const getHighlightForElement = useCallback((
    elementType: 'log' | 'variable' | 'state' | 'function' | 'property' | 'event',
    scriptId?: string,
    moduleId?: string,
    name?: string,
    logMessage?: string
  ): Highlight | null => {
    return highlights.find(highlight => {
      // Check if this highlight matches the element
      if (highlight.scriptId && scriptId && !scriptId.includes(highlight.scriptId)) {
        return false;
      }
      
      if (highlight.moduleId && moduleId && !moduleId.includes(highlight.moduleId)) {
        return false;
      }
      
      if (highlight.valueId && name && !name.includes(highlight.valueId)) {
        return false;
      }
      
      // For logs, check if the message contains the target
      if (elementType === 'log' && highlight.target && logMessage) {
        return logMessage.toLowerCase().includes(highlight.target.toLowerCase());
      }
      
      // For monitoring data, check if the name matches
      if (name && highlight.target) {
        return name.toLowerCase().includes(highlight.target.toLowerCase());
      }
      
      // Only match if we have a target and it matches the element's name or message
      // This prevents the fallback "return true" that was causing multiple highlights
      if (highlight.target) {
        if (elementType === 'log' && logMessage) {
          return logMessage.toLowerCase().includes(highlight.target.toLowerCase());
        }
        if (name) {
          return name.toLowerCase().includes(highlight.target.toLowerCase());
        }
      }
      
      // If no target is specified, don't match anything (prevents multiple highlights)
      return false;
    }) || null;
  }, [highlights]);

  // Get highlight styles for an element
  const getHighlightStyles = useCallback((
    elementType: 'log' | 'variable' | 'state' | 'function' | 'property' | 'event',
    scriptId?: string,
    moduleId?: string,
    name?: string,
    logMessage?: string
  ) => {
    const highlight = getHighlightForElement(elementType, scriptId, moduleId, name, logMessage);
    
    if (!highlight) {
      return {
        className: '',
        style: {},
        isHighlighted: false
      };
    }

    const patternClass = `highlight-pattern-${highlight.pattern}`;
    const elementClass = `${elementType === 'log' ? 'log-entry' : 
                         elementType === 'variable' || elementType === 'state' || 
                         elementType === 'function' || elementType === 'property' || 
                         elementType === 'event' ? 'monitoring-data-item' : ''} highlighted ${patternClass}`;

    return {
      className: elementClass,
      style: {
        '--highlight-color': highlight.color
      } as React.CSSProperties,
      isHighlighted: true,
      highlight,
      dataAttributes: {
        'data-highlight-name': highlight.name
      }
    };
  }, [getHighlightForElement]);

  // Update highlights when SaveSystem changes
  const updateHighlights = useCallback((newHighlights: Highlight[]) => {
    setHighlights(newHighlights);
  }, []);

  return {
    highlights,
    getHighlightForElement,
    getHighlightStyles,
    updateHighlights,
    isElementHighlighted: getHighlightForElement
  };
} 