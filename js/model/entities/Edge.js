// Edge.js - Base Edge class for graph connections

/**
 * Base Edge class representing a graph connection.
 * All edge types (DOT, GFA) extend this class.
 */
export class Edge {
  constructor(source, target, data = {}) {
    // Source and target can be node IDs or node references
    this.source = source;
    this.target = target;

    // Store additional data
    this.data = { ...data };

    // Type identifier
    this.type = 'base';

    // Visual properties
    this.weight = data.weight || 1;
    this.color = data.color || null;
  }

  /**
   * Get source ID (handles both node objects and IDs)
   */
  getSourceId() {
    return typeof this.source === 'object' ? this.source.id : this.source;
  }

  /**
   * Get target ID (handles both node objects and IDs)
   */
  getTargetId() {
    return typeof this.target === 'object' ? this.target.id : this.target;
  }

  /**
   * Check if this edge connects to a specific node
   */
  connectsTo(nodeId) {
    return this.getSourceId() === nodeId || this.getTargetId() === nodeId;
  }

  /**
   * Check if this edge connects two specific nodes
   */
  connects(nodeId1, nodeId2) {
    const sourceId = this.getSourceId();
    const targetId = this.getTargetId();

    return (
      (sourceId === nodeId1 && targetId === nodeId2) ||
      (sourceId === nodeId2 && targetId === nodeId1)
    );
  }

  /**
   * Get the other endpoint of this edge
   */
  getOtherEnd(nodeId) {
    const sourceId = this.getSourceId();
    const targetId = this.getTargetId();

    if (sourceId === nodeId) return targetId;
    if (targetId === nodeId) return sourceId;
    return null;
  }

  /**
   * Reverse the edge direction
   */
  reverse() {
    const temp = this.source;
    this.source = this.target;
    this.target = temp;
  }

  /**
   * Get edge properties as plain object (for serialization)
   */
  toJSON() {
    return {
      source: this.getSourceId(),
      target: this.getTargetId(),
      type: this.type,
      weight: this.weight,
      color: this.color,
      data: this.data
    };
  }

  /**
   * Clone this edge
   */
  clone() {
    return new Edge(this.source, this.target, {
      weight: this.weight,
      color: this.color,
      ...this.data
    });
  }
}
