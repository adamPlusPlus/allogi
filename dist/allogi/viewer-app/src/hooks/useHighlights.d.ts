export interface Highlight {
    id: string;
    name: string;
    scriptId?: string;
    moduleId?: string;
    methodId?: string;
    valueId?: string;
    color: string;
    pattern: string;
    target: string;
}
export interface HighlightMatch {
    highlight: Highlight;
    elementId: string;
    elementType: 'log' | 'variable' | 'state' | 'function' | 'property' | 'event';
}
export declare function useHighlights(): {
    highlights: Highlight[];
    getHighlightForElement: (elementType: "log" | "variable" | "state" | "function" | "property" | "event", scriptId?: string, moduleId?: string, name?: string, logMessage?: string) => Highlight | null;
    getHighlightStyles: (elementType: "log" | "variable" | "state" | "function" | "property" | "event", scriptId?: string, moduleId?: string, name?: string, logMessage?: string) => {
        className: string;
        style: {};
        isHighlighted: boolean;
        highlight?: undefined;
        dataAttributes?: undefined;
    } | {
        className: string;
        style: React.CSSProperties;
        isHighlighted: boolean;
        highlight: Highlight;
        dataAttributes: {
            'data-highlight-name': string;
        };
    };
    updateHighlights: (newHighlights: Highlight[]) => void;
    isElementHighlighted: (elementType: "log" | "variable" | "state" | "function" | "property" | "event", scriptId?: string, moduleId?: string, name?: string, logMessage?: string) => Highlight | null;
};
