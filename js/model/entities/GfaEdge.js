// GfaEdge.js - GFA-specific edge with orientation and overlap

import { Edge } from './Edge.js';

/**
 * GfaEdge represents a link in a GFA graph.
 * Extends base Edge with GFA-specific properties like orientation and overlap.
 */
export class GfaEdge extends Edge {
  constructor(source, target, srcOrientation, tgtOrientation, data = {}) {
    super(source, target, data);

    // GFA orientations ('+' or '-')
    this.srcOrientation = srcOrientation || '+';
    this.tgtOrientation = tgtOrientation || '+';

    // Overlap information (CIGAR string)
    this.overlap = data.overlap || null;

    // GFA type (link, containment, path, etc.)
    this.gfaType = data.gfaType || 'link';

    this.type = 'gfa';
  }

  /**
   * Get source node orientation
   */
  getSourceOrientation() {
    return this.srcOrientation;
  }

  /**
   * Get target node orientation
   */
  getTargetOrientation() {
    return this.tgtOrientation;
  }

  /**
   * Get overlap length from CIGAR string
   */
  getOverlapLength() {
    if (!this.overlap) return 0;

    // Parse CIGAR string (e.g., "75M" -> 75)
    const match = this.overlap.match(/(\d+)M/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Check if this edge connects nodes in the same orientation
   */
  isSameOrientation() {
    return this.srcOrientation === this.tgtOrientation;
  }

  /**
   * Get the connection type description
   */
  getConnectionType() {
    return `${this.srcOrientation} → ${this.tgtOrientation}`;
  }

  /**
   * Get which subnode this connects to on the source node
   * In GFA: '+' connects via green (outgoing), '-' connects via red (incoming)
   */
  getSourceSubnode() {
    return this.srcOrientation === '+' ? 'green' : 'red';
  }

  /**
   * Get which subnode this connects to on the target node
   * In GFA: '+' connects via red (incoming), '-' connects via green (outgoing)
   */
  getTargetSubnode() {
    return this.tgtOrientation === '+' ? 'red' : 'green';
  }

  /**
   * Reverse this GFA edge (swaps source/target and flips orientations)
   */
  reverse() {
    super.reverse();

    // Swap orientations
    const tempOrientation = this.srcOrientation;
    this.srcOrientation = this.tgtOrientation;
    this.tgtOrientation = tempOrientation;
  }

  /**
   * Get the reverse interpretation of this link
   * GFA links are bidirectional: A+→B+ is the same as B+→A+
   */
  getReverseInterpretation() {
    return new GfaEdge(
      this.target,
      this.source,
      this.flipOrientation(this.tgtOrientation),
      this.flipOrientation(this.srcOrientation),
      {
        overlap: this.overlap,
        gfaType: this.gfaType,
        ...this.data
      }
    );
  }

  /**
   * Flip orientation (+ becomes -, - becomes +)
   */
  flipOrientation(orientation) {
    return orientation === '+' ? '-' : '+';
  }

  /**
   * Serialize to JSON
   */
  toJSON() {
    return {
      ...super.toJSON(),
      srcOrientation: this.srcOrientation,
      tgtOrientation: this.tgtOrientation,
      overlap: this.overlap,
      gfaType: this.gfaType
    };
  }

  /**
   * Clone this GFA edge
   */
  clone() {
    return new GfaEdge(
      this.source,
      this.target,
      this.srcOrientation,
      this.tgtOrientation,
      {
        overlap: this.overlap,
        gfaType: this.gfaType,
        weight: this.weight,
        color: this.color,
        ...this.data
      }
    );
  }
}
