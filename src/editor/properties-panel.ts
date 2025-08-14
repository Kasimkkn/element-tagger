import { EventEmitter } from 'events';
import type { EditorOptions } from '../types/config';
import { DOMUtils } from '../runtime/dom-utils';
import { Logger } from '../utils/logger';

/**
 * Property types that can be edited
 */
export type PropertyType = 'string' | 'number' | 'boolean' | 'color' | 'url' | 'select' | 'textarea';

/**
 * Property definition
 */
export interface PropertyDefinition {
    name: string;
    type: PropertyType;
    value: any;
    options?: string[]; // For select type
    readonly?: boolean;
    category?: string;
    description?: string;
    validation?: (value: any) => boolean | string;
}

/**
 * Properties panel configuration
 */
export interface PropertiesPanelConfig extends EditorOptions {
    /**
     * Load standard properties from element
     */
    private loadStandardProperties(element: HTMLElement): void {
    // Basic properties
    this.properties.set('id', {
        name: 'ID',
        type: 'string',
        value: element.id,
        category: 'General',
        description: 'Element ID attribute'
    });

    this.properties.set('className', {
        name: 'Class',
        type: 'string',
        value: element.className,
        category: 'General',
        description: 'CSS classes'
    });

    this.properties.set('textContent', {
        name: 'Text Content',
        type: 'textarea',
        value: element.textContent || '',
        category: 'General',
        description: 'Element text content'
    });

    // Style properties
    const computedStyle = window.getComputedStyle(element);

    this.properties.set('width', {
        name: 'Width',
        type: 'string',
        value: element.style.width || computedStyle.width,
        category: 'Layout',
        description: 'Element width'
    });

    this.properties.set('height', {
        name: 'Height',
        type: 'string',
        value: element.style.height || computedStyle.height,
        category: 'Layout',
        description: 'Element height'
    });

    this.properties.set('display', {
        name: 'Display',
        type: 'select',
        value: computedStyle.display,
        options: ['block', 'inline', 'inline-block', 'flex', 'grid', 'none'],
        category: 'Layout',
        description: 'CSS display property'
    });

    this.properties.set('position', {
        name: 'Position',
        type: 'select',
        value: computedStyle.position,
        options: ['static', 'relative', 'absolute', 'fixed', 'sticky'],
        category: 'Layout',
        description: 'CSS position property'
    });

    // Color properties
    this.properties.set('color', {
        name: 'Text Color',
        type: 'color',
        value: this.rgbToHex(computedStyle.color),
        category: 'Style',
        description: 'Text color'
    });

    this.properties.set('backgroundColor', {
        name: 'Background Color',
        type: 'color',
        value: this.rgbToHex(computedStyle.backgroundColor),
        category: 'Style',
        description: 'Background color'
    });

    // Advanced properties
    if (this.config.showAdvanced) {
        this.properties.set('zIndex', {
            name: 'Z-Index',
            type: 'number',
            value: parseInt(computedStyle.zIndex) || 0,
            category: 'Advanced',
            description: 'Stacking order'
        });

        this.properties.set('opacity', {
            name: 'Opacity',
            type: 'number',
            value: parseFloat(computedStyle.opacity),
            category: 'Advanced',
            description: 'Element opacity (0-1)',
            validation: (value) => value >= 0 && value <= 1 || 'Opacity must be between 0 and 1'
        });
    }
}

    /**
     * Load custom properties
     */
    private loadCustomProperties(element: HTMLElement): void {
    this.config.customProperties.forEach(prop => {
        // Get value from element or use default
        let value = prop.value;

        if (element.hasAttribute(`data-${prop.name.toLowerCase()}`)) {
            value = element.getAttribute(`data-${prop.name.toLowerCase()}`);

            // Convert to appropriate type
            if (prop.type === 'number') {
                value = parseFloat(value) || 0;
            } else if (prop.type === 'boolean') {
                value = value === 'true';
            }
        }

        this.properties.set(prop.name, {
            ...prop,
            value
        });
    });
}

    /**
     * Refresh panel display
     */
    private refreshPanel(): void {
    if(!this.panel) return;

    const container = this.panel.querySelector('.properties-container') as HTMLElement;
    if(!container) return;

    // Clear existing properties
    container.innerHTML = '';
    this.propertyElements.clear();

    // Group properties by category
    const categorizedProperties = new Map<string, PropertyDefinition[]>();

    this.properties.forEach(prop => {
        const category = prop.category || 'General';
        if (!categorizedProperties.has(category)) {
            categorizedProperties.set(category, []);
        }
        categorizedProperties.get(category)!.push(prop);
    });

    // Render categories
    this.config.categories.forEach(categoryName => {
        const categoryProps = categorizedProperties.get(categoryName);
        if (!categoryProps || categoryProps.length === 0) return;

        if (this.config.enableCategories) {
            const categoryHeader = this.createCategoryHeader(categoryName);
            container.appendChild(categoryHeader);
        }

        categoryProps.forEach(prop => {
            const propertyElement = this.createPropertyElement(prop);
            container.appendChild(propertyElement);
            this.propertyElements.set(prop.name, propertyElement);
        });
    });
}

    /**
     * Create category header
     */
    private createCategoryHeader(categoryName: string): HTMLElement {
    const header = document.createElement('div');
    header.className = 'property-category-header';
    header.textContent = categoryName;
    header.style.cssText = `
            font-weight: bold;
            font-size: 12px;
            color: #666;
            margin: 16px 0 8px 0;
            padding: 4px 0;
            border-bottom: 1px solid #eee;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        `;

    if (this.config.theme === 'dark') {
        header.style.color = '#a0aec0';
        header.style.borderColor = '#4a5568';
    }

    return header;
}

    /**
     * Create property element
     */
    private createPropertyElement(property: PropertyDefinition): HTMLElement {
    const container = document.createElement('div');
    container.className = 'property-item';
    container.style.cssText = `
            margin-bottom: 12px;
            display: flex;
            flex-direction: column;
            gap: 4px;
        `;

    // Property label
    const label = document.createElement('label');
    label.textContent = property.name;
    label.style.cssText = `
            font-size: 12px;
            font-weight: 500;
            color: #333;
        `;

    if (this.config.theme === 'dark') {
        label.style.color = '#e2e8f0';
    }

    container.appendChild(label);

    // Property input
    const input = this.createPropertyInput(property);
    container.appendChild(input);

    // Description
    if (property.description) {
        const description = document.createElement('div');
        description.textContent = property.description;
        description.style.cssText = `
                font-size: 11px;
                color: #666;
                font-style: italic;
            `;

        if (this.config.theme === 'dark') {
            description.style.color = '#a0aec0';
        }

        container.appendChild(description);
    }

    return container;
}

    /**
     * Create property input based on type
     */
    private createPropertyInput(property: PropertyDefinition): HTMLElement {
    let input: HTMLElement;

    switch (property.type) {
        case 'boolean':
            input = this.createCheckboxInput(property);
            break;
        case 'number':
            input = this.createNumberInput(property);
            break;
        case 'color':
            input = this.createColorInput(property);
            break;
        case 'select':
            input = this.createSelectInput(property);
            break;
        case 'textarea':
            input = this.createTextareaInput(property);
            break;
        case 'url':
            input = this.createUrlInput(property);
            break;
        default:
            input = this.createTextInput(property);
    }

    input.style.fontSize = '13px';
    input.style.width = '100%';

    if (property.readonly) {
        (input as any).disabled = true;
        input.style.opacity = '0.6';
    }

    return input;
}

    /**
     * Create text input
     */
    private createTextInput(property: PropertyDefinition): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = property.value || '';
    input.style.cssText = `
            padding: 6px 8px;
            border: 1px solid #ccc;
            border-radius: 4px;
        `;

    input.addEventListener('change', () => {
        this.updateProperty(property.name, input.value);
    });

    return input;
}

    /**
     * Create number input
     */
    private createNumberInput(property: PropertyDefinition): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = property.value?.toString() || '0';
    input.style.cssText = `
            padding: 6px 8px;
            border: 1px solid #ccc;
            border-radius: 4px;
        `;

    input.addEventListener('change', () => {
        this.updateProperty(property.name, parseFloat(input.value) || 0);
    });

    return input;
}

    /**
     * Create checkbox input
     */
    private createCheckboxInput(property: PropertyDefinition): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!property.value;

    input.addEventListener('change', () => {
        this.updateProperty(property.name, input.checked);
    });

    return input;
}

    /**
     * Create color input
     */
    private createColorInput(property: PropertyDefinition): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = property.value || '#000000';

    input.addEventListener('change', () => {
        this.updateProperty(property.name, input.value);
    });

    return input;
}

    /**
     * Create select input
     */
    private createSelectInput(property: PropertyDefinition): HTMLSelectElement {
    const select = document.createElement('select');
    select.style.cssText = `
            padding: 6px 8px;
            border: 1px solid #ccc;
            border-radius: 4px;
        `;

    property.options?.forEach(option => {
        const optionEl = document.createElement('option');
        optionEl.value = option;
        optionEl.textContent = option;
        optionEl.selected = option === property.value;
        select.appendChild(optionEl);
    });

    select.addEventListener('change', () => {
        this.updateProperty(property.name, select.value);
    });

    return select;
}

    /**
     * Create textarea input
     */
    private createTextareaInput(property: PropertyDefinition): HTMLTextAreaElement {
    const textarea = document.createElement('textarea');
    textarea.value = property.value || '';
    textarea.rows = 3;
    textarea.style.cssText = `
            padding: 6px 8px;
            border: 1px solid #ccc;
            border-radius: 4px;
            resize: vertical;
        `;

    textarea.addEventListener('change', () => {
        this.updateProperty(property.name, textarea.value);
    });

    return textarea;
}

    /**
     * Create URL input
     */
    private createUrlInput(property: PropertyDefinition): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'url';
    input.value = property.value || '';
    input.style.cssText = `
            padding: 6px 8px;
            border: 1px solid #ccc;
            border-radius: 4px;
        `;

    input.addEventListener('change', () => {
        this.updateProperty(property.name, input.value);
    });

    return input;
}

    /**
     * Apply property to element
     */
    private applyPropertyToElement(elementId: string, propertyName: string, value: any): void {
    const element = DOMUtils.findElementById(elementId);
    if(!element) return;

    switch(propertyName) {
            case 'id':
    element.id = value;
    break;
    case 'className':
    element.className = value;
    break;
    case 'textContent':
    element.textContent = value;
    break;
    case 'width':
    case 'height':
    case 'color':
    case 'backgroundColor':
    case 'display':
    case 'position':
    element.style.setProperty(this.camelToKebab(propertyName), value);
    break;
    case 'zIndex':
    element.style.zIndex = value.toString();
    break;
    case 'opacity':
    element.style.opacity = value.toString();
    break;
    default:
        // Custom property - store as data attribute
        element.setAttribute(`data-${propertyName.toLowerCase()}`, value.toString());
}
    }

    /**
     * Update property UI
     */
    private updatePropertyUI(propertyName: string, newValue: any): void {
    const propertyElement = this.propertyElements.get(propertyName);
    if(!propertyElement) return;

    const input = propertyElement.querySelector('input, select, textarea') as HTMLInputElement;
    if(!input) return;

    if(input.type === 'checkbox') {
    input.checked = !!newValue;
} else {
    input.value = newValue?.toString() || '';
}
    }

    /**
     * Filter properties by search query
     */
    private filterProperties(query: string): void {
    this.propertyElements.forEach((element, propertyName) => {
        const property = this.properties.get(propertyName);
        const matches = !query ||
            propertyName.toLowerCase().includes(query) ||
            property?.description?.toLowerCase().includes(query);

        element.style.display = matches ? 'flex' : 'none';
    });
}

    /**
     * Utility functions
     */
    private rgbToHex(rgb: string): string {
    const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!match) return '#000000';

    const r = parseInt(match[1]);
    const g = parseInt(match[2]);
    const b = parseInt(match[3]);

    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

    private camelToKebab(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

}
/**
 * Get current element ID
 */
getCurrentElementId(): string | undefined {
    return this.currentElementId;
}

/**
 * Get all properties
 */
getProperties(): Map < string, PropertyDefinition > {
    return new Map(this.properties);
}

/**
 * Add custom property
 */
addCustomProperty(property: PropertyDefinition): void {
    this.properties.set(property.name, property);
    if(this.isVisible) {
    this.refreshPanel();
}
    }

/**
 * Remove property
 */
removeProperty(propertyName: string): void {
    this.properties.delete(propertyName);
    this.propertyElements.delete(propertyName);
    if(this.isVisible) {
    this.refreshPanel();
}
    }

/**
 * Check if panel is visible
 */
isShown(): boolean {
    return this.isVisible;
}

/**
 * Dispose panel
 */
dispose(): void {
    if(this.panel && this.panel.parentElement) {
    this.panel.parentElement.removeChild(this.panel);
}
this.properties.clear();
this.propertyElements.clear();
this.currentElementId = undefined;
this.isVisible = false;
    }
} 