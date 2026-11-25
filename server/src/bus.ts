import { EventEmitter } from 'node:events';

/** In-process event bus that decouples persistence/services from the realtime layer. */
export const bus = new EventEmitter();
bus.setMaxListeners(50);
