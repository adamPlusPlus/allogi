import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
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
    target?: string; // For datatype-name convention
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

interface StatsData {
  total: number;
  buffer: number;
  modules: number;
  info: number;
  warn: number;
  error: number;
  debug: number;
  scripts: number;
  variables: number;
  states: number;
  functions: number;
  properties: number;
  events: number;
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

interface ContextMenuState {
  isVisible: boolean;
  x: number;
  y: number;
  targetItem: SaveItem | null;
  targetElement?: HTMLElement;
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

interface SaveEditorProps {
  item: SaveItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: SaveItem) => void;
  items: SaveItem[]; // Add items array to find parent profile
}

const SaveSystem = forwardRef<SaveSystemRef, SaveSystemProps>(({
  isOpen,
  onToggle,
  onSave,
  onLoad,
  onDelete,
  onExport,
  onImport,
  currentData,
  currentView,
  onCreateHighlight
}, ref) => {
  const [state, setState] = useState<SaveSystemState>({
    items: [],
    expandedFolders: new Set(),
    selectedItem: null,
    editingItem: null,
    activeProfile: null
  });

  const [newItemName, setNewItemName] = useState('');
  const [newItemType, setNewItemType] = useState<'profile' | 'highlight' | 'comparison' | 'filter-preset' | 'view-preset' | 'log-session' | 'monitoring-session' | 'profile-settings' | 'last-ui' | 'highlight-script' | 'highlight-module' | 'highlight-method' | 'highlight-value'>('profile');
  const [showNewItemForm, setShowNewItemForm] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  // Double-click detection for native context menu
  const doubleClickRefs = useRef<Map<string, { lastClick: number; timeout: NodeJS.Timeout | null }>>(new Map());
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isVisible: false,
    x: 0,
    y: 0,
    targetItem: null
  });
  const [renamingItem, setRenamingItem] = useState<SaveItem | null>(null);
  const [newName, setNewName] = useState('');
  
  // Stats state
  const [stats, setStats] = useState<StatsData>({
    total: 0,
    buffer: 500,
    modules: 0,
    info: 0,
    warn: 0,
    error: 0,
    debug: 0,
    scripts: 15,
    variables: 30,
    states: 45,
    functions: 30,
    properties: 30,
    events: 30
  });

  // Load save data from localStorage on mount
  useEffect(() => {
    // TODO: Replace with Allog coordinator logging when available
    // console.log('SaveSystem: Loading data from localStorage...');
    const savedData = localStorage.getItem('allog-save-system');
    // console.log('SaveSystem: Retrieved data:', savedData);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        // console.log('SaveSystem: Parsed data:', parsed);
        const items = parsed.items || [];
        
        // Check if we need to populate missing default structure
        const populatedItems = ensureDefaultStructure(items);
        
        setState(prev => ({
          ...prev,
          items: populatedItems,
          expandedFolders: new Set(parsed.expandedFolders || []),
          activeProfile: parsed.activeProfile || null
        }));
      } catch (error) {
        // TODO: Replace with Allog coordinator logging when available
        // console.error('Failed to load save system data:', error);
        // If parsing fails, initialize with default structure
        initializeDefaultStructure();
      }
    } else {
      // TODO: Replace with Allog coordinator logging when available
      // console.log('SaveSystem: No saved data found, initializing with default structure');
      initializeDefaultStructure();
    }
  }, []);

  // Initialize default folder structure
  const initializeDefaultStructure = useCallback(() => {
    // TODO: Replace with Allog coordinator logging when available
    // console.log('SaveSystem: Initializing default structure...');
    
    const defaultItems: SaveItem[] = [
      // Default profile
      {
        id: 'default-profile',
        name: 'Default Profile',
        type: 'profile',
        metadata: {
          description: 'Default profile for all saves',
          tags: ['default'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      },
      // Default highlight category under the profile
      {
        id: 'default-highlight',
        name: 'Highlights',
        type: 'highlight',
        parentId: 'default-profile',
        metadata: {
          description: 'Default highlight category',
          tags: ['default', 'highlight'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      },
      // Default comparison category under the profile
      {
        id: 'default-comparison',
        name: 'Comparisons',
        type: 'comparison',
        parentId: 'default-profile',
        metadata: {
          description: 'Default comparison category',
          tags: ['default', 'comparison'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      },
      // Default filter presets under the profile
      {
        id: 'default-filter-preset',
        name: 'Filter Presets',
        type: 'filter-preset',
        parentId: 'default-profile',
        metadata: {
          description: 'Default filter presets category',
          tags: ['default', 'filter'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      },
      // Default view presets under the profile
      {
        id: 'default-view-preset',
        name: 'View Presets',
        type: 'view-preset',
        parentId: 'default-profile',
        metadata: {
          description: 'Default view presets category',
          tags: ['default', 'view'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      },
      // Default log sessions under the profile
      {
        id: 'default-log-session',
        name: 'Log Sessions',
        type: 'log-session',
        parentId: 'default-profile',
        metadata: {
          description: 'Default log sessions category',
          tags: ['default', 'log'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      },
      // Default monitoring sessions under the profile
      {
        id: 'default-monitoring-session',
        name: 'Monitoring Sessions',
        type: 'monitoring-session',
        parentId: 'default-profile',
        metadata: {
          description: 'Default monitoring sessions category',
          tags: ['default', 'monitoring'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }
    ];

    // TODO: Replace with Allog coordinator logging when available
    // console.log('SaveSystem: Setting default items:', defaultItems);
    setState(prev => ({
      ...prev,
      items: defaultItems,
      expandedFolders: new Set(['default-profile']) // Auto-expand the default profile
    }));
  }, []);

  // Find the parent profile of any item
  const findParentProfile = useCallback((item: SaveItem | null): SaveItem | null => {
    if (!item) return null;
    
    // If the item is already a profile, return it
    if (item.type === 'profile') {
      return item;
    }
    
    // If the item has a parentId, find the parent profile
    if (item.parentId) {
      const parent = state.items.find(parentItem => parentItem.id === item.parentId);
      if (parent) {
        // If parent is a profile, return it
        if (parent.type === 'profile') {
          return parent;
        }
        // If parent is not a profile, recursively find the profile
        return findParentProfile(parent);
      }
    }
    
    return null;
  }, [state.items]);

  // Generate default folder structure for a profile
  const generateDefaultFolders = useCallback((profileId: string, profileName: string): SaveItem[] => {
    const timestamp = new Date().toISOString();
    const baseId = profileId.replace('profile-', '');
    
    return [
      {
        id: `${baseId}-highlight`,
        name: 'Highlights',
        type: 'highlight',
        parentId: profileId,
        metadata: {
          description: `${profileName} highlight category`,
          tags: [profileName.toLowerCase(), 'highlight'],
          createdAt: timestamp,
          updatedAt: timestamp
        }
      },
      {
        id: `${baseId}-comparison`,
        name: 'Comparisons',
        type: 'comparison',
        parentId: profileId,
        metadata: {
          description: `${profileName} comparison category`,
          tags: [profileName.toLowerCase(), 'comparison'],
          createdAt: timestamp,
          updatedAt: timestamp
        }
      },
      {
        id: `${baseId}-filter-preset`,
        name: 'Filter Presets',
        type: 'filter-preset',
        parentId: profileId,
        metadata: {
          description: `${profileName} filter presets category`,
          tags: [profileName.toLowerCase(), 'filter'],
          createdAt: timestamp,
          updatedAt: timestamp
        }
      },
      {
        id: `${baseId}-view-preset`,
        name: 'View Presets',
        type: 'view-preset',
        parentId: profileId,
        metadata: {
          description: `${profileName} view presets category`,
          tags: [profileName.toLowerCase(), 'view'],
          createdAt: timestamp,
          updatedAt: timestamp
        }
      },
      {
        id: `${baseId}-log-session`,
        name: 'Log Sessions',
        type: 'log-session',
        parentId: profileId,
        metadata: {
          description: `${profileName} log sessions category`,
          tags: [profileName.toLowerCase(), 'log'],
          createdAt: timestamp,
          updatedAt: timestamp
        }
      },
      {
        id: `${baseId}-monitoring-session`,
        name: 'Monitoring Sessions',
        type: 'monitoring-session',
        parentId: profileId,
        metadata: {
          description: `${profileName} monitoring sessions category`,
          tags: [profileName.toLowerCase(), 'monitoring'],
          createdAt: timestamp,
          updatedAt: timestamp
        }
      }
    ];
  }, []);

  // Ensure default structure exists in the items array
  const ensureDefaultStructure = useCallback((items: SaveItem[]): SaveItem[] => {
    console.log('SaveSystem: Ensuring default structure exists...');
    
    const hasDefaultProfile = items.some(item => item.id === 'default-profile');
    const hasDefaultHighlight = items.some(item => item.id === 'default-highlight');
    const hasDefaultComparison = items.some(item => item.id === 'default-comparison');
    const hasDefaultFilterPreset = items.some(item => item.id === 'default-filter-preset');
    const hasDefaultViewPreset = items.some(item => item.id === 'default-view-preset');
    const hasDefaultLogSession = items.some(item => item.id === 'default-log-session');
    const hasDefaultMonitoringSession = items.some(item => item.id === 'default-monitoring-session');

    const missingItems: SaveItem[] = [];

    if (!hasDefaultProfile) {
      missingItems.push({
        id: 'default-profile',
        name: 'Default Profile',
        type: 'profile',
        metadata: {
          description: 'Default profile for all saves',
          tags: ['default'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      });
    }

    if (!hasDefaultHighlight) {
      missingItems.push({
        id: 'default-highlight',
        name: 'Highlights',
        type: 'highlight',
        parentId: 'default-profile',
        metadata: {
          description: 'Default highlight category',
          tags: ['default', 'highlight'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      });
    }

    if (!hasDefaultComparison) {
      missingItems.push({
        id: 'default-comparison',
        name: 'Comparisons',
        type: 'comparison',
        parentId: 'default-profile',
        metadata: {
          description: 'Default comparison category',
          tags: ['default', 'comparison'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      });
    }

    if (!hasDefaultFilterPreset) {
      missingItems.push({
        id: 'default-filter-preset',
        name: 'Filter Presets',
        type: 'filter-preset',
        parentId: 'default-profile',
        metadata: {
          description: 'Default filter presets category',
          tags: ['default', 'filter'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      });
    }

    if (!hasDefaultViewPreset) {
      missingItems.push({
        id: 'default-view-preset',
        name: 'View Presets',
        type: 'view-preset',
        parentId: 'default-profile',
        metadata: {
          description: 'Default view presets category',
          tags: ['default', 'view'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      });
    }

    if (!hasDefaultLogSession) {
      missingItems.push({
        id: 'default-log-session',
        name: 'Log Sessions',
        type: 'log-session',
        parentId: 'default-profile',
        metadata: {
          description: 'Default log sessions category',
          tags: ['default', 'log'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      });
    }

    if (!hasDefaultMonitoringSession) {
      missingItems.push({
        id: 'default-monitoring-session',
        name: 'Monitoring Sessions',
        type: 'monitoring-session',
        parentId: 'default-profile',
        metadata: {
          description: 'Default monitoring sessions category',
          tags: ['default', 'monitoring'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      });
    }

    if (missingItems.length > 0) {
      console.log('SaveSystem: Adding missing default items:', missingItems);
      return [...items, ...missingItems];
    }

    return items;
  }, []);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    console.log('SaveSystem: Saving state to localStorage:', {
      items: state.items,
      expandedFolders: Array.from(state.expandedFolders),
      activeProfile: state.activeProfile
    });
    localStorage.setItem('allog-save-system', JSON.stringify({
      items: state.items,
      expandedFolders: Array.from(state.expandedFolders),
      activeProfile: state.activeProfile
    }));
  }, [state.items, state.expandedFolders, state.activeProfile]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(prev => ({ ...prev, isVisible: false }));
    };

    if (contextMenu.isVisible) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu.isVisible]);

  // Create new save item
  const createNewItem = useCallback(() => {
    console.log('SaveSystem: Creating new item:', { newItemName, newItemType, selectedItem: state.selectedItem });
    if (!newItemName.trim()) return;

    const isFolder = newItemType === 'profile' || newItemType === 'highlight' || newItemType === 'comparison' || newItemType === 'filter-preset' || newItemType === 'view-preset' || newItemType === 'log-session' || newItemType === 'monitoring-session';
    const isNode = newItemType.includes('-') && newItemType !== 'filter-preset' && newItemType !== 'view-preset' && newItemType !== 'log-session' && newItemType !== 'monitoring-session';

    if (isFolder) {
      // For folders, determine the parent based on hierarchy rules
      let parentId: string | undefined;
      
      if (newItemType === 'profile') {
        // Profiles are top-level, no parent
        parentId = undefined;
      } else {
        // For all other folder types, find the parent profile
        const parentProfile = findParentProfile(state.selectedItem);
        if (!parentProfile) {
          console.warn('❌ Please select a profile or a subfolder within a profile to create this item.');
          return;
        }
        parentId = parentProfile.id;
      }

      const newFolder: SaveFolder = {
        id: `folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: newItemName.trim(),
        type: newItemType as any,
        parentId,
        metadata: {
          description: '',
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };

      console.log('SaveSystem: Creating new folder:', newFolder);
      setState(prev => {
        let newItems = [...prev.items, newFolder];
        
        // If this is a new profile, automatically create the default folder structure
        if (newItemType === 'profile') {
          const defaultFolders = generateDefaultFolders(newFolder.id, newFolder.name);
          newItems = [...newItems, ...defaultFolders];
          console.log('SaveSystem: Created default folders for new profile:', defaultFolders);
        }
        
        const newState = {
          ...prev,
          items: newItems
        };
        
        // If this is a new profile, automatically expand it to show the default folders
        if (newItemType === 'profile') {
          newState.expandedFolders = new Set(Array.from(prev.expandedFolders).concat(newFolder.id));
        }
        
        console.log('SaveSystem: New state after creating folder:', newState);
        return newState;
      });
    } else if (isNode) {
      // For nodes, they must be under a category (not directly under a profile)
      if (!state.selectedItem || (state.selectedItem.type !== 'highlight' && state.selectedItem.type !== 'comparison' && state.selectedItem.type !== 'filter-preset' && state.selectedItem.type !== 'view-preset' && state.selectedItem.type !== 'log-session' && state.selectedItem.type !== 'monitoring-session')) {
        console.warn('❌ Please select a category (highlight, comparison, etc.) first to create a save node.');
        return;
      }

      const newNode: SaveNode = {
        id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: newItemName.trim(),
        type: newItemType as any,
        parentId: state.selectedItem.id,
        metadata: {
          description: '',
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          data: currentData,
          target: newItemName.trim()
        }
      };

      console.log('SaveSystem: Creating new node:', newNode);
      setState(prev => {
        const newState = {
          ...prev,
          items: [...prev.items, newNode]
        };
        console.log('SaveSystem: New state after creating node:', newState);
        return newState;
      });
    }

    setNewItemName('');
    setNewItemType('profile');
    setShowNewItemForm(false);
  }, [newItemName, newItemType, state.selectedItem, currentData, generateDefaultFolders, findParentProfile]);

  // Toggle folder expansion
  const toggleFolder = useCallback((folderId: string) => {
    setState(prev => {
      const newExpanded = new Set(prev.expandedFolders);
      if (newExpanded.has(folderId)) {
        newExpanded.delete(folderId);
      } else {
        newExpanded.add(folderId);
      }
      return { ...prev, expandedFolders: newExpanded };
    });
  }, []);

  // Select item and set active profile
  const selectItem = useCallback((item: SaveItem) => {
    // Find the parent profile of the selected item
    const parentProfile = findParentProfile(item);
    
    setState(prev => ({ 
      ...prev, 
      selectedItem: item,
      activeProfile: parentProfile
    }));
    
    // Auto-set the default new item type based on selection
    if (item.type === 'profile') {
      setNewItemType('highlight'); // Default to highlight when profile is selected
    } else if (item.type === 'highlight') {
      setNewItemType('highlight-script'); // Default to highlight-script when highlight is selected
    } else if (item.type === 'comparison') {
      setNewItemType('comparison'); // Default to comparison when comparison is selected
    }
  }, [findParentProfile]);

  // Edit item
  const editItem = useCallback((item: SaveItem) => {
    setState(prev => ({ ...prev, editingItem: item }));
    setShowEditor(true);
  }, []);

  // Delete item
  const handleDelete = useCallback((itemId: string) => {
    // Check if this is a profile item that needs confirmation
    const itemToDelete = state.items.find(item => item.id === itemId);
    const isProfile = itemToDelete?.type === 'profile' || itemToDelete?.type === 'profile-settings';
    const isHighlight = itemToDelete?.type?.startsWith('highlight-');
    
    // Only show confirmation for profile items
    if (isProfile && !window.confirm('Are you sure you want to delete this profile?')) {
      return;
    }
    
    // Determine which items to remove
    let itemsToRemove = [itemId];
    
    // If deleting a profile, also delete its profile-settings
    if (itemToDelete?.type === 'profile') {
      const profileSettings = state.items.find(item => 
        item.type === 'profile-settings' && item.parentId === itemId
      );
      if (profileSettings) {
        itemsToRemove.push(profileSettings.id);
      }
    }
    
    setState(prev => ({
      ...prev,
      items: prev.items.filter(item => !itemsToRemove.includes(item.id)),
      selectedItem: prev.selectedItem && !itemsToRemove.includes(prev.selectedItem.id) ? prev.selectedItem : null,
      editingItem: prev.editingItem && !itemsToRemove.includes(prev.editingItem.id) ? prev.editingItem : null,
      activeProfile: prev.activeProfile && !itemsToRemove.includes(prev.activeProfile.id) ? prev.activeProfile : null
    }));
    
    // Call onDelete for each item being removed
    itemsToRemove.forEach((id: string) => onDelete(id));
    
    // Trigger highlight update if a highlight was deleted
    if (isHighlight) {
      const event = new CustomEvent('highlight-updated', {
        detail: { highlightId: itemId, deleted: true }
      });
      window.dispatchEvent(event);
    }
  }, [onDelete, state.items]);

  // Duplicate item
  const duplicateItem = useCallback((item: SaveItem) => {
    const duplicatedItem = {
      ...item,
      id: `${item.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `${item.name} (Copy)`,
      metadata: {
        ...item.metadata,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };

    setState(prev => ({
      ...prev,
      items: [...prev.items, duplicatedItem]
    }));
  }, []);

  // Rename item
  const startRename = useCallback((item: SaveItem) => {
    setRenamingItem(item);
    setNewName(item.name);
  }, []);

  const finishRename = useCallback(() => {
    if (renamingItem && newName.trim()) {
      setState(prev => ({
        ...prev,
        items: prev.items.map(item => 
          item.id === renamingItem.id 
            ? { ...item, name: newName.trim() }
            : item
        ),
        selectedItem: prev.selectedItem?.id === renamingItem.id 
          ? { ...prev.selectedItem, name: newName.trim() }
          : prev.selectedItem
      }));
    }
    setRenamingItem(null);
    setNewName('');
  }, [renamingItem, newName]);

  const cancelRename = useCallback(() => {
    setRenamingItem(null);
    setNewName('');
  }, []);

  // Handle right click on items (custom menu on regular right-click)
  const handleRightClick = useCallback((e: React.MouseEvent, item: SaveItem) => {
    const elementId = `save-item-${item.id}`;
    const now = Date.now();
    const doubleClickData = doubleClickRefs.current.get(elementId);
    
    console.log('SaveSystem: Right-click detected on item:', item.name, 'elementId:', elementId, 'target:', e.target, 'currentTarget:', e.currentTarget);
    
    // Check for double-click (within 300ms)
    if (doubleClickData && (now - doubleClickData.lastClick) < 300) {
      // Clear the timeout since we're handling the double-click
      if (doubleClickData.timeout) {
        clearTimeout(doubleClickData.timeout);
      }
      doubleClickRefs.current.delete(elementId);
      
      // Allow the browser's native context menu to show
      console.log('SaveSystem: Double right-click detected - allowing native context menu');
      return;
    }
    
    // Clear any existing timeout for this element
    if (doubleClickData?.timeout) {
      clearTimeout(doubleClickData.timeout);
    }
    
    // Set up for potential double-click
    const timeout = setTimeout(() => {
      doubleClickRefs.current.delete(elementId);
    }, 300);
    
    doubleClickRefs.current.set(elementId, {
      lastClick: now,
      timeout
    });
    
    // Show our custom context menu on single right-click
    e.preventDefault();
    e.stopPropagation();
    
    // Set the active profile based on the right-clicked item
    const parentProfile = findParentProfile(item);
    setState(prev => ({ 
      ...prev, 
      selectedItem: item,
      activeProfile: parentProfile
    }));
    
    setContextMenu({
      isVisible: true,
      x: e.clientX,
      y: e.clientY,
      targetItem: item,
      targetElement: e.currentTarget as HTMLElement
    });
  }, [selectItem]);

  // Handle right click on empty tree container area (custom menu on regular right-click)
  const handleTreeContainerRightClick = useCallback((e: React.MouseEvent) => {
    const elementId = 'tree-container';
    const now = Date.now();
    const doubleClickData = doubleClickRefs.current.get(elementId);
    
    console.log('SaveSystem: Right-click detected on tree container, target:', e.target, 'currentTarget:', e.currentTarget);
    
    // Check for double-click (within 300ms)
    if (doubleClickData && (now - doubleClickData.lastClick) < 300) {
      // Clear the timeout since we're handling the double-click
      if (doubleClickData.timeout) {
        clearTimeout(doubleClickData.timeout);
      }
      doubleClickRefs.current.delete(elementId);
      
      // Allow the browser's native context menu to show
      console.log('SaveSystem: Double right-click detected - allowing native context menu');
      return;
    }
    
    // Clear any existing timeout for this element
    if (doubleClickData?.timeout) {
      clearTimeout(doubleClickData.timeout);
    }
    
    // Set up for potential double-click
    const timeout = setTimeout(() => {
      doubleClickRefs.current.delete(elementId);
    }, 300);
    
    doubleClickRefs.current.set(elementId, {
      lastClick: now,
      timeout
    });
    
    // Show our custom context menu on single right-click
    e.preventDefault();
    e.stopPropagation();
    
    // Only show context menu if clicking on the container itself, not on items
    if (e.target === e.currentTarget) {
      setContextMenu({
        isVisible: true,
        x: e.clientX,
        y: e.clientY,
        targetItem: null, // null indicates empty area context menu
        targetElement: e.currentTarget as HTMLElement
      });
    }
  }, []);

  // Get available node types for a subfolder
  const getAvailableNodeTypes = useCallback((folderType: string): string[] => {
    switch (folderType) {
      case 'profile':
        return ['last-ui']; // Remove profile-settings from direct creation
      case 'highlight':
        return ['highlight-script', 'highlight-module', 'highlight-method', 'highlight-value'];
      case 'comparison':
        return ['comparison'];
      case 'filter-preset':
      case 'view-preset':
      case 'log-session':
      case 'monitoring-session':
        return ['last-ui']; // Remove profile-settings from subfolder creation
      default:
        return [];
    }
  }, []);

  // Create a node within a subfolder
  const createNodeInSubfolder = useCallback((folderItem: SaveItem, nodeType: string) => {
    const nodeName = `New ${nodeType.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}`;
    
    const newNode: SaveNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: nodeName,
      type: nodeType as any,
      parentId: folderItem.id,
      metadata: {
        description: `Auto-generated ${nodeType} node`,
        tags: ['auto-generated', nodeType],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        data: {},
        highlightData: nodeType.startsWith('highlight-') ? {
          color: '#ff0000',
          pattern: 'default'
        } : undefined,
        comparisonData: nodeType === 'comparison' ? {
          operation: 'equals',
          leftOperand: '',
          rightOperand: '',
          isValid: false
        } : undefined
      }
    };

    setState(prev => ({
      ...prev,
      items: [...prev.items, newNode],
      selectedItem: newNode
    }));

    // Save to localStorage
    const updatedData = {
      items: [...state.items, newNode],
      expandedFolders: Array.from(state.expandedFolders)
    };
    localStorage.setItem('allog-save-system', JSON.stringify(updatedData));
  }, [state.items, state.expandedFolders]);

  // Create a highlight from external data
  const createHighlightFromData = useCallback((highlightData: {
    name: string;
    description: string;
    scriptId?: string;
    moduleId?: string;
    tags: string[];
    data?: any;
  }) => {
    // Find the default highlight folder or create one if it doesn't exist
    let highlightFolder = state.items.find(item => 
      item.type === 'highlight' && item.parentId === 'default-profile'
    );

    if (!highlightFolder) {
      // Create a default highlight folder if it doesn't exist
      highlightFolder = {
        id: 'default-highlight',
        name: 'Highlights',
        type: 'highlight',
        parentId: 'default-profile',
        metadata: {
          description: 'Default highlight category',
          tags: ['default', 'highlight'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };
      setState(prev => ({
        ...prev,
        items: [...prev.items, highlightFolder as SaveItem]
      }));
    }

    // Determine the appropriate highlight type based on the data
    let highlightType: 'highlight-script' | 'highlight-module' | 'highlight-method' | 'highlight-value' = 'highlight-value';
    if (highlightData.scriptId && highlightData.moduleId) {
      highlightType = 'highlight-script';
    } else if (highlightData.moduleId) {
      highlightType = 'highlight-module';
    }

    // Generate a better name using the [dir/script]-name pattern
    let betterName = highlightData.name;
    
    if (highlightData.data) {
      // For monitoring data (variables, states, functions, properties, events)
      if (highlightData.data.type && highlightData.data.name && highlightData.moduleId && highlightData.scriptId) {
        // Extract the last part of the module path as the "dir"
        const modulePath = highlightData.moduleId.split('/');
        const dir = modulePath[modulePath.length - 1];
        
        // Extract the last part of the script path as the "script"
        const scriptPath = highlightData.scriptId.split('/');
        const script = scriptPath[scriptPath.length - 1];
        
        // Create name in format: .[dir/script]-name
        betterName = `.[${dir}/${script}]-${highlightData.data.name}`;
      }
      // For log entries
      else if (highlightData.data.message && highlightData.scriptId) {
        // Extract the last part of the script path
        const scriptPath = highlightData.scriptId.split('/');
        const script = scriptPath[scriptPath.length - 1];
        
        // Create a short, meaningful name from the log message
        const message = highlightData.data.message;
        const shortMessage = message.length > 30 ? message.substring(0, 30).replace(/\s+\w*$/, '') + '...' : message;
        
        // Create name in format: .[script]-shortMessage
        betterName = `.[${script}]-${shortMessage}`;
      }
    }

    // Create the highlight node
    const highlightNode: SaveNode = {
      id: `highlight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: betterName,
      type: highlightType,
      parentId: highlightFolder.id,
      metadata: {
        description: highlightData.description,
        tags: highlightData.tags,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        data: highlightData.data,
        // Set the target field for precise element matching
        target: highlightData.data?.name || highlightData.data?.message || highlightData.name,
        highlightData: {
          scriptId: highlightData.scriptId,
          moduleId: highlightData.moduleId,
          color: '#ffff00',
          pattern: 'default'
        }
      }
    };

    setState(prev => ({
      ...prev,
      items: [...prev.items, highlightNode],
      selectedItem: highlightNode
    }));

    // Save to localStorage
    const updatedData = {
      items: [...state.items, highlightNode],
      expandedFolders: Array.from(state.expandedFolders)
    };
    localStorage.setItem('allog-save-system', JSON.stringify(updatedData));

    // Call the external callback if provided
    if (onCreateHighlight) {
      onCreateHighlight(highlightData);
    }

    // Trigger highlight update
    const event = new CustomEvent('highlight-updated', {
      detail: { highlightId: highlightNode.id, created: true }
    });
    window.dispatchEvent(event);

    return highlightNode;
  }, [state.items, state.expandedFolders, onCreateHighlight]);

  // Remove highlight for a specific element
  const removeHighlightForElement = useCallback((elementData: {
    elementType: 'log' | 'variable' | 'state' | 'function' | 'property' | 'event';
    scriptId?: string;
    moduleId?: string;
    name?: string;
    logMessage?: string;
  }) => {
    // Find the highlight that matches this element
    const matchingHighlight = state.items.find(item => {
      if (item.type?.startsWith('highlight-') && (item as SaveNode).metadata?.highlightData) {
        const highlightData = (item as SaveNode).metadata!.highlightData!;
        
        // Check if this highlight matches the element
        if (highlightData.scriptId && elementData.scriptId && !elementData.scriptId.includes(highlightData.scriptId)) {
          return false;
        }
        
        if (highlightData.moduleId && elementData.moduleId && !elementData.moduleId.includes(highlightData.moduleId)) {
          return false;
        }
        
        if (highlightData.valueId && elementData.name && !elementData.name.includes(highlightData.valueId)) {
          return false;
        }
        
        // For logs, check if the message contains the target
        if (elementData.elementType === 'log' && (item as SaveNode).metadata?.target && elementData.logMessage) {
          return elementData.logMessage.toLowerCase().includes((item as SaveNode).metadata!.target!.toLowerCase());
        }
        
        // For monitoring data, check if the name matches
        if (elementData.name && (item as SaveNode).metadata?.target) {
          return elementData.name.toLowerCase().includes((item as SaveNode).metadata!.target!.toLowerCase());
        }
        
        // Only match if we have a target and it matches the element's name or message
        // This prevents the fallback "return true" that was causing multiple highlights
        if ((item as SaveNode).metadata?.target) {
          if (elementData.elementType === 'log' && elementData.logMessage) {
            return elementData.logMessage.toLowerCase().includes((item as SaveNode).metadata!.target!.toLowerCase());
          }
          if (elementData.name) {
            return elementData.name.toLowerCase().includes((item as SaveNode).metadata!.target!.toLowerCase());
          }
        }
        
        // If no target is specified, don't match anything (prevents multiple highlights)
        return false;
      }
      return false;
    });

    if (matchingHighlight) {
      // Remove the highlight from state
      setState(prev => ({
        ...prev,
        items: prev.items.filter(item => item.id !== matchingHighlight.id)
      }));

      // Update localStorage
      const updatedItems = state.items.filter(item => item.id !== matchingHighlight.id);
      const updatedData = {
        items: updatedItems,
        expandedFolders: Array.from(state.expandedFolders)
      };
      localStorage.setItem('allog-save-system', JSON.stringify(updatedData));

      // Trigger highlight update
      const event = new CustomEvent('highlight-updated', {
        detail: { highlightId: matchingHighlight.id, removed: true }
      });
      window.dispatchEvent(event);

      return true;
    }

    return false;
  }, [state.items, state.expandedFolders]);

  // Expose functions through ref
  useImperativeHandle(ref, () => ({
    createHighlightFromData,
    removeHighlightForElement
  }), [createHighlightFromData, removeHighlightForElement]);

  // Create profile settings for a profile
  const createProfileSettings = useCallback((profileId: string, profileName: string) => {
    const profileSettings: SaveNode = {
      id: `profile-settings-${profileId}`,
      name: 'Profile Settings',
      type: 'profile-settings',
      parentId: profileId,
      metadata: {
        description: `Settings for ${profileName}`,
        tags: ['profile', 'settings', 'system'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        data: {
          theme: 'dark',
          autoSave: true,
          notifications: true,
          defaultView: 'logs',
          instrumentation: {
            enabled: true,
            defaultLevel: 'detailed',
            components: {},
            methods: {
              logMethodCalls: true,
              logMethodParameters: true,
              logMethodReturns: true,
              logMethodTiming: true,
              logMethodErrors: true
            },
            state: {
              logVariableChanges: true,
              logConfigurationChanges: true,
              logBufferOperations: true,
              logModuleStateChanges: true,
              logServerCommunication: true
            },
            dataFlow: {
              logDataTransformation: true,
              logDataRouting: true,
              logDataFiltering: true,
              logDataSerialization: true
            },
            performance: {
              logExecutionTime: true,
              logMemoryUsage: true,
              logBufferStats: true,
              logServerLatency: true
            }
          }
        }
      }
    };
    return profileSettings;
  }, []);

  // Create a new profile
  const createNewProfile = useCallback(() => {
    const profileName = `New Profile ${state.items.filter(item => item.type === 'profile').length + 1}`;
    
    const newProfile: SaveFolder = {
      id: `profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: profileName,
      type: 'profile',
      metadata: {
        description: 'New profile',
        tags: ['new', 'profile'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };

    // Create profile settings for the new profile
    const profileSettings = createProfileSettings(newProfile.id, newProfile.name);

    console.log('SaveSystem: Creating new profile:', newProfile);
    setState(prev => {
      let newItems = [...prev.items, newProfile, profileSettings];
      
      // Automatically create the default folder structure for the new profile
      const defaultFolders = generateDefaultFolders(newProfile.id, newProfile.name);
      newItems = [...newItems, ...defaultFolders];
      console.log('SaveSystem: Created default folders for new profile:', defaultFolders);
      
      const newState = {
        ...prev,
        items: newItems,
        selectedItem: newProfile,
        expandedFolders: new Set(Array.from(prev.expandedFolders).concat(newProfile.id))
      };
      
      console.log('SaveSystem: New state after creating profile:', newState);
      return newState;
    });

    // Save to localStorage
    const updatedData = {
      items: [...state.items, newProfile, profileSettings, ...generateDefaultFolders(newProfile.id, newProfile.name)],
      expandedFolders: Array.from(state.expandedFolders).concat(newProfile.id)
    };
    localStorage.setItem('allog-save-system', JSON.stringify(updatedData));
  }, [state.items, state.expandedFolders, generateDefaultFolders, createProfileSettings]);

  // Handle context menu actions
  const handleContextMenuAction = useCallback((action: string, nodeType?: string) => {
    switch (action) {
      case 'create-profile':
        createNewProfile();
        break;
      case 'open':
        if (contextMenu.targetItem) {
          onLoad(contextMenu.targetItem);
        }
        break;
      case 'edit':
        if (contextMenu.targetItem) {
          editItem(contextMenu.targetItem);
        }
        break;
      case 'rename':
        if (contextMenu.targetItem) {
          startRename(contextMenu.targetItem);
        }
        break;
      case 'duplicate':
        if (contextMenu.targetItem) {
          duplicateItem(contextMenu.targetItem);
        }
        break;
      case 'delete':
        if (contextMenu.targetItem) {
          handleDelete(contextMenu.targetItem.id);
        }
        break;
      case 'properties':
        // For profiles, show profile settings; for other items, show properties in details panel
        if (contextMenu.targetItem && contextMenu.targetItem.type === 'profile') {
          // Find the profile settings for this profile
          const profileSettings = state.items.find(item => 
            item.type === 'profile-settings' && item.parentId === contextMenu.targetItem!.id
          );
          
          if (profileSettings) {
            // Open the profile settings in the editor
            editItem(profileSettings);
          } else {
            // Create profile settings if they don't exist
            const newProfileSettings = createProfileSettings(contextMenu.targetItem!.id, contextMenu.targetItem!.name);
            setState(prev => ({
              ...prev,
              items: [...prev.items, newProfileSettings]
            }));
            editItem(newProfileSettings);
          }
        }
        break;
      case 'create-node':
        if (nodeType && contextMenu.targetItem) {
          createNodeInSubfolder(contextMenu.targetItem, nodeType);
        }
        break;

    }

    setContextMenu(prev => ({ ...prev, isVisible: false }));
  }, [contextMenu.targetItem, contextMenu.targetElement, createNewProfile, onLoad, editItem, startRename, duplicateItem, handleDelete, createNodeInSubfolder]);

  // Filter items - show all items since search UI was removed
  const filteredItems = state.items;

  // Build tree structure
  const buildTree = (items: SaveItem[], parentId?: string): SaveItem[] => {
    // Filter out profile-settings from the tree hierarchy (they should be hidden)
    const filtered = items.filter(item => 
      item.parentId === parentId && 
      item.type !== 'profile-settings' // Hide profile-settings from tree
    );
    
    return filtered.map(item => {
      // Check if this item should have children (it's a folder)
      const isFolder = item.type === 'profile' || 
                      item.type === 'highlight' || 
                      item.type === 'comparison' || 
                      item.type === 'filter-preset' || 
                      item.type === 'view-preset' || 
                      item.type === 'log-session' || 
                      item.type === 'monitoring-session';
      
      if (isFolder) {
        const children = buildTree(items, item.id);
        return {
          ...item,
          children
        };
      }
      return item;
    });
  };

  const treeItems = buildTree(filteredItems);

  // Get item icon
  const getItemIcon = (item: SaveItem) => {
    // Determine if this is a folder
    const isFolder = item.type === 'profile' || 
                     item.type === 'highlight' || 
                     item.type === 'comparison' || 
                     item.type === 'filter-preset' || 
                     item.type === 'view-preset' || 
                     item.type === 'log-session' || 
                     item.type === 'monitoring-session';
    
    if (isFolder) {
      // It's a folder
      switch (item.type) {
        case 'profile': return '👤';
        case 'highlight': return '🔍';
        case 'comparison': return '⚖️';
        case 'filter-preset': return '🔧';
        case 'view-preset': return '👁️';
        case 'log-session': return '📋';
        case 'monitoring-session': return '📊';
        default: return '📁';
      }
    } else {
      // It's a node
      switch (item.type) {
        case 'profile-settings': return '⚙️';
        case 'last-ui': return '🖥️';
        case 'highlight-script': return '📜';
        case 'highlight-module': return '📦';
        case 'highlight-method': return '🔧';
        case 'highlight-value': return '💎';
        case 'comparison': return '⚖️';
        default: return '📄';
      }
    }
  };

  // Get item display name
  const getItemDisplayName = (item: SaveItem) => {
    // Determine if this is a folder
    const isFolder = item.type === 'profile' || 
                     item.type === 'highlight' || 
                     item.type === 'comparison' || 
                     item.type === 'filter-preset' || 
                     item.type === 'view-preset' || 
                     item.type === 'log-session' || 
                     item.type === 'monitoring-session';
    
    if (isFolder) {
      return `\\${item.name}`;
    } else {
      return `.${item.name}`;
    }
  };

  // Render tree item
  const renderTreeItem = (item: SaveItem, depth: number = 0) => {
    const isExpanded = state.expandedFolders.has(item.id);
    const isSelected = state.selectedItem?.id === item.id;
    
    // Determine if this is a folder and has children
    const isFolder = item.type === 'profile' || 
                     item.type === 'highlight' || 
                     item.type === 'comparison' || 
                     item.type === 'filter-preset' || 
                     item.type === 'view-preset' || 
                     item.type === 'log-session' || 
                     item.type === 'monitoring-session';
    
    const hasChildren = isFolder && 'children' in item && item.children && item.children.length > 0;
    const isRenaming = renamingItem?.id === item.id;

    return (
      <div 
        key={item.id} 
        className="tree-item-container"
        onContextMenu={(e) => handleRightClick(e, item)}
      >
        <div
          className={`tree-item ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: `${depth * 20 + 10}px` }}
          onClick={() => selectItem(item)}
          onContextMenu={(e) => handleRightClick(e, item)}
        >
          <div 
            className="tree-item-content"
            onContextMenu={(e) => handleRightClick(e, item)}
          >
            {isFolder && (
              <span
                className="expand-icon"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFolder(item.id);
                }}
                onContextMenu={(e) => handleRightClick(e, item)}
              >
                {isExpanded ? '▼' : '▶'}
              </span>
            )}
            <span 
              className="item-icon"
              onContextMenu={(e) => handleRightClick(e, item)}
            >
              {getItemIcon(item)}
            </span>
            {isRenaming ? (
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={finishRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    finishRename();
                  } else if (e.key === 'Escape') {
                    cancelRename();
                  }
                }}
                className="rename-input"
                autoFocus
              />
            ) : (
              <span 
                className="item-name"
                onContextMenu={(e) => handleRightClick(e, item)}
              >
                {getItemDisplayName(item)}
              </span>
            )}
          </div>
          {isSelected && !isRenaming && (
            <div 
              className="item-actions"
              onContextMenu={(e) => handleRightClick(e, item)}
            >
              {/* Only show edit button for non-profile-subfolder items and non-profile-settings */}
              {(() => {
                // Check if this is a profile subfolder (has parentId and is a folder type)
                const isProfileSubfolder = item.parentId && 
                  (item.type === 'highlight' || 
                   item.type === 'comparison' || 
                   item.type === 'filter-preset' || 
                   item.type === 'view-preset' || 
                   item.type === 'log-session' || 
                   item.type === 'monitoring-session');
                
                // Don't show edit for profile subfolders or profile-settings
                if (isProfileSubfolder || item.type === 'profile-settings') {
                  return null;
                }
                
                return (
                  <button
                    className="action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      editItem(item);
                    }}
                    onContextMenu={(e) => handleRightClick(e, item)}
                    title="Edit"
                  >
                    ✏️
                  </button>
                );
              })()}
              <button
                className="action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onLoad(item);
                }}
                onContextMenu={(e) => handleRightClick(e, item)}
                title="Load"
              >
                📂
              </button>
              <button
                className="action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onExport(item);
                }}
                onContextMenu={(e) => handleRightClick(e, item)}
                title="Export"
              >
                📤
              </button>
              {/* Only show delete button for non-profile-subfolder items and non-profile-settings */}
              {(() => {
                // Check if this is a profile subfolder (has parentId and is a folder type)
                const isProfileSubfolder = item.parentId && 
                  (item.type === 'highlight' || 
                   item.type === 'comparison' || 
                   item.type === 'filter-preset' || 
                   item.type === 'view-preset' || 
                   item.type === 'log-session' || 
                   item.type === 'monitoring-session');
                
                // Don't show delete for profile subfolders or profile-settings
                if (isProfileSubfolder || item.type === 'profile-settings') {
                  return null;
                }
                
                return (
                  <button
                    className="action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(item.id);
                    }}
                    onContextMenu={(e) => handleRightClick(e, item)}
                    title="Delete"
                  >
                    🗑️
                  </button>
                );
              })()}
            </div>
          )}
        </div>
        {isFolder && isExpanded && (
          <div className="tree-children">
            {hasChildren ? item.children!.map(child => renderTreeItem(child, depth + 1)) : (
              <div className="empty-folder" style={{ paddingLeft: `${(depth + 1) * 20 + 10}px`, color: '#666', fontStyle: 'italic' }}>
                Empty folder
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`save-system ${isOpen ? 'open' : ''}`}>
      
      {isOpen && (
        <div className="save-system-content">


                     {/* New Item Form */}
           <div className="new-item-section">
             <button
               className="new-item-btn"
               onClick={() => setShowNewItemForm(!showNewItemForm)}
             >
               {showNewItemForm ? 'Cancel' : '+ New Save'}
             </button>
             
             {/* Import Button */}
             <button
               className="import-btn"
               onClick={() => {
                 // Create hidden file input and trigger it
                 const fileInput = document.createElement('input');
                 fileInput.type = 'file';
                 fileInput.accept = '.json';
                 fileInput.style.display = 'none';
                 fileInput.onchange = (e) => {
                   const file = (e.target as HTMLInputElement).files?.[0];
                   if (file) {
                     onImport(file);
                   }
                   document.body.removeChild(fileInput);
                 };
                 document.body.appendChild(fileInput);
                 fileInput.click();
               }}
               title="Import JSON file"
             >
               📥 Import
             </button>
            
            {showNewItemForm && (
              <div className="new-item-form">
                <input
                  type="text"
                  placeholder="Save name..."
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="new-item-input"
                />
                                 <select
                   value={newItemType}
                   onChange={(e) => setNewItemType(e.target.value as any)}
                   className="new-item-type-select"
                 >
                   <optgroup label="Nodes">
                     {state.selectedItem?.type === 'profile' && (
                       <>
                         <option value="profile-settings">Profile Settings</option>
                         <option value="last-ui">Last UI</option>
                       </>
                     )}
                     {state.selectedItem?.type === 'highlight' && (
                       <>
                         <option value="highlight-script">Highlight Script</option>
                         <option value="highlight-module">Highlight Module</option>
                         <option value="highlight-method">Highlight Method</option>
                         <option value="highlight-value">Highlight Value</option>
                       </>
                     )}
                     {state.selectedItem?.type === 'comparison' && (
                       <option value="comparison">Comparison</option>
                     )}
                     {(state.selectedItem?.type === 'filter-preset' || state.selectedItem?.type === 'view-preset' || state.selectedItem?.type === 'log-session' || state.selectedItem?.type === 'monitoring-session') && (
                       <>
                         <option value="profile-settings">Profile Settings</option>
                         <option value="last-ui">Last UI</option>
                       </>
                     )}
                   </optgroup>
                 </select>
                <button
                  className="create-btn"
                  onClick={createNewItem}
                  disabled={!newItemName.trim()}
                >
                  Create
                </button>
              </div>
            )}
          </div>

          {/* Tree View */}
          <div className="tree-container" onContextMenu={handleTreeContainerRightClick}>
            {treeItems.length === 0 ? (
              <div className="empty-state">
                <p>No saves found</p>
                <p>Create your first save to get started</p>
              </div>
            ) : (
              treeItems.map(item => renderTreeItem(item))
            )}
          </div>

          {/* Selected Item Details */}
          {state.selectedItem && (
            <div className="selected-item-details">
              <h4>{getItemDisplayName(state.selectedItem)}</h4>
              <p className="item-type">{state.selectedItem.type}</p>
              {state.selectedItem.metadata?.description && (
                <p className="item-description">{state.selectedItem.metadata.description}</p>
              )}
              <div className="item-metadata">
                <span>Created: {new Date(state.selectedItem.metadata?.createdAt || '').toLocaleDateString()}</span>
                <span>Updated: {new Date(state.selectedItem.metadata?.updatedAt || '').toLocaleDateString()}</span>
              </div>
              {state.activeProfile && state.activeProfile.id !== state.selectedItem.id && (
                <div className="active-profile-indicator">
                  <span className="active-profile-label">Active Profile:</span>
                  <span className="active-profile-name">{getItemDisplayName(state.activeProfile)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Right Side Editor Drawer */}
      <SaveEditor
        item={state.editingItem}
        isOpen={showEditor}
        onClose={() => {
          setShowEditor(false);
          setState(prev => ({ ...prev, editingItem: null }));
        }}
        onSave={(updatedItem) => {
          setState(prev => ({
            ...prev,
            items: prev.items.map(item => 
              item.id === updatedItem.id ? updatedItem : item
            ),
            editingItem: null
          }));
          setShowEditor(false);
        }}
        items={state.items}
      />

      {/* Context Menu */}
      {contextMenu.isVisible && (
        <div 
          className="context-menu"
          style={{ 
            left: contextMenu.x, 
            top: contextMenu.y 
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Show different menu based on whether we're clicking on an item or empty space */}
          {contextMenu.targetItem ? (
            // Context menu for items
            <>
              <div 
                className="context-menu-item"
                onClick={() => handleContextMenuAction('open')}
              >
                <span className="context-menu-icon">📂</span>
                Open
              </div>
              {/* Only show edit option for non-profile-subfolder items and non-profile-settings */}
              {(() => {
                // Check if this is a profile subfolder (has parentId and is a folder type)
                const isProfileSubfolder = contextMenu.targetItem.parentId && 
                  (contextMenu.targetItem.type === 'highlight' || 
                   contextMenu.targetItem.type === 'comparison' || 
                   contextMenu.targetItem.type === 'filter-preset' || 
                   contextMenu.targetItem.type === 'view-preset' || 
                   contextMenu.targetItem.type === 'log-session' || 
                   contextMenu.targetItem.type === 'monitoring-session');
                
                // Don't show edit for profile subfolders or profile-settings
                if (isProfileSubfolder || contextMenu.targetItem.type === 'profile-settings') {
                  return null;
                }
                
                return (
                  <div 
                    className="context-menu-item"
                    onClick={() => handleContextMenuAction('edit')}
                  >
                    <span className="context-menu-icon">✏️</span>
                    Edit
                  </div>
                );
              })()}
              {/* Only show rename option for non-profile-subfolder items and non-profile-settings */}
              {(() => {
                // Check if this is a profile subfolder (has parentId and is a folder type)
                const isProfileSubfolder = contextMenu.targetItem.parentId && 
                  (contextMenu.targetItem.type === 'highlight' || 
                   contextMenu.targetItem.type === 'comparison' || 
                   contextMenu.targetItem.type === 'filter-preset' || 
                   contextMenu.targetItem.type === 'view-preset' || 
                   contextMenu.targetItem.type === 'log-session' || 
                   contextMenu.targetItem.type === 'monitoring-session');
                
                // Don't show rename for profile subfolders or profile-settings
                if (isProfileSubfolder || contextMenu.targetItem.type === 'profile-settings') {
                  return null;
                }
                
                return (
                  <>
                    <div className="context-menu-separator"></div>
                    <div 
                      className="context-menu-item"
                      onClick={() => handleContextMenuAction('rename')}
                    >
                      <span className="context-menu-icon">✏️</span>
                      Rename
                    </div>
                  </>
                );
              })()}
              
              {/* Only show duplicate option for non-profile-subfolder items and non-profile-settings */}
              {(() => {
                // Check if this is a profile subfolder (has parentId and is a folder type)
                const isProfileSubfolder = contextMenu.targetItem.parentId && 
                  (contextMenu.targetItem.type === 'highlight' || 
                   contextMenu.targetItem.type === 'comparison' || 
                   contextMenu.targetItem.type === 'filter-preset' || 
                   contextMenu.targetItem.type === 'view-preset' || 
                   contextMenu.targetItem.type === 'log-session' || 
                   contextMenu.targetItem.type === 'monitoring-session');
                
                // Don't show duplicate for profile subfolders or profile-settings
                if (isProfileSubfolder || contextMenu.targetItem.type === 'profile-settings') {
                  return null;
                }
                
                return (
                  <div 
                    className="context-menu-item"
                    onClick={() => handleContextMenuAction('duplicate')}
                  >
                    <span className="context-menu-icon">📋</span>
                    Duplicate
                  </div>
                );
              })()}
              
              {/* Create Node options for subfolders - moved to top level */}
              {contextMenu.targetItem.type !== 'profile' && 
               contextMenu.targetItem.type !== 'profile-settings' && 
               contextMenu.targetItem.type !== 'last-ui' && 
               contextMenu.targetItem.type !== 'highlight-script' && 
               contextMenu.targetItem.type !== 'highlight-module' && 
               contextMenu.targetItem.type !== 'highlight-method' && 
               contextMenu.targetItem.type !== 'highlight-value' && 
               contextMenu.targetItem.type !== 'comparison' && (
                <>
                  <div className="context-menu-separator"></div>
                  {getAvailableNodeTypes(contextMenu.targetItem.type).map(nodeType => (
                    <div 
                      key={nodeType}
                      className="context-menu-item"
                      onClick={() => handleContextMenuAction('create-node', nodeType)}
                    >
                      <span className="context-menu-icon">
                        {nodeType === 'profile-settings' ? '⚙️' :
                         nodeType === 'last-ui' ? '🖥️' :
                         nodeType === 'highlight-script' ? '📜' :
                         nodeType === 'highlight-module' ? '📦' :
                         nodeType === 'highlight-method' ? '🔧' :
                         nodeType === 'highlight-value' ? '💎' :
                         nodeType === 'comparison' ? '⚖️' : '📄'}
                      </span>
                      Create {nodeType.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </div>
                  ))}
                </>
              )}
              
              <div className="context-menu-separator"></div>
              <div 
                className="context-menu-item"
                onClick={() => handleContextMenuAction('properties')}
              >
                <span className="context-menu-icon">ℹ️</span>
                Properties
              </div>
              {/* Only show delete option for non-profile-subfolder items and non-profile-settings */}
              {(() => {
                // Check if this is a profile subfolder (has parentId and is a folder type)
                const isProfileSubfolder = contextMenu.targetItem.parentId && 
                  (contextMenu.targetItem.type === 'highlight' || 
                   contextMenu.targetItem.type === 'comparison' || 
                   contextMenu.targetItem.type === 'filter-preset' || 
                   contextMenu.targetItem.type === 'view-preset' || 
                   contextMenu.targetItem.type === 'log-session' || 
                   contextMenu.targetItem.type === 'monitoring-session');
                
                // Don't show delete for profile subfolders or profile-settings
                if (isProfileSubfolder || contextMenu.targetItem.type === 'profile-settings') {
                  return null;
                }
                
                return (
                  <>
                    <div className="context-menu-separator"></div>
                    <div 
                      className="context-menu-item context-menu-item-danger"
                      onClick={() => handleContextMenuAction('delete')}
                    >
                      <span className="context-menu-icon">🗑️</span>
                      Delete
                    </div>
                  </>
                );
              })()}
            </>
          ) : (
            // Context menu for empty space
            <>
              <div 
                className="context-menu-item"
                onClick={() => handleContextMenuAction('create-profile')}
              >
                <span className="context-menu-icon">👤</span>
                Create New Profile
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
});

// Save Editor Component
const SaveEditor: React.FC<SaveEditorProps> = ({ item, isOpen, onClose, onSave, items }) => {
  const [editedItem, setEditedItem] = useState<SaveItem | null>(item);
  const [description, setDescription] = useState(item?.metadata?.description || '');
  const [tags, setTags] = useState(item?.metadata?.tags?.join(', ') || '');
  const [isResizing, setIsResizing] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(item?.name || '');
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Update state when item changes
  useEffect(() => {
    if (item) {
      setEditedItem(item);
      setDescription(item.metadata?.description || '');
      setTags(item.metadata?.tags?.join(', ') || '');
      setTitleValue(item.name);
    }
  }, [item]);

  // Find the parent profile of the current item
  const findParentProfile = useCallback((currentItem: SaveItem | null): SaveItem | null => {
    if (!currentItem) return null;
    
    // If the current item is already a profile, return it
    if (currentItem.type === 'profile') {
      return currentItem;
    }
    
    // If the current item has a parentId, find the parent profile
    if (currentItem.parentId) {
      const parent = items.find((item: SaveItem) => item.id === currentItem.parentId);
      if (parent) {
        // If parent is a profile, return it
        if (parent.type === 'profile') {
          return parent;
        }
        // If parent is not a profile, recursively find the profile
        return findParentProfile(parent);
      }
    }
    
    return null;
  }, [items]);

  const parentProfile = findParentProfile(item);
  const editorRef = useRef<HTMLDivElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // Update title value when item changes
  useEffect(() => {
    if (item) {
      setTitleValue(item.name);
    }
  }, [item]);

  // Handle resize functionality and positioning
  useEffect(() => {
    if (!isOpen || !editorRef.current || !item) return;

    // Function to update editor positioning
    const updateEditorPosition = () => {
      if (!editorRef.current) return;
      
      const saveSystem = document.querySelector('.save-system');
      const monitoringDetail = document.querySelector('.monitoring-detail');
      const isMobile = window.innerWidth <= 768;
      
      const saveSystemWidth = saveSystem?.classList.contains('open') ? (isMobile ? 280 : 300) : 0;
      
      // Better detection of monitoring detail visibility
      let monitoringDetailWidth = 0;
      if (monitoringDetail) {
        const style = window.getComputedStyle(monitoringDetail);
        const rect = monitoringDetail.getBoundingClientRect();
        const isVisible = style.display !== 'none' && 
                         style.visibility !== 'hidden' && 
                         style.opacity !== '0' &&
                         rect.width > 0 && 
                         rect.height > 0;
        
        if (isVisible) {
          // Use actual width if available, otherwise use default
          const actualWidth = rect.width > 0 ? rect.width : (isMobile ? 320 : 400);
          monitoringDetailWidth = actualWidth;
        }
      }
      
      const left = saveSystemWidth;
      const width = `calc(100vw - ${saveSystemWidth}px - ${monitoringDetailWidth}px)`;
      
      editorRef.current.style.setProperty('--save-editor-left', `${left}px`);
      editorRef.current.style.setProperty('--save-editor-width', width);
      
      // Debug logging
      console.log('SaveEditor positioning:', {
        saveSystemWidth,
        monitoringDetailWidth,
        left,
        width,
        isMobile,
        monitoringDetailExists: !!monitoringDetail,
        monitoringDetailStyle: monitoringDetail ? window.getComputedStyle(monitoringDetail).display : 'N/A'
      });
    };

    // Update position immediately
    updateEditorPosition();

    // Set up mutation observer to watch for changes in other panels
    const observer = new MutationObserver(updateEditorPosition);
    
    // Observe the document body for changes to class attributes and styles
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style'],
      subtree: true
    });

    const handleMouseDown = (e: MouseEvent) => {
      if (e.target === editorRef.current) {
        setIsResizing(true);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !editorRef.current) return;
      
      const rect = editorRef.current.getBoundingClientRect();
      const newHeight = window.innerHeight - e.clientY;
      const minHeight = 300;
      const maxHeight = window.innerHeight * 0.8;
      
      if (newHeight >= minHeight && newHeight <= maxHeight) {
        editorRef.current.style.height = `${newHeight}px`;
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    // Also update position on window resize
    window.addEventListener('resize', updateEditorPosition);

    return () => {
      observer.disconnect();
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('resize', updateEditorPosition);
    };
  }, [isOpen, isResizing, item]);

  if (!item) return null;

  // Handle title editing
  const handleTitleClick = () => {
    setIsEditingTitle(true);
    setTitleValue(item.name);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitleValue(e.target.value);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false);
      setTitleValue(item.name);
    }
  };

  const handleTitleBlur = () => {
    handleTitleSave();
  };

  const handleTitleSave = () => {
    if (titleValue.trim() && titleValue !== item.name && editedItem) {
      const updatedItem: SaveItem = {
        ...editedItem,
        name: titleValue.trim(),
        metadata: {
          ...editedItem.metadata,
          createdAt: editedItem.metadata?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };
      setEditedItem(updatedItem);
      onSave(updatedItem);
    }
    setIsEditingTitle(false);
  };

  const handleSave = () => {
    if (!editedItem) return;
    const updatedItem = {
      ...editedItem,
      metadata: {
        ...editedItem.metadata,
        description,
        tags: tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag),
        createdAt: editedItem.metadata?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };
    onSave(updatedItem);
    
    // Trigger highlight update if this is a highlight item
    if (updatedItem.type?.startsWith('highlight-')) {
      const event = new CustomEvent('highlight-updated', {
        detail: { highlightId: updatedItem.id, updated: true }
      });
      window.dispatchEvent(event);
    }
  };

  return (
    <div className={`save-editor ${isOpen ? 'open' : ''}`} ref={editorRef}>
      <div 
        className="save-editor-header"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget || e.target === e.currentTarget.querySelector('h3') || e.target === e.currentTarget.querySelector('input')) {
            setIsResizing(true);
          }
        }}
      >
        <h3>
          Edit{' '}
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={titleValue}
              onChange={handleTitleChange}
              onKeyDown={handleTitleKeyDown}
              onBlur={handleTitleBlur}
              className="title-edit-input"
              autoFocus
            />
          ) : (
            <span 
              className="editable-title"
              onClick={handleTitleClick}
              title="Click to edit title"
            >
              {item.name}
            </span>
          )}
          {parentProfile && parentProfile.id !== item.id && (
            <span className="parent-profile-name">
              {' '}• {parentProfile.name}
            </span>
          )}
        </h3>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>
      
      <div className="save-editor-content">
        <div className="editor-section">
          <label>Description:</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter description..."
            rows={3}
          />
        </div>
        
        <div className="editor-section">
          <label>Tags:</label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Enter tags separated by commas..."
          />
        </div>

        {/* Type-specific editors */}
        {!('children' in item) && item.type === 'comparison' && (
          <ComparisonEditor item={item as SaveNode} onUpdate={(updatedNode: SaveNode) => setEditedItem(updatedNode as SaveItem)} />
        )}
        
        {!('children' in item) && item.type.startsWith('highlight-') && (
          <HighlightEditor item={item as SaveNode} onUpdate={(updatedNode: SaveNode) => setEditedItem(updatedNode as SaveItem)} />
        )}

        {!('children' in item) && item.type === 'profile-settings' && (
          <ProfileSettingsEditor item={item as SaveNode} onUpdate={(updatedNode: SaveNode) => setEditedItem(updatedNode as SaveItem)} />
        )}

        <div className="editor-actions">
          <button className="save-btn" onClick={handleSave}>Save</button>
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// Comparison Editor Component
const ComparisonEditor: React.FC<{ item: SaveNode, onUpdate: (item: SaveNode) => void }> = ({ item, onUpdate }) => {
  const [operation, setOperation] = useState(item.metadata?.comparisonData?.operation || '');
  const [leftOperand, setLeftOperand] = useState(JSON.stringify(item.metadata?.comparisonData?.leftOperand || ''));
  const [rightOperand, setRightOperand] = useState(JSON.stringify(item.metadata?.comparisonData?.rightOperand || ''));

  const handleUpdate = useCallback(() => {
    try {
      const updatedItem = {
        ...item,
        metadata: {
          ...item.metadata,
          createdAt: item.metadata?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          comparisonData: {
            operation,
            leftOperand: JSON.parse(leftOperand),
            rightOperand: JSON.parse(rightOperand),
            isValid: true, // This would be validated
            result: null // This would be calculated
          }
        }
      };
      onUpdate(updatedItem);
    } catch (error) {
      console.error('Invalid JSON in comparison operands:', error);
    }
  }, [item, operation, leftOperand, rightOperand, onUpdate]);

  // Auto-update when values change
  useEffect(() => {
    handleUpdate();
  }, [operation, leftOperand, rightOperand, handleUpdate]);

  return (
    <div className="editor-section">
      <h4>Comparison Settings</h4>
      <div className="comparison-inputs">
        <div>
          <label>Operation:</label>
          <select value={operation} onChange={(e) => setOperation(e.target.value)}>
            <option value="">Select operation...</option>
            <option value="equals">Equals</option>
            <option value="not-equals">Not Equals</option>
            <option value="greater-than">Greater Than</option>
            <option value="less-than">Less Than</option>
            <option value="contains">Contains</option>
            <option value="matches">Matches Pattern</option>
          </select>
        </div>
        <div>
          <label>Left Operand:</label>
          <textarea
            value={leftOperand}
            onChange={(e) => setLeftOperand(e.target.value)}
            placeholder="Enter left operand..."
            rows={2}
          />
        </div>
        <div>
          <label>Right Operand:</label>
          <textarea
            value={rightOperand}
            onChange={(e) => setRightOperand(e.target.value)}
            placeholder="Enter right operand..."
            rows={2}
          />
        </div>
      </div>
    </div>
  );
}

// Highlight Editor Component
const HighlightEditor: React.FC<{ item: SaveNode, onUpdate: (item: SaveNode) => void }> = ({ item, onUpdate }) => {
  const [color, setColor] = useState(item.metadata?.highlightData?.color || '#ffff00');
  const [pattern, setPattern] = useState(item.metadata?.highlightData?.pattern || '');

  const handleUpdate = useCallback(() => {
    const updatedItem = {
      ...item,
      metadata: {
        ...item.metadata,
        createdAt: item.metadata?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        highlightData: {
          ...item.metadata?.highlightData,
          color,
          pattern
        }
      }
    };
    onUpdate(updatedItem);
  }, [item, color, pattern, onUpdate]);

  // Auto-update when values change
  useEffect(() => {
    handleUpdate();
  }, [color, pattern, handleUpdate]);

  // Trigger highlight update when color or pattern changes
  useEffect(() => {
    // Dispatch a custom event to notify other components about highlight changes
    const event = new CustomEvent('highlight-updated', {
      detail: { highlightId: item.id, color, pattern }
    });
    window.dispatchEvent(event);
  }, [color, pattern, item.id]);

  return (
    <div className="editor-section">
      <h4>Highlight Settings</h4>
      <div className="highlight-inputs">
        <div>
          <label>Color:</label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </div>
        <div>
          <label>Pattern:</label>
          <input
            type="text"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="Enter highlight pattern..."
          />
        </div>
      </div>
    </div>
  );
}

// Profile Settings Editor Component
const ProfileSettingsEditor: React.FC<{ item: SaveNode, onUpdate: (item: SaveNode) => void }> = ({ item, onUpdate }) => {
  const [theme, setTheme] = useState(item.metadata?.data?.theme || 'dark');
  const [autoSave, setAutoSave] = useState(item.metadata?.data?.autoSave ?? true);
  const [notifications, setNotifications] = useState(item.metadata?.data?.notifications ?? true);
  const [defaultView, setDefaultView] = useState(item.metadata?.data?.defaultView || 'logs');
  const [instrumentationEnabled, setInstrumentationEnabled] = useState(item.metadata?.data?.instrumentation?.enabled ?? true);

  const handleUpdate = useCallback(() => {
    const updatedItem = {
      ...item,
      metadata: {
        ...item.metadata,
        createdAt: item.metadata?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        data: {
          theme,
          autoSave,
          notifications,
          defaultView,
          instrumentation: {
            ...item.metadata?.data?.instrumentation,
            enabled: instrumentationEnabled
          }
        }
      }
    };
    onUpdate(updatedItem);
  }, [item, theme, autoSave, notifications, defaultView, instrumentationEnabled, onUpdate]);

  // Auto-update when values change
  useEffect(() => {
    handleUpdate();
  }, [theme, autoSave, notifications, defaultView, instrumentationEnabled, handleUpdate]);

  return (
    <div className="editor-section">
      <h4>Profile Settings</h4>
      <div className="profile-settings-inputs">
        <div>
          <label>Theme:</label>
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="auto">Auto</option>
          </select>
        </div>
        <div>
          <label>Auto Save:</label>
          <input
            type="checkbox"
            checked={autoSave}
            onChange={(e) => setAutoSave(e.target.checked)}
          />
        </div>
        <div>
          <label>Notifications:</label>
          <input
            type="checkbox"
            checked={notifications}
            onChange={(e) => setNotifications(e.target.checked)}
          />
        </div>
        <div>
          <label>Default View:</label>
          <select value={defaultView} onChange={(e) => setDefaultView(e.target.value)}>
            <option value="logs">Logs</option>
            <option value="monitoring">Monitoring</option>
          </select>
        </div>
      </div>
    </div>
  );
}

export default SaveSystem; 