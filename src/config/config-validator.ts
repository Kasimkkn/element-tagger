import type { ElementTaggerOptions, ConfigValidationResult } from '../types/config';

/**
 * Configuration validator class
 */
export class ConfigValidator {
    private errors: string[] = [];
    private warnings: string[] = [];

    /**
     * Validate complete configuration
     */
    validate(config: ElementTaggerOptions): ConfigValidationResult {
        this.errors = [];
        this.warnings = [];

        this.validateMode(config.mode);
        this.validateFilePatterns(config);
        this.validateTaggingOptions(config.tagElements);
        this.validateIdGeneration(config.idGeneration);
        this.validateRuntimeOptions(config.runtime);
        this.validateEditorOptions(config.editor);

        return {
            isValid: this.errors.length === 0,
            errors: this.errors,
            warnings: this.warnings,
            config: this.errors.length === 0 ? config : undefined
        };
    }

    private validateMode(mode?: string): void {
        if (mode && !['development', 'production', 'export'].includes(mode)) {
            this.errors.push(`Invalid mode: ${mode}. Must be 'development', 'production', or 'export'.`);
        }
    }

    private validateFilePatterns(config: ElementTaggerOptions): void {
        if (config.include && !Array.isArray(config.include)) {
            this.errors.push('Include patterns must be an array of strings.');
        }

        if (config.exclude && !Array.isArray(config.exclude)) {
            this.errors.push('Exclude patterns must be an array of strings.');
        }

        if (config.mappingFile && typeof config.mappingFile !== 'string') {
            this.errors.push('Mapping file must be a string.');
        }
    }

    private validateTaggingOptions(options?: any): void {
        if (!options) return;

        if (typeof options !== 'object') {
            this.errors.push('Tag elements options must be an object.');
            return;
        }

        const booleanFields = ['domElements', 'customComponents', 'fragments', 'textNodes'];
        booleanFields.forEach(field => {
            if (options[field] !== undefined && typeof options[field] !== 'boolean') {
                this.errors.push(`tagElements.${field} must be a boolean.`);
            }
        });
    }

    private validateIdGeneration(options?: any): void {
        if (!options) return;

        if (typeof options !== 'object') {
            this.errors.push('ID generation options must be an object.');
            return;
        }

        if (options.hashLength && (typeof options.hashLength !== 'number' || options.hashLength < 4 || options.hashLength > 32)) {
            this.errors.push('hashLength must be a number between 4 and 32.');
        }

        if (options.idFormat && typeof options.idFormat !== 'string') {
            this.errors.push('idFormat must be a string.');
        }

        if (options.idFormat && !options.idFormat.includes('{hash}')) {
            this.warnings.push('idFormat should include {hash} placeholder for uniqueness.');
        }

        if (options.separator && typeof options.separator !== 'string') {
            this.errors.push('separator must be a string.');
        }
    }

    private validateRuntimeOptions(options?: any): void {
        if (!options) return;

        if (typeof options !== 'object') {
            this.errors.push('Runtime options must be an object.');
            return;
        }

        if (options.highlightOpacity !== undefined) {
            if (typeof options.highlightOpacity !== 'number' || options.highlightOpacity < 0 || options.highlightOpacity > 1) {
                this.errors.push('highlightOpacity must be a number between 0 and 1.');
            }
        }

        if (options.highlightColor && typeof options.highlightColor !== 'string') {
            this.errors.push('highlightColor must be a string.');
        }

        const booleanFields = ['enableClickHandler', 'enableHighlighter', 'enableHoverEffects', 'enableKeyboardShortcuts'];
        booleanFields.forEach(field => {
            if (options[field] !== undefined && typeof options[field] !== 'boolean') {
                this.errors.push(`runtime.${field} must be a boolean.`);
            }
        });
    }

    private validateEditorOptions(options?: any): void {
        if (!options) return;

        if (typeof options !== 'object') {
            this.errors.push('Editor options must be an object.');
            return;
        }

        if (options.autoSaveDelay !== undefined) {
            if (typeof options.autoSaveDelay !== 'number' || options.autoSaveDelay < 100) {
                this.warnings.push('autoSaveDelay should be at least 100ms to avoid performance issues.');
            }
        }

        if (options.theme && !['light', 'dark', 'auto'].includes(options.theme)) {
            this.errors.push('theme must be "light", "dark", or "auto".');
        }

        const booleanFields = [
            'enableInlineEditing',
            'enablePropertiesPanel',
            'enableStyleEditor',
            'enableDragAndDrop',
            'autoSave',
            'showElementBoundaries',
            'enableUndoRedo'
        ];

        booleanFields.forEach(field => {
            if (options[field] !== undefined && typeof options[field] !== 'boolean') {
                this.errors.push(`editor.${field} must be a boolean.`);
            }
        });
    }

    /**
     * Quick validation without full object creation
     */
    static isValid(config: ElementTaggerOptions): boolean {
        const validator = new ConfigValidator();
        const result = validator.validate(config);
        return result.isValid;
    }

    /**
     * Get validation errors for a config
     */
    static getErrors(config: ElementTaggerOptions): string[] {
        const validator = new ConfigValidator();
        const result = validator.validate(config);
        return result.errors;
    }
}