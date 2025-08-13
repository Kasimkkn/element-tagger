import type { ElementTaggerOptions } from '../types';

export const DEFAULT_CONFIG: Required<ElementTaggerOptions> = {
    // Processing options
    mode: 'development',
    include: [
        '**/*.jsx',
        '**/*.tsx',
        '**/*.js', // If contains JSX
        '**/*.ts'  // If contains JSX
    ],
    exclude: [
        'node_modules/**',
        'dist/**',
        'build/**',
        '.next/**',
        'coverage/**',
        '**/*.test.*',
        '**/*.spec.*'
    ],

    // ID generation
    idPrefix: '',
    idFormat: '{filename}-{element}-{hash}',
    hashLength: 8,

    // Mapping and persistence
    mappingFile: '.element-mapping.json',
    watchFiles: true,

    // Element detection
    tagElements: {
        domElements: true,      // div, span, h1, etc.
        customComponents: false, // Custom React components
        fragments: false,       // React.Fragment
        textNodes: false        // Text content
    },

    // Runtime settings
    runtime: {
        enableClickHandler: true,
        enableHighlighter: true,
        highlightColor: '#007acc',
        highlightOpacity: 0.3
    },

    // Editor settings
    editor: {
        enableInlineEditing: true,
        enablePropertiesPanel: true,
        enableStyleEditor: true,
        autoSave: true,
        autoSaveDelay: 1000
    }
}