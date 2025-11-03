// CanvasInteraction.js - Handles mouse and touch interaction with canvas

import { EventEmitter } from '../../core/EventEmitter.js';

/**
 * CanvasInteraction manages user interaction with the canvas.
 * Handles clicks, drags, hovers, and emits interaction events.
 */
export class CanvasInteraction extends EventEmitter {
  constructor(canvasManager, transform) {
    super();

    this.canvasManager = canvasManager;
    this.transform = transform;

    this.canvas = canvasManager.getCanvas();

    // Interaction state
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    // Hover state
    this.hoveredNode = null;
    this.hoveredEdge = null;

    // Click detection
    this.clickThreshold = 5; // pixels of movement allowed for click
    this.clickStartX = 0;
    this.clickStartY = 0;

    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Setup mouse and touch event listeners
   */
  setupEventListeners() {
    // Mouse events
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.addEventListener('click', this.handleClick.bind(this));
    this.canvas.addEventListener('dblclick', this.handleDoubleClick.bind(this));

    // Wheel event for zooming
    this.canvas.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });

    // Context menu (right-click)
    this.canvas.addEventListener('contextmenu', this.handleContextMenu.bind(this));

    // Touch events
    this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
    this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
  }

  /**
   * Handle mouse down
   */
  handleMouseDown(event) {
    const coords = this.getEventCoordinates(event);

    this.isDragging = true;
    this.dragStartX = coords.x;
    this.dragStartY = coords.y;
    this.clickStartX = coords.x;
    this.clickStartY = coords.y;
    this.lastMouseX = coords.x;
    this.lastMouseY = coords.y;

    this.emit('mousedown', {
      x: coords.x,
      y: coords.y,
      simX: coords.simX,
      simY: coords.simY,
      button: event.button,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey
    });
  }

  /**
   * Handle mouse move
   */
  handleMouseMove(event) {
    const coords = this.getEventCoordinates(event);

    if (this.isDragging) {
      const dx = coords.x - this.lastMouseX;
      const dy = coords.y - this.lastMouseY;

      this.emit('drag', {
        x: coords.x,
        y: coords.y,
        simX: coords.simX,
        simY: coords.simY,
        dx,
        dy,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey
      });
    } else {
      this.emit('hover', {
        x: coords.x,
        y: coords.y,
        simX: coords.simX,
        simY: coords.simY
      });
    }

    this.lastMouseX = coords.x;
    this.lastMouseY = coords.y;
  }

  /**
   * Handle mouse up
   */
  handleMouseUp(event) {
    const coords = this.getEventCoordinates(event);

    if (this.isDragging) {
      this.emit('dragend', {
        x: coords.x,
        y: coords.y,
        simX: coords.simX,
        simY: coords.simY
      });
    }

    this.isDragging = false;
  }

  /**
   * Handle click
   */
  handleClick(event) {
    const coords = this.getEventCoordinates(event);

    // Check if mouse moved during click (drag vs click)
    const dx = Math.abs(coords.x - this.clickStartX);
    const dy = Math.abs(coords.y - this.clickStartY);

    if (dx > this.clickThreshold || dy > this.clickThreshold) {
      return; // Was a drag, not a click
    }

    this.emit('click', {
      x: coords.x,
      y: coords.y,
      simX: coords.simX,
      simY: coords.simY,
      button: event.button,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey
    });
  }

  /**
   * Handle double click
   */
  handleDoubleClick(event) {
    const coords = this.getEventCoordinates(event);

    this.emit('dblclick', {
      x: coords.x,
      y: coords.y,
      simX: coords.simX,
      simY: coords.simY,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey
    });

    event.preventDefault();
  }

  /**
   * Handle mouse wheel (zoom)
   */
  handleWheel(event) {
    event.preventDefault();

    const coords = this.getEventCoordinates(event);

    // Determine zoom direction
    const delta = event.deltaY;
    const zoomFactor = delta < 0 ? 1.1 : 1 / 1.1;

    this.emit('wheel', {
      x: coords.x,
      y: coords.y,
      simX: coords.simX,
      simY: coords.simY,
      delta,
      zoomFactor
    });
  }

  /**
   * Handle context menu (right-click)
   */
  handleContextMenu(event) {
    event.preventDefault();

    const coords = this.getEventCoordinates(event);

    this.emit('contextmenu', {
      x: coords.x,
      y: coords.y,
      simX: coords.simX,
      simY: coords.simY
    });
  }

  /**
   * Handle touch start
   */
  handleTouchStart(event) {
    if (event.touches.length === 1) {
      // Single touch - treat as mouse down
      const touch = event.touches[0];
      const coords = this.getTouchCoordinates(touch);

      this.isDragging = true;
      this.dragStartX = coords.x;
      this.dragStartY = coords.y;
      this.clickStartX = coords.x;
      this.clickStartY = coords.y;
      this.lastMouseX = coords.x;
      this.lastMouseY = coords.y;

      this.emit('mousedown', {
        x: coords.x,
        y: coords.y,
        simX: coords.simX,
        simY: coords.simY,
        button: 0,
        shiftKey: false,
        ctrlKey: false
      });
    }

    event.preventDefault();
  }

  /**
   * Handle touch move
   */
  handleTouchMove(event) {
    if (event.touches.length === 1) {
      // Single touch - treat as mouse move
      const touch = event.touches[0];
      const coords = this.getTouchCoordinates(touch);

      if (this.isDragging) {
        const dx = coords.x - this.lastMouseX;
        const dy = coords.y - this.lastMouseY;

        this.emit('drag', {
          x: coords.x,
          y: coords.y,
          simX: coords.simX,
          simY: coords.simY,
          dx,
          dy,
          shiftKey: false,
          ctrlKey: false
        });
      }

      this.lastMouseX = coords.x;
      this.lastMouseY = coords.y;
    }

    event.preventDefault();
  }

  /**
   * Handle touch end
   */
  handleTouchEnd(event) {
    if (event.changedTouches.length === 1) {
      const touch = event.changedTouches[0];
      const coords = this.getTouchCoordinates(touch);

      // Check if this was a tap (click)
      const dx = Math.abs(coords.x - this.clickStartX);
      const dy = Math.abs(coords.y - this.clickStartY);

      if (dx <= this.clickThreshold && dy <= this.clickThreshold) {
        this.emit('click', {
          x: coords.x,
          y: coords.y,
          simX: coords.simX,
          simY: coords.simY,
          button: 0,
          shiftKey: false,
          ctrlKey: false
        });
      }

      if (this.isDragging) {
        this.emit('dragend', {
          x: coords.x,
          y: coords.y,
          simX: coords.simX,
          simY: coords.simY
        });
      }

      this.isDragging = false;
    }

    event.preventDefault();
  }

  /**
   * Get event coordinates (canvas and simulation space)
   */
  getEventCoordinates(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Convert to simulation coordinates
    const simCoords = this.transform.invert(x, y);

    return {
      x,          // Canvas coordinates
      y,
      simX: simCoords.x,  // Simulation coordinates
      simY: simCoords.y
    };
  }

  /**
   * Get touch coordinates
   */
  getTouchCoordinates(touch) {
    const rect = this.canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    const simCoords = this.transform.invert(x, y);

    return {
      x,
      y,
      simX: simCoords.x,
      simY: simCoords.y
    };
  }

  /**
   * Set transform for coordinate conversion
   */
  setTransform(transform) {
    this.transform = transform;
  }

  /**
   * Set hovered node
   */
  setHoveredNode(node) {
    if (this.hoveredNode !== node) {
      const previousNode = this.hoveredNode;
      this.hoveredNode = node;

      this.emit('hoverChanged', {
        type: 'node',
        current: node,
        previous: previousNode
      });
    }
  }

  /**
   * Set hovered edge
   */
  setHoveredEdge(edge) {
    if (this.hoveredEdge !== edge) {
      const previousEdge = this.hoveredEdge;
      this.hoveredEdge = edge;

      this.emit('hoverChanged', {
        type: 'edge',
        current: edge,
        previous: previousEdge
      });
    }
  }

  /**
   * Clear hover state
   */
  clearHover() {
    this.setHoveredNode(null);
    this.setHoveredEdge(null);
  }

  /**
   * Set cursor style
   */
  setCursor(cursor) {
    this.canvasManager.setCursor(cursor);
  }

  /**
   * Clean up event listeners
   */
  destroy() {
    // Remove all event listeners
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.removeEventListener('click', this.handleClick);
    this.canvas.removeEventListener('dblclick', this.handleDoubleClick);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
    this.canvas.removeEventListener('touchstart', this.handleTouchStart);
    this.canvas.removeEventListener('touchmove', this.handleTouchMove);
    this.canvas.removeEventListener('touchend', this.handleTouchEnd);

    this.removeAllListeners();
  }
}
