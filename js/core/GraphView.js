// GraphView.js - Rendering layer with DOM event handling

import { EventEmitter } from './EventEmitter.js';
import { GfaRenderer } from '../view/renderers/GfaRenderer.js';
import { DotRenderer } from '../view/renderers/DotRenderer.js';

/**
 * GraphView handles all rendering and DOM interactions.
 * Emits events for user actions, subscribes to Model events for re-rendering.
 *
 * Events emitted:
 * - canvasClick: {x, y, screenX, screenY}
 * - nodeClick: {nodeId, x, y}
 * - nodeDragStart: {nodeId, x, y}
 * - nodeDrag: {nodeId, x, y, dx, dy}
 * - nodeDragEnd: {nodeId, x, y}
 * - canvasZoom: {transform}
 * - canvasPan: {transform}
 */
export class GraphView extends EventEmitter {
  constructor(canvas, ctx) {
    super();

    this.canvas = canvas;
    this.ctx = ctx;
    this.transform = d3.zoomIdentity; // D3 zoom transform

    // Rendering state (mirrors model state for performance)
    this._nodes = [];
    this._links = [];
    this._format = 'dot';
    this._selectedNodes = new Set();
    this._selectedEdges = new Set();
    this._pinnedNodes = new Set();
    this._highlightedPath = {
      nodes: new Set(),
      edges: new Set(),
      currentColor: '#ff6b6b'
    };

    // Drag state
    this._dragNode = null;
    this._dragStartPos = null;

    // Initialize MVC renderers
    this._dotRenderer = new DotRenderer();
    this._gfaRenderer = new GfaRenderer();
    this._dotRenderer.initialize(canvas, ctx);
    this._gfaRenderer.initialize(canvas, ctx);

    this._setupCanvas();
    this._setupZoom();
    this._setupDragHandlers();
  }

  // ===== SETUP =====

  _setupCanvas() {
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  _setupZoom() {
    const zoom = d3.zoom()
      .scaleExtent([0.01, 10])
      .on('zoom', (event) => {
        this.transform = event.transform;
        this.emit('canvasZoom', { transform: this.transform });
        this.render();
      });

    d3.select(this.canvas).call(zoom);
  }

  _setupDragHandlers() {
    this.canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this._onPointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this._onPointerUp(e));
    this.canvas.addEventListener('pointerleave', (e) => this._onPointerUp(e));
  }

  // ===== RENDERING =====

  /**
   * Main render function - delegates to MVC renderers
   */
  render() {
    if (!this.canvas || !this.ctx) return;

    const renderData = {
      nodes: this._nodes,
      edges: this._links,
      transform: this.transform,
      selection: { nodes: this._selectedNodes, edges: this._selectedEdges },
      pinnedNodes: this._pinnedNodes,
      highlightedPath: this._highlightedPath,
      scaleFactor: 1.0
    };

    // Route to appropriate renderer based on format
    if (this._format === 'gfa') {
      this._gfaRenderer.render(renderData);
    } else {
      this._dotRenderer.render(renderData);
    }
  }

  /**
   * Resize canvas to fit container
   */
  resizeCanvas() {
    const container = this.canvas.parentElement;
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;
    this.render();
  }

  // ===== STATE UPDATES (from Model events) =====

  /**
   * Update nodes from model
   */
  updateNodes(nodes) {
    // Only log if node count actually changes
    if (nodes.length !== this._nodes.length) {
      console.log(`[GraphView] ⚠️ NODE COUNT CHANGED: ${this._nodes.length} → ${nodes.length}`);
    }
    this._nodes = nodes;
  }

  /**
   * Invalidate GFA nodes cache (forces recreation on next render)
   * Called after graph structure changes (e.g., node merging)
   */
  invalidateGfaNodes() {
    console.log(`[GraphView] Invalidating GFA nodes cache (current: ${this._nodes.length} nodes)`);
    this._gfaRenderer.clearCache();
  }

  /**
   * Flip selected GFA nodes
   * @param {Set} selectedNodeIds - Set of node IDs to flip
   * @returns {boolean} True if any nodes were flipped
   */
  flipSelectedNodes(selectedNodeIds) {
    if (this._format !== 'gfa') {
      console.warn('[GraphView] flipSelectedNodes only works for GFA format');
      return false;
    }

    let flipped = false;
    for (const nodeId of selectedNodeIds) {
      if (this._gfaRenderer.flipNode(nodeId)) {
        flipped = true;
      }
    }

    if (flipped) {
      this.render();
    }

    return flipped;
  }

  /**
   * Update links from model
   */
  updateLinks(links) {
    this._links = links;
  }

  /**
   * Update format from model
   */
  updateFormat(format) {
    this._format = format;
  }

  /**
   * Update selection from model
   */
  updateSelection(selectedNodes, selectedEdges) {
    this._selectedNodes = new Set(selectedNodes);
    this._selectedEdges = new Set(selectedEdges);
  }

  /**
   * Update pinned nodes from model
   */
  updatePinnedNodes(pinnedNodes) {
    this._pinnedNodes = new Set(pinnedNodes);
  }

  /**
   * Update highlighted path from model
   */
  updateHighlightedPath(path) {
    if (path) {
      this._highlightedPath.nodes = new Set(path.nodes);
      this._highlightedPath.edges = new Set(path.edges);
      this._highlightedPath.currentColor = path.color;
    } else {
      this._highlightedPath.nodes.clear();
      this._highlightedPath.edges.clear();
      this._highlightedPath.currentColor = '#ff6b6b';
    }
  }

  // ===== INTERACTION HANDLERS =====

  _onPointerDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const { x, y } = this._screenToSim(screenX, screenY);

    // Find node at position
    const node = this._findNodeAt(x, y);

    if (node) {
      // Start dragging node
      this._dragNode = node;
      this._dragStartPos = { x, y };

      this.emit('nodeDragStart', {
        nodeId: node.id,
        x: node.x,
        y: node.y
      });

      e.preventDefault();
    } else {
      // Canvas click
      this.emit('canvasClick', { x, y, screenX, screenY });
    }
  }

  _onPointerMove(e) {
    if (!this._dragNode) return;

    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const { x, y } = this._screenToSim(screenX, screenY);

    const dx = x - this._dragNode.x;
    const dy = y - this._dragNode.y;

    this.emit('nodeDrag', {
      nodeId: this._dragNode.id,
      x,
      y,
      dx,
      dy
    });

    e.preventDefault();
  }

  _onPointerUp(e) {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const { x, y } = this._screenToSim(screenX, screenY);

    if (this._dragNode) {
      // Check if this was a click (minimal movement) or a drag
      const dx = x - this._dragStartPos.x;
      const dy = y - this._dragStartPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 5) {
        // It was a click, not a drag
        this.emit('nodeClick', {
          nodeId: this._dragNode.id,
          x: this._dragNode.x,
          y: this._dragNode.y
        });
      } else {
        // It was a drag
        this.emit('nodeDragEnd', {
          nodeId: this._dragNode.id,
          x,
          y
        });
      }

      this._dragNode = null;
      this._dragStartPos = null;
    }
  }

  // ===== COORDINATE CONVERSION =====

  _screenToSim(screenX, screenY) {
    return {
      x: (screenX - this.transform.x) / this.transform.k,
      y: (screenY - this.transform.y) / this.transform.k
    };
  }

  // ===== HIT DETECTION =====

  _findNodeAt(x, y) {
    // For GFA format, use GFA renderer's hit detection
    if (this._format === 'gfa') {
      for (const node of this._nodes) {
        if (this._gfaRenderer.hitTest(node, x, y)) {
          return node;
        }
      }
      return null;
    }

    // For DOT format, use circular hit detection
    let minDist = Infinity;
    let closestNode = null;

    this._nodes.forEach(node => {
      const dx = node.x - x;
      const dy = node.y - y;
      const dist2 = dx * dx + dy * dy;

      if (dist2 < 100 && dist2 < minDist) {
        minDist = dist2;
        closestNode = node;
      }
    });

    return closestNode;
  }

  // ===== PUBLIC API =====

  /**
   * Get canvas center in simulation coordinates
   */
  getCanvasCenter() {
    return this._screenToSim(this.canvas.width / 2, this.canvas.height / 2);
  }

  /**
   * Reset zoom/pan to default
   */
  resetView() {
    const zoom = d3.zoom();
    d3.select(this.canvas)
      .transition()
      .duration(750)
      .call(zoom.transform, d3.zoomIdentity);
  }

  /**
   * Clean up event listeners
   */
  destroy() {
    window.removeEventListener('resize', this.resizeCanvas);
    this.removeAllListeners();
  }
}
