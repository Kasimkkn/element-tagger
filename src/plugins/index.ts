/**
 * Build tool plugins for Element Tagger
 * TODO: Implement full plugin functionality
 */

export class VitePlugin {
    constructor() {
        console.warn('VitePlugin not yet implemented');
    }
}

export class WebpackPlugin {
    constructor() {
        console.warn('WebpackPlugin not yet implemented');
    }
}

export class NextPlugin {
    constructor() {
        console.warn('NextPlugin not yet implemented');
    }
}

// Export plugins
export const plugins = {
    vite: VitePlugin,
    webpack: WebpackPlugin,
    next: NextPlugin
} as const;