// GfaGraph.js - GFA-specific graph extension

import { Graph } from './Graph.js';
import { GfaNode } from './entities/GfaNode.js';
import { GfaEdge } from './entities/GfaEdge.js';
import { MergedNode } from './entities/MergedNode.js';

/**
 * GfaGraph extends Graph with GFA-specific functionality.
 * Handles GFA nodes, edges, orientations, and sequences.
 */
export class GfaGraph extends Graph {
  constructor() {
    super();

    // GFA metadata
    this.version = '1.0';
    this.headers = [];

    // Pinned nodes (fixed positions)
    this.pinnedNodes = new Set();
  }

  /**
   * Add a GFA node
   * @param {GfaNode} node - GFA node to add
   * @returns {GfaNode} The added node
   */
  addNode(node) {
    if (!(node instanceof GfaNode) && !(node instanceof MergedNode)) {
      console.warn('GfaGraph should contain GfaNode instances');
    }

    return super.addNode(node);
  }

  /**
   * Add a GFA edge
   * @param {GfaEdge} edge - GFA edge to add
   * @returns {GfaEdge} The added edge
   */
  addEdge(edge) {
    if (!(edge instanceof GfaEdge)) {
      console.warn('GfaGraph should contain GfaEdge instances');
    }

    return super.addEdge(edge);
  }

  /**
   * Pin a node (fix its position)
   * @param {string|number} nodeId - Node ID to pin
   */
  pinNode(nodeId) {
    const node = this.getNode(nodeId);
    if (!node) return;

    node.pin();
    this.pinnedNodes.add(nodeId);

    this.emit('nodePinned', { nodeId, node });
  }

  /**
   * Unpin a node
   * @param {string|number} nodeId - Node ID to unpin
   */
  unpinNode(nodeId) {
    const node = this.getNode(nodeId);
    if (!node) return;

    node.unpin();
    this.pinnedNodes.delete(nodeId);

    this.emit('nodeUnpinned', { nodeId, node });
  }

  /**
   * Check if node is pinned
   * @param {string|number} nodeId - Node ID
   * @returns {boolean} True if pinned
   */
  isNodePinned(nodeId) {
    return this.pinnedNodes.has(nodeId);
  }

  /**
   * Get all pinned nodes
   * @returns {Array} Array of pinned node IDs
   */
  getPinnedNodes() {
    return Array.from(this.pinnedNodes);
  }

  /**
   * Unpin all nodes
   */
  unpinAll() {
    this.pinnedNodes.forEach(nodeId => {
      this.unpinNode(nodeId);
    });
  }

  /**
   * Flip a GFA node orientation
   * @param {string|number} nodeId - Node ID to flip
   */
  flipNode(nodeId) {
    const node = this.getNode(nodeId);
    if (!node || !(node instanceof GfaNode)) {
      console.warn(`Cannot flip node ${nodeId}: not a GfaNode`);
      return;
    }

    node.flip();

    this.emit('nodeFlipped', { nodeId, node, isFlipped: node.isFlipped });
  }

  /**
   * Get GFA edge between nodes with orientations
   * @param {string|number} sourceId - Source node ID
   * @param {string|number} targetId - Target node ID
   * @param {string} srcOrientation - Source orientation (+/-)
   * @param {string} tgtOrientation - Target orientation (+/-)
   * @returns {GfaEdge|null} Matching edge or null
   */
  getGfaEdge(sourceId, targetId, srcOrientation, tgtOrientation) {
    return this.edges.find(edge => {
      if (!(edge instanceof GfaEdge)) return false;

      return edge.getSourceId() === sourceId &&
             edge.getTargetId() === targetId &&
             edge.srcOrientation === srcOrientation &&
             edge.tgtOrientation === tgtOrientation;
    }) || null;
  }

  /**
   * Find GFA link between two nodes (any orientation)
   * @param {string|number} nodeId1 - First node ID
   * @param {string|number} nodeId2 - Second node ID
   * @returns {GfaEdge|null} First matching link or null
   */
  findLinkBetween(nodeId1, nodeId2) {
    return this.edges.find(edge => {
      if (!(edge instanceof GfaEdge)) return false;

      const src = edge.getSourceId();
      const tgt = edge.getTargetId();

      return (src === nodeId1 && tgt === nodeId2) ||
             (src === nodeId2 && tgt === nodeId1);
    }) || null;
  }

  /**
   * Get all GFA links for a node with specific orientation
   * @param {string|number} nodeId - Node ID
   * @param {string} orientation - Orientation (+/-)
   * @param {string} direction - 'incoming' or 'outgoing'
   * @returns {Array<GfaEdge>} Matching edges
   */
  getLinksForOrientation(nodeId, orientation, direction = 'both') {
    return this.edges.filter(edge => {
      if (!(edge instanceof GfaEdge)) return false;

      if (direction === 'outgoing' || direction === 'both') {
        if (edge.getSourceId() === nodeId && edge.srcOrientation === orientation) {
          return true;
        }
      }

      if (direction === 'incoming' || direction === 'both') {
        if (edge.getTargetId() === nodeId && edge.tgtOrientation === orientation) {
          return true;
        }
      }

      return false;
    });
  }

  /**
   * Get connection information for a node
   * @param {string|number} nodeId - Node ID
   * @returns {Object} Connection info
   */
  getNodeConnections(nodeId) {
    const node = this.getNode(nodeId);
    if (!node) return null;

    const incoming = this.getIncomingEdges(nodeId);
    const outgoing = this.getOutgoingEdges(nodeId);

    const result = {
      nodeId,
      totalConnections: incoming.length + outgoing.length,
      incomingCount: incoming.length,
      outgoingCount: outgoing.length,
      isLinear: (incoming.length + outgoing.length) <= 2,
      isBranching: (incoming.length + outgoing.length) > 2
    };

    // GFA-specific orientation info
    if (node instanceof GfaNode) {
      const posIncoming = this.getLinksForOrientation(nodeId, '+', 'incoming');
      const posOutgoing = this.getLinksForOrientation(nodeId, '+', 'outgoing');
      const negIncoming = this.getLinksForOrientation(nodeId, '-', 'incoming');
      const negOutgoing = this.getLinksForOrientation(nodeId, '-', 'outgoing');

      result.orientationInfo = {
        '+': { incoming: posIncoming.length, outgoing: posOutgoing.length },
        '-': { incoming: negIncoming.length, outgoing: negOutgoing.length }
      };
    }

    return result;
  }

  /**
   * Find linear chain starting from a node
   * @param {string|number} startNodeId - Starting node ID
   * @returns {Object} Chain info {nodes, edges, isLinear}
   */
  findLinearChain(startNodeId) {
    const startNode = this.getNode(startNodeId);
    if (!startNode) return null;

    const visited = new Set();
    const chainNodes = [];
    const chainEdges = [];

    // Trace backwards
    let current = startNodeId;
    while (current) {
      const incoming = this.getIncomingEdges(current);

      if (incoming.length !== 1) break;

      const edge = incoming[0];
      const prevId = edge.getSourceId();

      if (visited.has(prevId)) break;

      const connections = this.getNodeConnections(prevId);
      if (!connections.isLinear) break;

      current = prevId;
    }

    const chainStart = current;

    // Trace forwards from chain start
    current = chainStart;
    visited.clear();

    while (current) {
      if (visited.has(current)) break;

      visited.add(current);
      chainNodes.push(current);

      const connections = this.getNodeConnections(current);
      if (!connections.isLinear && current !== chainStart) break;

      const outgoing = this.getOutgoingEdges(current);

      if (outgoing.length === 0) break;
      if (outgoing.length > 1) break;

      const edge = outgoing[0];
      chainEdges.push(edge);

      const nextId = edge.getTargetId();
      if (visited.has(nextId)) break;

      current = nextId;
    }

    return {
      nodes: chainNodes,
      edges: chainEdges,
      isLinear: chainNodes.length > 1,
      startNode: chainStart,
      endNode: current
    };
  }

  /**
   * Calculate total sequence length
   * @returns {number} Total length in bases
   */
  getTotalSequenceLength() {
    return this.nodes.reduce((sum, node) => {
      if (node instanceof GfaNode) {
        return sum + node.length;
      }
      return sum;
    }, 0);
  }

  /**
   * Calculate average depth
   * @returns {number} Average depth
   */
  getAverageDepth() {
    const gfaNodes = this.nodes.filter(n => n instanceof GfaNode);
    if (gfaNodes.length === 0) return 0;

    const totalDepth = gfaNodes.reduce((sum, node) => sum + node.depth, 0);
    return totalDepth / gfaNodes.length;
  }

  /**
   * Get GFA statistics
   */
  getGfaStats() {
    const baseStats = this.getStats();

    const gfaNodes = this.nodes.filter(n => n instanceof GfaNode);
    const mergedNodes = this.nodes.filter(n => n instanceof MergedNode);

    return {
      ...baseStats,
      gfaNodeCount: gfaNodes.length,
      mergedNodeCount: mergedNodes.length,
      totalSequenceLength: this.getTotalSequenceLength(),
      averageDepth: this.getAverageDepth(),
      pinnedNodeCount: this.pinnedNodes.size
    };
  }

  /**
   * Clear graph and reset GFA-specific state
   */
  clear() {
    super.clear();

    this.pinnedNodes.clear();
    this.headers = [];
  }

  /**
   * Serialize to JSON
   */
  toJSON() {
    const baseJSON = super.toJSON();

    return {
      ...baseJSON,
      version: this.version,
      headers: this.headers,
      pinnedNodes: Array.from(this.pinnedNodes)
    };
  }

  /**
   * Load from JSON
   */
  fromJSON(data) {
    this.clear();

    this.version = data.version || '1.0';
    this.headers = data.headers || [];

    // Load nodes (create proper GfaNode instances)
    data.nodes.forEach(nodeData => {
      let node;

      if (nodeData.type === 'merged') {
        node = new MergedNode(
          nodeData.id,
          nodeData.mergedFrom,
          nodeData.originalNodes,
          nodeData.originalLinks,
          nodeData
        );
      } else if (nodeData.type === 'gfa') {
        node = new GfaNode(nodeData.id, nodeData);
      } else {
        node = new GfaNode(nodeData.id, nodeData);
      }

      this.addNode(node);
    });

    // Load edges (create proper GfaEdge instances)
    data.edges.forEach(edgeData => {
      const edge = new GfaEdge(
        edgeData.source,
        edgeData.target,
        edgeData.srcOrientation,
        edgeData.tgtOrientation,
        edgeData
      );

      this.addEdge(edge);
    });

    // Restore pinned nodes
    if (data.pinnedNodes) {
      data.pinnedNodes.forEach(nodeId => {
        this.pinNode(nodeId);
      });
    }

    return this;
  }
}
