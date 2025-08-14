// Export all fully implemented runtime functionality
export { ClickHandler } from './click-handler';
export { DOMUtils } from './dom-utils';
export { ElementHighlighter } from './element-highlighter';
export { ElementTracker } from './element-tracker';

// Export types
export type {
    ClickEventData,
    ClickHandlerConfig
} from './click-handler';

export type {
    HighlightStyle,
    ElementHighlighterConfig
} from './element-highlighter';

export type {
    TrackedElement,
    ElementTrackerConfig,
    ElementUpdateEvent
} from './element-tracker';

