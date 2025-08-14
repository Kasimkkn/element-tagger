import NextPlugin from './next-plugin';
import RollupPlugin from './rollup-plugin';
import VitePlugin from './vite-plugin';
import WebpackPlugin from './webpack-plugin';

// Export all build tool plugins - now fully implemented!
export { VitePlugin, elementTaggerDev as viteElementTaggerDev, elementTaggerProd as viteElementTaggerProd, elementTaggerExport as viteElementTaggerExport } from './vite-plugin';
export { WebpackPlugin, elementTaggerDev as webpackElementTaggerDev, elementTaggerProd as webpackElementTaggerProd, elementTaggerExport as webpackElementTaggerExport } from './webpack-plugin';
export { NextPlugin, elementTaggerDev as nextElementTaggerDev, elementTaggerProd as nextElementTaggerProd, elementTaggerExport as nextElementTaggerExport, withElementTagger } from './next-plugin';
export { RollupPlugin, elementTaggerDev as rollupElementTaggerDev, elementTaggerProd as rollupElementTaggerProd, elementTaggerExport as rollupElementTaggerExport } from './rollup-plugin';

// Export plugin configurations
export type { ViteElementTaggerConfig } from './vite-plugin';
export type { WebpackElementTaggerConfig } from './webpack-plugin';
export type { NextElementTaggerConfig } from './next-plugin';
export type { RollupElementTaggerConfig } from './rollup-plugin';

// Export examples for quick setup
export { examples as nextExamples } from './next-plugin';
export { examples as rollupExamples } from './rollup-plugin';

// Main plugins object for easy access
export const plugins = {
    vite: VitePlugin,
    webpack: WebpackPlugin,
    next: NextPlugin,
    rollup: RollupPlugin
} as const;

// Quick setup functions
export const setupPlugins = {
    /**
     * Vite setup for different modes
     */
    vite: {
        dev: () => VitePlugin({ mode: 'development', enableInDev: true, enableInProd: false }),
        prod: () => VitePlugin({ mode: 'production', enableInDev: false, enableInProd: true }),
        export: () => VitePlugin({ mode: 'export', enableInDev: false, enableInProd: false })
    },

    /**
     * Webpack setup for different modes
     */
    webpack: {
        dev: () => new WebpackPlugin({ mode: 'development', enableInDev: true, enableInProd: false }),
        prod: () => new WebpackPlugin({ mode: 'production', enableInDev: false, enableInProd: true }),
        export: () => new WebpackPlugin({ mode: 'export', enableInDev: false, enableInProd: false })
    },

    /**
     * Next.js setup for different modes
     */
    next: {
        dev: NextPlugin({ enableInDev: true, enableInProd: false, enableInExport: false }),
        prod: NextPlugin({ enableInDev: false, enableInProd: true, enableInExport: false }),
        export: NextPlugin({ enableInDev: false, enableInProd: false, enableInExport: true })
    },

    /**
     * Rollup setup for different modes
     */
    rollup: {
        dev: () => RollupPlugin({ mode: 'development', enableInDev: true, enableInProd: false }),
        prod: () => RollupPlugin({ mode: 'production', enableInDev: false, enableInProd: true }),
        export: () => RollupPlugin({ mode: 'export', enableInDev: false, enableInProd: false })
    }
};

/**
 * Universal plugin factory - detects build tool and returns appropriate plugin
 */
export function createElementTaggerPlugin(options: {
    mode?: 'development' | 'production' | 'export';
    buildTool?: 'vite' | 'webpack' | 'next' | 'rollup';
    config?: any;
} = {}) {
    const { mode = 'development', buildTool, config = {} } = options;

    // Auto-detect build tool if not specified
    let detectedTool = buildTool;
    if (!detectedTool) {
        // Try to detect from package.json or environment
        if (typeof process !== 'undefined' && process.env) {
            if (process.env.VITE) detectedTool = 'vite';
            else if (process.env.WEBPACK) detectedTool = 'webpack';
            else if (process.env.NEXT) detectedTool = 'next';
        }

        // Default to vite
        detectedTool = detectedTool || 'vite';
    }

    // Return appropriate plugin
    switch (detectedTool) {
        case 'vite':
            return VitePlugin({ mode, ...config });
        case 'webpack':
            return new WebpackPlugin({ mode, ...config });
        case 'next':
            return NextPlugin({ ...config });
        case 'rollup':
            return RollupPlugin({ mode, ...config });
        default:
            throw new Error(`Unsupported build tool: ${detectedTool}`);
    }
}

// Default export for easy usage
export default plugins;