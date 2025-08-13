import { ensureDir, writeFile, copyFile, readFile } from 'fs-extra';
import { resolve, relative, dirname, basename } from 'path';
import { performance } from 'perf_hooks';
import { CodeExporter, type ExportConfig } from './code-exporter';
import { AssetBundler, type AssetBundlerConfig } from './asset-bundler';
import type { ExportOptions } from '../types/config';
import { Logger } from '../utils/logger';

/**
 * Project template configuration
 */
export interface ProjectTemplate {
    /** Template name */
    name: string;

    /** Template description */
    description: string;

    /** Template files */
    files: Array<{
        path: string;
        content: string | (() => string);
        condition?: (config: ProjectGeneratorConfig) => boolean;
    }>;

    /** Dependencies to add to package.json */
    dependencies?: Record<string, string>;

    /** Dev dependencies to add to package.json */
    devDependencies?: Record<string, string>;

    /** Scripts to add to package.json */
    scripts?: Record<string, string>;

    /** Post-generation hook */
    postGenerate?: (outputDir: string, config: ProjectGeneratorConfig) => Promise<void>;
}

/**
 * Project generator configuration
 */
export interface ProjectGeneratorConfig {
    /** Source directory */
    sourceDir: string;

    /** Output directory */
    outputDir: string;

    /** Project template */
    template?: ProjectTemplate;

    /** Project metadata */
    project: {
        name: string;
        version?: string;
        description?: string;
        author?: string;
        license?: string;
        repository?: string;
    };

    /** Export options */
    export?: ExportOptions;

    /** Asset bundling options */
    assets?: Partial<AssetBundlerConfig>;

    /** Framework-specific options */
    framework?: {
        type: 'react' | 'vue' | 'angular' | 'vanilla';
        version?: string;
        features?: string[];
    };

    /** Build system */
    buildSystem?: {
        type: 'vite' | 'webpack' | 'rollup' | 'none';
        config?: Record<string, any>;
    };

    /** Additional configurations */
    features?: {
        typescript?: boolean;
        eslint?: boolean;
        prettier?: boolean;
        testing?: boolean;
        storybook?: boolean;
        docker?: boolean;
    };
}

/**
 * Generation result
 */
export interface GenerationResult {
    success: boolean;
    outputPath: string;
    filesGenerated: number;
    duration: number;
    template?: string;
    errors: string[];
    warnings: string[];
}

/**
 * Project generator for creating complete deployable projects
 */
export class ProjectGenerator {
    private readonly logger: Logger;
    private readonly config: ProjectGeneratorConfig;
    private readonly codeExporter: CodeExporter;
    private readonly assetBundler: AssetBundler;

    constructor(config: ProjectGeneratorConfig) {
        this.logger = new Logger('ProjectGenerator');
        this.config = config;

        // Initialize code exporter
        const exportConfig: ExportConfig = {
            sourceDir: config.sourceDir,
            outputDir: config.outputDir,
            ...config.export
        };
        this.codeExporter = new CodeExporter(exportConfig);

        // Initialize asset bundler
        const assetConfig: AssetBundlerConfig = {
            sourceDir: config.sourceDir,
            outputDir: config.outputDir,
            ...config.assets
        };
        this.assetBundler = new AssetBundler(assetConfig);
    }

    /**
     * Generate complete project
     */
    async generate(): Promise<GenerationResult> {
        const startTime = performance.now();
        this.logger.info(`Generating project: ${this.config.project.name}`);

        try {
            // Ensure output directory
            await ensureDir(this.config.outputDir);

            // Export code
            this.logger.info('Exporting code...');
            const exportResult = await this.codeExporter.export();
            if (!exportResult.success) {
                throw new Error(`Code export failed: ${exportResult.errors.join(', ')}`);
            }

            // Bundle assets
            this.logger.info('Bundling assets...');
            const assetResult = await this.assetBundler.bundle();
            if (!assetResult.success) {
                this.logger.warn(`Asset bundling had errors: ${assetResult.errors.join(', ')}`);
            }

            // Generate project files
            this.logger.info('Generating project files...');
            const projectFiles = await this.generateProjectFiles();

            // Apply template if specified
            let templateFiles = 0;
            if (this.config.template) {
                this.logger.info(`Applying template: ${this.config.template.name}`);
                templateFiles = await this.applyTemplate(this.config.template);
            }

            // Generate configuration files
            await this.generateConfigFiles();

            // Generate documentation
            await this.generateDocumentation();

            const duration = performance.now() - startTime;
            const totalFiles = exportResult.filesProcessed + assetResult.assets.length + projectFiles + templateFiles;

            this.logger.info(`Project generation completed: ${totalFiles} files (${duration.toFixed(2)}ms)`);

            return {
                success: true,
                outputPath: this.config.outputDir,
                filesGenerated: totalFiles,
                duration,
                template: this.config.template?.name,
                errors: [...exportResult.errors, ...assetResult.errors],
                warnings: [...(exportResult.warnings || []), ...assetResult.warnings]
            };
        } catch (error) {
            const duration = performance.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            this.logger.error('Project generation failed', error);

            return {
                success: false,
                outputPath: this.config.outputDir,
                filesGenerated: 0,
                duration,
                errors: [errorMessage],
                warnings: []
            };
        }
    }

    /**
     * Generate core project files
     */
    private async generateProjectFiles(): Promise<number> {
        let filesGenerated = 0;

        // Generate package.json
        await this.generatePackageJson();
        filesGenerated++;

        // Generate README.md
        await this.generateReadme();
        filesGenerated++;

        // Generate .gitignore
        await this.generateGitignore();
        filesGenerated++;

        // Generate environment files
        if (this.config.features?.typescript) {
            await this.generateTsConfig();
            filesGenerated++;
        }

        if (this.config.features?.eslint) {
            await this.generateEslintConfig();
            filesGenerated++;
        }

        if (this.config.features?.prettier) {
            await this.generatePrettierConfig();
            filesGenerated++;
        }

        return filesGenerated;
    }

    /**
     * Generate package.json
     */
    private async generatePackageJson(): Promise<void> {
        const basePackageJson = {
            name: this.config.project.name,
            version: this.config.project.version || '1.0.0',
            description: this.config.project.description || 'Generated project from Element Tagger',
            main: 'index.js',
            scripts: {
                start: 'node index.js',
                build: 'echo "Build completed"',
                test: 'echo "No tests specified"'
            },
            author: this.config.project.author || '',
            license: this.config.project.license || 'MIT',
            dependencies: {},
            devDependencies: {}
        };

        // Add framework-specific dependencies
        if (this.config.framework) {
            this.addFrameworkDependencies(basePackageJson);
        }

        // Add build system dependencies
        if (this.config.buildSystem) {
            this.addBuildSystemDependencies(basePackageJson);
        }

        // Add feature dependencies
        if (this.config.features) {
            this.addFeatureDependencies(basePackageJson);
        }

        // Add template dependencies
        if (this.config.template) {
            if (this.config.template.dependencies) {
                Object.assign(basePackageJson.dependencies, this.config.template.dependencies);
            }
            if (this.config.template.devDependencies) {
                Object.assign(basePackageJson.devDependencies, this.config.template.devDependencies);
            }
            if (this.config.template.scripts) {
                Object.assign(basePackageJson.scripts, this.config.template.scripts);
            }
        }

        const packageJsonPath = resolve(this.config.outputDir, 'package.json');
        await writeFile(packageJsonPath, JSON.stringify(basePackageJson, null, 2), 'utf-8');
        this.logger.debug('Generated package.json');
    }

    /**
     * Add framework-specific dependencies
     */
    private addFrameworkDependencies(packageJson: any): void {
        const framework = this.config.framework!;

        switch (framework.type) {
            case 'react':
                packageJson.dependencies.react = framework.version || '^18.0.0';
                packageJson.dependencies['react-dom'] = framework.version || '^18.0.0';
                packageJson.scripts.start = 'react-scripts start';
                packageJson.scripts.build = 'react-scripts build';
                break;

            case 'vue':
                packageJson.dependencies.vue = framework.version || '^3.0.0';
                packageJson.scripts.start = 'vue-cli-service serve';
                packageJson.scripts.build = 'vue-cli-service build';
                break;

            case 'angular':
                packageJson.dependencies['@angular/core'] = framework.version || '^15.0.0';
                packageJson.scripts.start = 'ng serve';
                packageJson.scripts.build = 'ng build';
                break;

            case 'vanilla':
                // No additional dependencies needed
                break;
        }
    }

    /**
     * Add build system dependencies
     */
    private addBuildSystemDependencies(packageJson: any): void {
        const buildSystem = this.config.buildSystem!;

        switch (buildSystem.type) {
            case 'vite':
                packageJson.devDependencies.vite = '^4.0.0';
                packageJson.scripts.dev = 'vite';
                packageJson.scripts.build = 'vite build';
                packageJson.scripts.preview = 'vite preview';
                break;

            case 'webpack':
                packageJson.devDependencies.webpack = '^5.0.0';
                packageJson.devDependencies['webpack-cli'] = '^4.0.0';
                packageJson.scripts.build = 'webpack';
                break;

            case 'rollup':
                packageJson.devDependencies.rollup = '^3.0.0';
                packageJson.scripts.build = 'rollup -c';
                break;
        }
    }

    /**
     * Add feature dependencies
     */
    private addFeatureDependencies(packageJson: any): void {
        const features = this.config.features!;

        if (features.typescript) {
            packageJson.devDependencies.typescript = '^4.9.0';
            packageJson.devDependencies['@types/node'] = '^18.0.0';
        }

        if (features.eslint) {
            packageJson.devDependencies.eslint = '^8.0.0';
            if (features.typescript) {
                packageJson.devDependencies['@typescript-eslint/eslint-plugin'] = '^5.0.0';
                packageJson.devDependencies['@typescript-eslint/parser'] = '^5.0.0';
            }
        }

        if (features.prettier) {
            packageJson.devDependencies.prettier = '^2.8.0';
        }

        if (features.testing) {
            packageJson.devDependencies.vitest = '^0.28.0';
            packageJson.scripts.test = 'vitest';
        }
    }

    /**
     * Generate README.md
     */
    private async generateReadme(): Promise<void> {
        const readme = `# ${this.config.project.name}

${this.config.project.description || 'A project generated by Element Tagger'}

## Getting Started

### Prerequisites

- Node.js (version 16 or higher)
- npm or yarn

### Installation

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Start the development server:
   \`\`\`bash
   npm start
   \`\`\`

### Building for Production

To create a production build:

\`\`\`bash
npm run build
\`\`\`

${this.config.framework ? `
## Framework

This project uses ${this.config.framework.type.charAt(0).toUpperCase() + this.config.framework.type.slice(1)}${this.config.framework.version ? ` version ${this.config.framework.version}` : ''}.
` : ''}

${this.config.buildSystem ? `
## Build System

This project uses ${this.config.buildSystem.type.charAt(0).toUpperCase() + this.config.buildSystem.type.slice(1)} for building and bundling.
` : ''}

## Project Structure

\`\`\`
${this.config.project.name}/
├── src/                 # Source files
├── public/              # Public assets
├── dist/                # Build output
├── package.json         # Project dependencies
└── README.md           # This file
\`\`\`

## License

${this.config.project.license || 'MIT'}

---

Generated by Element Tagger on ${new Date().toISOString()}
`;

        const readmePath = resolve(this.config.outputDir, 'README.md');
        await writeFile(readmePath, readme, 'utf-8');
        this.logger.debug('Generated README.md');
    }

    /**
     * Generate .gitignore
     */
    private async generateGitignore(): Promise<void> {
        const gitignore = `# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Build outputs
dist/
build/
*.tsbuildinfo

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Logs
logs/
*.log

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Temporary folders
tmp/
temp/

${this.config.features?.testing ? `
# Test coverage
coverage/
.nyc_output/
` : ''}

${this.config.buildSystem?.type === 'vite' ? `
# Vite
.vite/
` : ''}

${this.config.features?.storybook ? `
# Storybook
storybook-static/
` : ''}
`;

        const gitignorePath = resolve(this.config.outputDir, '.gitignore');
        await writeFile(gitignorePath, gitignore, 'utf-8');
        this.logger.debug('Generated .gitignore');
    }

    /**
     * Generate TypeScript configuration
     */
    private async generateTsConfig(): Promise<void> {
        const tsconfig = {
            compilerOptions: {
                target: 'ES2020',
                lib: ['ES2020', 'DOM', 'DOM.Iterable'],
                allowJs: true,
                skipLibCheck: true,
                esModuleInterop: true,
                allowSyntheticDefaultImports: true,
                strict: true,
                forceConsistentCasingInFileNames: true,
                noFallthroughCasesInSwitch: true,
                module: 'esnext',
                moduleResolution: 'node',
                resolveJsonModule: true,
                isolatedModules: true,
                noEmit: true,
                jsx: this.config.framework?.type === 'react' ? 'react-jsx' : 'preserve'
            },
            include: [
                'src/**/*'
            ],
            exclude: [
                'node_modules',
                'dist',
                'build'
            ]
        };

        const tsconfigPath = resolve(this.config.outputDir, 'tsconfig.json');
        await writeFile(tsconfigPath, JSON.stringify(tsconfig, null, 2), 'utf-8');
        this.logger.debug('Generated tsconfig.json');
    }

    /**
     * Generate ESLint configuration
     */
    private async generateEslintConfig(): Promise<void> {
        const eslintrc = {
            env: {
                browser: true,
                es2021: true,
                node: true
            },
            extends: [
                'eslint:recommended',
                ...(this.config.features?.typescript ? ['@typescript-eslint/recommended'] : []),
                ...(this.config.framework?.type === 'react' ? ['plugin:react/recommended'] : [])
            ],
            parser: this.config.features?.typescript ? '@typescript-eslint/parser' : 'espree',
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                ...(this.config.framework?.type === 'react' ? { ecmaFeatures: { jsx: true } } : {})
            },
            plugins: [
                ...(this.config.features?.typescript ? ['@typescript-eslint'] : []),
                ...(this.config.framework?.type === 'react' ? ['react'] : [])
            ],
            rules: {
                'no-unused-vars': 'warn',
                'no-console': 'warn'
            }
        };

        const eslintrcPath = resolve(this.config.outputDir, '.eslintrc.json');
        await writeFile(eslintrcPath, JSON.stringify(eslintrc, null, 2), 'utf-8');
        this.logger.debug('Generated .eslintrc.json');
    }

    /**
     * Generate Prettier configuration
     */
    private async generatePrettierConfig(): Promise<void> {
        const prettierrc = {
            semi: true,
            trailingComma: 'es5',
            singleQuote: true,
            printWidth: 80,
            tabWidth: 2,
            useTabs: false
        };

        const prettierrcPath = resolve(this.config.outputDir, '.prettierrc');
        await writeFile(prettierrcPath, JSON.stringify(prettierrc, null, 2), 'utf-8');
        this.logger.debug('Generated .prettierrc');
    }

    /**
     * Apply project template
     */
    private async applyTemplate(template: ProjectTemplate): Promise<number> {
        let filesGenerated = 0;

        for (const file of template.files) {
            // Check condition if specified
            if (file.condition && !file.condition(this.config)) {
                continue;
            }

            const filePath = resolve(this.config.outputDir, file.path);
            const content = typeof file.content === 'function' ? file.content() : file.content;

            await ensureDir(dirname(filePath));
            await writeFile(filePath, content, 'utf-8');
            filesGenerated++;
        }

        // Run post-generation hook if specified
        if (template.postGenerate) {
            await template.postGenerate(this.config.outputDir, this.config);
        }

        return filesGenerated;
    }

    /**
     * Generate configuration files for build systems
     */
    private async generateConfigFiles(): Promise<void> {
        if (this.config.buildSystem?.type === 'vite') {
            await this.generateViteConfig();
        } else if (this.config.buildSystem?.type === 'webpack') {
            await this.generateWebpackConfig();
        } else if (this.config.buildSystem?.type === 'rollup') {
            await this.generateRollupConfig();
        }
    }

    /**
     * Generate Vite configuration
     */
    private async generateViteConfig(): Promise<void> {
        const viteConfig = `import { defineConfig } from 'vite'
${this.config.framework?.type === 'react' ? "import react from '@vitejs/plugin-react'" : ''}

export default defineConfig({
  ${this.config.framework?.type === 'react' ? 'plugins: [react()],' : ''}
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  server: {
    port: 3000,
    open: true
  }${this.config.buildSystem?.config ? `,
  ${Object.entries(this.config.buildSystem.config)
                    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
                    .join(',\n  ')}` : ''}
})`;

        const configPath = resolve(this.config.outputDir, 'vite.config.js');
        await writeFile(configPath, viteConfig, 'utf-8');
        this.logger.debug('Generated vite.config.js');
    }

    /**
     * Generate Webpack configuration
     */
    private async generateWebpackConfig(): Promise<void> {
        const webpackConfig = `const path = require('path');

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true
  },
  module: {
    rules: [
      {
        test: /\\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'${this.config.framework?.type === 'react' ? ", '@babel/preset-react'" : ''}]
          }
        }
      },
      {
        test: /\\.css$/i,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource'
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.jsx'${this.config.features?.typescript ? ", '.ts', '.tsx'" : ''}]
  },
  devServer: {
    contentBase: './dist',
    hot: true,
    port: 3000
  }
};`;

        const configPath = resolve(this.config.outputDir, 'webpack.config.js');
        await writeFile(configPath, webpackConfig, 'utf-8');
        this.logger.debug('Generated webpack.config.js');
    }

    /**
     * Generate Rollup configuration
     */
    private async generateRollupConfig(): Promise<void> {
        const rollupConfig = `import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
${this.config.features?.typescript ? "import typescript from '@rollup/plugin-typescript';" : ''}

export default {
  input: 'src/index.js',
  output: {
    dir: 'dist',
    format: 'cjs'
  },
  plugins: [
    resolve(),
    commonjs()${this.config.features?.typescript ? ',\n    typescript()' : ''}
  ]
};`;

        const configPath = resolve(this.config.outputDir, 'rollup.config.js');
        await writeFile(configPath, rollupConfig, 'utf-8');
        this.logger.debug('Generated rollup.config.js');
    }

    /**
     * Generate documentation files
     */
    private async generateDocumentation(): Promise<void> {
        // Generate CHANGELOG.md
        await this.generateChangelog();

        // Generate CONTRIBUTING.md if it's an open source project
        if (this.config.project.license && this.config.project.license !== 'UNLICENSED') {
            await this.generateContributingGuide();
        }

        // Generate LICENSE file
        if (this.config.project.license) {
            await this.generateLicense();
        }
    }

    /**
     * Generate CHANGELOG.md
     */
    private async generateChangelog(): Promise<void> {
        const changelog = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [${this.config.project.version || '1.0.0'}] - ${new Date().toISOString().split('T')[0]}

### Added
- Initial project setup
- Generated from Element Tagger
${this.config.framework ? `- ${this.config.framework.type.charAt(0).toUpperCase() + this.config.framework.type.slice(1)} framework integration` : ''}
${this.config.buildSystem ? `- ${this.config.buildSystem.type.charAt(0).toUpperCase() + this.config.buildSystem.type.slice(1)} build system` : ''}
${this.config.features?.typescript ? '- TypeScript support' : ''}
${this.config.features?.eslint ? '- ESLint configuration' : ''}
${this.config.features?.prettier ? '- Prettier code formatting' : ''}
${this.config.features?.testing ? '- Testing setup' : ''}
`;

        const changelogPath = resolve(this.config.outputDir, 'CHANGELOG.md');
        await writeFile(changelogPath, changelog, 'utf-8');
        this.logger.debug('Generated CHANGELOG.md');
    }

    /**
     * Generate CONTRIBUTING.md
     */
    private async generateContributingGuide(): Promise<void> {
        const contributing = `# Contributing to ${this.config.project.name}

Thank you for considering contributing to this project!

## Getting Started

1. Fork the repository
2. Clone your fork: \`git clone https://github.com/your-username/${this.config.project.name}.git\`
3. Install dependencies: \`npm install\`
4. Create a feature branch: \`git checkout -b feature/your-feature-name\`

## Development

### Running the Project

\`\`\`bash
npm start
\`\`\`

### Building

\`\`\`bash
npm run build
\`\`\`

### Testing

\`\`\`bash
npm test
\`\`\`

${this.config.features?.eslint ? `
### Code Style

This project uses ESLint for code linting. Run the linter with:

\`\`\`bash
npm run lint
\`\`\`
` : ''}

${this.config.features?.prettier ? `
### Code Formatting

This project uses Prettier for code formatting. Format your code with:

\`\`\`bash
npm run format
\`\`\`
` : ''}

## Submitting Changes

1. Ensure your code follows the project's coding standards
2. Add tests for any new functionality
3. Update documentation as needed
4. Commit your changes with a clear commit message
5. Push to your fork and submit a pull request

## Pull Request Guidelines

- Provide a clear description of the changes
- Include the purpose and motivation for the changes
- Reference any related issues
- Ensure all tests pass
- Keep the pull request focused on a single feature or fix

## Code of Conduct

Please be respectful and constructive in all interactions.

## Questions?

Feel free to open an issue for any questions or discussions.
`;

        const contributingPath = resolve(this.config.outputDir, 'CONTRIBUTING.md');
        await writeFile(contributingPath, contributing, 'utf-8');
        this.logger.debug('Generated CONTRIBUTING.md');
    }

    /**
     * Generate LICENSE file
     */
    private async generateLicense(): Promise<void> {
        let licenseText = '';

        switch (this.config.project.license) {
            case 'MIT':
                licenseText = this.getMITLicense();
                break;
            case 'Apache-2.0':
                licenseText = this.getApacheLicense();
                break;
            case 'GPL-3.0':
                licenseText = this.getGPLLicense();
                break;
            default:
                licenseText = `# ${this.config.project.license} License

Please refer to the ${this.config.project.license} license terms.
`;
        }

        const licensePath = resolve(this.config.outputDir, 'LICENSE');
        await writeFile(licensePath, licenseText, 'utf-8');
        this.logger.debug('Generated LICENSE');
    }

    /**
     * Get MIT License text
     */
    private getMITLicense(): string {
        const year = new Date().getFullYear();
        const author = this.config.project.author || 'Project Author';

        return `MIT License

Copyright (c) ${year} ${author}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
    }

    /**
     * Get Apache License text (simplified)
     */
    private getApacheLicense(): string {
        const year = new Date().getFullYear();
        const author = this.config.project.author || 'Project Author';

        return `Apache License
Version 2.0, January 2004
http://www.apache.org/licenses/

Copyright ${year} ${author}

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
`;
    }

    /**
     * Get GPL License text (simplified)
     */
    private getGPLLicense(): string {
        const year = new Date().getFullYear();
        const author = this.config.project.author || 'Project Author';

        return `GNU GENERAL PUBLIC LICENSE
Version 3, 29 June 2007

Copyright (C) ${year} ${author}

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
`;
    }

    /**
     * Create project template for React
     */
    static createReactTemplate(): ProjectTemplate {
        return {
            name: 'React',
            description: 'React application template',
            files: [
                {
                    path: 'src/index.js',
                    content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`
                },
                {
                    path: 'src/App.js',
                    content: `import React from 'react';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Welcome to Your React App</h1>
        <p>This project was generated by Element Tagger.</p>
      </header>
    </div>
  );
}

export default App;`
                },
                {
                    path: 'src/index.css',
                    content: `body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

code {
  font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New',
    monospace;
}`
                },
                {
                    path: 'src/App.css',
                    content: `.App {
  text-align: center;
}

.App-header {
  background-color: #282c34;
  padding: 20px;
  color: white;
  min-height: 50vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: calc(10px + 2vmin);
}`
                },
                {
                    path: 'public/index.html',
                    content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta name="description" content="React app generated by Element Tagger" />
    <title>React App</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>`
                }
            ],
            dependencies: {
                'react': '^18.2.0',
                'react-dom': '^18.2.0'
            },
            devDependencies: {
                '@vitejs/plugin-react': '^4.0.0'
            },
            scripts: {
                'dev': 'vite',
                'build': 'vite build',
                'preview': 'vite preview'
            }
        };
    }

    /**
     * Create project template for Vue
     */
    static createVueTemplate(): ProjectTemplate {
        return {
            name: 'Vue',
            description: 'Vue application template',
            files: [
                {
                    path: 'src/main.js',
                    content: `import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')`
                },
                {
                    path: 'src/App.vue',
                    content: `<template>
  <div id="app">
    <header>
      <h1>Welcome to Your Vue App</h1>
      <p>This project was generated by Element Tagger.</p>
    </header>
  </div>
</template>

<script>
export default {
  name: 'App'
}
</script>

<style scoped>
header {
  background-color: #4fc08d;
  padding: 20px;
  color: white;
  text-align: center;
  min-height: 50vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
</style>`
                },
                {
                    path: 'src/style.css',
                    content: `body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

#app {
  min-height: 100vh;
}`
                },
                {
                    path: 'index.html',
                    content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vue App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>`
                }
            ],
            dependencies: {
                'vue': '^3.3.0'
            },
            devDependencies: {
                '@vitejs/plugin-vue': '^4.0.0'
            }
        };
    }
}