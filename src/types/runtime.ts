/**
 * Runtime types for browser environment
 */

export interface RuntimeConfig {
    enableClickHandler?: boolean;
    enableHighlighter?: boolean;
    highlightColor?: string;
    highlightOpacity?: number;
}

export interface ElementTracker {
    track(elementId: string): void;
    untrack(elementId: string): void;
    getTracked(): string[];
}

export interface ClickHandler {
    onElementClick(callback: (elementId: string, element: HTMLElement) => void): void;
    removeClickHandler(): void;
}

export interface ElementHighlighter {
    highlight(elementId: string): void;
    unhighlight(elementId: string): void;
    clearAll(): void;
}