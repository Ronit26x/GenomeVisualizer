// GfaExporter.js - Export graph to GFA format with merge/resolution support

import { getBaseNodeId, findAllSegments } from '../chain-utils.js';

/**
 * GfaExporter exports the current graph state to GFA format.
 * Handles merged nodes, resolved vertices, and chain segments by reconstructing the original structure.
 */
export class GfaExporter {
  constructor() {
    this.version = '1.0';
  }

  /**
   * Export graph to GFA format
   * @param {Array} nodes - Graph nodes
   * @param {Array} links - Graph links
   * @param {Object} options - Export options
   * @returns {string} GFA formatted text
   */
  export(nodes, links, options = {}) {
    const {
      includeHeader = true,
      expandMergedNodes = false, // Changed default to false - keep merged nodes
      includeOptionalTags = true
    } = options;

    let gfaText = '';

    // Add header
    if (includeHeader) {
      gfaText += `H\tVN:Z:${this.version}\n`;
    }

    // FIRST: Consolidate chain segments back to base nodes
    const { consolidatedNodes, consolidatedLinks } = this.consolidateChainSegments(nodes, links);

    console.log(`[GfaExporter] Consolidated ${nodes.length} nodes (with segments) to ${consolidatedNodes.length} base nodes`);
    console.log(`[GfaExporter] Consolidated ${links.length} links to ${consolidatedLinks.length} links`);

    // Process nodes - expand merged nodes if requested
    const processedNodes = this.processNodes(consolidatedNodes, expandMergedNodes);
    const processedLinks = this.processLinks(consolidatedNodes, consolidatedLinks, expandMergedNodes);

    // Add segments
    processedNodes.forEach(node => {
      gfaText += this.formatSegment(node, includeOptionalTags);
    });

    // Add links
    processedLinks.forEach(link => {
      gfaText += this.formatLink(link);
    });

    return gfaText;
  }

  /**
   * Consolidate chain segments back to their base nodes
   * @param {Array} nodes - Nodes (may include chain segments)
   * @param {Array} links - Links (may include internal chain links)
   * @returns {Object} { consolidatedNodes, consolidatedLinks }
   */
  consolidateChainSegments(nodes, links) {
    // Group nodes by base ID
    const baseNodeGroups = new Map();

    nodes.forEach(node => {
      const baseId = getBaseNodeId(node.id);

      if (!baseNodeGroups.has(baseId)) {
        baseNodeGroups.set(baseId, {
          baseId: baseId,
          segments: [],
          isChain: false
        });
      }

      const group = baseNodeGroups.get(baseId);
      group.segments.push(node);

      // If this is a segment (not the base node), mark as chain
      if (node.isChainSegment || node.parentChainId) {
        group.isChain = true;
      }
    });

    // Consolidate segments into base nodes
    const consolidatedNodes = [];

    baseNodeGroups.forEach((group, baseId) => {
      if (group.isChain && group.segments.length > 1) {
        // This is a chain - consolidate all segments into one node
        // Use first segment as template and sum up properties
        const firstSegment = group.segments[0];
        const totalLength = group.segments.reduce((sum, seg) => sum + (seg.length || 0), 0);

        const consolidatedNode = {
          id: baseId,
          seq: firstSegment.seq || '*',
          length: totalLength,
          depth: firstSegment.depth,
          gfaType: firstSegment.gfaType,
          LN: totalLength,
          DP: firstSegment.DP || firstSegment.depth,
          KC: firstSegment.KC,
          RC: firstSegment.RC,
          // Preserve other properties from first segment
          ...firstSegment,
          // Override with consolidated values
          id: baseId,
          length: totalLength,
          LN: totalLength
        };

        consolidatedNodes.push(consolidatedNode);
      } else {
        // Not a chain or single segment - use as is
        consolidatedNodes.push(group.segments[0]);
      }
    });

    // Consolidate links - remove internal chain links and redirect segment IDs to base IDs
    const linkSet = new Set();
    const consolidatedLinks = [];

    links.forEach(link => {
      // Skip internal chain links
      if (link.isInternalChainLink) {
        return;
      }

      const sourceId = String(link.source?.id || link.source);
      const targetId = String(link.target?.id || link.target);

      const sourceBaseId = getBaseNodeId(sourceId);
      const targetBaseId = getBaseNodeId(targetId);

      // Create link key for deduplication
      const srcOri = link.srcOrientation || '+';
      const tgtOri = link.tgtOrientation || '+';
      const linkKey = `${sourceBaseId}\t${srcOri}\t${targetBaseId}\t${tgtOri}`;

      // Skip if we've already added this link
      if (linkSet.has(linkKey)) {
        return;
      }

      linkSet.add(linkKey);

      // Create consolidated link with base IDs
      consolidatedLinks.push({
        source: sourceBaseId,
        target: targetBaseId,
        srcOrientation: srcOri,
        tgtOrientation: tgtOri,
        overlap: link.overlap || '*',
        gfaType: link.gfaType || 'link'
      });
    });

    return {
      consolidatedNodes,
      consolidatedLinks
    };
  }

  /**
   * Process nodes - expand merged nodes back to original nodes OR keep as merged
   * @param {Array} nodes - Input nodes
   * @param {boolean} expandMergedNodes - Whether to expand merged nodes
   * @returns {Array} Processed nodes
   */
  processNodes(nodes, expandMergedNodes) {
    const processedNodes = [];

    nodes.forEach(node => {
      if (this.isMergedNode(node)) {
        if (expandMergedNodes) {
          // Expand merged node back to original nodes
          const originalNodes = node.originalNodes || [];
          originalNodes.forEach(originalNode => {
            processedNodes.push(this.createSegmentNode(originalNode));
          });
        } else {
          // Keep as merged node - export with special tags
          processedNodes.push(this.createMergedSegmentNode(node));
        }
      } else if (this.isResolvedNode(node)) {
        // For resolved nodes, use the original ID if available
        const segmentNode = this.createSegmentNode(node);
        processedNodes.push(segmentNode);
      } else {
        // Regular node
        processedNodes.push(this.createSegmentNode(node));
      }
    });

    return processedNodes;
  }

  /**
   * Process links - reconstruct original links for merged nodes
   * @param {Array} nodes - Graph nodes
   * @param {Array} links - Input links
   * @param {boolean} expandMergedNodes - Whether to expand merged nodes
   * @returns {Array} Processed links
   */
  processLinks(nodes, links, expandMergedNodes) {
    const processedLinks = [];
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    links.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;

      const sourceNode = nodeMap.get(sourceId);
      const targetNode = nodeMap.get(targetId);

      // Check if either endpoint is a merged node
      const sourceIsMerged = expandMergedNodes && sourceNode && this.isMergedNode(sourceNode);
      const targetIsMerged = expandMergedNodes && targetNode && this.isMergedNode(targetNode);

      if (sourceIsMerged || targetIsMerged) {
        // Reconstruct original links
        if (sourceIsMerged) {
          // Add internal links from merged source node
          const internalLinks = sourceNode.originalLinks || [];
          internalLinks.forEach(internalLink => {
            processedLinks.push(this.createGfaLink(internalLink));
          });

          // If target is not merged, we need to reconnect external edges
          if (!targetIsMerged && link.mergedConnection) {
            // This is an external edge - map it to the correct original node
            const mappedLink = this.mapMergedNodeLink(link, sourceNode, targetNode, 'source');
            if (mappedLink) {
              processedLinks.push(mappedLink);
            }
          }
        }

        if (targetIsMerged) {
          // Add internal links from merged target node
          const internalLinks = targetNode.originalLinks || [];
          internalLinks.forEach(internalLink => {
            // Avoid duplicates if both source and target are merged
            if (!sourceIsMerged) {
              processedLinks.push(this.createGfaLink(internalLink));
            }
          });

          // If source is not merged, reconnect external edges
          if (!sourceIsMerged && link.mergedConnection) {
            const mappedLink = this.mapMergedNodeLink(link, targetNode, sourceNode, 'target');
            if (mappedLink) {
              processedLinks.push(mappedLink);
            }
          }
        }

        // If both are merged and there's a connection between them, map it
        if (sourceIsMerged && targetIsMerged && link.mergedConnection) {
          const mappedLink = this.mapMergedToMergedLink(link, sourceNode, targetNode);
          if (mappedLink) {
            processedLinks.push(mappedLink);
          }
        }
      } else {
        // Regular link - just format it
        processedLinks.push(this.createGfaLink(link));
      }
    });

    // Remove duplicates
    return this.deduplicateLinks(processedLinks);
  }

  /**
   * Map a link involving a merged node to original nodes
   * @param {Object} link - The link to map
   * @param {Object} mergedNode - The merged node
   * @param {Object} otherNode - The other endpoint node
   * @param {string} mergedEnd - 'source' or 'target' - which end is merged
   * @returns {Object} Mapped link
   */
  mapMergedNodeLink(link, mergedNode, otherNode, mergedEnd) {
    const originalNodes = mergedNode.originalNodes || [];
    if (originalNodes.length === 0) return null;

    // Get the original node that this link should connect to
    const originalPathNode = link.originalPathNode;
    let targetOriginalNode = null;

    if (originalPathNode) {
      // Find the original node with this ID
      targetOriginalNode = originalNodes.find(n => n.id === originalPathNode);
    }

    // If not found, use first or last node based on orientation
    if (!targetOriginalNode) {
      if (mergedEnd === 'source') {
        // Source is merged - check orientation to determine which end
        targetOriginalNode = link.srcOrientation === '+' ?
          originalNodes[originalNodes.length - 1] : originalNodes[0];
      } else {
        // Target is merged - check orientation to determine which end
        targetOriginalNode = link.tgtOrientation === '+' ?
          originalNodes[0] : originalNodes[originalNodes.length - 1];
      }
    }

    if (!targetOriginalNode) return null;

    // Create new link with original node ID
    return {
      source: mergedEnd === 'source' ? targetOriginalNode.id : (otherNode?.id || link.source),
      target: mergedEnd === 'target' ? targetOriginalNode.id : (otherNode?.id || link.target),
      srcOrientation: link.srcOrientation || '+',
      tgtOrientation: link.tgtOrientation || '+',
      overlap: link.overlap || '*',
      gfaType: link.gfaType || 'link'
    };
  }

  /**
   * Map a link between two merged nodes
   * @param {Object} link - The link between merged nodes
   * @param {Object} sourceNode - Source merged node
   * @param {Object} targetNode - Target merged node
   * @returns {Object} Mapped link
   */
  mapMergedToMergedLink(link, sourceNode, targetNode) {
    const sourceOriginals = sourceNode.originalNodes || [];
    const targetOriginals = targetNode.originalNodes || [];

    if (sourceOriginals.length === 0 || targetOriginals.length === 0) return null;

    // Map based on orientations
    const sourceOriginal = link.srcOrientation === '+' ?
      sourceOriginals[sourceOriginals.length - 1] : sourceOriginals[0];
    const targetOriginal = link.tgtOrientation === '+' ?
      targetOriginals[0] : targetOriginals[targetOriginals.length - 1];

    return {
      source: sourceOriginal.id,
      target: targetOriginal.id,
      srcOrientation: link.srcOrientation || '+',
      tgtOrientation: link.tgtOrientation || '+',
      overlap: link.overlap || '*',
      gfaType: link.gfaType || 'link'
    };
  }

  /**
   * Create a segment node from node data
   * @param {Object} node - Node data
   * @returns {Object} Segment node
   */
  createSegmentNode(node) {
    return {
      id: node.id,
      seq: node.seq || '*',
      length: node.length || (node.seq && node.seq !== '*' ? node.seq.length : 1000),
      depth: node.depth || 1.0,
      LN: node.LN,
      DP: node.DP,
      KC: node.KC,
      RC: node.RC
    };
  }

  /**
   * Create a merged segment node with merge metadata
   * @param {Object} node - Merged node data
   * @returns {Object} Merged segment node with custom tags
   */
  createMergedSegmentNode(node) {
    // Store original nodes as a JSON string in a custom tag
    const originalNodesData = node.originalNodes || [];
    const originalLinksData = node.originalLinks || [];

    // Create compact representation of original nodes (just IDs and sequences)
    const compactNodes = originalNodesData.map(n => ({
      id: n.id,
      seq: n.seq || '*',
      length: n.length,
      depth: n.depth
    }));

    // Create compact representation of original links
    const compactLinks = originalLinksData.map(l => ({
      s: typeof l.source === 'object' ? l.source.id : l.source,
      t: typeof l.target === 'object' ? l.target.id : l.target,
      so: l.srcOrientation || '+',
      to: l.tgtOrientation || '+',
      o: l.overlap || '*'
    }));

    return {
      id: node.id,
      seq: node.seq || '*',
      length: node.totalLength || node.length || 1000,
      depth: node.averageDepth || node.depth || 1.0,
      LN: node.totalLength || node.length,
      DP: node.averageDepth || node.depth,
      // Custom tags for merged node metadata
      isMerged: true,
      mergedFrom: node.mergedFrom || [],
      pathName: node.pathName || '',
      originalNodes: compactNodes,
      originalLinks: compactLinks
    };
  }

  /**
   * Create a GFA link from link data
   * @param {Object} link - Link data
   * @returns {Object} GFA link
   */
  createGfaLink(link) {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;

    return {
      source: sourceId,
      target: targetId,
      srcOrientation: link.srcOrientation || '+',
      tgtOrientation: link.tgtOrientation || '+',
      overlap: link.overlap || '*',
      gfaType: link.gfaType || 'link'
    };
  }

  /**
   * Format a segment as GFA S line
   * @param {Object} node - Node to format
   * @param {boolean} includeOptionalTags - Include optional tags
   * @returns {string} GFA S line
   */
  formatSegment(node, includeOptionalTags) {
    let line = `S\t${node.id}\t${node.seq || '*'}`;

    if (includeOptionalTags) {
      // Add LN tag if available
      if (node.length && node.seq === '*') {
        line += `\tLN:i:${node.length}`;
      }

      // Add depth/coverage tags if available
      if (node.DP !== undefined && node.DP > 0) {
        line += `\tDP:f:${node.DP}`;
      } else if (node.depth !== undefined && node.depth > 0 && node.depth !== 1.0) {
        line += `\tDP:f:${node.depth}`;
      }

      // Add KC tag if available
      if (node.KC !== undefined) {
        line += `\tKC:i:${node.KC}`;
      }

      // Add RC tag if available
      if (node.RC !== undefined) {
        line += `\tRC:i:${node.RC}`;
      }

      // Add merged node metadata as custom tags
      if (node.isMerged) {
        line += `\tMG:Z:merged`;
        line += `\tMF:Z:${(node.mergedFrom || []).join(',')}`;
        if (node.pathName) {
          line += `\tPN:Z:${node.pathName}`;
        }
        // Store original nodes and links as JSON in custom tags
        if (node.originalNodes && node.originalNodes.length > 0) {
          const nodesJson = JSON.stringify(node.originalNodes);
          line += `\tON:J:${nodesJson}`;
        }
        if (node.originalLinks && node.originalLinks.length > 0) {
          const linksJson = JSON.stringify(node.originalLinks);
          line += `\tOL:J:${linksJson}`;
        }
      }
    }

    line += '\n';
    return line;
  }

  /**
   * Format a link as GFA L line
   * @param {Object} link - Link to format
   * @returns {string} GFA L line
   */
  formatLink(link) {
    const source = typeof link.source === 'object' ? link.source.id : link.source;
    const target = typeof link.target === 'object' ? link.target.id : link.target;
    const srcOri = link.srcOrientation || '+';
    const tgtOri = link.tgtOrientation || '+';
    const overlap = link.overlap || '*';

    return `L\t${source}\t${srcOri}\t${target}\t${tgtOri}\t${overlap}\n`;
  }

  /**
   * Remove duplicate links
   * @param {Array} links - Links to deduplicate
   * @returns {Array} Deduplicated links
   */
  deduplicateLinks(links) {
    const seen = new Set();
    const unique = [];

    links.forEach(link => {
      const key = `${link.source}\t${link.srcOrientation}\t${link.target}\t${link.tgtOrientation}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(link);
      }
    });

    return unique;
  }

  /**
   * Check if a node is a merged node
   * @param {Object} node - Node to check
   * @returns {boolean} True if merged node
   */
  isMergedNode(node) {
    return node && (
      node.gfaType === 'merged_segment' ||
      node.type === 'merged' ||
      node.mergedFrom !== undefined ||
      (node.originalNodes && node.originalNodes.length > 0)
    );
  }

  /**
   * Check if a node is a resolved node
   * @param {Object} node - Node to check
   * @returns {boolean} True if resolved node
   */
  isResolvedNode(node) {
    return node && (
      node.originalId !== undefined ||
      node.resolutionType !== undefined
    );
  }

  /**
   * Download GFA as file
   * @param {string} gfaText - GFA text content
   * @param {string} filename - Output filename
   */
  downloadGfaFile(gfaText, filename = 'graph.gfa') {
    const blob = new Blob([gfaText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

/**
 * Export current graph state to GFA format and download
 * @param {Array} nodes - Graph nodes
 * @param {Array} links - Graph links
 * @param {Object} options - Export options
 * @returns {Object} Export result
 */
export function exportGraphToGfa(nodes, links, options = {}) {
  const exporter = new GfaExporter();

  const gfaText = exporter.export(nodes, links, options);

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = options.filename || `graph-export-${timestamp}.gfa`;

  // Download the file
  exporter.downloadGfaFile(gfaText, filename);

  // Count segments and links
  const segmentCount = gfaText.split('\n').filter(line => line.startsWith('S\t')).length;
  const linkCount = gfaText.split('\n').filter(line => line.startsWith('L\t')).length;

  return {
    success: true,
    filename,
    segmentCount,
    linkCount,
    size: gfaText.length
  };
}
