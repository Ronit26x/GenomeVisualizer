// Node.js - Base Node class for graph entities

/**
 * Base Node class representing a graph vertex.
 * All node types (DOT, GFA, Merged) extend this class.
 */
export class Node {
  constructor(id, data = {}) {
    this.id = id;

    // Position (can be set by layout engine)
    this.x = data.x || 0;
    this.y = data.y || 0;

    // Velocity (for physics simulation)
    this.vx = data.vx || 0;
    this.vy = data.vy || 0;

    // Fixed position (pinning)
    this.fx = data.fx || null;
    this.fy = data.fy || null;

    // Store additional data
    this.data = { ...data };

    // Type identifier
    this.type = 'base';
  }

  /**
   * Pin node at current position
   */
  pin() {
    this.fx = this.x;
    this.fy = this.y;
  }

  /**
   * Unpin node
   */
  unpin() {
    this.fx = null;
    this.fy = null;
  }

  /**
   * Check if node is pinned
   */
  isPinned() {
    return this.fx !== null || this.fy !== null;
  }

  /**
   * Update position
   */
  setPosition(x, y) {
    this.x = x;
    this.y = y;
  }

  /**
   * Get node properties as plain object (for serialization)
   */
  toJSON() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      fx: this.fx,
      fy: this.fy,
      type: this.type,
      data: this.data
    };
  }

  /**
   * Clone this node
   */
  clone() {
    return new Node(this.id, {
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      fx: this.fx,
      fy: this.fy,
      ...this.data
    });
  }
}
