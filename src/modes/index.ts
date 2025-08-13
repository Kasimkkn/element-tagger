import type { ElementTaggerOptions, ProcessingMode } from '../types/config';
import { ElementTagger } from '../core';

/**
 * Development mode configuration
 */
export class DevelopmentMode {
    static getConfig(): Partial<ElementTaggerOptions> {
        return {
            mode: 'development' as ProcessingMode,
            watchFiles: true,
            tagElements: {
                domElements: true,
                customComponents: false,
                fragments: false,
                textNodes: false
            },
            runtime: {
                enableClickHandler: true,
                enableHighlighter: true,
                highlightColor: '#007acc',
                highlightOpacity: 0.3
            },
            editor: {
                enableInlineEditing: true,
                enablePropertiesPanel: true,
                enableStyleEditor: true,
                autoSave: true,
                autoSaveDelay: 1000
            },
            performance: {
                enableCaching: true,
                enableMonitoring: true
            },
            logging: {
                level: 'debug',
                enableColors: true,
                enableTimestamps: true
            }
        };
    }

    static create(options: ElementTaggerOptions = {}): ElementTagger {
        const config = { ...this.getConfig(), ...options };
        return new ElementTagger(config);
    }
}

/**
 * Production mode configuration for user editing
 */
export class ProductionMode {
    static getConfig(): Partial<ElementTaggerOptions> {
        return {
            mode: 'production' as ProcessingMode,
            watchFiles: false,
            tagElements: {
                domElements: true,
                customComponents: true,
                fragments: false,
                textNodes: false
            },
            runtime: {
                enableClickHandler: true,
                enableHighlighter: true,
                highlightColor: '#28a745',
                highlightOpacity: 0.2
            },
            editor: {
                enableInlineEditing: true,
                enablePropertiesPanel: true,
                enableStyleEditor: true,
                autoSave: true,
                autoSaveDelay: 500
            },
            sync: {
                enableRealTimeSync: true,
                syncDelay: 1000
            },
            performance: {
                enableCaching: true,
                enableMonitoring: false
            },
            logging: {
                level: 'warn',
                enableColors: false,
                enableTimestamps: true
            }
        };
    }

    static create(options: ElementTaggerOptions = {}): ElementTagger {
        const config = { ...this.getConfig(), ...options };
        return new ElementTagger(config);
    }
}

/**
 * Export mode configuration for clean code generation
 */
export class ExportMode {
    static getConfig(): Partial<ElementTaggerOptions> {
        return {
            mode: 'export' as ProcessingMode,
            watchFiles: false,
            tagElements: {
                domElements: false,
                customComponents: false,
                fragments: false,
                textNodes: false
            },
            export: {
                stripTaggingAttributes: true,
                minify: true,
                removeComments: true,
                includeSourceMaps: false
            },
            performance: {
                enableCaching: false,
                enableMonitoring: false
            },
            logging: {
                level: 'info',
                enableColors: false,
                enableTimestamps: false
            }
        };
    }

    static create(options: ElementTaggerOptions = {}): ElementTagger {
        const config = { ...this.getConfig(), ...options };
        return new ElementTagger(config);
    }
}

/**
 * Mode factory for creating ElementTagger instances
 */
export class ModeFactory {
    static development(options?: ElementTaggerOptions): ElementTagger {
        return DevelopmentMode.create(options);
    }

    static production(options?: ElementTaggerOptions): ElementTagger {
        return ProductionMode.create(options);
    }

    static export(options?: ElementTaggerOptions): ElementTagger {
        return ExportMode.create(options);
    }

    static fromMode(mode: ProcessingMode, options?: ElementTaggerOptions): ElementTagger {
        switch (mode) {
            case 'development':
                return this.development(options);
            case 'production':
                return this.production(options);
            case 'export':
                return this.export(options);
            default:
                throw new Error(`Unknown processing mode: ${mode}`);
        }
    }
}

// Export mode configurations
export const modes = {
    development: DevelopmentMode,
    production: ProductionMode,
    export: ExportMode
} as const;

// Default export
export { ModeFactory as default };