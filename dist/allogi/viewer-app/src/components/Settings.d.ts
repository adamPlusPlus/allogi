import React from 'react';
import '../styles/Settings.css';
interface SettingsProps {
    isOpen: boolean;
    onClose: () => void;
}
declare const Settings: React.FC<SettingsProps>;
export default Settings;
