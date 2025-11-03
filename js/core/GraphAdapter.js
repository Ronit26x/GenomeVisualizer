// GraphAdapter.js - Adapter to make GraphModel compatible with Graph class interface
// This bridges the gap between the legacy plain-array interface and the new Graph class interface

/**
 * GraphAdapter wraps GraphModel to provide a Graph-like interface for operations.
 * This allows us to use the new operation classes without fully refactoring GraphModel.
 */
export class GraphAdapter {
  constructor(model) {
    this.model = model;
  }

  /**
   * Get all nodes (returns array of plain objects, not Node instances)
   */
  getNodes() {
    return this.model.nodes; // Already returns a copy
  }

  /**
   * Get all edges (returns array of plain link objects)
   */
  getEdges() {
    return this.model.links; // Already returns a copy
  }

  /**
   * Get a single node by ID
   */
  getNode(nodeId) {
    return this.model.getNode(nodeId);
  }

  /**
   * Get a single edge/link by index
   */
  getEdge(sourceId, targetId) {
    // GraphModel doesn't have this, so we search through links
    const links = this.model.links;
    return links.find(link => {
      const linkSourceId = String(link.source?.id || link.source);
      const linkTargetId = String(link.target?.id || link.target);
      return linkSourceId === String(sourceId) && linkTargetId === String(targetId);
    }) || null;
  }

  /**
   * Add a node to the graph
   */
  addNode(node, source = 'operation') {
    this.model.addNode(node, source);
  }

  /**
   * Remove a node from the graph
   */
  removeNode(nodeId, source = 'operation') {
    this.model.removeNodes([nodeId], source);
  }

  /**
   * Add an edge/link to the graph
   */
  addEdge(edge, source = 'operation') {
    // GraphModel works with plain link objects, not Edge instances
    // So we need to convert Edge to plain object
    const linkObj = {
      source: edge.source?.id || edge.source,
      target: edge.target?.id || edge.target
    };

    // Copy over all properties from edge (excluding source/target which we already set)
    Object.keys(edge).forEach(key => {
      if (key !== 'source' && key !== 'target' && key !== 'data') {
        linkObj[key] = edge[key];
      }
    });

    // Copy any properties from edge.data
    if (edge.data) {
      Object.assign(linkObj, edge.data);
    }

    // Add to model's internal links array
    this.model._links.push(linkObj);
    this.model._rebuildMaps();
  }

  /**
   * Merge multiple nodes into a single node (atomic operation)
   * This properly handles edge reconnection
   */
  mergeNodes(nodeIdsToMerge, mergedNode, newEdges, source = 'operation') {
    this.model.mergeNodes(nodeIdsToMerge, mergedNode, newEdges, source);
  }

  /**
   * Remove an edge/link from the graph
   */
  removeEdge(sourceId, targetId, source = 'operation') {
    // GraphModel doesn't have a removeEdge method, so we manually filter
    const links = this.model._links;
    this.model._links = links.filter(link => {
      const linkSourceId = String(link.source?.id || link.source);
      const linkTargetId = String(link.target?.id || link.target);
      return !(linkSourceId === String(sourceId) && linkTargetId === String(targetId));
    });
    this.model._rebuildMaps();
  }

  /**
   * Clear all nodes and edges
   */
  clear() {
    this.model.reset();
  }

  /**
   * Get incoming edges for a node
   */
  getIncomingEdges(nodeId) {
    return this.model.links.filter(link => {
      const targetId = String(link.target?.id || link.target);
      return targetId === String(nodeId);
    });
  }

  /**
   * Get outgoing edges for a node
   */
  getOutgoingEdges(nodeId) {
    return this.model.links.filter(link => {
      const sourceId = String(link.source?.id || link.source);
      return sourceId === String(nodeId);
    });
  }

  /**
   * Get all edges connected to a node
   */
  getEdgesForNode(nodeId) {
    return this.model.links.filter(link => {
      const sourceId = String(link.source?.id || link.source);
      const targetId = String(link.target?.id || link.target);
      return sourceId === String(nodeId) || targetId === String(nodeId);
    });
  }

  /**
   * Check if node exists
   */
  hasNode(nodeId) {
    return this.model.getNode(nodeId) !== undefined;
  }

  /**
   * Get neighbors of a node
   */
  getNeighbors(nodeId) {
    const edges = this.getEdgesForNode(nodeId);
    const neighborIds = new Set();

    edges.forEach(link => {
      const sourceId = String(link.source?.id || link.source);
      const targetId = String(link.target?.id || link.target);

      if (sourceId === String(nodeId)) {
        neighborIds.add(targetId);
      } else {
        neighborIds.add(sourceId);
      }
    });

    return Array.from(neighborIds).map(id => this.getNode(id)).filter(n => n);
  }

  /**
   * Get degree (total connections) of a node
   */
  getDegree(nodeId) {
    return this.getEdgesForNode(nodeId).length;
  }

  /**
   * Get in-degree of a node
   */
  getInDegree(nodeId) {
    return this.getIncomingEdges(nodeId).length;
  }

  /**
   * Get out-degree of a node
   */
  getOutDegree(nodeId) {
    return this.getOutgoingEdges(nodeId).length;
  }

  /**
   * Load graph data (replaces existing data)
   */
  loadGraph(nodes, links, format = 'dot', source = 'operation') {
    this.model.loadGraph(nodes, links, format, source);
  }

  /**
   * Get graph statistics
   */
  getStats() {
    return {
      nodeCount: this.model.nodes.length,
      edgeCount: this.model.links.length,
      format: this.model.format
    };
  }

  /**
   * Access the underlying model (for compatibility)
   */
  getModel() {
    return this.model;
  }
}
