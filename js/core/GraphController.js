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

    // Auto-stop simulation timer
    this._autoStopTimer = null;

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

    this.model.on('visualizationOptionChanged', ({ option, value }) => {
      if (option === 'showComponentBounds') {
        this.view.updateShowComponentBounds(value);
        this.view.render();
      }
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

    // Wake simulation on node click (after warm start is done)
    if (!this._firstNodeClickAfterLoad) {
      this._wakeSimulation();
      this._scheduleAutoStop(2000);
    }

    // One-time warm start on first node click
    if (this._firstNodeClickAfterLoad && this.layoutManager.simulation) {
      console.log('[GraphController] First click - starting warm start (4000 ticks)');

      // Update loading screen
      if (window.LoadingScreen) {
        window.LoadingScreen.update('Settling graph layout...', 75, 'Computing optimal positions');
      }

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

        // Update loading screen progress during settling
        if (window.LoadingScreen && tickCount % 200 === 0) {
          const progress = 75 + Math.floor((tickCount / totalTicks) * 15); // 75-90%
          window.LoadingScreen.update('Settling graph layout...', progress,
            `${Math.floor((tickCount / totalTicks) * 100)}% complete`);
        }

        // Continue if more ticks needed
        if (tickCount < totalTicks) {
          requestAnimationFrame(runTickBatch);
        } else {
          // Done with warm start - restart with faster decay to settle quickly
          sim.alpha(0.3).alphaDecay(0.1).restart();
          console.log('[GraphController] Warm start complete');

          // Update loading screen
          if (window.LoadingScreen) {
            window.LoadingScreen.update('Applying rotational alignment...', 90, 'Optimizing node orientations');
          }

          // Apply rotational alignment to GFA nodes for cleaner layout
          console.log('[GraphController] Applying rotational alignment for cleaner layout');
          this.layoutManager.applyRotationalAlignment();

          // Split long nodes into chains for natural curving (GFA only)
          if (this.model.format === 'gfa') {
            console.log('[GraphController] Splitting long nodes into chains for natural curving');

            // Update loading screen for segmentation
            if (window.LoadingScreen) {
              window.LoadingScreen.update('Segmenting long nodes...', 95, 'Creating chain segments for smooth curves');
            }

            this.model.splitLongNodesIntoChains(50000, 5, 'system');

            // Restart simulation with the new chain structure
            this.layoutManager.start(
              this.model._nodes,
              this.model._links,
              this.view.canvas.width,
              this.view.canvas.height
            );
          }

          // Perform final redraw to settle the layout
          console.log('[GraphController] Performing final redraw for optimal settling');

          if (window.LoadingScreen) {
            window.LoadingScreen.update('Final settling...', 96, 'Optimizing final layout');
          }

          // Restart the simulation for final settling
          if (this.layoutManager.simulation) {
            this.layoutManager.simulation.alpha(0.5).restart();
          }

          // Monitor simulation settling and zoom when done
          this._monitorFinalSettling();
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

    // Only pin nodes AFTER warm start has completed
    // Before warm start, let them move freely with the simulation
    if (!this._firstNodeClickAfterLoad) {
      const node = this.model.getNode(nodeId);
      if (node) {
        node.fx = node.x;
        node.fy = node.y;
      }
    }

    // Wake up simulation on interaction
    this._wakeSimulation();

    this.emit('nodeDragStarted', { nodeId });
  }

  _onNodeDrag(nodeId, x, y) {
    if (!this._dragState || this._dragState.nodeId !== nodeId) {
      return;
    }

    // Update model position
    this.model.updateNodePosition(nodeId, x, y, 'drag');

    // Only update fixed position AFTER warm start
    if (!this._firstNodeClickAfterLoad) {
      const node = this.model.getNode(nodeId);
      if (node) {
        node.fx = x;
        node.fy = y;
      }

      // Keep simulation awake during drag
      if (this.layoutManager.simulation && this.layoutManager.simulation.alpha() < 0.1) {
        this.layoutManager.simulation.alphaTarget(0.3);
      }
    }
  }

  _onNodeDragEnd(nodeId) {
    if (!this._dragState) {
      return;
    }

    // Only keep nodes pinned AFTER warm start has completed
    // Before warm start, let simulation continue to move them
    if (!this._firstNodeClickAfterLoad) {
      const node = this.model.getNode(nodeId);
      if (node) {
        // Keep fx/fy set to maintain the dragged position
        node.fx = node.x;
        node.fy = node.y;
      }

      // Clear alpha target to let simulation cool down
      if (this.layoutManager.simulation) {
        this.layoutManager.simulation.alphaTarget(0);
      }
    }

    // Schedule auto-stop 2 seconds after interaction ends
    this._scheduleAutoStop(2000);

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

  // ===== SIMULATION LIFECYCLE MANAGEMENT =====

  /**
   * Wake up simulation on user interaction
   */
  _wakeSimulation() {
    // Clear any pending auto-stop
    if (this._autoStopTimer) {
      clearTimeout(this._autoStopTimer);
      this._autoStopTimer = null;
    }

    // Restart simulation if it's stopped
    if (this.layoutManager.simulation) {
      const currentAlpha = this.layoutManager.simulation.alpha();
      if (currentAlpha < 0.01) {
        console.log('[GraphController] Waking simulation due to user interaction');
        this.layoutManager.simulation.alpha(0.3).restart();
      } else {
        // Just boost if already running
        this.layoutManager.boostSimulation(0.3);
      }
    }
  }

  /**
   * Schedule simulation to auto-stop after delay
   */
  _scheduleAutoStop(delay) {
    // Clear any existing timer
    if (this._autoStopTimer) {
      clearTimeout(this._autoStopTimer);
    }

    // Schedule new auto-stop
    this._autoStopTimer = setTimeout(() => {
      if (this.layoutManager.simulation) {
        console.log(`[GraphController] Auto-stopping simulation after ${delay}ms idle`);
        this.layoutManager.simulation.stop();
        this.layoutManager.isRunning = false;
      }
      this._autoStopTimer = null;
    }, delay);
  }

  /**
   * Monitor final settling after redraw and zoom when complete
   */
  _monitorFinalSettling() {
    if (!this.layoutManager.simulation) return;

    let checkCount = 0;
    const maxChecks = 100; // Maximum 10 seconds (100 * 100ms)
    const checkInterval = 100; // Check every 100ms

    const checkSettling = () => {
      if (!this.layoutManager.simulation) {
        // Simulation stopped, proceed to finalize
        this._finalizeGraphDisplay();
        return;
      }

      const alpha = this.layoutManager.simulation.alpha();
      checkCount++;

      // Update progress (96-99% during settling)
      const progress = 96 + Math.min(3, Math.floor((checkCount / maxChecks) * 3));
      if (window.LoadingScreen && checkCount % 5 === 0) {
        window.LoadingScreen.update('Final settling...', progress, `Settling... (alpha: ${alpha.toFixed(3)})`);
      }

      // Check if settled (alpha very low) or timeout
      if (alpha < 0.01 || checkCount >= maxChecks) {
        console.log(`[GraphController] Final settling complete - alpha: ${alpha.toFixed(3)}, checks: ${checkCount}`);

        // Stop the simulation
        this.layoutManager.simulation.stop();
        this.layoutManager.isRunning = false;

        // Proceed to finalize
        this._finalizeGraphDisplay();
      } else {
        // Continue monitoring
        setTimeout(checkSettling, checkInterval);
      }
    };

    // Start monitoring
    setTimeout(checkSettling, checkInterval);
  }

  /**
   * Finalize graph display - zoom to fit and hide loading screen
   */
  _finalizeGraphDisplay() {
    console.log('[GraphController] Finalizing graph display');

    if (window.LoadingScreen) {
      window.LoadingScreen.update('Finalizing...', 100, 'Graph ready!');
    }

    // Zoom to fit all nodes in view - use larger padding for more zoom out
    console.log('[GraphController] Zooming to fit all nodes');
    this.view.zoomToFit(150); // Increased padding for more zoom out

    // Hide loading screen after zoom completes
    setTimeout(() => {
      if (window.LoadingScreen) {
        window.LoadingScreen.hide();
      }
    }, 1000); // Wait for zoom animation to complete (750ms + margin)
  }

  // ===== PUBLIC API (called by UI/main.js) =====

  /**
   * Load a graph from parsed data
   */
  loadGraph(nodes, links, format) {
    this.model.loadGraph(nodes, links, format);

    // Reset first click flag on new graph load
    this._firstNodeClickAfterLoad = true;

    // Disable alignment forces (will be re-enabled after warm start)
    this.layoutManager.disableAlignmentForces();

    // Start layout simulation
    const center = this.view.getCanvasCenter();
    this.layoutManager.start(
      this.model.nodes,
      this.model.links,
      this.view.canvas.width,
      this.view.canvas.height
    );

    // Update loading screen
    if (window.LoadingScreen) {
      window.LoadingScreen.update('Starting simulation...', 70, 'Warming up layout engine');
    }

    // Automatically trigger warm start by simulating a node drag internally
    // Wait 1 second, drag for 1ms, then trigger warm start
    if (this.model.nodes.length > 0) {
      setTimeout(() => {
        const firstNode = this.model.nodes[0];
        const firstNodeId = firstNode.id;

        // Start drag
        this._onNodeDragStart(firstNodeId, firstNode.x, firstNode.y);

        // End drag after 1ms and trigger warm start
        setTimeout(() => {
          this._onNodeDragEnd(firstNodeId);
          // Trigger warm start after drag
          this._onNodeClick(firstNodeId);
        }, 1);
      }, 1000);
    }
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

  /**
   * Toggle component bounds visualization
   */
  toggleComponentBounds() {
    return this.model.toggleComponentBounds();
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
    // Clear auto-stop timer
    if (this._autoStopTimer) {
      clearTimeout(this._autoStopTimer);
      this._autoStopTimer = null;
    }

    this.layoutManager.destroy();
    this.view.destroy();
    this.model.removeAllListeners();
    this.removeAllListeners();
  }
}
