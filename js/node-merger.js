// node-merger.js - Node merging functionality for web-based Bandage tool

/**
 * Merge selected nodes from a path into a single node
 * @param {Array} pathNodes - Array of node objects from the selected path
 * @param {Array} nodes - All nodes in the graph
 * @param {Array} links - All links in the graph
 * @param {String} pathName - Name of the path being merged
 * @returns {Object} Result of the merge operation
 */
export function mergeNodesFromPath(pathNodes, nodes, links, pathName = 'Merged Path') {
  if (!pathNodes || pathNodes.length < 2) {
    throw new Error('At least 2 nodes are required for merging');
  }

  console.log(`Merging ${pathNodes.length} nodes: ${pathNodes.map(n => n.id).join(' → ')}`);
  
  // Create the merged node ID
  const mergedNodeId = generateMergedNodeId(pathNodes);
  
  // Collect all external connections (edges that connect to nodes outside the path)
  const externalConnections = collectExternalConnections(pathNodes, links);
  
  console.log(`Found ${externalConnections.length} external connections to preserve`);
  
  // Create the new merged node with original data stored
  const mergedNode = createMergedNode(pathNodes, mergedNodeId, pathName, links);
  
  // Remove original nodes and their internal links
  const updatedNodes = removeOriginalNodes(nodes, pathNodes);
  const updatedLinks = removeInternalLinks(links, pathNodes);
  
  // Add the merged node
  updatedNodes.push(mergedNode);
  
  // Create new links for external connections
  const newLinks = createMergedNodeLinks(externalConnections, mergedNodeId);
  updatedLinks.push(...newLinks);
  
  console.log(`Merge complete: Created node ${mergedNodeId} with ${newLinks.length} connections`);
  
  return {
    success: true,
    mergedNode: mergedNode,
    mergedNodeId: mergedNodeId,
    originalNodeIds: pathNodes.map(n => n.id),
    newNodes: updatedNodes,
    newLinks: updatedLinks,
    externalConnections: externalConnections.length,
    removedNodes: pathNodes.length,
    pathName: pathName
  };
}

/**
 * Generate a unique ID for the merged node
 */
function generateMergedNodeId(pathNodes) {
  const nodeIds = pathNodes.map(n => n.id).join('_');
  const timestamp = Date.now().toString().slice(-6); // Last 6 digits
  return `MERGED_${nodeIds}_${timestamp}`;
}

/**
 * Collect all external connections (links that go outside the path)
 */
function collectExternalConnections(pathNodes, links) {
  const pathNodeIds = new Set(pathNodes.map(n => normalizeNodeId(n.id)));
  const externalConnections = [];
  
  links.forEach((link, linkIndex) => {
    const sourceId = normalizeNodeId(link.source.id || link.source);
    const targetId = normalizeNodeId(link.target.id || link.target);
    
    const sourceInPath = pathNodeIds.has(sourceId);
    const targetInPath = pathNodeIds.has(targetId);
    
    // External connection: one end in path, one end outside
    if (sourceInPath && !targetInPath) {
      externalConnections.push({
        type: 'outgoing',
        originalLink: link,
        linkIndex: linkIndex,
        pathNodeId: sourceId,
        externalNodeId: targetId,
        srcOrientation: link.srcOrientation || '+',
        tgtOrientation: link.tgtOrientation || '+',
        overlap: link.overlap || '*'
      });
    } else if (!sourceInPath && targetInPath) {
      externalConnections.push({
        type: 'incoming',
        originalLink: link,
        linkIndex: linkIndex,
        pathNodeId: targetId,
        externalNodeId: sourceId,
        srcOrientation: link.srcOrientation || '+',
        tgtOrientation: link.tgtOrientation || '+',
        overlap: link.overlap || '*'
      });
    }
  });
  
  console.log(`📊 External connections breakdown:`);
  const incoming = externalConnections.filter(conn => conn.type === 'incoming').length;
  const outgoing = externalConnections.filter(conn => conn.type === 'outgoing').length;
  console.log(`  - Incoming: ${incoming}`);
  console.log(`  - Outgoing: ${outgoing}`);
  
  return externalConnections;
}

/**
 * Create the merged node with combined properties
 */
function createMergedNode(pathNodes, mergedNodeId, pathName, originalLinks = []) {
  // Calculate combined properties
  const totalLength = pathNodes.reduce((sum, node) => sum + (node.length || 1000), 0);
  const avgDepth = pathNodes.reduce((sum, node) => sum + (node.depth || 1.0), 0) / pathNodes.length;
  
  // Get the path node IDs for filtering links
  const pathNodeIds = new Set(pathNodes.map(n => String(n.id)));
  
  // Store ALL original links between these nodes for sequence reconstruction
  const storedLinks = (originalLinks || []).filter(link => {
    const sourceId = String(link.source.id || link.source);
    const targetId = String(link.target.id || link.target);
    return pathNodeIds.has(sourceId) && pathNodeIds.has(targetId);
  });
  
  const mergedNode = {
    id: mergedNodeId,
    length: totalLength,
    depth: avgDepth,
    seq: '*',
    gfaType: 'merged_segment',
    mergedFrom: pathNodes.map(n => n.id),
    pathName: pathName,
    
    // Store complete original data for sequence reconstruction
    originalNodes: pathNodes,  // Store the actual node objects
    originalLinks: storedLinks, // Store the actual link objects
    
    // Positioning
    x: pathNodes.reduce((sum, n) => sum + (n.x || 0), 0) / pathNodes.length,
    y: pathNodes.reduce((sum, n) => sum + (n.y || 0), 0) / pathNodes.length,
    vx: 0,
    vy: 0
  };
  
  console.log(`Created merged node with ${pathNodes.length} original nodes and ${storedLinks.length} original links stored`);
  return mergedNode;
}

/**
 * Remove original nodes from the node array
 */
function removeOriginalNodes(nodes, pathNodes) {
  const pathNodeIds = new Set(pathNodes.map(n => normalizeNodeId(n.id)));
  return nodes.filter(node => !pathNodeIds.has(normalizeNodeId(node.id)));
}

/**
 * Remove internal links (links between nodes in the path) and external links to removed nodes
 */
function removeInternalLinks(links, pathNodes) {
  const pathNodeIds = new Set(pathNodes.map(n => normalizeNodeId(n.id)));
  
  return links.filter(link => {
    const sourceId = normalizeNodeId(link.source.id || link.source);
    const targetId = normalizeNodeId(link.target.id || link.target);
    
    const sourceInPath = pathNodeIds.has(sourceId);
    const targetInPath = pathNodeIds.has(targetId);
    
    // Keep only links that don't involve path nodes at all, or are external connections
    // External connections will be recreated with the merged node
    return !sourceInPath && !targetInPath;
  });
}

/**
 * Create new links connecting external nodes to the merged node
 */
function createMergedNodeLinks(externalConnections, mergedNodeId) {
  const newLinks = [];
  
  externalConnections.forEach(connection => {
    let newLink;
    
    if (connection.type === 'incoming') {
      // External node → Merged node
      newLink = {
        source: connection.externalNodeId,
        target: mergedNodeId,
        srcOrientation: connection.srcOrientation,
        tgtOrientation: connection.tgtOrientation,
        overlap: connection.overlap,
        gfaType: 'link',
        mergedConnection: true,
        originalPathNode: connection.pathNodeId
      };
    } else {
      // Merged node → External node
      newLink = {
        source: mergedNodeId,
        target: connection.externalNodeId,
        srcOrientation: connection.srcOrientation,
        tgtOrientation: connection.tgtOrientation,
        overlap: connection.overlap,
        gfaType: 'link',
        mergedConnection: true,
        originalPathNode: connection.pathNodeId
      };
    }
    
    newLinks.push(newLink);
    console.log(`🔗 Created ${connection.type} link: ${newLink.source} → ${newLink.target}`);
  });
  
  return newLinks;
}

/**
 * Export sequence for a merged node using the existing sequence exporter
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
    const { exportPathSequence } = await import('./sequence-exporter.js');
    exportPathSequence(pathData, originalNodes, originalLinks);
    console.log(`✅ Successfully exported merged node sequence`);
  } catch (error) {
    console.error(`❌ Error exporting merged node sequence:`, error);
    throw error;
  }
}

/**
 * Check if a node is a merged node
 */
export function isMergedNode(node) {
  return node && node.gfaType === 'merged_segment' && node.mergedFrom;
}

/**
 * Get display information for a merged node (for info panel)
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
 * Utility function to normalize node IDs
 */
function normalizeNodeId(nodeId) {
  return String(nodeId).trim();
}

/**
 * Update saved paths after node merging to replace merged nodes
 */
export function updatePathsAfterMerge(savedPaths, mergeResult) {
  if (!mergeResult.success) return savedPaths;
  
  const { mergedNodeId, originalNodeIds } = mergeResult;
  const updatedPaths = [];
  
  console.log(`\n🔄 Updating ${savedPaths.length} saved paths after merge...`);
  
  savedPaths.forEach((path, pathIndex) => {
    const pathNodeIds = path.sequence.split(',').map(id => id.trim());
    let pathModified = false;
    let newSequence = [...pathNodeIds];
    
    // Check if this path contains any of the merged nodes
    const hasOriginalNodes = originalNodeIds.some(origId => 
      pathNodeIds.includes(String(origId))
    );
    
    if (hasOriginalNodes) {
      console.log(`  📝 Updating path "${path.name}": contains merged nodes`);
      
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
  
  const modifiedCount = savedPaths.length - updatedPaths.filter(p => !p.mergeUpdated).length;
  console.log(`📊 Updated ${modifiedCount} paths affected by merge`);
  
  return updatedPaths;
}