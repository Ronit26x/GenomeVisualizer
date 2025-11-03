// MergedNode.js - Node representing a merged linear chain

import { GfaNode } from './GfaNode.js';

/**
 * MergedNode represents multiple nodes that have been merged into one.
 * Stores the original nodes and links for sequence reconstruction.
 */
export class MergedNode extends GfaNode {
  constructor(id, mergedFrom, originalNodes, originalLinks, data = {}) {
    super(id, data);

    // IDs of nodes that were merged
    this.mergedFrom = Array.isArray(mergedFrom) ? mergedFrom : [mergedFrom];

    // Original nodes and links (for sequence reconstruction)
    this.originalNodes = originalNodes || [];
    this.originalLinks = originalLinks || [];

    // Path name (describes the merge)
    this.pathName = data.pathName || `Merged ${this.mergedFrom.length} nodes`;

    // Aggregate properties from merged nodes
    this.totalLength = this.calculateTotalLength();
    this.averageDepth = this.calculateAverageDepth();
    this.nodeCount = this.originalNodes.length;

    this.type = 'merged';
  }

  /**
   * Calculate total sequence length from merged nodes
   */
  calculateTotalLength() {
    return this.originalNodes.reduce((sum, node) => {
      return sum + (node.length || (node.seq && node.seq !== '*' ? node.seq.length : 0));
    }, 0);
  }

  /**
   * Calculate average depth from merged nodes
   */
  calculateAverageDepth() {
    if (this.originalNodes.length === 0) return 0;

    const totalDepth = this.originalNodes.reduce((sum, node) => {
      return sum + (node.depth || 0);
    }, 0);

    return totalDepth / this.originalNodes.length;
  }

  /**
   * Get info about this merged node
   */
  getInfo() {
    return {
      type: 'merged',
      id: this.id,
      mergedFrom: this.mergedFrom,
      originalNodes: this.mergedFrom,
      nodeCount: this.nodeCount,
      totalLength: this.totalLength,
      averageDepth: this.averageDepth,
      pathName: this.pathName
    };
  }

  /**
   * Check if this node contains a specific original node ID
   */
  containsNode(nodeId) {
    return this.mergedFrom.includes(nodeId);
  }

  /**
   * Get the sequence of original node IDs in merge order
   */
  getSequenceIds() {
    return this.originalNodes.map(n => n.id);
  }

  /**
   * Serialize to JSON
   */
  toJSON() {
    return {
      ...super.toJSON(),
      mergedFrom: this.mergedFrom,
      originalNodes: this.originalNodes.map(n => ({ ...n })),
      originalLinks: this.originalLinks.map(l => ({ ...l })),
      pathName: this.pathName,
      totalLength: this.totalLength,
      averageDepth: this.averageDepth,
      nodeCount: this.nodeCount
    };
  }

  /**
   * Clone this merged node
   */
  clone() {
    return new MergedNode(
      this.id,
      [...this.mergedFrom],
      this.originalNodes.map(n => ({ ...n })),
      this.originalLinks.map(l => ({ ...l })),
      this.toJSON()
    );
  }

  /**
   * Static method to check if a node is a merged node
   */
  static isMergedNode(node) {
    return node && (node.type === 'merged' || node.mergedFrom !== undefined);
  }
}
