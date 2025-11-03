// DotParser.js - DOT format parser using graphlib

import { Parser } from './Parser.js';

/**
 * DotParser parses DOT format graph files.
 * Uses graphlib-dot library for parsing.
 */
export class DotParser extends Parser {
  constructor() {
    super('dot');
  }

  /**
   * Parse DOT text into graph data
   * @param {string} text - DOT text to parse
   * @param {Function} logEvent - Optional logging function
   * @returns {Object} {nodes, links} - Plain objects for compatibility
   */
  parse(text, logEvent = null) {
    this.clearMessages();

    if (logEvent) logEvent('Parsing DOT…');

    if (!this.validate(text)) {
      throw new Error('Invalid DOT input');
    }

    try {
      // Try graphlib-dot parser first
      if (typeof graphlibDot !== 'undefined') {
        return this.parseWithGraphlib(text, logEvent);
      } else {
        // Fallback to regex-based parser
        this.addWarning('graphlib-dot not available, using fallback parser');
        if (logEvent) logEvent('  → using regex fallback');
        return this.parseWithRegex(text, logEvent);
      }
    } catch (error) {
      this.addError(`DOT parsing failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse using graphlib-dot
   */
  parseWithGraphlib(text, logEvent) {
    const graph = graphlibDot.read(text);

    const nodes = [];
    const links = [];

    // Extract nodes as plain objects (not Node instances)
    graph.nodes().forEach(nodeId => {
      const nodeData = graph.node(nodeId);

      const node = {
        id: nodeId,
        ...nodeData
      };

      nodes.push(node);
    });

    // Extract edges as plain objects (not Edge instances)
    graph.edges().forEach(edge => {
      const edgeData = graph.edge(edge);

      const link = {
        source: edge.v,
        target: edge.w,
        ...edgeData
      };

      links.push(link);
    });

    this.log(`Parsed ${nodes.length} nodes and ${links.length} edges`);
    if (logEvent) logEvent(`  → graphlib-dot found ${links.length} edges`);

    return { nodes, links };
  }

  /**
   * Fallback regex-based parser
   */
  parseWithRegex(text, logEvent) {
    const nodes = [];
    const links = [];
    const nodeMap = new Map();

    // Simple regex patterns
    const nodePattern = /(\w+)\s*\[([^\]]+)\]/g;
    const edgePattern = /(\w+)\s*-[->]\s*(\w+)(?:\s*\[([^\]]+)\])?/g;

    // Parse nodes
    let match;
    while ((match = nodePattern.exec(text)) !== null) {
      const nodeId = match[1];
      const attrs = this.parseAttributes(match[2]);

      const node = {
        id: nodeId,
        ...attrs
      };

      nodes.push(node);
      nodeMap.set(nodeId, node);
    }

    // Parse edges
    let edgeCount = 0;
    while ((match = edgePattern.exec(text)) !== null) {
      const sourceId = match[1];
      const targetId = match[2];
      const attrString = match[3] || '';
      const attrs = this.parseAttributes(attrString);

      // Ensure nodes exist
      if (!nodeMap.has(sourceId)) {
        const node = { id: sourceId };
        nodes.push(node);
        nodeMap.set(sourceId, node);
      }

      if (!nodeMap.has(targetId)) {
        const node = { id: targetId };
        nodes.push(node);
        nodeMap.set(targetId, node);
      }

      const link = {
        source: sourceId,
        target: targetId,
        ...attrs
      };

      links.push(link);
      edgeCount++;
    }

    this.log(`Parsed ${nodes.length} nodes and ${links.length} edges (regex fallback)`);
    if (logEvent) logEvent(`  → fallback parsed ${edgeCount} edges`);

    return { nodes, links };
  }

  /**
   * Parse DOT attribute string
   */
  parseAttributes(attrString) {
    const attrs = {};

    if (!attrString) return attrs;

    const attrPattern = /(\w+)\s*=\s*"?([^",\]]+)"?/g;
    let match;

    while ((match = attrPattern.exec(attrString)) !== null) {
      const key = match[1];
      const value = match[2];
      attrs[key] = value;
    }

    return attrs;
  }
}
