// EventEmitter.js - Base event system with cycle prevention

/**
 * EventEmitter provides a pub/sub event system with built-in guards against cyclic updates.
 * Used as base class for both Model and View components.
 */
export class EventEmitter {
  constructor() {
    this._listeners = new Map(); // eventName -> Set of callbacks
    this._emitting = new Set();   // Track currently emitting events (cycle guard)
    this._dampening = new Map();  // eventName -> timestamp of last emit (for dampening)
    this._dampeningThreshold = 16; // ~60fps, ignore events faster than this (ms)
  }

  /**
   * Subscribe to an event
   * @param {string} eventName - Name of the event
   * @param {Function} callback - Handler function
   * @param {Object} options - Optional configuration
   * @param {boolean} options.once - Auto-unsubscribe after first trigger
   * @returns {Function} Unsubscribe function
   */
  on(eventName, callback, options = {}) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }

    if (!this._listeners.has(eventName)) {
      this._listeners.set(eventName, new Set());
    }

    const wrapper = options.once
      ? (...args) => {
          callback(...args);
          this.off(eventName, wrapper);
        }
      : callback;

    // Store original callback reference for removal
    wrapper._original = callback;

    this._listeners.get(eventName).add(wrapper);

    // Return unsubscribe function
    return () => this.off(eventName, callback);
  }

  /**
   * Subscribe to an event (one-time)
   * @param {string} eventName - Name of the event
   * @param {Function} callback - Handler function
   * @returns {Function} Unsubscribe function
   */
  once(eventName, callback) {
    return this.on(eventName, callback, { once: true });
  }

  /**
   * Unsubscribe from an event
   * @param {string} eventName - Name of the event
   * @param {Function} callback - Handler function to remove (optional - removes all if not specified)
   */
  off(eventName, callback = null) {
    if (!this._listeners.has(eventName)) {
      return;
    }

    const listeners = this._listeners.get(eventName);

    if (callback === null) {
      // Remove all listeners for this event
      listeners.clear();
    } else {
      // Remove specific callback (check both wrapper and original)
      for (const listener of listeners) {
        if (listener === callback || listener._original === callback) {
          listeners.delete(listener);
        }
      }
    }

    // Clean up empty listener sets
    if (listeners.size === 0) {
      this._listeners.delete(eventName);
    }
  }

  /**
   * Emit an event with data
   * @param {string} eventName - Name of the event
   * @param {*} data - Event payload
   * @param {Object} options - Optional configuration
   * @param {boolean} options.preventCycles - Guard against re-entrant calls (default: true)
   * @param {boolean} options.dampen - Apply time-based dampening (default: false)
   * @returns {boolean} True if event was emitted, false if blocked
   */
  emit(eventName, data = {}, options = {}) {
    const {
      preventCycles = true,
      dampen = false
    } = options;

    // Cycle prevention: Don't emit if already emitting this event
    if (preventCycles && this._emitting.has(eventName)) {
      console.warn(`[EventEmitter] Cycle detected: ${eventName} already emitting, skipping`);
      return false;
    }

    // Dampening: Ignore events that fire too frequently
    if (dampen) {
      const lastEmit = this._dampening.get(eventName) || 0;
      const now = performance.now();

      if (now - lastEmit < this._dampeningThreshold) {
        return false; // Too soon, skip
      }

      this._dampening.set(eventName, now);
    }

    // Get listeners for this event
    const listeners = this._listeners.get(eventName);

    if (!listeners || listeners.size === 0) {
      return false;
    }

    // Mark as currently emitting
    this._emitting.add(eventName);

    try {
      // Call all listeners with the data
      // Create array copy to avoid issues if listeners modify the set during iteration
      const listenersArray = Array.from(listeners);

      for (const callback of listenersArray) {
        try {
          callback(data);
        } catch (error) {
          console.error(`[EventEmitter] Error in listener for "${eventName}":`, error);
          // Continue calling other listeners even if one fails
        }
      }

      return true;
    } finally {
      // Always clean up emitting flag
      this._emitting.delete(eventName);
    }
  }

  /**
   * Remove all listeners
   */
  removeAllListeners() {
    this._listeners.clear();
    this._emitting.clear();
    this._dampening.clear();
  }

  /**
   * Get listener count for an event
   * @param {string} eventName - Name of the event
   * @returns {number} Number of listeners
   */
  listenerCount(eventName) {
    const listeners = this._listeners.get(eventName);
    return listeners ? listeners.size : 0;
  }

  /**
   * Get all event names that have listeners
   * @returns {string[]} Array of event names
   */
  eventNames() {
    return Array.from(this._listeners.keys());
  }
}
