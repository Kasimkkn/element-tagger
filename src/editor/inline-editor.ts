import { EventEmitter } from 'events';
import type { EditorOptions } from '../types/config';
import { DOMUtils } from '../runtime/dom-utils';
import { Logger } from '../utils/logger';

/**
 * Editable content types
 */
export type EditableContentType = 'text' | 'html' | 'attribute' | 'style';

/**
 * Edit session data
 */
export interface EditSession {
    elementId: string;
    element: HTMLElement;
    contentType: EditableContentType;
    originalValue: string;
    currentValue: string;
    target: string; // attribute name or 'textContent'
    editor: HTMLElement;
    isActive: boolean;
    startTime: number;
}

/**
 * Inline editor configuration
 */
export interface InlineEditorConfig extends EditorOptions {
    /** Enable text editing */
    enableTextEditing?: boolean;

    /** Enable HTML editing */
    enableHtmlEditing?: boolean;

    /** Enable attribute editing */
    enableAttributeEditing?: boolean;

    /** Enable style editing */
    enableStyleEditing?: boolean;

    /** Auto-focus editor on creation */
    autoFocus?: boolean;

    /** Editor CSS classes */
    editorClasses?: string[];

    /** Escape key cancels editing */
    escapeToCancel?: boolean;

    /** Enter key saves changes */
    enterToSave?: boolean;

    /** Click outside saves changes */
    clickOutsideToSave?: boolean;
}

/**
 * Edit change event
 */
export interface EditChangeEvent {
    elementId: string;
    contentType: EditableContentType;
    target: string;
    oldValue: string;
    newValue: string;
    timestamp: number;
}

/**
 * Inline editor for live content editing
 */
export class InlineEditor extends EventEmitter {
    private readonly logger: Logger;
    private readonly config: Required<InlineEditorConfig>;
    private readonly activeSessions = new Map<string, EditSession>();
    private isActive = false;

    constructor(config: InlineEditorConfig = {}) {
        super();
        this.logger = new Logger('InlineEditor');
        this.config = {
            enableInlineEditing: true,
            enablePropertiesPanel: true,
            enableStyleEditor: true,
            enableDragAndDrop: false,
            autoSave: true,
            autoSaveDelay: 1000,
            showElementBoundaries: false,
            enableUndoRedo: true,
            maxUndoHistory: 50,
            theme: 'light',
            panels: {},
            enableTextEditing: true,
            enableHtmlEditing: false,
            enableAttributeEditing: true,
            enableStyleEditing: true,
            autoFocus: true,
            editorClasses: ['element-tagger-inline-editor'],
            escapeToCancel: true,
            enterToSave: true,
            clickOutsideToSave: true,
            ...config
        };

        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleClickOutside = this.handleClickOutside.bind(this);
    }

    /**
     * Start inline editing
     */
    start(): void {
        if (this.isActive) {
            this.logger.warn('Inline editor already active');
            return;
        }

        this.logger.info('Starting inline editor');
        this.isActive = true;

        // Add global event listeners
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('click', this.handleClickOutside);

        this.emit('editor-started');
    }

    /**
     * Stop inline editing
     */
    stop(): void {
        if (!this.isActive) {
            return;
        }

        this.logger.info('Stopping inline editor');
        this.isActive = false;

        // Cancel all active sessions
        const sessionIds = Array.from(this.activeSessions.keys());
        sessionIds.forEach(sessionId => this.cancelEditing(sessionId));

        // Remove event listeners
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('click', this.handleClickOutside);

        this.emit('editor-stopped');
    }

    /**
     * Start editing element text content
     */
    editText(elementId: string): boolean {
        if (!this.config.enableTextEditing) {
            this.logger.warn('Text editing is disabled');
            return false;
        }

        const element = DOMUtils.findElementById(elementId);
        if (!element) {
            this.logger.warn(`Element not found: ${elementId}`);
            return false;
        }

        // Cancel any existing session for this element
        this.cancelEditing(elementId);

        const originalValue = DOMUtils.getTextContent(element);
        const editor = this.createTextEditor(element, originalValue);

        const session: EditSession = {
            elementId,
            element,
            contentType: 'text',
            originalValue,
            currentValue: originalValue,
            target: 'textContent',
            editor,
            isActive: true,
            startTime: Date.now()
        };

        this.activeSessions.set(elementId, session);
        this.logger.debug(`Started text editing: ${elementId}`);
        this.emit('editing-started', session);

        return true;
    }

    /**
     * Start editing element HTML content
     */
    editHtml(elementId: string): boolean {
        if (!this.config.enableHtmlEditing) {
            this.logger.warn('HTML editing is disabled');
            return false;
        }

        const element = DOMUtils.findElementById(elementId);
        if (!element) {
            this.logger.warn(`Element not found: ${elementId}`);
            return false;
        }

        this.cancelEditing(elementId);

        const originalValue = element.innerHTML;
        const editor = this.createHtmlEditor(element, originalValue);

        const session: EditSession = {
            elementId,
            element,
            contentType: 'html',
            originalValue,
            currentValue: originalValue,
            target: 'innerHTML',
            editor,
            isActive: true,
            startTime: Date.now()
        };

        this.activeSessions.set(elementId, session);
        this.logger.debug(`Started HTML editing: ${elementId}`);
        this.emit('editing-started', session);

        return true;
    }

    /**
     * Start editing element attribute
     */
    editAttribute(elementId: string, attributeName: string): boolean {
        if (!this.config.enableAttributeEditing) {
            this.logger.warn('Attribute editing is disabled');
            return false;
        }

        const element = DOMUtils.findElementById(elementId);
        if (!element) {
            this.logger.warn(`Element not found: ${elementId}`);
            return false;
        }

        const sessionKey = `${elementId}-${attributeName}`;
        this.cancelEditing(sessionKey);

        const originalValue = element.getAttribute(attributeName) || '';
        const editor = this.createAttributeEditor(element, attributeName, originalValue);

        const session: EditSession = {
            elementId: sessionKey,
            element,
            contentType: 'attribute',
            originalValue,
            currentValue: originalValue,
            target: attributeName,
            editor,
            isActive: true,
            startTime: Date.now()
        };

        this.activeSessions.set(sessionKey, session);
        this.logger.debug(`Started attribute editing: ${elementId}.${attributeName}`);
        this.emit('editing-started', session);

        return true;
    }

    /**
     * Start editing element style property
     */
    editStyle(elementId: string, propertyName: string): boolean {
        if (!this.config.enableStyleEditing) {
            this.logger.warn('Style editing is disabled');
            return false;
        }

        const element = DOMUtils.findElementById(elementId);
        if (!element) {
            this.logger.warn(`Element not found: ${elementId}`);
            return false;
        }

        const sessionKey = `${elementId}-style-${propertyName}`;
        this.cancelEditing(sessionKey);

        const originalValue = element.style.getPropertyValue(propertyName) || '';
        const editor = this.createStyleEditor(element, propertyName, originalValue);

        const session: EditSession = {
            elementId: sessionKey,
            element,
            contentType: 'style',
            originalValue,
            currentValue: originalValue,
            target: propertyName,
            editor,
            isActive: true,
            startTime: Date.now()
        };

        this.activeSessions.set(sessionKey, session);
        this.logger.debug(`Started style editing: ${elementId}.${propertyName}`);
        this.emit('editing-started', session);

        return true;
    }

    /**
     * Save changes and end editing session
     */
    saveChanges(sessionId: string): boolean {
        const session = this.activeSessions.get(sessionId);
        if (!session || !session.isActive) {
            return false;
        }

        const newValue = this.getEditorValue(session.editor, session.contentType);

        if (newValue === session.originalValue) {
            // No changes, just cancel
            return this.cancelEditing(sessionId);
        }

        // Apply changes to element
        this.applyChanges(session, newValue);

        // Create change event
        const changeEvent: EditChangeEvent = {
            elementId: session.elementId,
            contentType: session.contentType,
            target: session.target,
            oldValue: session.originalValue,
            newValue,
            timestamp: Date.now()
        };

        // Clean up session
        this.cleanupSession(session);
        this.activeSessions.delete(sessionId);

        this.logger.debug(`Saved changes: ${sessionId}`);
        this.emit('changes-saved', changeEvent);

        // Auto-save if enabled
        if (this.config.autoSave) {
            setTimeout(() => {
                this.emit('auto-save-triggered', changeEvent);
            }, this.config.autoSaveDelay);
        }

        return true;
    }

    /**
     * Cancel editing session without saving
     */
    cancelEditing(sessionId: string): boolean {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            return false;
        }

        this.cleanupSession(session);
        this.activeSessions.delete(sessionId);

        this.logger.debug(`Cancelled editing: ${sessionId}`);
        this.emit('editing-cancelled', session);

        return true;
    }

    /**
     * Get active editing sessions
     */
    getActiveSessions(): EditSession[] {
        return Array.from(this.activeSessions.values()).filter(session => session.isActive);
    }

    /**
     * Check if element is being edited
     */
    isEditing(elementId: string): boolean {
        return this.activeSessions.has(elementId);
    }

    /**
     * Create text editor
     */
    private createTextEditor(element: HTMLElement, value: string): HTMLElement {
        const editor = document.createElement('input');
        editor.type = 'text';
        editor.value = value;
        editor.className = this.config.editorClasses.join(' ');

        this.styleEditor(editor, element);
        this.positionEditor(editor, element);

        document.body.appendChild(editor);

        if (this.config.autoFocus) {
            editor.focus();
            editor.select();
        }

        return editor;
    }

    /**
     * Create HTML editor
     */
    private createHtmlEditor(element: HTMLElement, value: string): HTMLElement {
        const editor = document.createElement('textarea');
        editor.value = value;
        editor.className = this.config.editorClasses.join(' ');
        editor.rows = Math.min(10, Math.max(3, value.split('\n').length));

        this.styleEditor(editor, element);
        this.positionEditor(editor, element);

        document.body.appendChild(editor);

        if (this.config.autoFocus) {
            editor.focus();
            editor.select();
        }

        return editor;
    }

    /**
     * Create attribute editor
     */
    private createAttributeEditor(element: HTMLElement, attributeName: string, value: string): HTMLElement {
        const container = document.createElement('div');
        container.className = this.config.editorClasses.join(' ') + ' attribute-editor';

        const label = document.createElement('label');
        label.textContent = `${attributeName}:`;
        label.style.display = 'block';
        label.style.fontWeight = 'bold';
        label.style.marginBottom = '4px';

        const editor = document.createElement('input');
        editor.type = 'text';
        editor.value = value;
        editor.style.width = '100%';

        container.appendChild(label);
        container.appendChild(editor);

        this.styleEditor(container, element);
        this.positionEditor(container, element);

        document.body.appendChild(container);

        if (this.config.autoFocus) {
            editor.focus();
            editor.select();
        }

        return container;
    }

    /**
     * Create style editor
     */
    private createStyleEditor(element: HTMLElement, propertyName: string, value: string): HTMLElement {
        const container = document.createElement('div');
        container.className = this.config.editorClasses.join(' ') + ' style-editor';

        const label = document.createElement('label');
        label.textContent = `${propertyName}:`;
        label.style.display = 'block';
        label.style.fontWeight = 'bold';
        label.style.marginBottom = '4px';

        const editor = document.createElement('input');
        editor.type = 'text';
        editor.value = value;
        editor.style.width = '100%';

        // Add suggestions for common CSS properties
        if (propertyName === 'color' || propertyName === 'background-color') {
            editor.type = 'color';
        }

        container.appendChild(label);
        container.appendChild(editor);

        this.styleEditor(container, element);
        this.positionEditor(container, element);

        document.body.appendChild(container);

        if (this.config.autoFocus) {
            editor.focus();
            if (editor.type === 'text') {
                editor.select();
            }
        }

        return container;
    }

    /**
     * Style editor element
     */
    private styleEditor(editor: HTMLElement, targetElement: HTMLElement): void {
        editor.style.cssText = `
            position: absolute;
            z-index: 1000000;
            background: white;
            border: 2px solid #007acc;
            border-radius: 4px;
            padding: 8px;
            font-family: inherit;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            max-width: 300px;
        `;

        if (this.config.theme === 'dark') {
            editor.style.background = '#2d3748';
            editor.style.color = 'white';
            editor.style.borderColor = '#4299e1';
        }
    }

    /**
     * Position editor relative to target element
     */
    private positionEditor(editor: HTMLElement, targetElement: HTMLElement): void {
        const targetRect = targetElement.getBoundingClientRect();
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        // Position below the element by default
        let left = targetRect.left + scrollLeft;
        let top = targetRect.bottom + scrollTop + 8;

        // Adjust if editor would go off-screen
        setTimeout(() => {
            const editorRect = editor.getBoundingClientRect();

            // Check right edge
            if (left + editorRect.width > window.innerWidth) {
                left = window.innerWidth - editorRect.width - 16;
            }

            // Check bottom edge
            if (top + editorRect.height > window.innerHeight + scrollTop) {
                top = targetRect.top + scrollTop - editorRect.height - 8;
            }

            // Ensure minimum margins
            left = Math.max(8, left);
            top = Math.max(8, top);

            editor.style.left = `${left}px`;
            editor.style.top = `${top}px`;
        }, 0);

        editor.style.left = `${left}px`;
        editor.style.top = `${top}px`;
    }

    /**
     * Get editor value based on content type
     */
    private getEditorValue(editor: HTMLElement, contentType: EditableContentType): string {
        if (contentType === 'attribute' || contentType === 'style') {
            const input = editor.querySelector('input') as HTMLInputElement;
            return input ? input.value : '';
        } else if (editor instanceof HTMLInputElement) {
            return editor.value;
        } else if (editor instanceof HTMLTextAreaElement) {
            return editor.value;
        }
        return '';
    }

    /**
     * Apply changes to element
     */
    private applyChanges(session: EditSession, newValue: string): void {
        const { element, contentType, target } = session;

        switch (contentType) {
            case 'text':
                element.textContent = newValue;
                break;
            case 'html':
                element.innerHTML = newValue;
                break;
            case 'attribute':
                if (newValue) {
                    element.setAttribute(target, newValue);
                } else {
                    element.removeAttribute(target);
                }
                break;
            case 'style':
                if (newValue) {
                    element.style.setProperty(target, newValue);
                } else {
                    element.style.removeProperty(target);
                }
                break;
        }

        session.currentValue = newValue;
    }

    /**
     * Cleanup editor session
     */
    private cleanupSession(session: EditSession): void {
        session.isActive = false;

        if (session.editor.parentElement) {
            session.editor.parentElement.removeChild(session.editor);
        }
    }

    /**
     * Handle keyboard events
     */
    private handleKeyDown(event: KeyboardEvent): void {
        if (!this.isActive || this.activeSessions.size === 0) {
            return;
        }

        // Find active session for the current focus
        const activeElement = document.activeElement as HTMLElement;
        let activeSession: EditSession | null = null;

        for (const session of this.activeSessions.values()) {
            if (session.editor === activeElement || session.editor.contains(activeElement)) {
                activeSession = session;
                break;
            }
        }

        if (!activeSession) {
            return;
        }

        switch (event.key) {
            case 'Escape':
                if (this.config.escapeToCancel) {
                    event.preventDefault();
                    this.cancelEditing(activeSession.elementId);
                }
                break;
            case 'Enter':
                if (this.config.enterToSave && !event.shiftKey) {
                    event.preventDefault();
                    this.saveChanges(activeSession.elementId);
                }
                break;
        }
    }

    /**
     * Handle click outside editor
     */
    private handleClickOutside(event: MouseEvent): void {
        if (!this.isActive || !this.config.clickOutsideToSave || this.activeSessions.size === 0) {
            return;
        }

        const target = event.target as HTMLElement;

        // Check if click is outside any active editor
        for (const [sessionId, session] of this.activeSessions.entries()) {
            if (!session.editor.contains(target)) {
                this.saveChanges(sessionId);
            }
        }
    }

    /**
     * Get editor statistics
     */
    getStats(): {
        isActive: boolean;
        activeSessions: number;
        totalEdits: number;
        averageEditTime: number;
    } {
        const sessions = Array.from(this.activeSessions.values());
        const currentTime = Date.now();
        const editTimes = sessions.map(s => currentTime - s.startTime);
        const averageEditTime = editTimes.length > 0
            ? editTimes.reduce((sum, time) => sum + time, 0) / editTimes.length
            : 0;

        return {
            isActive: this.isActive,
            activeSessions: sessions.length,
            totalEdits: this.activeSessions.size,
            averageEditTime
        };
    }
}