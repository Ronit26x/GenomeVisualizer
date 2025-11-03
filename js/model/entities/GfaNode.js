// GfaNode.js - GFA-specific node with sequence and orientation

import { Node } from './Node.js';

/**
 * GfaNode represents a segment in a GFA graph.
 * Extends base Node with GFA-specific properties like sequence, depth, and orientation.
 */
export class GfaNode extends Node {
  constructor(id, data = {}) {
    super(id, data);

    // GFA-specific properties
    this.seq = data.seq || '*';
    this.length = data.length || (data.seq && data.seq !== '*' ? data.seq.length : 0);
    this.depth = data.depth || 0;

    // Visual properties for Bandage-style rendering
    this.angle = data.angle || 0;
    this.width = data.width || 10;
    this.drawnLength = data.drawnLength || 50;
    this.isFlipped = data.isFlipped || false;

    // Metadata tags from GFA file
    this.tags = {
      DP: data.DP || data.depth || 0,     // Depth/coverage
      LN: data.LN || this.length,          // Length
      KC: data.KC || 0,                     // K-mer count
      RC: data.RC || 0                      // Read count
    };

    this.type = 'gfa';
  }

  /**
   * Flip node 180 degrees (for GFA orientation)
   */
  flip() {
    this.isFlipped = !this.isFlipped;
    this.angle = (this.angle + Math.PI) % (2 * Math.PI);
  }

  /**
   * Calculate optimal rotation based on connected nodes
   */
  calculateOptimalRotation(connectedNodes) {
    if (!connectedNodes || connectedNodes.length === 0) {
      return this.angle;
    }

    // Calculate average direction to connected nodes
    let sumX = 0;
    let sumY = 0;

    connectedNodes.forEach(node => {
      const dx = node.x - this.x;
      const dy = node.y - this.y;
      sumX += dx;
      sumY += dy;
    });

    if (sumX === 0 && sumY === 0) {
      return this.angle;
    }

    return Math.atan2(sumY, sumX);
  }

  /**
   * Get reverse complement of sequence
   */
  getReverseComplement() {
    if (this.seq === '*') {
      return '*';
    }

    const complement = {
      'A': 'T', 'T': 'A', 'C': 'G', 'G': 'C',
      'a': 't', 't': 'a', 'c': 'g', 'g': 'c',
      'N': 'N', 'n': 'n'
    };

    return this.seq
      .split('')
      .reverse()
      .map(base => complement[base] || base)
      .join('');
  }

  /**
   * Get sequence in specified orientation
   */
  getSequence(orientation = '+') {
    if (orientation === '-') {
      return this.getReverseComplement();
    }
    return this.seq;
  }

  /**
   * Serialize to JSON
   */
  toJSON() {
    return {
      ...super.toJSON(),
      seq: this.seq,
      length: this.length,
      depth: this.depth,
      angle: this.angle,
      width: this.width,
      drawnLength: this.drawnLength,
      isFlipped: this.isFlipped,
      tags: this.tags
    };
  }

  /**
   * Clone this GFA node
   */
  clone() {
    return new GfaNode(this.id, this.toJSON());
  }
}
