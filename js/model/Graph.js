// Graph.js - Base graph data structure

import { EventEmitter } from '../core/EventEmitter.js';
import { Node } from './entities/Node.js';
import { Edge } from './entities/Edge.js';

/**
 * Base Graph class that manages nodes and edges.
 * Provides core graph operations like add/remove/find.
 */
export class Graph extends EventEmitter {
  constructor() {
    super();

    this.nodes = [];
    this.edges = [];
    this.nodeMap = new Map(); // id -> node for fast lookup
    this.edgeMap = new Map(); // "source-target" -> edge
  }

  /**
   * Add a node to the graph
   * @param {Node} node - Node to add
   * @returns {Node} The added node
   */
  addNode(node) {
    if (!(node instanceof Node)) {
      throw new Error('Node must be an instance of Node class');
    }

    if (this.nodeMap.has(node.id)) {
      console.warn(`Node with id ${node.id} already exists`);
      return this.nodeMap.get(node.id);
    }

    this.nodes.push(node);
    this.nodeMap.set(node.id, node);

    this.emit('nodeAdded', { node });

    return node;
  }

  /**
   * Remove a node from the graph
   * @param {string|number} nodeId - ID of node to remove
   * @returns {Node|null} The removed node or null
   */
  removeNode(nodeId) {
    const node = this.nodeMap.get(nodeId);
    if (!node) return null;

    // Remove all edges connected to this node
    const connectedEdges = this.getEdgesForNode(nodeId);
    connectedEdges.forEach(edge => this.removeEdge(edge.getSourceId(), edge.getTargetId()));

    // Remove node
    this.nodes = this.nodes.filter(n => n.id !== nodeId);
    this.nodeMap.delete(nodeId);

    this.emit('nodeRemoved', { node, nodeId });

    return node;
  }

  /**
   * Get a node by ID
   * @param {string|number} nodeId - Node ID
   * @returns {Node|null} The node or null
   */
  getNode(nodeId) {
    return this.nodeMap.get(nodeId) || null;
  }

  /**
   * Check if node exists
   * @param {string|number} nodeId - Node ID
   * @returns {boolean} True if node exists
   */
  hasNode(nodeId) {
    return this.nodeMap.has(nodeId);
  }

  /**
   * Get all nodes
   * @returns {Array<Node>} All nodes
   */
  getNodes() {
    return [...this.nodes];
  }

  /**
   * Add an edge to the graph
   * @param {Edge} edge - Edge to add
   * @returns {Edge} The added edge
   */
  addEdge(edge) {
    if (!(edge instanceof Edge)) {
      throw new Error('Edge must be an instance of Edge class');
    }

    const sourceId = edge.getSourceId();
    const targetId = edge.getTargetId();

    // Verify nodes exist
    if (!this.hasNode(sourceId)) {
      throw new Error(`Source node ${sourceId} does not exist`);
    }
    if (!this.hasNode(targetId)) {
      throw new Error(`Target node ${targetId} does not exist`);
    }

    const edgeKey = this.getEdgeKey(sourceId, targetId);

    if (this.edgeMap.has(edgeKey)) {
      console.warn(`Edge ${edgeKey} already exists`);
      return this.edgeMap.get(edgeKey);
    }

    // Update edge to use node objects instead of IDs
    edge.source = this.getNode(sourceId);
    edge.target = this.getNode(targetId);

    this.edges.push(edge);
    this.edgeMap.set(edgeKey, edge);

    this.emit('edgeAdded', { edge });

    return edge;
  }

  /**
   * Remove an edge from the graph
   * @param {string|number} sourceId - Source node ID
   * @param {string|number} targetId - Target node ID
   * @returns {Edge|null} The removed edge or null
   */
  removeEdge(sourceId, targetId) {
    const edgeKey = this.getEdgeKey(sourceId, targetId);
    const edge = this.edgeMap.get(edgeKey);

    if (!edge) return null;

    this.edges = this.edges.filter(e => {
      const eSrc = e.getSourceId();
      const eTgt = e.getTargetId();
      return !(eSrc === sourceId && eTgt === targetId);
    });

    this.edgeMap.delete(edgeKey);

    this.emit('edgeRemoved', { edge, sourceId, targetId });

    return edge;
  }

  /**
   * Get an edge by source and target IDs
   * @param {string|number} sourceId - Source node ID
   * @param {string|number} targetId - Target node ID
   * @returns {Edge|null} The edge or null
   */
  getEdge(sourceId, targetId) {
    const edgeKey = this.getEdgeKey(sourceId, targetId);
    return this.edgeMap.get(edgeKey) || null;
  }

  /**
   * Get all edges
   * @returns {Array<Edge>} All edges
   */
  getEdges() {
    return [...this.edges];
  }

  /**
   * Get all edges connected to a node
   * @param {string|number} nodeId - Node ID
   * @returns {Array<Edge>} Edges connected to node
   */
  getEdgesForNode(nodeId) {
    return this.edges.filter(edge => edge.connectsTo(nodeId));
  }

  /**
   * Get incoming edges for a node
   * @param {string|number} nodeId - Node ID
   * @returns {Array<Edge>} Incoming edges
   */
  getIncomingEdges(nodeId) {
    return this.edges.filter(edge => edge.getTargetId() === nodeId);
  }

  /**
   * Get outgoing edges for a node
   * @param {string|number} nodeId - Node ID
   * @returns {Array<Edge>} Outgoing edges
   */
  getOutgoingEdges(nodeId) {
    return this.edges.filter(edge => edge.getSourceId() === nodeId);
  }

  /**
   * Get neighbors of a node
   * @param {string|number} nodeId - Node ID
   * @returns {Array<Node>} Neighboring nodes
   */
  getNeighbors(nodeId) {
    const edges = this.getEdgesForNode(nodeId);
    const neighborIds = new Set();

    edges.forEach(edge => {
      const otherId = edge.getOtherEnd(nodeId);
      if (otherId) neighborIds.add(otherId);
    });

    return Array.from(neighborIds).map(id => this.getNode(id)).filter(n => n);
  }

  /**
   * Get degree (total connections) of a node
   * @param {string|number} nodeId - Node ID
   * @returns {number} Degree
   */
  getDegree(nodeId) {
    return this.getEdgesForNode(nodeId).length;
  }

  /**
   * Get in-degree of a node
   * @param {string|number} nodeId - Node ID
   * @returns {number} In-degree
   */
  getInDegree(nodeId) {
    return this.getIncomingEdges(nodeId).length;
  }

  /**
   * Get out-degree of a node
   * @param {string|number} nodeId - Node ID
   * @returns {number} Out-degree
   */
  getOutDegree(nodeId) {
    return this.getOutgoingEdges(nodeId).length;
  }

  /**
   * Clear all nodes and edges
   */
  clear() {
    const nodeCount = this.nodes.length;
    const edgeCount = this.edges.length;

    this.nodes = [];
    this.edges = [];
    this.nodeMap.clear();
    this.edgeMap.clear();

    this.emit('cleared', { nodeCount, edgeCount });
  }

  /**
   * Get graph statistics
   */
  getStats() {
    return {
      nodeCount: this.nodes.length,
      edgeCount: this.edges.length,
      averageDegree: this.nodes.length > 0
        ? this.edges.length * 2 / this.nodes.length
        : 0
    };
  }

  /**
   * Create edge key for map storage
   */
  getEdgeKey(sourceId, targetId) {
    return `${sourceId}-${targetId}`;
  }

  /**
   * Serialize to JSON
   */
  toJSON() {
    return {
      nodes: this.nodes.map(n => n.toJSON()),
      edges: this.edges.map(e => e.toJSON())
    };
  }

  /**
   * Load from JSON
   */
  fromJSON(data) {
    this.clear();

    // Load nodes
    data.nodes.forEach(nodeData => {
      const node = new Node(nodeData.id, nodeData);
      this.addNode(node);
    });

    // Load edges
    data.edges.forEach(edgeData => {
      const edge = new Edge(edgeData.source, edgeData.target, edgeData);
      this.addEdge(edge);
    });

    return this;
  }
}
