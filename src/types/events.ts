/**
 * Event types for Element Tagger event system
 */

export interface BaseEvent {
    type: string;
    timestamp: string;
    source?: string;
}

export interface FileProcessedEvent extends BaseEvent {
    type: 'file-processed';
    data: {
        filePath: string;
        elementsCount: number;
        processingTime: number;
        success: boolean;
    };
}

export interface ElementTaggedEvent extends BaseEvent {
    type: 'element-tagged';
    data: {
        elementId: string;
        filePath: string;
        elementType: 'dom' | 'component' | 'fragment';
        tagName: string;
    };
}

export interface MappingSavedEvent extends BaseEvent {
    type: 'mapping-saved';
    data: {
        mappingFile: string;
        elementsCount: number;
        filesCount: number;
    };
}

export interface ErrorEvent extends BaseEvent {
    type: 'error';
    data: {
        error: Error;
        context?: Record<string, any>;
    };
}

export type ElementTaggerEvent =
    | FileProcessedEvent
    | ElementTaggedEvent
    | MappingSavedEvent
    | ErrorEvent;

export interface EventEmitter {
    on(event: string, listener: (data: any) => void): void;
    off(event: string, listener: (data: any) => void): void;
    emit(event: string, data: any): void;
}