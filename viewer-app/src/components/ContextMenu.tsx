import React, { useEffect, useRef } from 'react';

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

export default function ContextMenu({ isVisible, x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  return (
    <div 
      ref={menuRef}
      className="context-menu"
      style={{ 
        left: x, 
        top: y,
        position: 'fixed',
        zIndex: 1000
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, index) => (
        <React.Fragment key={item.id || index}>
          {item.separator ? (
            <div className="context-menu-separator" />
          ) : (
            <div 
              className={`context-menu-item ${item.disabled ? 'disabled' : ''} ${item.submenu ? 'context-menu-item-submenu' : ''}`}
              onClick={() => {
                if (!item.disabled) {
                  item.action();
                  onClose();
                }
              }}
            >
              {item.icon && <span className="context-menu-icon">{item.icon}</span>}
              <span className="context-menu-label">{item.label}</span>
              {item.submenu && <span className="context-menu-arrow">▶</span>}
              {item.submenu && (
                <div className="context-submenu">
                  {item.submenu.map((subItem, subIndex) => (
                    <div 
                      key={subItem.id || subIndex}
                      className={`context-menu-item ${subItem.disabled ? 'disabled' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!subItem.disabled) {
                          subItem.action();
                          onClose();
                        }
                      }}
                    >
                      {subItem.icon && <span className="context-menu-icon">{subItem.icon}</span>}
                      <span className="context-menu-label">{subItem.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
} 