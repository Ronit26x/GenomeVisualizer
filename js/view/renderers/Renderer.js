// Renderer.js - Abstract base class for graph renderers

import { EventEmitter } from '../../core/EventEmitter.js';

/**
 * Base Renderer class for all graph renderers.
 * All renderers (DOT, GFA, etc.) extend this class.
 */
export class Renderer extends EventEmitter {
  constructor(name = 'base') {
    super();

    this.name = name;
    this.canvas = null;
    this.ctx = null;

    // Rendering state
    this.isInitialized = false;

    // Visual settings
    this.nodeRadius = 10;
    this.edgeWidth = 1;
    this.nodeColor = '#4A90E2';
    this.edgeColor = '#999';
    this.selectedColor = '#FF6B6B';
    this.highlightColor = '#FFD700';
  }

  /**
   * Initialize renderer with canvas context
   * @param {HTMLCanvasElement} canvas - Canvas element
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
   */
  initialize(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.isInitialized = true;

    this.emit('initialized', { canvas, ctx });
  }

  /**
   * Render the graph
   * Must be implemented by subclasses
   * @param {Object} renderData - Data to render (nodes, edges, transform, etc.)
   */
  render(renderData) {
    throw new Error(`Renderer.render() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Clear the canvas
   */
  clear() {
    if (!this.ctx || !this.canvas) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Apply transform to context (zoom/pan)
   * @param {Object} transform - Transform object with x, y, k
   */
  applyTransform(transform) {
    if (!this.ctx) return;

    this.ctx.save();
    this.ctx.translate(transform.x, transform.y);
    this.ctx.scale(transform.k, transform.k);
  }

  /**
   * Restore context after transform
   */
  restoreTransform() {
    if (!this.ctx) return;

    this.ctx.restore();
  }

  /**
   * Draw a node at given position
   * @param {Object} node - Node to draw
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {Object} style - Style overrides
   */
  drawNode(node, x, y, style = {}) {
    // Base implementation - can be overridden
    const ctx = this.ctx;
    const radius = style.radius || this.nodeRadius;
    const color = style.color || this.nodeColor;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();

    if (style.stroke) {
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = style.strokeWidth || 2;
      ctx.stroke();
    }
  }

  /**
   * Draw an edge between two points
   * @param {number} x1 - Start X
   * @param {number} y1 - Start Y
   * @param {number} x2 - End X
   * @param {number} y2 - End Y
   * @param {Object} style - Style overrides
   */
  drawEdge(x1, y1, x2, y2, style = {}) {
    // Base implementation - can be overridden
    const ctx = this.ctx;
    const color = style.color || this.edgeColor;
    const width = style.width || this.edgeWidth;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  /**
   * Draw text label
   * @param {string} text - Text to draw
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {Object} style - Style overrides
   */
  drawLabel(text, x, y, style = {}) {
    const ctx = this.ctx;
    const fontSize = style.fontSize || 12;
    const color = style.color || '#000';

    ctx.font = `${fontSize}px ${style.fontFamily || 'sans-serif'}`;
    ctx.fillStyle = color;
    ctx.textAlign = style.textAlign || 'center';
    ctx.textBaseline = style.textBaseline || 'middle';
    ctx.fillText(text, x, y);
  }

  /**
   * Check if point is inside node bounds
   * @param {Object} node - Node to check
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {boolean} True if point is inside node
   */
  hitTest(node, x, y) {
    // Default circular hit test
    const dx = x - node.x;
    const dy = y - node.y;
    const radius = this.nodeRadius;

    return (dx * dx + dy * dy) <= (radius * radius);
  }

  /**
   * Update visual settings
   */
  setStyle(settings) {
    Object.assign(this, settings);
    this.emit('styleChanged', settings);
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.canvas = null;
    this.ctx = null;
    this.isInitialized = false;
    this.removeAllListeners();
  }
}
