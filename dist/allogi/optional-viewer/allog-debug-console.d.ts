/**
 * Allog Debug Console - React-based overlay for viewing and managing logs
 * Moved to optional viewer location outside core allog
 */
interface DebugConsoleProps {
    visible?: boolean;
    onClose?: () => void;
    position?: 'top' | 'bottom' | 'full';
    serverUrl?: string;
}
export default function AllogDebugConsole({ visible, onClose, position, serverUrl }: DebugConsoleProps): JSX.Element;
export declare function AllogDebugButton({ onPress }: {
    onPress: () => void;
}): JSX.Element;
export {};
