// LayoutEngine.js - Base class for graph layout algorithms

import { EventEmitter } from '../core/EventEmitter.js';

/**
 * Base LayoutEngine class for graph layout algorithms.
 * All layout engines (Force, Hierarchical, etc.) extend this class.
 */
export class LayoutEngine extends EventEmitter {
  constructor(name = 'base') {
    super();

    this.name = name;
    this.isRunning = false;
    this.isPaused = false;

    // Layout parameters
    this.width = 800;
    this.height = 600;

    // Nodes and edges being laid out
    this.nodes = [];
    this.edges = [];
  }

  /**
   * Start the layout engine
   * @param {Array} nodes - Array of nodes to layout
   * @param {Array} edges - Array of edges
   * @param {number} width - Canvas width
   * @param {number} height - Canvas height
   */
  start(nodes, edges, width, height) {
    this.nodes = nodes;
    this.edges = edges;
    this.width = width || this.width;
    this.height = height || this.height;

    this.isRunning = true;
    this.isPaused = false;

    this.emit('start', { nodes, edges });
  }

  /**
   * Stop the layout engine
   */
  stop() {
    this.isRunning = false;
    this.isPaused = false;

    this.emit('stop');
  }

  /**
   * Pause the layout engine
   */
  pause() {
    this.isPaused = true;
    this.emit('pause');
  }

  /**
   * Resume the layout engine
   */
  resume() {
    this.isPaused = false;
    this.emit('resume');
  }

  /**
   * Restart the layout engine
   */
  restart() {
    this.stop();
    this.start(this.nodes, this.edges, this.width, this.height);
    this.emit('restart');
  }

  /**
   * Perform one iteration/tick of the layout algorithm
   * Must be implemented by subclasses
   */
  tick() {
    throw new Error(`LayoutEngine.tick() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Update node positions (called after each tick)
   * @param {Function} callback - Optional callback with updated nodes
   */
  updatePositions(callback) {
    if (callback) {
      callback(this.nodes);
    }

    this.emit('tick', { nodes: this.nodes });
  }

  /**
   * Set layout bounds
   */
  setBounds(width, height) {
    this.width = width;
    this.height = height;
    this.emit('boundsChanged', { width, height });
  }

  /**
   * Get center point of layout
   */
  getCenter() {
    return {
      x: this.width / 2,
      y: this.height / 2
    };
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.stop();
    this.nodes = [];
    this.edges = [];
    this.removeAllListeners();
  }
}
