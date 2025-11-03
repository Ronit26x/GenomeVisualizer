// node-merger-utils.js - Utility functions for working with merged nodes
// Extracted from legacy node-merger.js for use with MVC architecture

/**
 * Check if a node is a merged node
 * @param {Object} node - Node object to check
 * @returns {boolean} True if node is a merged node
 */
export function isMergedNode(node) {
  return node && node.gfaType === 'merged_segment' && node.mergedFrom;
}

/**
 * Get display information for a merged node (for info panel)
 * @param {Object} mergedNode - Merged node object
 * @returns {Object|null} Info object or null if not a merged node
 */
export function getMergedNodeInfo(mergedNode) {
  if (!isMergedNode(mergedNode)) {
    return null;
  }

  return {
    id: mergedNode.id,
    type: 'Merged Node',
    originalNodes: mergedNode.mergedFrom,
    nodeCount: mergedNode.mergedFrom.length,
    totalLength: mergedNode.length,
    averageDepth: mergedNode.depth,
    pathName: mergedNode.pathName,
    canExportSequence: true
  };
}

/**
 * Export sequence for a merged node using the existing sequence exporter
 * @param {Object} mergedNode - Merged node object
 * @param {Array} originalNodes - Original node array (for sequence reconstruction)
 * @param {Array} originalLinks - Original link array (for sequence reconstruction)
 */
export async function exportMergedNodeSequence(mergedNode, originalNodes, originalLinks) {
  if (!mergedNode || !mergedNode.mergedFrom) {
    throw new Error('Not a merged node');
  }

  console.log(`\n📤 === EXPORTING MERGED NODE SEQUENCE ===`);
  console.log(`🆔 Merged node: ${mergedNode.id}`);
  console.log(`📋 Original nodes: ${mergedNode.mergedFrom.join(' → ')}`);

  // Reconstruct the original path data for the sequence exporter
  const pathData = {
    name: `${mergedNode.pathName || 'Merged Node'} Sequence`,
    sequence: mergedNode.mergedFrom.join(','),
    nodes: new Set(mergedNode.mergedFrom),
    edges: new Set() // Will be recalculated by exporter
  };

  // Use the existing sequence exporter
  try {
    const { exportPathSequence } = await import('./SequenceExporter.js');
    exportPathSequence(pathData, originalNodes, originalLinks);
    console.log(`✅ Successfully exported merged node sequence`);
  } catch (error) {
    console.error(`❌ Error exporting merged node sequence:`, error);
    throw error;
  }
}

/**
 * Update saved paths after node merging to replace merged nodes
 * @param {Array} savedPaths - Array of saved path objects
 * @param {Object} mergeResult - Result from NodeMerger.execute()
 * @returns {Array} Updated paths array
 */
export function updatePathsAfterMerge(savedPaths, mergeResult) {
  if (!mergeResult.success && !mergeResult.mergedNodeId) {
    return savedPaths;
  }

  const { mergedNodeId, originalNodeIds } = mergeResult;
  const updatedPaths = [];

  console.log(`\n📄 Updating ${savedPaths.length} saved paths after merge...`);

  savedPaths.forEach((path) => {
    const pathNodeIds = path.sequence.split(',').map(id => id.trim());
    let pathModified = false;
    let newSequence = [...pathNodeIds];

    // Check if this path contains any of the merged nodes
    const hasOriginalNodes = originalNodeIds.some(origId =>
      pathNodeIds.includes(String(origId))
    );

    if (hasOriginalNodes) {
      console.log(`  🔍 Updating path "${path.name}": contains merged nodes`);

      // Replace all occurrences of original nodes with the merged node
      newSequence = pathNodeIds.map(nodeId => {
        if (originalNodeIds.includes(nodeId) || originalNodeIds.includes(Number(nodeId))) {
          pathModified = true;
          return mergedNodeId;
        }
        return nodeId;
      });

      // Remove consecutive duplicates (if path had multiple merged nodes in sequence)
      const deduplicatedSequence = [];
      let lastNode = null;
      newSequence.forEach(nodeId => {
        if (nodeId !== lastNode) {
          deduplicatedSequence.push(nodeId);
          lastNode = nodeId;
        }
      });

      if (pathModified) {
        const updatedPath = {
          ...path,
          sequence: deduplicatedSequence.join(','),
          nodes: new Set(deduplicatedSequence),
          lastUpdated: new Date(),
          updateReason: `Nodes merged: ${originalNodeIds.join(', ')} → ${mergedNodeId}`,
          mergeUpdated: true
        };

        // Recalculate edges for the updated path
        updatedPath.edges = new Set(); // Will be recalculated when path is displayed

        updatedPaths.push(updatedPath);
        console.log(`    ✅ Updated to: ${updatedPath.sequence}`);
      } else {
        updatedPaths.push(path);
      }
    } else {
      // Path not affected by merge
      updatedPaths.push(path);
    }
  });

  const modifiedCount = updatedPaths.filter(p => p.mergeUpdated).length;
  console.log(`📊 Updated ${modifiedCount} paths affected by merge`);

  return updatedPaths;
}
