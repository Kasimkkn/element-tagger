/**
 * Editor types for visual editing functionality
 */

export interface EditorConfig {
    enableInlineEditing?: boolean;
    enablePropertiesPanel?: boolean;
    enableStyleEditor?: boolean;
    theme?: 'light' | 'dark' | 'auto';
}

export interface PropertyEditor {
    editProperty(elementId: string, property: string, value: any): void;
    getProperty(elementId: string, property: string): any;
}

export interface StyleEditor {
    editStyle(elementId: string, property: string, value: string): void;
    getStyle(elementId: string, property: string): string;
    getComputedStyles(elementId: string): CSSStyleDeclaration;
}

export interface InlineEditor {
    startEditing(elementId: string): void;
    stopEditing(): void;
    saveChanges(): void;
    cancelChanges(): void;
}

export interface SelectionManager {
    select(elementId: string): void;
    deselect(): void;
    getSelected(): string | null;
    onSelectionChange(callback: (elementId: string | null) => void): void;
}