// VertexResolution.js - Logical vertex resolution operation

import { Operation } from './Operation.js';

/**
 * VertexResolution operation splits a vertex into multiple vertices
 * based on logical path combinations (incoming × outgoing edges).
 *
 * This preserves the exact logic from the legacy implementation.
 */
export class VertexResolution extends Operation {
  constructor(graph, vertexId, selectedCombinations) {
    super('VertexResolution', `Resolve vertex ${vertexId} logically`);

    this.graph = graph;
    this.vertexId = vertexId;
    this.selectedCombinations = selectedCombinations;

    // Operation results
    this.vertex = null;
    this.newNodes = [];
    this.newLinks = [];
    this.connections = null;
  }

  /**
   * Validate if operation can be executed
   */
  validate() {
    // Use getNodeOrChainOriginal to support both regular nodes and chains
    const vertex = this.graph.getNodeOrChainOriginal(this.vertexId);
    if (!vertex) {
      throw new Error(`Vertex ${this.vertexId} not found (neither as node nor chain)`);
    }

    if (!this.selectedCombinations || this.selectedCombinations.length === 0) {
      throw new Error('No path combinations selected');
    }

    return true;
  }

  /**
   * Execute the vertex resolution operation
   */
  execute() {
    this.validate();

    // Save state before execution
    this.saveBeforeState({
      nodes: this.graph.getNodes().map(n => this.cloneObject(n)),
      edges: this.graph.getEdges().map(e => this.cloneObject(e))
    });

    // Get vertex (works for both regular nodes and chains)
    this.vertex = this.graph.getNodeOrChainOriginal(this.vertexId);
    console.log(`[VertexResolution] Retrieved vertex/chain:`, this.vertex);

    // Get connections
    this.connections = this.getVertexConnections(this.vertexId);

    console.log(`[VertexResolution] Resolving vertex ${this.vertexId} into ${this.selectedCombinations.length} copies`);

    // Create new nodes
    this.newNodes = this.createNewNodes();

    // MATCH LEGACY: Directly manipulate model's internal arrays to preserve D3 references
    const model = this.graph.getModel();

    // Check if this is a chain - if so, remove all segments instead of the original vertex
    const chainInfo = this.graph.getChainInfo(this.vertexId);
    let nodesToRemove = [];

    if (chainInfo) {
      // This is a chain - remove all segments
      nodesToRemove = chainInfo.segmentIds;
      console.log(`[VertexResolution] Removing chain segments:`, nodesToRemove);
    } else {
      // Regular node - remove just this node
      nodesToRemove = [this.vertexId];
      console.log(`[VertexResolution] Removing regular node:`, this.vertexId);
    }

    // Remove nodes (either chain segments or regular node)
    const nodesToRemoveSet = new Set(nodesToRemove.map(String));
    model._nodes = model._nodes.filter(n => !nodesToRemoveSet.has(String(n.id)));

    // Remove edges connected to removed nodes
    // CRITICAL: Use String() to ensure type-safe comparison (IDs might be numbers or strings)
    model._links = model._links.filter(link => {
      const sourceId = String((typeof link.source === 'object') ? link.source.id : link.source);
      const targetId = String((typeof link.target === 'object') ? link.target.id : link.target);
      return !nodesToRemoveSet.has(sourceId) && !nodesToRemoveSet.has(targetId);
    });

    // Add new nodes (don't clone - D3 needs to mutate these directly)
    model._nodes.push(...this.newNodes);

    // Create new edges based on selected combinations
    this.newLinks = this.createNewLinks();

    // Add new links (don't clone - D3 needs to mutate these directly)
    model._links.push(...this.newLinks);

    // Rebuild maps for the model
    model._rebuildMaps();

    // CRITICAL: Emit event to trigger simulation recreation
    // This is necessary because we directly manipulated the arrays
    model.emit('graphStructureChanged', {
      reason: 'vertexResolution',
      nodesAdded: this.newNodes.length,
      nodesRemoved: nodesToRemove.length,  // Use actual count (1 for regular node, multiple for chain)
      edgesAdded: this.newLinks.length,
      edgesRemoved: this.connections.incoming.length + this.connections.outgoing.length
    });

    // Save state after execution
    this.saveAfterState({
      nodes: this.graph.getNodes().map(n => this.cloneObject(n)),
      edges: this.graph.getEdges().map(e => this.cloneObject(e))
    });

    this.markExecuted();

    return {
      success: true,
      originalVertexId: this.vertexId,
      newVertexIds: this.newNodes.map(n => n.id),
      newVertexCount: this.newNodes.length,
      newEdgeCount: this.newLinks.length,
      resolutionType: 'logical',
      newVertices: this.newNodes
    };
  }

  /**
   * Reverse the resolution operation (undo)
   */
  reverse() {
    if (!this.beforeState) {
      throw new Error('No state to restore');
    }

    // Clear graph
    this.graph.clear();

    // Restore original nodes
    this.beforeState.nodes.forEach(node => {
      this.graph.addNode(this.cloneObject(node));
    });

    // Restore original edges
    this.beforeState.edges.forEach(edge => {
      this.graph.addEdge(this.cloneObject(edge));
    });

    this.markReversed();
  }

  /**
   * Get vertex connections (logical - incoming/outgoing)
   * EXACT COPY from main.js getVertexConnections()
   */
  getVertexConnections(vertexId) {
    const incoming = [];
    const outgoing = [];
    const links = this.graph.getEdges();
    const nodes = this.graph.getNodes();

    links.forEach((link, index) => {
      const sourceId = (typeof link.source === 'object') ? link.source.id : link.source;
      const targetId = (typeof link.target === 'object') ? link.target.id : link.target;

      if (targetId === vertexId) {
        incoming.push({
          linkIndex: index,
          link: link,
          sourceId: sourceId,
          sourceNode: (typeof link.source === 'object') ? link.source : nodes.find(n => n.id === sourceId),
          orientation: link.tgtOrientation || '+'
        });
      }
      if (sourceId === vertexId) {
        outgoing.push({
          linkIndex: index,
          link: link,
          targetId: targetId,
          targetNode: (typeof link.target === 'object') ? link.target : nodes.find(n => n.id === targetId),
          orientation: link.srcOrientation || '+'
        });
      }
    });

    console.log(`[VertexResolution] Vertex ${vertexId}: ${incoming.length} incoming, ${outgoing.length} outgoing edges`);
    return { incoming, outgoing };
  }

  /**
   * Create new nodes from selected combinations
   * Chain-aware: creates chain segments for long nodes during resolution
   */
  createNewNodes() {
    const allSegments = [];
    const allInternalLinks = [];
    const nodeMapping = new Map(); // Maps logical node ID to first/last segment IDs
    const selectedCombos = this.selectedCombinations;
    const vertex = this.vertex;

    selectedCombos.forEach((combo, index) => {
      const newNodeId = selectedCombos.length === 1 ? vertex.id : `${vertex.id}_${index + 1}`;
      const newNode = {
        ...vertex,
        id: newNodeId,
        originalId: vertex.id,
        pathDescription: combo.description,
        resolutionType: 'logical',
        x: vertex.x,
        y: vertex.y,
        vx: 0,
        vy: 0,
        // CRITICAL: Explicitly set fx/fy to null to prevent D3 from treating as pinned
        fx: null,
        fy: null
      };

      // Position nodes in circle if multiple
      if (selectedCombos.length > 1) {
        const angleOffset = (index * 2 * Math.PI) / selectedCombos.length;
        const radius = 60;
        newNode.x = vertex.x + radius * Math.cos(angleOffset);
        newNode.y = vertex.y + radius * Math.sin(angleOffset);
      }

      // Check if this node needs to be split into a chain (GFA only with long nodes)
      const chainData = this.graph.createChainSegmentsIfNeeded(newNode, 50000, 5);

      if (chainData.needsSplit) {
        // Node was split - add all segments and internal links
        console.log(`[VertexResolution] Node ${newNodeId} split into ${chainData.segments.length} segments`);
        allSegments.push(...chainData.segments);
        allInternalLinks.push(...chainData.internalLinks);

        // Store mapping for link creation (connect to first/last segments)
        nodeMapping.set(newNodeId, {
          firstSegmentId: chainData.segments[0].id,
          lastSegmentId: chainData.segments[chainData.segments.length - 1].id
        });
      } else {
        // Regular node - just add it
        allSegments.push(newNode);
        nodeMapping.set(newNodeId, {
          firstSegmentId: newNodeId,
          lastSegmentId: newNodeId
        });
      }
    });

    // Store for use in createNewLinks()
    this.nodeMapping = nodeMapping;
    this.internalChainLinks = allInternalLinks;

    return allSegments;
  }

  /**
   * Create new links from selected combinations
   * Chain-aware: connects to first/last segments for chains
   */
  createNewLinks() {
    const newLinks = [];
    const selectedCombos = this.selectedCombinations;
    const vertex = this.vertex;

    selectedCombos.forEach((combo, index) => {
      const newNodeId = selectedCombos.length === 1 ? vertex.id : `${vertex.id}_${index + 1}`;
      const mapping = this.nodeMapping.get(newNodeId);

      if (!mapping) {
        console.error(`[VertexResolution] No mapping found for node ${newNodeId}`);
        return;
      }

      // Validate external node references
      if (combo.incoming) {
        const externalNode = this.graph.getNode(combo.incoming.sourceId);
        if (!externalNode) {
          console.warn(`[VertexResolution] WARNING: External incoming node ${combo.incoming.sourceId} not found!`);
        }
      }
      if (combo.outgoing) {
        const externalNode = this.graph.getNode(combo.outgoing.targetId);
        if (!externalNode) {
          console.warn(`[VertexResolution] WARNING: External outgoing node ${combo.outgoing.targetId} not found!`);
        }
      }

      // Incoming edges connect to the FIRST segment
      if (combo.incoming) {
        newLinks.push({
          ...combo.incoming.link,
          target: mapping.firstSegmentId,
          source: combo.incoming.sourceId
        });
      }

      // Outgoing edges connect from the LAST segment
      if (combo.outgoing) {
        newLinks.push({
          ...combo.outgoing.link,
          source: mapping.lastSegmentId,
          target: combo.outgoing.targetId
        });
      }
    });

    // Add internal chain links
    newLinks.push(...this.internalChainLinks);

    return newLinks;
  }

  /**
   * Generate all possible path combinations for a vertex
   * EXACT COPY from main.js generatePathCombinations()
   */
  static generatePathCombinations(incoming, outgoing) {
    const combinations = [];

    if (incoming.length === 0) {
      outgoing.forEach(out => {
        combinations.push({
          incoming: null,
          outgoing: out,
          id: `start_${out.targetId}`,
          description: `Start → ${out.targetId}`
        });
      });
    } else if (outgoing.length === 0) {
      incoming.forEach(inc => {
        combinations.push({
          incoming: inc,
          outgoing: null,
          id: `${inc.sourceId}_end`,
          description: `${inc.sourceId} → End`
        });
      });
    } else {
      incoming.forEach(inc => {
        outgoing.forEach(out => {
          combinations.push({
            incoming: inc,
            outgoing: out,
            id: `${inc.sourceId}_${out.targetId}`,
            description: `${inc.sourceId} → ${out.targetId}`
          });
        });
      });
    }

    console.log(`[VertexResolution] Generated ${combinations.length} path combinations`);
    return combinations;
  }

  /**
   * Get operation summary
   */
  getSummary() {
    return {
      ...super.getSummary(),
      originalVertexId: this.vertexId,
      newVertexIds: this.newNodes.map(n => n.id),
      newVertexCount: this.newNodes.length,
      resolutionType: 'logical'
    };
  }

  /**
   * Deep clone a plain object
   */
  cloneObject(obj) {
    if (!obj) return obj;
    return JSON.parse(JSON.stringify(obj));
  }
}
