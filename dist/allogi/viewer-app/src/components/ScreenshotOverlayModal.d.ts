import React from 'react';
interface ScreenshotOverlayModalProps {
    isOpen: boolean;
    imageUrl: string;
    overlay?: any;
    json?: any;
    onClose: () => void;
}
declare const ScreenshotOverlayModal: React.FC<ScreenshotOverlayModalProps>;
export default ScreenshotOverlayModal;
