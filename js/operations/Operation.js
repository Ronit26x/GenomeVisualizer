// Operation.js - Base class for all graph operations

import { EventEmitter } from '../core/EventEmitter.js';

/**
 * Base Operation class for all graph manipulations.
 * Operations are reversible actions that can be undone/redone.
 * All operations extend EventEmitter for progress/completion notifications.
 */
export class Operation extends EventEmitter {
  constructor(name, description = '') {
    super();

    this.name = name;
    this.description = description;

    // Operation state
    this.executed = false;
    this.reversed = false;

    // Snapshot for undo
    this.beforeState = null;
    this.afterState = null;

    // Timestamp
    this.timestamp = Date.now();
  }

  /**
   * Execute the operation (must be implemented by subclasses)
   * @returns {Object} Result of the operation
   */
  execute() {
    throw new Error(`Operation.execute() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Reverse the operation (undo)
   * @returns {Object} Result of the reversal
   */
  reverse() {
    throw new Error(`Operation.reverse() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Validate if operation can be executed
   * @returns {boolean} True if operation is valid
   */
  validate() {
    return true;
  }

  /**
   * Save state before execution (for undo)
   */
  saveBeforeState(state) {
    this.beforeState = state;
  }

  /**
   * Save state after execution (for redo)
   */
  saveAfterState(state) {
    this.afterState = state;
  }

  /**
   * Mark operation as executed
   */
  markExecuted() {
    this.executed = true;
    this.reversed = false;
    this.emit('executed', { operation: this });
  }

  /**
   * Mark operation as reversed
   */
  markReversed() {
    this.executed = false;
    this.reversed = true;
    this.emit('reversed', { operation: this });
  }

  /**
   * Get operation summary for logging
   */
  getSummary() {
    return {
      name: this.name,
      description: this.description,
      executed: this.executed,
      reversed: this.reversed,
      timestamp: this.timestamp
    };
  }

  /**
   * Serialize to JSON
   */
  toJSON() {
    return this.getSummary();
  }
}
