// History.js - Manages undo/redo history using Operations

import { EventEmitter } from '../core/EventEmitter.js';
import { Operation } from '../operations/Operation.js';

/**
 * History class manages undo/redo stack for graph operations.
 * Stores Operation instances and supports undo/redo.
 */
export class History extends EventEmitter {
  constructor(maxSize = 20) {
    super();

    this.maxSize = maxSize;
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Add an operation to history
   * @param {Operation} operation - Operation to add
   */
  push(operation) {
    if (!(operation instanceof Operation)) {
      throw new Error('History can only store Operation instances');
    }

    // Add to undo stack
    this.undoStack.push(operation);

    // Limit stack size
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }

    // Clear redo stack when new operation added
    this.redoStack = [];

    this.emit('operationAdded', {
      operation,
      canUndo: this.canUndo(),
      canRedo: this.canRedo()
    });
  }

  /**
   * Undo last operation
   * @returns {Operation|null} The undone operation or null
   */
  undo() {
    if (!this.canUndo()) {
      console.warn('Nothing to undo');
      return null;
    }

    const operation = this.undoStack.pop();

    try {
      // Execute reverse operation
      operation.reverse();
      operation.markReversed();

      // Add to redo stack
      this.redoStack.push(operation);

      this.emit('undone', {
        operation,
        canUndo: this.canUndo(),
        canRedo: this.canRedo()
      });

      return operation;
    } catch (error) {
      console.error('Error during undo:', error);
      // Put operation back on stack if undo failed
      this.undoStack.push(operation);
      throw error;
    }
  }

  /**
   * Redo last undone operation
   * @returns {Operation|null} The redone operation or null
   */
  redo() {
    if (!this.canRedo()) {
      console.warn('Nothing to redo');
      return null;
    }

    const operation = this.redoStack.pop();

    try {
      // Execute operation again
      operation.execute();
      operation.markExecuted();

      // Add back to undo stack
      this.undoStack.push(operation);

      this.emit('redone', {
        operation,
        canUndo: this.canUndo(),
        canRedo: this.canRedo()
      });

      return operation;
    } catch (error) {
      console.error('Error during redo:', error);
      // Put operation back on redo stack if redo failed
      this.redoStack.push(operation);
      throw error;
    }
  }

  /**
   * Check if undo is available
   * @returns {boolean} True if can undo
   */
  canUndo() {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo is available
   * @returns {boolean} True if can redo
   */
  canRedo() {
    return this.redoStack.length > 0;
  }

  /**
   * Get undo stack size
   * @returns {number} Number of operations in undo stack
   */
  getUndoCount() {
    return this.undoStack.length;
  }

  /**
   * Get redo stack size
   * @returns {number} Number of operations in redo stack
   */
  getRedoCount() {
    return this.redoStack.length;
  }

  /**
   * Get last operation without removing it
   * @returns {Operation|null} Last operation or null
   */
  peek() {
    if (this.undoStack.length === 0) return null;
    return this.undoStack[this.undoStack.length - 1];
  }

  /**
   * Get operation history (for display)
   * @returns {Array} Array of operation summaries
   */
  getHistory() {
    return this.undoStack.map(op => op.getSummary());
  }

  /**
   * Clear all history
   */
  clear() {
    const hadHistory = this.undoStack.length > 0 || this.redoStack.length > 0;

    this.undoStack = [];
    this.redoStack = [];

    if (hadHistory) {
      this.emit('cleared', {
        canUndo: false,
        canRedo: false
      });
    }
  }

  /**
   * Clear redo stack only
   */
  clearRedo() {
    this.redoStack = [];
    this.emit('redoCleared', { canRedo: false });
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      maxSize: this.maxSize,
      canUndo: this.canUndo(),
      canRedo: this.canRedo()
    };
  }

  /**
   * Serialize to JSON
   */
  toJSON() {
    return {
      maxSize: this.maxSize,
      undoStack: this.undoStack.map(op => op.toJSON()),
      redoStack: this.redoStack.map(op => op.toJSON())
    };
  }

  /**
   * Get operation at index in undo stack
   * @param {number} index - Index (0 = oldest, -1 = newest)
   * @returns {Operation|null} Operation or null
   */
  getOperationAt(index) {
    if (index < 0) {
      index = this.undoStack.length + index;
    }

    if (index < 0 || index >= this.undoStack.length) {
      return null;
    }

    return this.undoStack[index];
  }

  /**
   * Find operations by name
   * @param {string} name - Operation name to search for
   * @returns {Array<Operation>} Matching operations
   */
  findOperationsByName(name) {
    return this.undoStack.filter(op => op.name === name);
  }

  /**
   * Get time since last operation
   * @returns {number|null} Milliseconds since last operation or null
   */
  getTimeSinceLastOperation() {
    const last = this.peek();
    return last ? Date.now() - last.timestamp : null;
  }
}
