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

    // Visualization options
    this._showComponentBounds = false;

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

    // Calculate connected components and their bounding boxes
    const componentBounds = this._calculateComponentBounds();

    const renderData = {
      nodes: this._nodes,
      edges: this._links,
      transform: this.transform,
      selection: { nodes: this._selectedNodes, edges: this._selectedEdges },
      pinnedNodes: this._pinnedNodes,
      highlightedPath: this._highlightedPath,
      scaleFactor: 1.0,
      componentBounds: componentBounds,
      showComponentBounds: this._showComponentBounds
    };

    // Route to appropriate renderer based on format
    if (this._format === 'gfa') {
      this._gfaRenderer.render(renderData);
    } else {
      this._dotRenderer.render(renderData);
    }
  }

  /**
   * Calculate bounding boxes for connected components
   */
  _calculateComponentBounds() {
    // For GFA format, we need the visual nodes to be created first
    // Skip calculation if GFA renderer hasn't created visual nodes yet
    if (this._format === 'gfa' && this._gfaRenderer.gfaVisualNodes.length === 0) {
      return [];
    }

    // Helper to extract base node ID (remove _segN suffix for chain segments)
    const getBaseNodeId = (nodeId) => {
      const id = String(nodeId);
      const match = id.match(/^(.+)_seg\d+$/);
      return match ? match[1] : id;
    };

    // Build adjacency information using BASE node IDs (ignore chain segments)
    const visited = new Set();
    const components = [];

    // Helper function to perform DFS on base node IDs
    const dfs = (baseNodeId, component) => {
      if (visited.has(baseNodeId)) return;
      visited.add(baseNodeId);
      component.push(baseNodeId);

      // Find all connected nodes (using base IDs)
      this._links.forEach(link => {
        const sourceId = String(link.source?.id || link.source);
        const targetId = String(link.target?.id || link.target);
        const sourceBaseId = getBaseNodeId(sourceId);
        const targetBaseId = getBaseNodeId(targetId);

        // Skip internal chain links (links within the same base node)
        if (sourceBaseId === targetBaseId) return;

        if (sourceBaseId === baseNodeId && !visited.has(targetBaseId)) {
          dfs(targetBaseId, component);
        } else if (targetBaseId === baseNodeId && !visited.has(sourceBaseId)) {
          dfs(sourceBaseId, component);
        }
      });
    };

    // Get unique base node IDs
    const baseNodeIds = new Set();
    this._nodes.forEach(node => {
      baseNodeIds.add(getBaseNodeId(node.id));
    });

    // Find all connected components (using base node IDs)
    baseNodeIds.forEach(baseNodeId => {
      if (!visited.has(baseNodeId)) {
        const component = [];
        dfs(baseNodeId, component);
        components.push(component);
      }
    });

    // Calculate bounding boxes for each component with padding
    const bounds = [];
    components.forEach(componentBaseNodeIds => {
      // Map base node IDs to all actual nodes (including all segments)
      const nodes = [];
      componentBaseNodeIds.forEach(baseNodeId => {
        // Find all nodes (segments) that belong to this base node
        this._nodes.forEach(node => {
          if (getBaseNodeId(node.id) === baseNodeId) {
            if (node.x !== undefined && node.y !== undefined) {
              nodes.push(node);
            }
          }
        });
      });

      if (nodes.length === 0) return;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      // For GFA format, we need to consider the node dimensions
      if (this._format === 'gfa') {
        // Get GFA visual nodes from renderer
        const gfaNodes = nodes.map(node =>
          this._gfaRenderer.gfaVisualNodes.find(gn => gn.id === node.id)
        ).filter(gn => gn);

        if (gfaNodes.length > 0) {
          gfaNodes.forEach(gfaNode => {
            // Calculate bounds considering the node's length and width
            const halfLength = gfaNode.drawnLength / 2;
            const halfWidth = gfaNode.width / 2;
            const cos = Math.cos(gfaNode.angle);
            const sin = Math.sin(gfaNode.angle);

            // Calculate the 4 corners of the rectangular node
            const corners = [
              { x: gfaNode.x - cos * halfLength - sin * halfWidth, y: gfaNode.y - sin * halfLength + cos * halfWidth },
              { x: gfaNode.x - cos * halfLength + sin * halfWidth, y: gfaNode.y - sin * halfLength - cos * halfWidth },
              { x: gfaNode.x + cos * halfLength - sin * halfWidth, y: gfaNode.y + sin * halfLength + cos * halfWidth },
              { x: gfaNode.x + cos * halfLength + sin * halfWidth, y: gfaNode.y + sin * halfLength - cos * halfWidth }
            ];

            corners.forEach(corner => {
              minX = Math.min(minX, corner.x);
              minY = Math.min(minY, corner.y);
              maxX = Math.max(maxX, corner.x);
              maxY = Math.max(maxY, corner.y);
            });
          });
        }
      } else {
        // For DOT format, use circular node approximation
        const nodeRadius = 10; // Approximate node radius

        nodes.forEach(node => {
          minX = Math.min(minX, node.x - nodeRadius);
          minY = Math.min(minY, node.y - nodeRadius);
          maxX = Math.max(maxX, node.x + nodeRadius);
          maxY = Math.max(maxY, node.y + nodeRadius);
        });
      }

      // Add padding
      const padding = 30;
      let newMinX = minX - padding;
      let newMinY = minY - padding;
      let newMaxX = maxX + padding;
      let newMaxY = maxY + padding;

      // Make the bounds square by equalizing width and height
      const width = newMaxX - newMinX;
      const height = newMaxY - newMinY;
      const maxDimension = Math.max(width, height);

      // Expand the smaller dimension to match the larger one
      if (width < maxDimension) {
        const diff = (maxDimension - width) / 2;
        newMinX -= diff;
        newMaxX += diff;
      }
      if (height < maxDimension) {
        const diff = (maxDimension - height) / 2;
        newMinY -= diff;
        newMaxY += diff;
      }

      bounds.push({
        minX: newMinX,
        minY: newMinY,
        maxX: newMaxX,
        maxY: newMaxY
      });
    });

    return bounds;
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

  /**
   * Update showComponentBounds flag
   */
  updateShowComponentBounds(show) {
    this._showComponentBounds = show;
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
   * Zoom to fit all nodes in view
   */
  zoomToFit(padding = 50) {
    if (this._nodes.length === 0) return;

    // Calculate bounding box of all nodes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    this._nodes.forEach(node => {
      if (node.x !== undefined && node.y !== undefined) {
        // For GFA format, consider node dimensions
        if (this._format === 'gfa') {
          const gfaNode = this._gfaRenderer.gfaVisualNodes.find(gn => gn.id === node.id);
          if (gfaNode) {
            const halfLength = gfaNode.drawnLength / 2;
            const halfWidth = gfaNode.width / 2;
            const cos = Math.cos(gfaNode.angle);
            const sin = Math.sin(gfaNode.angle);

            // Calculate the 4 corners
            const corners = [
              { x: gfaNode.x - cos * halfLength - sin * halfWidth, y: gfaNode.y - sin * halfLength + cos * halfWidth },
              { x: gfaNode.x - cos * halfLength + sin * halfWidth, y: gfaNode.y - sin * halfLength - cos * halfWidth },
              { x: gfaNode.x + cos * halfLength - sin * halfWidth, y: gfaNode.y + sin * halfLength + cos * halfWidth },
              { x: gfaNode.x + cos * halfLength + sin * halfWidth, y: gfaNode.y + sin * halfLength - cos * halfWidth }
            ];

            corners.forEach(corner => {
              minX = Math.min(minX, corner.x);
              minY = Math.min(minY, corner.y);
              maxX = Math.max(maxX, corner.x);
              maxY = Math.max(maxY, corner.y);
            });
          } else {
            // Fallback if GFA node not created yet
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x);
            maxY = Math.max(maxY, node.y);
          }
        } else {
          // For DOT format, use node position with small radius
          const radius = 10;
          minX = Math.min(minX, node.x - radius);
          minY = Math.min(minY, node.y - radius);
          maxX = Math.max(maxX, node.x + radius);
          maxY = Math.max(maxY, node.y + radius);
        }
      }
    });

    if (!isFinite(minX)) return;

    // Add generous padding to ensure graph is zoomed out
    const width = maxX - minX + 2 * padding;
    const height = maxY - minY + 2 * padding;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Calculate scale to fit - with extra margin to zoom out more
    const scaleX = this.canvas.width / width;
    const scaleY = this.canvas.height / height;
    let scale = Math.min(scaleX, scaleY);

    // Apply zoom out factor - reduce scale to zoom out further
    // 0.8 means zoom out to 80% of the "perfect fit" size
    scale = scale * 0.8;

    // Clamp scale to reasonable bounds
    // Maximum zoom in: 0.5, ensure we don't zoom in too much
    scale = Math.min(scale, 0.5);

    console.log('[GraphView] zoomToFit - bounds:', { minX, minY, maxX, maxY, width, height, scale });

    // Calculate translation to center
    const translateX = this.canvas.width / 2 - scale * centerX;
    const translateY = this.canvas.height / 2 - scale * centerY;

    // Apply transform
    const zoom = d3.zoom();
    const newTransform = d3.zoomIdentity
      .translate(translateX, translateY)
      .scale(scale);

    d3.select(this.canvas)
      .transition()
      .duration(750)
      .call(zoom.transform, newTransform);
  }

  /**
   * Clean up event listeners
   */
  destroy() {
    window.removeEventListener('resize', this.resizeCanvas);
    this.removeAllListeners();
  }
}
