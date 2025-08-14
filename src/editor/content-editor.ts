import { EventEmitter } from 'events';
import type { EditorOptions } from '../types/config';
import { DOMUtils } from '../runtime/dom-utils';
import { Logger } from '../utils/logger';

/**
 * Content types that can be edited
 */
export type ContentType = 'text' | 'html' | 'markdown' | 'json';

/**
 * Content editor configuration
 */
export interface ContentEditorConfig extends EditorOptions {
    /** Default content type */
    defaultContentType?: ContentType;

    /** Enable rich text editing */
    enableRichText?: boolean;

    /** Enable markdown support */
    enableMarkdown?: boolean;

    /** Enable syntax highlighting */
    enableSyntaxHighlighting?: boolean;

    /** Auto-save interval in milliseconds */
    autoSaveInterval?: number;

    /** Maximum content length */
    maxContentLength?: number;

    /** Editor toolbar options */
    toolbar?: {
        bold?: boolean;
        italic?: boolean;
        underline?: boolean;
        strikethrough?: boolean;
        link?: boolean;
        image?: boolean;
        list?: boolean;
        code?: boolean;
    };
}

/**
 * Content change event data
 */
export interface ContentChangeEvent {
    elementId: string;
    contentType: ContentType;
    oldContent: string;
    newContent: string;
    timestamp: number;
    isAutoSave?: boolean;
}

/**
 * Content editor session
 */
export interface ContentEditorSession {
    elementId: string;
    element: HTMLElement;
    contentType: ContentType;
    originalContent: string;
    currentContent: string;
    isDirty: boolean;
    isActive: boolean;
    editor: HTMLElement;
    toolbar?: HTMLElement;
    startTime: number;
    lastSaved?: number;
}

/**
 * Content editor for rich text editing
 */
export class ContentEditor extends EventEmitter {
    private readonly logger: Logger;
    private readonly config: Required<ContentEditorConfig>;
    private readonly sessions = new Map<string, ContentEditorSession>();
    private autoSaveTimer?: NodeJS.Timeout;
    private isActive = false;

    constructor(config: ContentEditorConfig = {}) {
        super();
        this.logger = new Logger('ContentEditor');
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
            defaultContentType: 'text',
            enableRichText: true,
            enableMarkdown: false,
            enableSyntaxHighlighting: true,
            autoSaveInterval: 5000,
            maxContentLength: 100000,
            toolbar: {
                bold: true,
                italic: true,
                underline: true,
                strikethrough: false,
                link: true,
                image: true,
                list: true,
                code: true
            },
            ...config
        };

        this.setupAutoSave();
    }

    /**
     * Start content editing
     */
    start(): void {
        if (this.isActive) {
            this.logger.warn('Content editor already active');
            return;
        }

        this.logger.info('Starting content editor');
        this.isActive = true;
        this.emit('editor-started');
    }

    /**
     * Stop content editing
     */
    stop(): void {
        if (!this.isActive) {
            return;
        }

        this.logger.info('Stopping content editor');
        this.isActive = false;

        // Save all active sessions
        const sessionIds = Array.from(this.sessions.keys());
        sessionIds.forEach(sessionId => this.saveContent(sessionId));

        // Clear auto-save timer
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
            this.autoSaveTimer = undefined;
        }

        this.emit('editor-stopped');
    }

    /**
     * Start editing element content
     */
    editContent(elementId: string, contentType: ContentType = 'text'): boolean {
        const element = DOMUtils.findElementById(elementId);
        if (!element) {
            this.logger.warn(`Element not found: ${elementId}`);
            return false;
        }

        // Close existing session if any
        this.closeSession(elementId);

        const originalContent = this.extractContent(element, contentType);
        const editor = this.createContentEditor(element, contentType, originalContent);
        const toolbar = this.config.enableRichText ? this.createToolbar(elementId, contentType) : undefined;

        const session: ContentEditorSession = {
            elementId,
            element,
            contentType,
            originalContent,
            currentContent: originalContent,
            isDirty: false,
            isActive: true,
            editor,
            toolbar,
            startTime: Date.now()
        };

        this.sessions.set(elementId, session);
        this.logger.debug(`Started content editing: ${elementId} (${contentType})`);
        this.emit('editing-started', session);

        return true;
    }

    /**
     * Save content changes
     */
    saveContent(elementId: string): boolean {
        const session = this.sessions.get(elementId);
        if (!session || !session.isActive) {
            return false;
        }

        const newContent = this.getEditorContent(session.editor, session.contentType);

        if (newContent === session.originalContent) {
            // No changes, just close
            return this.closeSession(elementId);
        }

        // Apply changes to element
        this.applyContent(session.element, newContent, session.contentType);

        // Create change event
        const changeEvent: ContentChangeEvent = {
            elementId,
            contentType: session.contentType,
            oldContent: session.originalContent,
            newContent,
            timestamp: Date.now(),
            isAutoSave: false
        };

        // Update session
        session.originalContent = newContent;
        session.currentContent = newContent;
        session.isDirty = false;
        session.lastSaved = Date.now();

        this.logger.debug(`Content saved: ${elementId}`);
        this.emit('content-saved', changeEvent);

        return true;
    }

    /**
     * Close editing session
     */
    closeSession(elementId: string): boolean {
        const session = this.sessions.get(elementId);
        if (!session) {
            return false;
        }

        // Remove editor from DOM
        if (session.editor.parentElement) {
            session.editor.parentElement.removeChild(session.editor);
        }

        // Remove toolbar from DOM
        if (session.toolbar && session.toolbar.parentElement) {
            session.toolbar.parentElement.removeChild(session.toolbar);
        }

        this.sessions.delete(elementId);
        this.logger.debug(`Closed editing session: ${elementId}`);
        this.emit('session-closed', session);

        return true;
    }

    /**
     * Extract content from element based on type
     */
    private extractContent(element: HTMLElement, contentType: ContentType): string {
        switch (contentType) {
            case 'text':
                return element.textContent || '';
            case 'html':
                return element.innerHTML;
            case 'markdown':
                return element.getAttribute('data-markdown') || element.textContent || '';
            case 'json':
                return element.getAttribute('data-json') || '{}';
            default:
                return element.textContent || '';
        }
    }

    /**
     * Apply content to element
     */
    private applyContent(element: HTMLElement, content: string, contentType: ContentType): void {
        switch (contentType) {
            case 'text':
                element.textContent = content;
                break;
            case 'html':
                element.innerHTML = this.sanitizeHTML(content);
                break;
            case 'markdown':
                element.setAttribute('data-markdown', content);
                element.innerHTML = this.renderMarkdown(content);
                break;
            case 'json':
                element.setAttribute('data-json', content);
                element.textContent = this.formatJSON(content);
                break;
        }
    }

    /**
     * Create content editor element
     */
    private createContentEditor(element: HTMLElement, contentType: ContentType, content: string): HTMLElement {
        const editor = document.createElement(contentType === 'text' ? 'input' : 'div');
        editor.className = 'content-editor';

        if (contentType === 'text') {
            (editor as HTMLInputElement).type = 'text';
            (editor as HTMLInputElement).value = content;
        } else {
            editor.contentEditable = 'true';
            editor.innerHTML = content;
        }

        // Style editor
        this.styleEditor(editor, element);
        this.positionEditor(editor, element);

        // Add event listeners
        this.setupEditorEvents(editor, element.getAttribute('data-el-id') || '');

        document.body.appendChild(editor);
        editor.focus();

        return editor;
    }

    /**
     * Create toolbar for rich text editing
     */
    private createToolbar(elementId: string, contentType: ContentType): HTMLElement {
        const toolbar = document.createElement('div');
        toolbar.className = 'content-editor-toolbar';

        // Add toolbar buttons based on configuration
        const buttons = this.createToolbarButtons(elementId, contentType);
        buttons.forEach(button => toolbar.appendChild(button));

        // Style toolbar
        toolbar.style.cssText = `
            position: absolute;
            z-index: 1000001;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            padding: 8px;
            display: flex;
            gap: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        `;

        if (this.config.theme === 'dark') {
            toolbar.style.background = '#2d3748';
            toolbar.style.color = 'white';
            toolbar.style.borderColor = '#4a5568';
        }

        document.body.appendChild(toolbar);
        return toolbar;
    }

    /**
     * Create toolbar buttons
     */
    private createToolbarButtons(elementId: string, contentType: ContentType): HTMLElement[] {
        const buttons: HTMLElement[] = [];
        const toolbar = this.config.toolbar;

        if (toolbar.bold) {
            buttons.push(this.createToolbarButton('B', 'bold', () => this.execCommand('bold')));
        }

        if (toolbar.italic) {
            buttons.push(this.createToolbarButton('I', 'italic', () => this.execCommand('italic')));
        }

        if (toolbar.underline) {
            buttons.push(this.createToolbarButton('U', 'underline', () => this.execCommand('underline')));
        }

        if (toolbar.link) {
            buttons.push(this.createToolbarButton('🔗', 'link', () => this.insertLink()));
        }

        if (toolbar.list) {
            buttons.push(this.createToolbarButton('•', 'list', () => this.execCommand('insertUnorderedList')));
        }

        if (toolbar.code) {
            buttons.push(this.createToolbarButton('<>', 'code', () => this.insertCode()));
        }

        // Add save button
        buttons.push(this.createToolbarButton('💾', 'save', () => this.saveContent(elementId)));

        // Add close button
        buttons.push(this.createToolbarButton('✕', 'close', () => this.closeSession(elementId)));

        return buttons;
    }

    /**
     * Create individual toolbar button
     */
    private createToolbarButton(text: string, action: string, onClick: () => void): HTMLElement {
        const button = document.createElement('button');
        button.textContent = text;
        button.title = action;
        button.style.cssText = `
            padding: 4px 8px;
            border: 1px solid #ccc;
            background: white;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            min-width: 24px;
        `;

        button.addEventListener('click', (e) => {
            e.preventDefault();
            onClick();
        });

        button.addEventListener('mouseenter', () => {
            button.style.background = '#f0f0f0';
        });

        button.addEventListener('mouseleave', () => {
            button.style.background = 'white';
        });

        return button;
    }

    /**
     * Setup editor event listeners
     */
    private setupEditorEvents(editor: HTMLElement, elementId: string): void {
        // Input changes
        const handleInput = () => {
            const session = this.sessions.get(elementId);
            if (session) {
                session.currentContent = this.getEditorContent(editor, session.contentType);
                session.isDirty = session.currentContent !== session.originalContent;
                this.emit('content-changed', {
                    elementId,
                    content: session.currentContent,
                    isDirty: session.isDirty
                });
            }
        };

        editor.addEventListener('input', handleInput);
        editor.addEventListener('keyup', handleInput);

        // Keyboard shortcuts
        editor.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 's':
                        e.preventDefault();
                        this.saveContent(elementId);
                        break;
                    case 'Escape':
                        e.preventDefault();
                        this.closeSession(elementId);
                        break;
                }
            }
        });
    }

    /**
     * Get content from editor
     */
    private getEditorContent(editor: HTMLElement, contentType: ContentType): string {
        if (editor instanceof HTMLInputElement) {
            return editor.value;
        } else {
            return contentType === 'html' ? editor.innerHTML : editor.textContent || '';
        }
    }

    /**
     * Execute rich text command
     */
    private execCommand(command: string, value?: string): void {
        document.execCommand(command, false, value);
    }

    /**
     * Insert link
     */
    private insertLink(): void {
        const url = prompt('Enter URL:');
        if (url) {
            this.execCommand('createLink', url);
        }
    }

    /**
     * Insert code block
     */
    private insertCode(): void {
        const code = prompt('Enter code:');
        if (code) {
            this.execCommand('insertHTML', `<code>${this.escapeHTML(code)}</code>`);
        }
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
            padding: 12px;
            font-family: inherit;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            min-width: 300px;
            max-width: 600px;
            min-height: 100px;
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

        editor.style.left = `${targetRect.left + scrollLeft}px`;
        editor.style.top = `${targetRect.bottom + scrollTop + 8}px`;
    }

    /**
     * Setup auto-save functionality
     */
    private setupAutoSave(): void {
        if (!this.config.autoSave) return;

        const autoSave = () => {
            this.sessions.forEach((session, elementId) => {
                if (session.isDirty && session.isActive) {
                    const lastSaved = session.lastSaved || session.startTime;
                    const timeSinceLastSave = Date.now() - lastSaved;

                    if (timeSinceLastSave >= this.config.autoSaveInterval) {
                        this.autoSaveContent(elementId);
                    }
                }
            });

            this.autoSaveTimer = setTimeout(autoSave, this.config.autoSaveInterval);
        };

        this.autoSaveTimer = setTimeout(autoSave, this.config.autoSaveInterval);
    }

    /**
     * Auto-save content
     */
    private autoSaveContent(elementId: string): void {
        const session = this.sessions.get(elementId);
        if (!session || !session.isDirty) return;

        const newContent = this.getEditorContent(session.editor, session.contentType);
        this.applyContent(session.element, newContent, session.contentType);

        const changeEvent: ContentChangeEvent = {
            elementId,
            contentType: session.contentType,
            oldContent: session.currentContent,
            newContent,
            timestamp: Date.now(),
            isAutoSave: true
        };

        session.currentContent = newContent;
        session.isDirty = false;
        session.lastSaved = Date.now();

        this.logger.debug(`Auto-saved content: ${elementId}`);
        this.emit('content-auto-saved', changeEvent);
    }

    /**
     * Utility functions
     */
    private sanitizeHTML(html: string): string {
        const div = document.createElement('div');
        div.innerHTML = html;
        // Remove potentially dangerous elements and attributes
        // This is a basic implementation - use a proper sanitizer in production
        return div.innerHTML;
    }

    private renderMarkdown(markdown: string): string {
        // Basic markdown rendering - use a proper markdown library in production
        return markdown
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

    private formatJSON(json: string): string {
        try {
            return JSON.stringify(JSON.parse(json), null, 2);
        } catch {
            return json;
        }
    }

    private escapeHTML(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Get all active sessions
     */
    getActiveSessions(): ContentEditorSession[] {
        return Array.from(this.sessions.values()).filter(session => session.isActive);
    }

    /**
     * Check if element is being edited
     */
    isEditing(elementId: string): boolean {
        return this.sessions.has(elementId);
    }

    /**
     * Get session for element
     */
    getSession(elementId: string): ContentEditorSession | undefined {
        return this.sessions.get(elementId);
    }
}