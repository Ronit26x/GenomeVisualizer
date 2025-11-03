// Parser.js - Abstract base class for graph format parsers

import { EventEmitter } from '../../core/EventEmitter.js';

/**
 * Base Parser class for all graph format parsers.
 * All parsers (DOT, GFA, etc.) extend this class.
 */
export class Parser extends EventEmitter {
  constructor(format = 'unknown') {
    super();

    this.format = format;
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Parse text content into graph data
   * Must be implemented by subclasses
   * @param {string} text - Raw text content to parse
   * @returns {Object} Parsed graph data { nodes, edges }
   */
  parse(text) {
    throw new Error(`Parser.parse() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Validate the input text before parsing
   * @param {string} text - Text to validate
   * @returns {boolean} True if valid
   */
  validate(text) {
    if (!text || typeof text !== 'string') {
      this.addError('Invalid input: text must be a non-empty string');
      return false;
    }

    return true;
  }

  /**
   * Add an error message
   */
  addError(message) {
    this.errors.push({
      message,
      timestamp: Date.now()
    });

    this.emit('error', { message });
  }

  /**
   * Add a warning message
   */
  addWarning(message) {
    this.warnings.push({
      message,
      timestamp: Date.now()
    });

    this.emit('warning', { message });
  }

  /**
   * Clear all errors and warnings
   */
  clearMessages() {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Get all errors
   */
  getErrors() {
    return [...this.errors];
  }

  /**
   * Get all warnings
   */
  getWarnings() {
    return [...this.warnings];
  }

  /**
   * Check if parser has errors
   */
  hasErrors() {
    return this.errors.length > 0;
  }

  /**
   * Check if parser has warnings
   */
  hasWarnings() {
    return this.warnings.length > 0;
  }

  /**
   * Log a message (can be overridden)
   */
  log(message) {
    console.log(`[${this.format.toUpperCase()} Parser] ${message}`);
    this.emit('log', { message });
  }

  /**
   * Reset parser state
   */
  reset() {
    this.clearMessages();
  }
}
