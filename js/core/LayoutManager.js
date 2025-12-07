// LayoutManager.js - Force-directed layout with dampening and cycle prevention

import { EventEmitter } from './EventEmitter.js';

/**
 * LayoutManager handles automated graph layout using D3 force simulation.
 * Includes dampening to prevent oscillation and cycle guards.
 *
 * Events emitted:
 * - layoutTick: {alpha}
 * - layoutEnd: {}
 */
export class LayoutManager extends EventEmitter {
  constructor(model) {
    super();

    this.model = model;
    this.simulation = null;
    this.isRunning = false;

    // Dampening configuration
    this.dampeningEnabled = true;
    this.dampeningThreshold = 0.5; // Minimum position change to emit update (pixels)
    this.layoutSourceTag = 'layout'; // Tag for events emitted by layout

    // Track last positions to calculate deltas
    this._lastPositions = new Map();

    // Render throttling
    this._renderPending = false;

    // Subscribe to model events that should trigger layout updates
    this._setupModelListeners();
  }

  // ===== SETUP =====

  _setupModelListeners() {
    // When graph is loaded, restart simulation
    this.model.on('graphLoaded', ({ nodes, links, source }) => {
      if (source !== this.layoutSourceTag) {
        // Use actual arrays from model, not event copies
        this.start(this.model._nodes, this.model._links);
      }
    });

    // When nodes are added, restart simulation
    this.model.on('nodeAdded', () => {
      if (this.isRunning) {
        this.restart();
      }
    });

    // When nodes are removed, restart simulation
    this.model.on('nodeRemoved', () => {
      if (this.isRunning) {
        this.restart();
      }
    });

    // When a node is dragged, update simulation
    this.model.on('nodeMoved', ({ nodeId, x, y, source }) => {
      // Ignore events from layout itself to prevent cycles
      if (source === this.layoutSourceTag) {
        return;
      }

      // If user is dragging, boost simulation
      if (source === 'user' || source === 'drag') {
        this.boostSimulation();
      }
    });

    // When a node is pinned, update simulation
    this.model.on('nodePinned', ({ nodeId, pinned }) => {
      if (this.isRunning) {
        const node = this.model.getNode(nodeId);
        if (node && this.simulation) {
          if (pinned) {
            node.fx = node.x;
            node.fy = node.y;
          } else {
            node.fx = null;
            node.fy = null;
          }
          this.simulation.alpha(0.1).restart();
        }
      }
    });

    // When nodes are merged, update simulation data
    this.model.on('nodesMerged', () => {
      console.log('[LayoutManager] nodesMerged event received! isRunning:', this.isRunning);
      if (this.simulation) {
        console.log('[LayoutManager] Updating simulation data...');
        this.updateSimulationData();
      } else {
        console.warn('[LayoutManager] nodesMerged received but no simulation exists');
      }
    });

    // When graph structure changes (vertex resolution, etc.), update simulation data
    this.model.on('graphStructureChanged', ({ reason, nodesAdded, nodesRemoved, edgesAdded, edgesRemoved }) => {
      console.log(`[LayoutManager] graphStructureChanged event received (${reason})! isRunning:`, this.isRunning);
      console.log(`  Nodes: +${nodesAdded} -${nodesRemoved}, Edges: +${edgesAdded} -${edgesRemoved}`);
      if (this.simulation) {
        console.log('[LayoutManager] Updating simulation data...');
        this.updateSimulationData();
      } else {
        console.warn(`[LayoutManager] graphStructureChanged (${reason}) received but no simulation exists`);
      }
    });

    console.log('[LayoutManager] Event listeners registered, including nodesMerged and graphStructureChanged');
  }

  // ===== SIMULATION CONTROL =====

  /**
   * Start simulation with nodes and links
   */
  start(nodes, links, canvasWidth = 800, canvasHeight = 600) {
    console.log(`🔧 [LayoutManager] start() called with ${nodes.length} nodes and ${links.length} links`);

    // DIAGNOSTIC: Check if we're receiving the actual arrays or copies
    console.log('[LayoutManager] Are we using actual model arrays?',
      nodes === this.model._nodes ? '✅ YES (nodes)' : '❌ NO (nodes)',
      links === this.model._links ? '✅ YES (links)' : '❌ NO (links)');

    if (this.simulation) {
      this.stop();
    }

    this.isRunning = true;
    this._lastPositions.clear();

    // Create D3 force simulation (matching existing behavior)
    this.simulation = d3.forceSimulation(nodes)
      .force('charge', d3.forceManyBody().strength(d => {
        // Reduce charge for chain segments to prevent excessive repulsion
        return d.isChainSegment ? -30 : -80;
      }))
      .force('link', d3.forceLink(links)
        .id(d => d.id)
        .distance(link => {
          // Internal chain links: distance based on segment length
          if (link.isInternalChainLink) {
            const sourceNode = typeof link.source === 'object' ? link.source : nodes.find(n => n.id === link.source);
            if (sourceNode && sourceNode.length) {
              // Reduced scaling for more subtle length variation
              // 0.0015 pixels per bp = 1500 pixels per megabase
              const scaleFactor = 0.0015;
              return Math.max(5, sourceNode.length * scaleFactor);
            }
            return 10;
          }
          // External links: much shorter distance for compact layout
          return 20;
        })
        .strength(link => {
          // Internal chain links: very strong (keep chain together)
          if (link.isInternalChainLink) return 2.0;
          // External links: normal strength
          return 1.0;
        }))
      .force('center', d3.forceCenter(canvasWidth / 2, canvasHeight / 2))
      .on('tick', () => this._onTick())
      .on('end', () => this._onEnd());

    console.log('[LayoutManager] ✅ Simulation started');
    return this.simulation;
  }

  /**
   * Stop simulation
   */
  stop() {
    if (this.simulation) {
      this.simulation.stop();
      this.isRunning = false;
    }
  }

  /**
   * Restart simulation with current nodes
   */
  restart() {
    if (this.simulation) {
      this.simulation.alpha(1).restart();
    }
  }

  /**
   * Update simulation data (nodes and links) after graph structure changes
   * For node merging, we MUST completely recreate the simulation (like old implementation)
   * because D3 needs to reinitialize all internal state for the new node structure
   */
  updateSimulationData() {
    if (!this.simulation) {
      console.warn('[LayoutManager] Cannot update simulation data - no simulation exists');
      return;
    }

    console.log('🔧 [LayoutManager] Graph structure changed - completely recreating simulation');

    // Get current canvas center from the old simulation
    const oldCenter = this.simulation.force('center');
    const centerX = oldCenter ? oldCenter.x() : 400;
    const centerY = oldCenter ? oldCenter.y() : 300;

    // CRITICAL: Must use the ACTUAL arrays, not copies, so D3 can mutate them
    const nodes = this.model._nodes;
    const links = this.model._links;

    console.log(`[LayoutManager] Recreating simulation with ${nodes.length} nodes and ${links.length} links`);

    // Stop old simulation
    this.simulation.stop();

    // Completely recreate simulation (matching old implementation's startSimulation())
    this.simulation = d3.forceSimulation(nodes)
      .force('charge', d3.forceManyBody().strength(d => {
        // Reduce charge for chain segments to prevent excessive repulsion
        return d.isChainSegment ? -30 : -80;
      }))
      .force('link', d3.forceLink(links)
        .id(d => d.id)
        .distance(link => {
          // Internal chain links: distance based on segment length
          if (link.isInternalChainLink) {
            const sourceNode = typeof link.source === 'object' ? link.source : nodes.find(n => n.id === link.source);
            if (sourceNode && sourceNode.length) {
              // Reduced scaling for more subtle length variation
              // 0.0015 pixels per bp = 1500 pixels per megabase
              const scaleFactor = 0.0015;
              return Math.max(5, sourceNode.length * scaleFactor);
            }
            return 10;
          }
          // External links: much shorter distance for compact layout
          return 20;
        })
        .strength(link => {
          // Internal chain links: very strong (keep chain together)
          if (link.isInternalChainLink) return 2.0;
          // External links: normal strength
          return 1.0;
        }))
      .force('center', d3.forceCenter(centerX, centerY))
      .on('tick', () => this._onTick())
      .on('end', () => this._onEnd());

    this.isRunning = true;

    console.log('[LayoutManager] ✅ Simulation completely recreated with fresh D3 state');
  }

  /**
   * Boost simulation (e.g., during drag)
   */
  boostSimulation(alpha = 0.3) {
    if (this.simulation) {
      this.simulation.alphaTarget(alpha).restart();
    }
  }

  /**
   * Cool down simulation (e.g., after drag ends)
   */
  coolSimulation() {
    if (this.simulation) {
      this.simulation.alphaTarget(0);
    }
  }

  /**
   * Update center force (e.g., on canvas resize)
   */
  updateCenter(width, height) {
    if (this.simulation) {
      this.simulation.force('center', d3.forceCenter(width / 2, height / 2));
    }
  }

  // ===== SIMULATION CALLBACKS =====

  _onTick() {
    // Always update all nodes directly (for smooth animation)
    this.simulation.nodes().forEach(node => {
      // Update node positions directly in the model's array (no events)
      const modelNode = this.model.getNode(node.id);
      if (modelNode) {
        modelNode.x = node.x;
        modelNode.y = node.y;
      }
    });

    // Emit batch event for view to render (throttled by requestAnimationFrame)
    if (!this._renderPending) {
      this._renderPending = true;
      requestAnimationFrame(() => {
        this._renderPending = false;
        this.model.emit('nodesMovedBatch', { source: this.layoutSourceTag });
      });
    }

    this.emit('layoutTick', { alpha: this.simulation.alpha() });
  }

  _onEnd() {
    // Final position update
    this._updateAllNodePositions();

    this.emit('layoutEnd', {});
    this.isRunning = false;
  }

  /**
   * Update all node positions in model (used for non-dampened updates)
   */
  _updateAllNodePositions() {
    if (!this.simulation) return;

    const updates = this.simulation.nodes().map(node => ({
      nodeId: node.id,
      x: node.x,
      y: node.y
    }));

    if (updates.length > 0) {
      this.model.updateNodePositions(updates, this.layoutSourceTag);
    }
  }

  // ===== ALIGNMENT FORCES =====

  /**
   * Apply optimal rotation alignment to GFA nodes after warm start
   * This rotates nodes to align with their edge flow directions
   */
  applyRotationalAlignment() {
    if (!this.simulation) return;

    console.log('[LayoutManager] Applying rotational alignment to GFA nodes');

    const nodes = this.simulation.nodes();
    const links = this.model._links;
    const format = this.model._format;

    // Only apply to GFA format
    if (format !== 'gfa') {
      console.log('[LayoutManager] Skipping rotational alignment - not GFA format');
      return;
    }

    let alignedCount = 0;

    nodes.forEach(node => {
      // Find all edges connected to this node
      const connectedEdges = links.filter(link => {
        const sourceId = link.source?.id || link.source;
        const targetId = link.target?.id || link.target;
        return sourceId === node.id || targetId === node.id;
      });

      if (connectedEdges.length < 2) return; // Need at least 2 edges to determine orientation

      // Calculate angles to all connected nodes
      const angles = [];

      connectedEdges.forEach(link => {
        const sourceId = link.source?.id || link.source;
        const targetId = link.target?.id || link.target;

        // Find the other node
        let otherNode;
        if (sourceId === node.id) {
          otherNode = nodes.find(n => n.id === targetId);
        } else {
          otherNode = nodes.find(n => n.id === sourceId);
        }

        if (otherNode) {
          const dx = otherNode.x - node.x;
          const dy = otherNode.y - node.y;
          const angle = Math.atan2(dy, dx);
          angles.push(angle);
        }
      });

      if (angles.length < 2) return;

      // Separate edges by direction (incoming vs outgoing) based on GFA semantics
      const incomingAngles = [];
      const outgoingAngles = [];

      connectedEdges.forEach(link => {
        const sourceId = link.source?.id || link.source;
        const targetId = link.target?.id || link.target;
        const srcOri = link.srcOrientation || '+';
        const tgtOri = link.tgtOrientation || '+';

        let otherNode;
        let isIncoming = false;

        if (sourceId === node.id) {
          // This node is source
          otherNode = nodes.find(n => n.id === targetId);
          // If source orientation is +, edge goes out from outgoing end
          // If source orientation is -, edge goes out from incoming end
          isIncoming = (srcOri === '-');
        } else {
          // This node is target
          otherNode = nodes.find(n => n.id === sourceId);
          // If target orientation is +, edge comes in to incoming end
          // If target orientation is -, edge comes in to outgoing end
          isIncoming = (tgtOri === '+');
        }

        if (otherNode) {
          const dx = otherNode.x - node.x;
          const dy = otherNode.y - node.y;
          const angle = Math.atan2(dy, dx);

          if (isIncoming) {
            incomingAngles.push(angle);
          } else {
            outgoingAngles.push(angle);
          }
        }
      });

      // Calculate optimal orientation respecting flow direction
      const optimalAngle = this._calculateOptimalNodeOrientation(angles, incomingAngles, outgoingAngles);

      // Store the calculated angle on the node for the renderer to use
      node.calculatedAngle = optimalAngle;
      alignedCount++;
    });

    console.log(`[LayoutManager] Aligned ${alignedCount} nodes`);
  }

  /**
   * Calculate optimal orientation angle for a node based on its edge angles
   * Respects GFA flow direction (incoming edges to back, outgoing to front)
   */
  _calculateOptimalNodeOrientation(angles, incomingAngles, outgoingAngles) {
    if (angles.length === 0) return 0;
    if (angles.length === 1) return angles[0];

    // If we have clear incoming/outgoing separation, use flow direction
    if (incomingAngles.length > 0 && outgoingAngles.length > 0) {
      // Calculate average direction of outgoing edges
      let sumX = 0, sumY = 0;
      outgoingAngles.forEach(angle => {
        sumX += Math.cos(angle);
        sumY += Math.sin(angle);
      });

      // Node should point toward outgoing edges (arrow points out)
      const outgoingDirection = Math.atan2(sumY, sumX);

      // Test this direction and its opposite, pick the one that aligns better
      const candidate1 = outgoingDirection;
      const candidate2 = outgoingDirection + Math.PI;

      const score1 = this._scoreOrientationDirected(candidate1, incomingAngles, outgoingAngles);
      const score2 = this._scoreOrientationDirected(candidate2, incomingAngles, outgoingAngles);

      return score1 <= score2 ? candidate1 : candidate2;
    }

    // Fallback: No clear flow direction, just minimize criss-crossing
    let bestAngle = 0;
    let bestScore = Infinity;

    const numCandidates = 18;
    for (let i = 0; i < numCandidates; i++) {
      const candidateAngle = (i * Math.PI) / numCandidates;
      const score = this._scoreOrientation(candidateAngle, angles);

      if (score < bestScore) {
        bestScore = score;
        bestAngle = candidateAngle;
      }
    }

    return bestAngle;
  }

  /**
   * Score orientation considering flow direction
   * Incoming edges should connect to back (180°), outgoing to front (0°)
   */
  _scoreOrientationDirected(nodeAngle, incomingAngles, outgoingAngles) {
    let totalDeviation = 0;

    // Incoming edges should connect to the back (-180° relative to node)
    incomingAngles.forEach(edgeAngle => {
      let relativeAngle = edgeAngle - nodeAngle;
      while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
      while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;

      // Ideal is 180° (back of node)
      const distToBack = Math.abs(Math.abs(relativeAngle) - Math.PI);
      totalDeviation += distToBack * distToBack;
    });

    // Outgoing edges should connect to the front (0° relative to node)
    outgoingAngles.forEach(edgeAngle => {
      let relativeAngle = edgeAngle - nodeAngle;
      while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
      while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;

      // Ideal is 0° (front of node)
      const distToFront = Math.abs(relativeAngle);
      totalDeviation += distToFront * distToFront;
    });

    return totalDeviation;
  }

  /**
   * Score how well a node orientation aligns with its edge angles
   * Lower score = better alignment (edges connect at opposite ends, not sides)
   */
  _scoreOrientation(nodeAngle, edgeAngles) {
    // For a node oriented at 'nodeAngle', edges should ideally connect at 0° or 180°
    // Calculate how much each edge deviates from these ideal connection points

    let totalDeviation = 0;

    edgeAngles.forEach(edgeAngle => {
      // Calculate relative angle of edge to node orientation
      let relativeAngle = edgeAngle - nodeAngle;

      // Normalize to [-π, π]
      while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
      while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;

      // Ideal connection points are at 0° (front) or 180° (back)
      // Calculate distance to nearest ideal point
      const distToFront = Math.abs(relativeAngle);
      const distToBack = Math.abs(Math.abs(relativeAngle) - Math.PI);
      const minDist = Math.min(distToFront, distToBack);

      // Accumulate squared deviation (penalize perpendicular connections heavily)
      totalDeviation += minDist * minDist;
    });

    return totalDeviation;
  }

  /**
   * Disable alignment forces (kept for compatibility)
   */
  disableAlignmentForces() {
    // No-op now, kept for compatibility
  }

  // ===== CONFIGURATION =====

  /**
   * Enable/disable dampening
   */
  setDampening(enabled) {
    this.dampeningEnabled = enabled;
  }

  /**
   * Set dampening threshold
   */
  setDampeningThreshold(threshold) {
    this.dampeningThreshold = threshold;
  }

  /**
   * Update force strengths
   */
  setForceStrengths({ charge, linkDistance, linkStrength } = {}) {
    if (!this.simulation) return;

    if (charge !== undefined) {
      this.simulation.force('charge', d3.forceManyBody().strength(charge));
    }

    if (linkDistance !== undefined || linkStrength !== undefined) {
      const linkForce = this.simulation.force('link');
      if (linkDistance !== undefined) {
        linkForce.distance(linkDistance);
      }
      if (linkStrength !== undefined) {
        linkForce.strength(linkStrength);
      }
    }

    this.simulation.alpha(0.3).restart();
  }

  // ===== CLEANUP =====

  /**
   * Clean up simulation and listeners
   */
  destroy() {
    this.stop();
    this.removeAllListeners();
    this._lastPositions.clear();
  }
}
