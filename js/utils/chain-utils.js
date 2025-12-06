// chain-utils.js - Utilities for working with chain segments

/**
 * Extract base node ID from a node ID (removes _segN suffix)
 * @param {string|number} nodeId - Node ID (may be a chain segment like "node1_seg0")
 * @returns {string} Base node ID without segment suffix
 */
export function getBaseNodeId(nodeId) {
  const id = String(nodeId);
  const match = id.match(/^(.+)_seg\d+$/);
  return match ? match[1] : id;
}

/**
 * Check if a node ID is a chain segment
 * @param {string|number} nodeId - Node ID to check
 * @returns {boolean} True if this is a chain segment ID
 */
export function isChainSegment(nodeId) {
  const id = String(nodeId);
  return /_seg\d+$/.test(id);
}

/**
 * Build a chain-aware node map that supports lookups by both base ID and segment ID
 * Maps base IDs to the first segment of each chain, and segment IDs to themselves
 *
 * @param {Array} nodes - Array of node objects
 * @returns {Map} Map where keys can be base IDs or segment IDs, values are node objects
 */
export function buildChainAwareNodeMap(nodes) {
  const nodeMap = new Map();
  const baseNodeToFirstSegment = new Map();

  // First pass: map all segments by their full ID
  nodes.forEach(node => {
    const nodeId = String(node.id);
    nodeMap.set(nodeId, node);

    // Track first segment for each base node
    const baseId = getBaseNodeId(nodeId);
    if (!baseNodeToFirstSegment.has(baseId)) {
      baseNodeToFirstSegment.set(baseId, node);
    }
  });

  // Second pass: add base node ID mappings (to first segment)
  baseNodeToFirstSegment.forEach((firstSegment, baseId) => {
    // Only add base ID mapping if it doesn't already exist as a real node
    if (!nodeMap.has(baseId)) {
      nodeMap.set(baseId, firstSegment);
    }
  });

  return nodeMap;
}

/**
 * Find all segments belonging to a base node
 * @param {string|number} baseNodeId - Base node ID
 * @param {Array} nodes - Array of all nodes
 * @returns {Array} Array of all segment nodes for this base node
 */
export function findAllSegments(baseNodeId, nodes) {
  const baseId = String(baseNodeId);
  return nodes.filter(node => getBaseNodeId(node.id) === baseId);
}

/**
 * Get the first segment of a node (or the node itself if not a chain)
 * @param {string|number} nodeId - Node ID (base or segment)
 * @param {Map} nodeMap - Chain-aware node map from buildChainAwareNodeMap
 * @returns {Object|null} First segment node or null if not found
 */
export function getFirstSegment(nodeId, nodeMap) {
  const id = String(nodeId);
  const baseId = getBaseNodeId(id);
  return nodeMap.get(baseId) || null;
}

/**
 * Get the last segment of a node (or the node itself if not a chain)
 * @param {string|number} nodeId - Node ID (base or segment)
 * @param {Array} nodes - Array of all nodes
 * @returns {Object|null} Last segment node or null if not found
 */
export function getLastSegment(nodeId, nodes) {
  const baseId = getBaseNodeId(String(nodeId));
  const segments = findAllSegments(baseId, nodes);

  if (segments.length === 0) return null;

  // Find the segment with the highest number
  const numbered = segments
    .map(seg => {
      const match = String(seg.id).match(/_seg(\d+)$/);
      return {
        node: seg,
        segNum: match ? parseInt(match[1]) : -1
      };
    })
    .filter(item => item.segNum >= 0);

  if (numbered.length === 0) {
    // Not a chain, return the first (only) segment
    return segments[0];
  }

  // Return segment with highest number
  numbered.sort((a, b) => b.segNum - a.segNum);
  return numbered[0].node;
}
