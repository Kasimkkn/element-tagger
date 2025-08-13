mport { ElementTagger } from './core';
import { VitePlugin } from './plugins/vite-plugin';
import { WebpackPlugin } from './plugins/webpack-plugin';
import { NextPlugin } from './plugins/next-plugin';
import { RuntimeTracker } from './runtime';
import { VisualEditor } from './editor';
import { CodeSynchronizer } from './sync';
import { CodeExporter } from './export';

// Main class
export { ElementTagger };

// Plugin integrations
export const plugins = {
    vite: VitePlugin,
    webpack: WebpackPlugin,
    next: NextPlugin
} as const;

// Runtime functionality
export { RuntimeTracker };

// Editor components
export { VisualEditor };

// Code synchronization
export { CodeSynchronizer };

// Export functionality
export { CodeExporter };

// Modes
export { DevelopmentMode, ProductionMode, ExportMode } from './modes';

// Types
export type * from './types';

// Default export for easy usage
export default ElementTagger;