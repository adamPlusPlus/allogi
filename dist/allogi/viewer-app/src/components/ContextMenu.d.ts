import React from 'react';
export interface ContextMenuProps {
    isVisible: boolean;
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
}
export interface ContextMenuItem {
    id: string;
    label: string;
    icon?: string;
    action: () => void;
    disabled?: boolean;
    separator?: boolean;
    submenu?: ContextMenuItem[];
}
export default function ContextMenu({ isVisible, x, y, items, onClose }: ContextMenuProps): React.JSX.Element;
