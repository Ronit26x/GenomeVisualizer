// GraphController.js - Logic coordinator between Model and View

import { EventEmitter } from './EventEmitter.js';

/**
 * GraphController mediates between Model and View.
 * Subscribes to View events → updates Model
 * Subscribes to Model events → triggers side effects and View updates
 * Handles complex operations (vertex resolution, merging, path management)
 */
export class GraphController extends EventEmitter {
  constructor(model, view, layoutManager) {
    super();

    this.model = model;
    this.view = view;
    this.layoutManager = layoutManager;

    // Drag state
    this._dragState = null;

    // Track first node click for one-time warm start
    this._firstNodeClickAfterLoad = true;

    this._setupViewListeners();
    this._setupModelListeners();
  }

  // ===== SETUP LISTENERS =====

  _setupViewListeners() {
    // Node interactions
    this.view.on('nodeClick', ({ nodeId }) => this._onNodeClick(nodeId));
    this.view.on('nodeDragStart', ({ nodeId, x, y }) => this._onNodeDragStart(nodeId, x, y));
    this.view.on('nodeDrag', ({ nodeId, x, y }) => this._onNodeDrag(nodeId, x, y));
    this.view.on('nodeDragEnd', ({ nodeId }) => this._onNodeDragEnd(nodeId));

    // Canvas interactions
    this.view.on('canvasClick', () => this._onCanvasClick());
    this.view.on('canvasZoom', () => this._onCanvasZoom());
  }

  _setupModelListeners() {
    // When model changes, update view
    this.model.on('graphLoaded', ({ nodes, links, format, source }) => {
      this.view.updateNodes(nodes);
      this.view.updateLinks(links);
      this.view.updateFormat(format);
      // Invalidate GFA cache when graph structure changes (e.g., after resolution or undo)
      // but NOT on initial user load (that would clear it before first render)
      if (source === 'resolution' || source === 'undo') {
        this.view.invalidateGfaNodes();
      }
      this.view.render();
    });

    this.model.on('nodeAdded', () => {
      this.view.updateNodes(this.model.nodes);
      this.view.render();
    });

    this.model.on('nodeRemoved', () => {
      this.view.updateNodes(this.model.nodes);
      this.view.updateLinks(this.model.links);
      this.view.render();
    });

    this.model.on('nodesMerged', () => {
      console.log('[GraphController] nodesMerged event - updating view');
      this.view.updateNodes(this.model.nodes);
      this.view.updateLinks(this.model.links);
      // Invalidate GFA nodes cache so they get recreated with the merged node
      this.view.invalidateGfaNodes();
      this.view.render();
    });

    this.model.on('graphStructureChanged', ({ reason, nodesAdded, nodesRemoved, edgesAdded, edgesRemoved }) => {
      console.log(`[GraphController] graphStructureChanged event (${reason}) - updating view`);
      console.log(`  Nodes: +${nodesAdded} -${nodesRemoved}, Edges: +${edgesAdded} -${edgesRemoved}`);
      this.view.updateNodes(this.model.nodes);
      this.view.updateLinks(this.model.links);
      // CRITICAL: Invalidate GFA cache so visual nodes get recreated
      this.view.invalidateGfaNodes();
      this.view.render();
    });

    this.model.on('nodeMoved', ({ source }) => {
      // Only render on user-initiated moves, not layout moves
      if (source !== 'layout') {
        this.view.updateNodes(this.model.nodes);
        this.view.render();
      }
    });

    this.model.on('nodesMovedBatch', () => {
      // Batch updates from layout - render once
      this.view.updateNodes(this.model.nodes);
      this.view.render();
    });

    this.model.on('nodeSelected', ({ nodeIds }) => {
      this.view.updateSelection(nodeIds, this.model.selectedEdges);
      this.view.render();
    });

    this.model.on('nodePinned', () => {
      this.view.updatePinnedNodes(this.model.pinnedNodes);
      this.view.render();
    });

    this.model.on('pathSelected', ({ path }) => {
      this.view.updateHighlightedPath(path);
      this.view.render();
    });

    this.model.on('pathsCleared', () => {
      this.view.updateHighlightedPath(null);
      this.view.render();
    });

    this.model.on('stateRestored', () => {
      // Undo was performed - sync all view state
      this.view.updateNodes(this.model.nodes);
      this.view.updateLinks(this.model.links);
      this.view.updateSelection(this.model.selectedNodes, this.model.selectedEdges);
      this.view.updatePinnedNodes(this.model.pinnedNodes);
      this.view.render();
    });

    // Layout manager events
    this.layoutManager.on('layoutTick', () => {
      // Update happens in model via layoutManager
      // View updates triggered by model's nodesMovedBatch event
    });
  }

  // ===== VIEW EVENT HANDLERS =====

  _onNodeClick(nodeId) {
    // Toggle selection
    const currentSelection = this.model.selectedNodes;

    if (currentSelection.has(nodeId)) {
      this.model.deselectNodes(nodeId);
    } else {
      this.model.selectNodes(nodeId, { additive: false });
    }

    // One-time warm start on first node click
    if (this._firstNodeClickAfterLoad && this.layoutManager.simulation) {
      console.log('[GraphController] First click - starting warm start (4000 ticks)');

      const sim = this.layoutManager.simulation;

      // Run ticks in batches using requestAnimationFrame for smooth UI
      let tickCount = 0;
      const totalTicks = 4000;
      const ticksPerFrame = 50; // Process 50 ticks per frame

      const runTickBatch = () => {
        // Run a batch of ticks
        for (let i = 0; i < ticksPerFrame && tickCount < totalTicks; i++) {
          sim.tick();
          tickCount++;
        }

        // Continue if more ticks needed
        if (tickCount < totalTicks) {
          requestAnimationFrame(runTickBatch);
        } else {
          // Done with warm start - restart with faster decay to settle quickly
          sim.alpha(0.3).alphaDecay(0.1).restart();
          console.log('[GraphController] Warm start complete');
        }
      };

      runTickBatch();
      this._firstNodeClickAfterLoad = false;
    }

    // Emit controller event for UI updates
    this.emit('nodeClicked', { nodeId, selected: this.model.selectedNodes.has(nodeId) });
  }

  _onNodeDragStart(nodeId, x, y) {
    this._dragState = {
      nodeId,
      startX: x,
      startY: y,
      isDragging: true
    };

    // Boost simulation during drag
    this.layoutManager.boostSimulation(0.3);

    this.emit('nodeDragStarted', { nodeId });
  }

  _onNodeDrag(nodeId, x, y) {
    if (!this._dragState || this._dragState.nodeId !== nodeId) {
      return;
    }

    // Update model with new position
    this.model.updateNodePosition(nodeId, x, y, 'drag');
  }

  _onNodeDragEnd(nodeId) {
    if (!this._dragState) {
      return;
    }

    // Cool down simulation after drag
    this.layoutManager.coolSimulation();

    this._dragState = null;

    this.emit('nodeDragEnded', { nodeId });
  }

  _onCanvasClick() {
    // Deselect all nodes
    this.model.deselectNodes();
  }

  _onCanvasZoom() {
    // View already updated, just trigger render
    // Could add zoom-level specific logic here
  }

  // ===== PUBLIC API (called by UI/main.js) =====

  /**
   * Load a graph from parsed data
   */
  loadGraph(nodes, links, format) {
    this.model.loadGraph(nodes, links, format);

    // Reset first click flag on new graph load
    this._firstNodeClickAfterLoad = true;

    // Start layout simulation
    const center = this.view.getCanvasCenter();
    this.layoutManager.start(
      this.model.nodes,
      this.model.links,
      this.view.canvas.width,
      this.view.canvas.height
    );
  }

  /**
   * Pin selected nodes
   */
  pinSelectedNodes() {
    this.model.pinSelectedNodes();
  }

  /**
   * Remove selected nodes
   */
  removeSelectedNodes() {
    const selectedIds = Array.from(this.model.selectedNodes);
    if (selectedIds.length > 0) {
      this.model.removeNodes(selectedIds);
    }
  }

  /**
   * Undo last operation
   */
  undo() {
    this.model.undo();

    // Restart layout with restored state
    if (this.layoutManager.isRunning) {
      this.layoutManager.restart();
    }
  }

  /**
   * Save a path
   */
  savePath(nodeSequence, pathName) {
    return this.model.savePath(nodeSequence, pathName);
  }

  /**
   * Select a path
   */
  selectPath(pathIndex) {
    this.model.selectPath(pathIndex);
  }

  /**
   * Remove a path
   */
  removePath(pathIndex) {
    this.model.removePath(pathIndex);
  }

  /**
   * Clear all paths
   */
  clearAllPaths() {
    this.model.clearAllPaths();
  }

  /**
   * Get current selection
   */
  getSelection() {
    return {
      nodes: Array.from(this.model.selectedNodes),
      edges: Array.from(this.model.selectedEdges)
    };
  }

  /**
   * Get current path
   */
  getCurrentPath() {
    return this.model.currentPath;
  }

  /**
   * Get all saved paths
   */
  getSavedPaths() {
    return this.model.savedPaths;
  }

  /**
   * Redraw the graph (restart layout)
   */
  redraw() {
    if (this.layoutManager.simulation) {
      this.layoutManager.restart();
    } else {
      this.layoutManager.start(
        this.model.nodes,
        this.model.links,
        this.view.canvas.width,
        this.view.canvas.height
      );
    }
  }

  /**
   * Reset view (zoom/pan)
   */
  resetView() {
    this.view.resetView();
  }

  /**
   * Generate random graph (for testing)
   */
  generateRandomGraph(nodeCount = 50) {
    const nodes = d3.range(nodeCount).map(i => ({ id: i }));
    const links = d3.range(nodeCount - 1).map(i => ({ source: i, target: i + 1 }));

    this.loadGraph(nodes, links, 'dot');
  }

  // ===== COMPLEX OPERATIONS (to be implemented) =====

  /**
   * Perform vertex resolution
   * TODO: Integrate with existing resolution logic
   */
  resolveVertex(vertexId) {
    // Will integrate with existing vertex resolution system
    console.warn('[GraphController] resolveVertex not yet implemented');
  }

  /**
   * Merge selected nodes
   * TODO: Integrate with existing node-merger.js
   */
  mergeSelectedNodes() {
    // Will integrate with existing node merging system
    console.warn('[GraphController] mergeSelectedNodes not yet implemented');
  }

  /**
   * Export path sequence
   * TODO: Integrate with operations/SequenceExporter.js
   */
  exportPathSequence(pathIndex) {
    // Will integrate with existing sequence export system
    console.warn('[GraphController] exportPathSequence not yet implemented');
  }

  // ===== CLEANUP =====

  /**
   * Clean up all listeners and references
   */
  destroy() {
    this.layoutManager.destroy();
    this.view.destroy();
    this.model.removeAllListeners();
    this.removeAllListeners();
  }
}
