// GfaParser.js - GFA format parser

import { Parser } from './Parser.js';

/**
 * GfaParser parses GFA (Graphical Fragment Assembly) format files.
 * Supports GFA v1.0 and v2.0.
 */
export class GfaParser extends Parser {
  constructor() {
    super('gfa');

    this.version = '1.0';
  }

  /**
   * Parse GFA text into graph data
   * @param {string} text - GFA text to parse
   * @param {Function} logEvent - Optional logging function
   * @returns {Object} {nodes, links} - Plain objects for compatibility
   */
  parse(text, logEvent = null) {
    this.clearMessages();

    if (logEvent) logEvent('Parsing GFA…');

    if (!this.validate(text)) {
      throw new Error('Invalid GFA input');
    }

    const nodes = [];
    const links = [];
    const seen = new Set();

    const lines = text.split('\n');

    lines.forEach((line, lineNum) => {
      line = line.trim();

      if (!line || line.startsWith('#')) {
        return; // Skip empty lines and comments
      }

      const fields = line.split('\t');
      const recordType = fields[0];

      try {
        switch (recordType) {
          case 'H': // Header
            this.parseHeader(fields);
            break;

          case 'S': // Segment (node)
            const node = this.parseSegment(fields);
            if (node) {
              nodes.push(node);
            }
            break;

          case 'L': // Link (edge)
            const link = this.parseLink(fields);
            if (link) {
              // Check for duplicates
              const key = `${link.source}→${link.target}`;
              if (!seen.has(key)) {
                seen.add(key);
                links.push(link);
              }
            }
            break;

          case 'P': // Path
            this.parsePath(fields);
            break;

          case 'E': // Edge (GFA v2)
            const edgeV2 = this.parseEdge(fields);
            if (edgeV2) {
              const key = `${edgeV2.source}→${edgeV2.target}`;
              if (!seen.has(key)) {
                seen.add(key);
                links.push(edgeV2);
              }
            }
            break;

          default:
            this.addWarning(`Unknown record type on line ${lineNum + 1}: ${recordType}`);
        }
      } catch (error) {
        this.addError(`Error on line ${lineNum + 1}: ${error.message}`);
      }
    });

    this.log(`Parsed ${nodes.length} segments and ${links.length} links`);
    if (logEvent) logEvent(`  → parsed ${nodes.length} segments, ${links.length} links`);

    return { nodes, links };
  }

  /**
   * Parse GFA header line
   */
  parseHeader(fields) {
    // H VN:Z:1.0
    fields.forEach(field => {
      if (field.startsWith('VN:Z:')) {
        this.version = field.substring(5);
      }
    });
  }

  /**
   * Parse GFA segment (node)
   */
  parseSegment(fields) {
    // S segmentName sequence [tags]
    if (fields.length < 3) {
      this.addError('Invalid segment line: insufficient fields');
      return null;
    }

    const id = fields[1];
    const seq = fields[2];

    const node = {
      id: id,
      seq: seq,
      length: seq !== '*' ? seq.length : 1000,
      depth: 1.0,
      gfaType: 'segment'
    };

    // Parse optional tags
    for (let i = 3; i < fields.length; i++) {
      const tag = fields[i];
      const parts = tag.split(':');

      if (parts.length >= 3) {
        const tagName = parts[0];
        const tagType = parts[1];
        const tagValue = parts.slice(2).join(':');

        switch (tagName) {
          case 'LN': // Length
            node.length = parseInt(tagValue, 10);
            node.LN = node.length;
            break;

          case 'DP': // Depth/Coverage
            const depthValue = parseFloat(tagValue);
            if (!isNaN(depthValue) && depthValue > 0) {
              node.depth = depthValue;
              node.DP = depthValue;
            }
            break;

          case 'KC': // K-mer count (use as depth)
            const kcValue = parseFloat(tagValue);
            if (!isNaN(kcValue) && kcValue > 0 && node.length > 0) {
              node.depth = kcValue / node.length;
              node.KC = kcValue;
            }
            break;

          case 'RC': // Read count (use as depth)
            const rcValue = parseFloat(tagValue);
            if (!isNaN(rcValue) && rcValue > 0 && node.length > 0) {
              node.depth = rcValue / node.length;
              node.RC = rcValue;
            }
            break;

          default:
            node[tagName] = tagValue;
        }
      }
    }

    return node;
  }

  /**
   * Parse GFA link (edge)
   */
  parseLink(fields) {
    // L segmentA orientationA segmentB orientationB overlap [tags]
    if (fields.length < 6) {
      this.addError('Invalid link line: insufficient fields');
      return null;
    }

    const sourceId = fields[1];
    const srcOrientation = fields[2];
    const targetId = fields[3];
    const tgtOrientation = fields[4];
    const overlap = fields[5];

    const link = {
      source: sourceId,
      target: targetId,
      srcOrientation: srcOrientation,
      tgtOrientation: tgtOrientation,
      overlap: overlap || '0M',
      gfaType: 'link'
    };

    // Parse optional tags
    for (let i = 6; i < fields.length; i++) {
      const tag = fields[i];
      const parts = tag.split(':');

      if (parts.length >= 3) {
        const tagName = parts[0];
        const tagValue = parts.slice(2).join(':');
        link[tagName] = tagValue;
      }
    }

    return link;
  }

  /**
   * Parse GFA path
   */
  parsePath(fields) {
    // P pathName segmentNames overlaps
    // Paths will be handled separately
    this.emit('pathFound', {
      name: fields[1],
      segments: fields[2],
      overlaps: fields[3]
    });
  }

  /**
   * Parse GFA v2 edge
   */
  parseEdge(fields) {
    // E edgeId segmentA orientationA segmentB orientationB begin end overlap [tags]
    if (fields.length < 9) {
      this.addError('Invalid edge line: insufficient fields');
      return null;
    }

    const sourceId = fields[2];
    const srcOrientation = fields[3];
    const targetId = fields[4];
    const tgtOrientation = fields[5];
    const overlap = fields[8];

    const link = {
      source: sourceId,
      target: targetId,
      srcOrientation: srcOrientation,
      tgtOrientation: tgtOrientation,
      overlap: overlap || '0M',
      gfaType: 'edge',
      edgeId: fields[1],
      begin: fields[6],
      end: fields[7]
    };

    return link;
  }
}
