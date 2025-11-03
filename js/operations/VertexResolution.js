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
    const vertex = this.graph.getNode(this.vertexId);
    if (!vertex) {
      throw new Error(`Vertex ${this.vertexId} not found`);
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

    // Get vertex
    this.vertex = this.graph.getNode(this.vertexId);

    // Get connections
    this.connections = this.getVertexConnections(this.vertexId);

    console.log(`[VertexResolution] Resolving vertex ${this.vertexId} into ${this.selectedCombinations.length} copies`);

    // Create new nodes
    this.newNodes = this.createNewNodes();

    // MATCH LEGACY: Directly manipulate model's internal arrays to preserve D3 references
    // Remove original vertex
    const model = this.graph.getModel();
    model._nodes = model._nodes.filter(n => n.id !== this.vertexId);

    // Remove edges connected to original vertex
    // CRITICAL: Use String() to ensure type-safe comparison (IDs might be numbers or strings)
    const vertexIdStr = String(this.vertexId);
    model._links = model._links.filter(link => {
      const sourceId = String((typeof link.source === 'object') ? link.source.id : link.source);
      const targetId = String((typeof link.target === 'object') ? link.target.id : link.target);
      return sourceId !== vertexIdStr && targetId !== vertexIdStr;
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
      nodesRemoved: 1,
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
   * EXACT COPY from main.js performVertexResolution()
   */
  createNewNodes() {
    const newNodes = [];
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

      newNodes.push(newNode);
    });

    return newNodes;
  }

  /**
   * Create new links from selected combinations
   * EXACT COPY from main.js performVertexResolution()
   */
  createNewLinks() {
    const newLinks = [];
    const selectedCombos = this.selectedCombinations;
    const vertex = this.vertex;

    selectedCombos.forEach((combo, index) => {
      const newNodeId = selectedCombos.length === 1 ? vertex.id : `${vertex.id}_${index + 1}`;

      if (combo.incoming) {
        newLinks.push({
          ...combo.incoming.link,
          target: newNodeId,
          source: combo.incoming.sourceId
        });
      }

      if (combo.outgoing) {
        newLinks.push({
          ...combo.outgoing.link,
          source: newNodeId,
          target: combo.outgoing.targetId
        });
      }
    });

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
