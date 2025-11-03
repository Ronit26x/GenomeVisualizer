// Transform.js - Manages zoom and pan transform state

import { EventEmitter } from '../core/EventEmitter.js';

/**
 * Transform class manages zoom (scale) and pan (translate) state.
 * Compatible with D3 zoom behavior.
 */
export class Transform extends EventEmitter {
  constructor(x = 0, y = 0, k = 1) {
    super();

    this.x = x; // Translate X
    this.y = y; // Translate Y
    this.k = k; // Scale factor

    // Constraints
    this.minZoom = 0.1;
    this.maxZoom = 10;
  }

  /**
   * Set transform values
   * @param {number} x - Translate X
   * @param {number} y - Translate Y
   * @param {number} k - Scale factor
   */
  set(x, y, k) {
    const oldTransform = this.clone();

    this.x = x;
    this.y = y;
    this.k = this.constrainZoom(k);

    if (this.hasChanged(oldTransform)) {
      this.emit('changed', {
        transform: this.clone(),
        previous: oldTransform
      });
    }
  }

  /**
   * Set translate values
   * @param {number} x - Translate X
   * @param {number} y - Translate Y
   */
  setTranslate(x, y) {
    this.set(x, y, this.k);
  }

  /**
   * Set scale factor
   * @param {number} k - Scale factor
   */
  setScale(k) {
    this.set(this.x, this.y, k);
  }

  /**
   * Translate by delta
   * @param {number} dx - Delta X
   * @param {number} dy - Delta Y
   */
  translate(dx, dy) {
    this.set(this.x + dx, this.y + dy, this.k);
  }

  /**
   * Scale by factor
   * @param {number} factor - Scale factor multiplier
   * @param {number} centerX - Center X for scaling (optional)
   * @param {number} centerY - Center Y for scaling (optional)
   */
  scale(factor, centerX = 0, centerY = 0) {
    const newK = this.k * factor;

    // If center point provided, adjust translation to scale around that point
    if (centerX !== 0 || centerY !== 0) {
      const dx = (centerX - this.x) * (1 - factor);
      const dy = (centerY - this.y) * (1 - factor);
      this.set(this.x + dx, this.y + dy, newK);
    } else {
      this.set(this.x, this.y, newK);
    }
  }

  /**
   * Zoom in by fixed amount
   * @param {number} centerX - Center X
   * @param {number} centerY - Center Y
   */
  zoomIn(centerX = 0, centerY = 0) {
    this.scale(1.2, centerX, centerY);
  }

  /**
   * Zoom out by fixed amount
   * @param {number} centerX - Center X
   * @param {number} centerY - Center Y
   */
  zoomOut(centerX = 0, centerY = 0) {
    this.scale(1 / 1.2, centerX, centerY);
  }

  /**
   * Reset to identity transform
   */
  reset() {
    this.set(0, 0, 1);
  }

  /**
   * Apply transform to a point
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {Object} Transformed point {x, y}
   */
  apply(x, y) {
    return {
      x: x * this.k + this.x,
      y: y * this.k + this.y
    };
  }

  /**
   * Invert transform (screen to graph coordinates)
   * @param {number} x - Screen X
   * @param {number} y - Screen Y
   * @returns {Object} Graph coordinates {x, y}
   */
  invert(x, y) {
    return {
      x: (x - this.x) / this.k,
      y: (y - this.y) / this.k
    };
  }

  /**
   * Apply transform to canvas context
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   */
  applyToContext(ctx) {
    ctx.translate(this.x, this.y);
    ctx.scale(this.k, this.k);
  }

  /**
   * Set zoom constraints
   * @param {number} min - Minimum zoom
   * @param {number} max - Maximum zoom
   */
  setZoomConstraints(min, max) {
    this.minZoom = min;
    this.maxZoom = max;
    this.k = this.constrainZoom(this.k);
  }

  /**
   * Constrain zoom to min/max
   */
  constrainZoom(k) {
    return Math.max(this.minZoom, Math.min(this.maxZoom, k));
  }

  /**
   * Check if transform changed
   */
  hasChanged(otherTransform) {
    return this.x !== otherTransform.x ||
           this.y !== otherTransform.y ||
           this.k !== otherTransform.k;
  }

  /**
   * Get zoom level as percentage
   * @returns {number} Zoom percentage (100 = 100%)
   */
  getZoomPercent() {
    return Math.round(this.k * 100);
  }

  /**
   * Check if transform is at identity
   * @returns {boolean} True if at identity (no transform)
   */
  isIdentity() {
    return this.x === 0 && this.y === 0 && this.k === 1;
  }

  /**
   * Fit bounds to view
   * @param {Object} bounds - Bounds {minX, minY, maxX, maxY}
   * @param {number} width - View width
   * @param {number} height - View height
   * @param {number} padding - Padding (default 50)
   */
  fitBounds(bounds, width, height, padding = 50) {
    const boundsWidth = bounds.maxX - bounds.minX;
    const boundsHeight = bounds.maxY - bounds.minY;

    // Calculate scale to fit
    const scaleX = (width - padding * 2) / boundsWidth;
    const scaleY = (height - padding * 2) / boundsHeight;
    const scale = Math.min(scaleX, scaleY);

    // Calculate center offset
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    const x = width / 2 - centerX * scale;
    const y = height / 2 - centerY * scale;

    this.set(x, y, scale);
  }

  /**
   * Center on point
   * @param {number} x - Point X
   * @param {number} y - Point Y
   * @param {number} width - View width
   * @param {number} height - View height
   */
  centerOn(x, y, width, height) {
    const newX = width / 2 - x * this.k;
    const newY = height / 2 - y * this.k;
    this.set(newX, newY, this.k);
  }

  /**
   * Clone transform
   * @returns {Transform} Cloned transform
   */
  clone() {
    const cloned = new Transform(this.x, this.y, this.k);
    cloned.minZoom = this.minZoom;
    cloned.maxZoom = this.maxZoom;
    return cloned;
  }

  /**
   * Serialize to JSON
   */
  toJSON() {
    return {
      x: this.x,
      y: this.y,
      k: this.k,
      minZoom: this.minZoom,
      maxZoom: this.maxZoom
    };
  }

  /**
   * Load from JSON
   */
  fromJSON(data) {
    this.x = data.x || 0;
    this.y = data.y || 0;
    this.k = data.k || 1;
    this.minZoom = data.minZoom || 0.1;
    this.maxZoom = data.maxZoom || 10;
    return this;
  }

  /**
   * Create from D3 zoom event
   */
  static fromD3Event(event) {
    return new Transform(event.transform.x, event.transform.y, event.transform.k);
  }

  /**
   * Get D3-compatible transform object
   */
  toD3Transform() {
    return {
      x: this.x,
      y: this.y,
      k: this.k,
      toString: () => `translate(${this.x},${this.y}) scale(${this.k})`
    };
  }
}
