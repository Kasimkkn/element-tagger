import { parse, ParserOptions } from '@babel/parser';
import * as t from '@babel/types';
import { readFileSync } from 'fs-extra';
import { extname } from 'path';
import type { ASTNode, ParseResult, ParserConfig } from '../types/ast';
import { Logger } from '../utils/logger';

/**
 * AST Parser for JSX/TSX files
 * Handles parsing of React components with proper TypeScript and JSX support
 */
export class ASTParser {
    private readonly logger: Logger;
    private readonly defaultOptions: ParserOptions;

    constructor(config: ParserConfig = {}) {
        this.logger = new Logger('ASTParser');

        this.defaultOptions = {
            sourceType: 'module',
            allowImportExportEverywhere: true,
            allowReturnOutsideFunction: false,
            ranges: true,
            plugins: [
                'jsx',
                'typescript',
                'decorators-legacy',
                'classProperties',
                'objectRestSpread',
                'functionBind',
                'exportDefaultFrom',
                'exportNamespaceFrom',
                'dynamicImport',
                'nullishCoalescingOperator',
                'optionalChaining',
                'importMeta',
                'topLevelAwait',
                'optionalCatchBinding',
                ...config.additionalPlugins || []
            ],
            ...config.parserOptions
        };
    }

    /**
     * Parse a file and return the AST
     */
    async parseFile(filePath: string): Promise<ParseResult> {
        try {
            this.logger.debug(`Parsing file: ${filePath}`);

            const content = readFileSync(filePath, 'utf-8');
            const result = await this.parseCode(content, filePath);

            this.logger.debug(`Successfully parsed: ${filePath}`);
            return result;
        } catch (error) {
            this.logger.error(`Failed to parse file: ${filePath}`, error);
            return {
                success: false,
                filePath,
                content: '',
                error: error instanceof Error ? error.message : 'Unknown parsing error'
            };
        }
    }

    /**
     * Parse code string and return the AST
     */
    async parseCode(code: string, filePath?: string): Promise<ParseResult> {
        try {
            // Determine file type and adjust parser options
            const options = this.getParserOptions(filePath);

            // Parse the code
            const ast = parse(code, options);

            // Validate that we have JSX content
            const hasJSX = this.containsJSX(ast);

            return {
                success: true,
                ast: ast as ASTNode,
                content: code,
                filePath: filePath || '<string>',
                hasJSX,
                metadata: {
                    sourceType: options.sourceType,
                    isTypeScript: this.isTypeScriptFile(filePath),
                    plugins: options.plugins || []
                }
            };
        } catch (error) {
            this.logger.error(`Failed to parse code`, error);
            return {
                success: false,
                content: code,
                filePath: filePath || '<string>',
                error: error instanceof Error ? error.message : 'Unknown parsing error'
            };
        }
    }

    /**
     * Check if the AST contains JSX elements
     */
    private containsJSX(ast: t.Node): boolean {
        let hasJSX = false;

        const visitor = {
            JSXElement: () => {
                hasJSX = true;
            },
            JSXFragment: () => {
                hasJSX = true;
            }
        };

        // Simple traversal to check for JSX
        this.simpleTraverse(ast, visitor);
        return hasJSX;
    }

    /**
     * Simple AST traversal helper
     */
    private simpleTraverse(node: t.Node, visitor: Record<string, () => void>): void {
        if (!node || typeof node !== 'object') return;

        // Call visitor for current node type
        if (visitor[node.type]) {
            visitor[node.type]();
        }

        // Traverse child nodes
        for (const key in node) {
            const child = (node as any)[key];

            if (Array.isArray(child)) {
                child.forEach(item => {
                    if (item && typeof item === 'object' && item.type) {
                        this.simpleTraverse(item, visitor);
                    }
                });
            } else if (child && typeof child === 'object' && child.type) {
                this.simpleTraverse(child, visitor);
            }
        }
    }

    /**
     * Get parser options based on file type
     */
    private getParserOptions(filePath?: string): ParserOptions {
        const isTypeScript = this.isTypeScriptFile(filePath);

        let options = { ...this.defaultOptions };

        if (isTypeScript) {
            // Ensure TypeScript plugin is included
            if (!options.plugins?.includes('typescript')) {
                options.plugins = [...(options.plugins || []), 'typescript'];
            }
        }

        return options;
    }

    /**
     * Check if file is TypeScript
     */
    private isTypeScriptFile(filePath?: string): boolean {
        if (!filePath) return false;
        const ext = extname(filePath).toLowerCase();
        return ext === '.ts' || ext === '.tsx';
    }

    /**
     * Validate that code can be parsed without errors
     */
    async validateSyntax(code: string, filePath?: string): Promise<boolean> {
        try {
            const result = await this.parseCode(code, filePath);
            return result.success;
        } catch {
            return false;
        }
    }

    /**
     * Get parser statistics
     */
    getStats(): { parsedFiles: number; errors: number } {
        // This would be implemented with instance tracking in a real implementation
        return {
            parsedFiles: 0,
            errors: 0
        };
    }

    /**
     * Check if file should be processed based on extension
     */
    static shouldProcessFile(filePath: string): boolean {
        const ext = extname(filePath).toLowerCase();
        return ['.js', '.jsx', '.ts', '.tsx'].includes(ext);
    }

    /**
     * Create a new parser instance with custom config
     */
    static create(config?: ParserConfig): ASTParser {
        return new ASTParser(config);
    }
}