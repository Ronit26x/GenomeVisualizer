// CanvasManager.js - Manages canvas element and context

import { EventEmitter } from '../../core/EventEmitter.js';

/**
 * CanvasManager wraps a canvas element and provides rendering utilities.
 * Handles canvas initialization, resizing, and context management.
 */
export class CanvasManager extends EventEmitter {
  constructor(canvasElement) {
    super();

    if (!canvasElement || !(canvasElement instanceof HTMLCanvasElement)) {
      throw new Error('CanvasManager requires a valid HTMLCanvasElement');
    }

    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');

    // Device pixel ratio for high-DPI displays
    this.pixelRatio = window.devicePixelRatio || 1;

    // Setup resize observer
    this.resizeObserver = null;
    this.setupResizeObserver();

    // Initial resize
    this.resize();
  }

  /**
   * Setup resize observer to detect canvas size changes
   */
  setupResizeObserver() {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.resize();
      });

      this.resizeObserver.observe(this.canvas.parentElement || this.canvas);
    } else {
      // Fallback to window resize event
      window.addEventListener('resize', () => this.resize());
    }
  }

  /**
   * Resize canvas to match container size and device pixel ratio
   */
  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Update canvas internal resolution for high-DPI displays
    this.canvas.width = width * this.pixelRatio;
    this.canvas.height = height * this.pixelRatio;

    // Set CSS size
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    // Scale context to match device pixel ratio
    this.ctx.scale(this.pixelRatio, this.pixelRatio);

    this.emit('resized', { width, height, pixelRatio: this.pixelRatio });
  }

  /**
   * Get canvas dimensions (CSS pixels)
   */
  getDimensions() {
    return {
      width: this.canvas.clientWidth,
      height: this.canvas.clientHeight
    };
  }

  /**
   * Get canvas internal resolution
   */
  getResolution() {
    return {
      width: this.canvas.width,
      height: this.canvas.height
    };
  }

  /**
   * Get canvas bounding rect
   */
  getBoundingRect() {
    return this.canvas.getBoundingClientRect();
  }

  /**
   * Clear the entire canvas
   */
  clear() {
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  }

  /**
   * Fill canvas with color
   */
  fill(color = '#ffffff') {
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  }

  /**
   * Get 2D context
   */
  getContext() {
    return this.ctx;
  }

  /**
   * Get canvas element
   */
  getCanvas() {
    return this.canvas;
  }

  /**
   * Convert screen coordinates to canvas coordinates
   */
  screenToCanvas(screenX, screenY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: screenX - rect.left,
      y: screenY - rect.top
    };
  }

  /**
   * Save canvas as image
   */
  toDataURL(type = 'image/png', quality = 1.0) {
    return this.canvas.toDataURL(type, quality);
  }

  /**
   * Save canvas to blob
   */
  async toBlob(type = 'image/png', quality = 1.0) {
    return new Promise((resolve, reject) => {
      this.canvas.toBlob(
        blob => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob'));
          }
        },
        type,
        quality
      );
    });
  }

  /**
   * Download canvas as image file
   */
  download(filename = 'graph.png', type = 'image/png', quality = 1.0) {
    const dataURL = this.toDataURL(type, quality);
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataURL;
    link.click();
  }

  /**
   * Set canvas cursor
   */
  setCursor(cursor) {
    this.canvas.style.cursor = cursor;
  }

  /**
   * Enable/disable antialiasing
   */
  setAntialiasing(enabled, quality = 'high') {
    this.ctx.imageSmoothingEnabled = enabled;
    if (enabled) {
      this.ctx.imageSmoothingQuality = quality;
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.removeAllListeners();
  }
}
