// node-merger.js - SIMPLIFIED: Linear chain detection based on connection count only

/**
 * Automatically find and merge linear chain of nodes starting from a selected node
 * @param {Object} selectedNode - The starting node for chain detection
 * @param {Array} nodes - All nodes in the graph
 * @param {Array} links - All links in the graph
 * @returns {Object} Result of the merge operation
 */
export function mergeLinearChainFromNode(selectedNode, nodes, links) {
  console.log(`\n\n${'='.repeat(80)}`);
  console.log(`🔍 === AUTOMATIC LINEAR CHAIN DETECTION ===`);
  console.log(`Starting from node: ${selectedNode.id}`);
  console.log(`Total nodes in graph: ${nodes.length}`);
  console.log(`Total links in graph: ${links.length}`);
  console.log(`Sample link structure:`, links[0]);
  console.log(`${'='.repeat(80)}\n`);

  // Find the complete linear chain containing this node
  const linearChain = findLinearChain(selectedNode, nodes, links);
  
  if (linearChain.length < 2) {
    throw new Error(`Node ${selectedNode.id} is not part of a linear chain (found ${linearChain.length} nodes)`);
  }
  
  console.log(`📊 Found linear chain: ${linearChain.map(n => n.id).join(' → ')}`);
  
  // Create a path name for the merged chain
  const pathName = `Linear Chain: ${linearChain[0].id} → ${linearChain[linearChain.length - 1].id}`;
  
  // Use the existing merge function
  return mergeNodesFromPath(linearChain, nodes, links, pathName);
}

/**
 * Find the complete linear chain containing the given node
 */
function findLinearChain(startNode, nodes, links) {
  console.log(`\n🔗 === FINDING LINEAR CHAIN FROM ${startNode.id} ===`);

  // Build simple connection counts for all nodes
  const nodeConnections = buildNodeConnections(nodes, links);

  // Check if the start node is part of a linear chain
  const startNodeId = normalizeNodeId(startNode.id);
  const startConnections = nodeConnections.get(startNodeId);
  if (!startConnections) {
    console.log(`❌ Start node ${startNode.id} has no connections`);
    return [startNode];
  }

  const totalConns = startConnections.incoming.length + startConnections.outgoing.length;
  console.log(`🔍 Start node ${startNode.id}: ${startConnections.incoming.length} in, ${startConnections.outgoing.length} out (total: ${totalConns})`);

  if (startConnections.incoming.length > 0) {
    console.log(`  Incoming from: ${startConnections.incoming.map(c => c.nodeId).join(', ')}`);
  }
  if (startConnections.outgoing.length > 0) {
    console.log(`  Outgoing to: ${startConnections.outgoing.map(c => c.nodeId).join(', ')}`);
  }

  // If start node is branching (3+ connections), only return itself
  if (!isLinearOrEndpointNode(startNode.id, nodeConnections)) {
    console.log(`❌ Start node ${startNode.id} is branching (total connections: ${totalConns} > 2) - returning single node`);
    return [startNode];
  }

  // Build chain in both directions from start node
  const chainNodes = [startNode];
  const visitedIds = new Set([startNodeId]);
  
  // Trace backwards
  let currentNode = startNode;
  while (true) {
    const prevNode = getLinearPreviousNode(currentNode, nodeConnections, nodes, visitedIds);
    if (!prevNode) break;

    chainNodes.unshift(prevNode);
    visitedIds.add(normalizeNodeId(prevNode.id));
    currentNode = prevNode;

    console.log(`  ⬅️ Added ${prevNode.id} to start of chain`);
  }

  // Trace forwards
  currentNode = startNode;
  while (true) {
    const nextNode = getLinearNextNode(currentNode, nodeConnections, nodes, visitedIds);
    if (!nextNode) break;

    chainNodes.push(nextNode);
    visitedIds.add(normalizeNodeId(nextNode.id));
    currentNode = nextNode;

    console.log(`  ➡️ Added ${nextNode.id} to end of chain`);
  }
  
  console.log(`📊 Final chain: ${chainNodes.map(n => n.id).join(' → ')}`);
  
  // Simple validation
  if (chainNodes.length >= 2) {
    console.log(`✅ Chain validation successful!`);
  }
  
  return chainNodes;
}

/**
 * Build connection information for all nodes
 * For GFA: Uses PHYSICAL connections (red/green subnodes based on orientations)
 * For DOT: Uses LOGICAL connections (source→target)
 */
function buildNodeConnections(nodes, links) {
  console.log(`📋 Building connections from ${links.length} links...`);

  const connections = new Map();

  // Initialize all nodes - normalize IDs
  nodes.forEach(node => {
    const normalizedId = normalizeNodeId(node.id);
    connections.set(normalizedId, {
      incoming: [], // Red subnode (incoming) for GFA, or logical incoming
      outgoing: []  // Green subnode (outgoing) for GFA, or logical outgoing
    });
  });

  // Detect if this is GFA format by checking for orientation markers
  const isGFA = links.length > 0 && links.some(link =>
    link.srcOrientation !== undefined || link.tgtOrientation !== undefined
  );

  console.log(`📊 Format detected: ${isGFA ? 'GFA (using physical connections)' : 'DOT (using logical connections)'}`);

  // Process all links
  links.forEach((link, linkIndex) => {
    // Handle both string IDs and object references (after D3 processing)
    const sourceId = normalizeNodeId(
      link.source?.id !== undefined ? link.source.id : link.source
    );
    const targetId = normalizeNodeId(
      link.target?.id !== undefined ? link.target.id : link.target
    );

    if (!connections.has(sourceId) || !connections.has(targetId)) {
      console.log(`⚠️ Skipping link ${linkIndex}: source=${sourceId}, target=${targetId} (node not found)`);
      return; // Skip links to non-existent nodes
    }

    if (isGFA) {
      // GFA: Use PHYSICAL connections based on orientations
      // + orientation = green (outgoing) subnode
      // - orientation = red (incoming) subnode

      const srcOrientation = link.srcOrientation || '+';
      const tgtOrientation = link.tgtOrientation || '+';

      // Source node connection
      if (srcOrientation === '+') {
        // Source uses green (outgoing) subnode
        connections.get(sourceId).outgoing.push({ nodeId: targetId });
      } else {
        // Source uses red (incoming) subnode
        connections.get(sourceId).incoming.push({ nodeId: targetId });
      }

      // Target node connection
      if (tgtOrientation === '+') {
        // Target uses red (incoming) subnode
        connections.get(targetId).incoming.push({ nodeId: sourceId });
      } else {
        // Target uses green (outgoing) subnode
        connections.get(targetId).outgoing.push({ nodeId: sourceId });
      }
    } else {
      // DOT: Use LOGICAL connections (simple source→target)
      connections.get(sourceId).outgoing.push({ nodeId: targetId });
      connections.get(targetId).incoming.push({ nodeId: sourceId });
    }
  });
  
  // Show what we found - only log a summary
  const stats = { isolated: 0, endpoint: 0, linear: 0, branching: 0 };
  connections.forEach((conn) => {
    const inCount = conn.incoming.length;
    const outCount = conn.outgoing.length;

    if (inCount + outCount === 0) stats.isolated++;
    else if (inCount + outCount === 1) stats.endpoint++;
    else if (inCount === 1 && outCount === 1) stats.linear++;
    else if (inCount + outCount > 2) stats.branching++;
  });

  console.log(`\n📊 === CONNECTION SUMMARY ===`);
  console.log(`  Isolated: ${stats.isolated}, Endpoints: ${stats.endpoint}, Linear: ${stats.linear}, Branching: ${stats.branching}`);
  
  return connections;
}

// ULTRA SIMPLE: Just follow the chain until you hit branching
function getLinearPreviousNode(currentNode, connections, nodes, visited) {
  const currentId = normalizeNodeId(currentNode.id);
  const conn = connections.get(currentId);

  if (!conn) {
    console.log(`  ⚠️ No connection data for ${currentId}`);
    return null;
  }

  // Can go backwards if we have incoming connections (even if current is endpoint with 0 outgoing)
  if (conn.incoming.length === 0) {
    console.log(`  ⏹️ Stopping backwards: ${currentId} has no incoming connections`);
    return null;
  }

  if (conn.incoming.length > 1) {
    console.log(`  ⏹️ Stopping backwards: ${currentId} has ${conn.incoming.length} incoming (multiple paths converge here)`);
    return null;
  }

  const prevNodeId = conn.incoming[0].nodeId;

  if (visited.has(prevNodeId)) {
    console.log(`  🔄 Stopping backwards: ${prevNodeId} already visited (cycle detected)`);
    return null; // Cycle detection
  }

  const prevConnections = connections.get(prevNodeId);
  if (!prevConnections) {
    console.log(`  ❌ Stopping backwards: No connection data for ${prevNodeId}`);
    return null; // Node not found
  }

  // SIMPLE: Previous node can be part of chain if it's not branching
  const totalConnections = prevConnections.incoming.length + prevConnections.outgoing.length;

  if (totalConnections > 2) {
    console.log(`  🌳 Stopping backwards: ${prevNodeId} is branching (${totalConnections} total connections)`);
    return null; // This is a branching node, stop here
  }

  const prevNode = nodes.find(n => normalizeNodeId(n.id) === prevNodeId);

  if (!prevNode) {
    console.log(`  ❌ Stopping backwards: Node ${prevNodeId} not found in nodes array`);
  }

  return prevNode || null;
}

// ULTRA SIMPLE: Just follow the chain until you hit branching
function getLinearNextNode(currentNode, connections, nodes, visited) {
  const currentId = normalizeNodeId(currentNode.id);
  const conn = connections.get(currentId);

  if (!conn) {
    console.log(`  ⚠️ No connection data for ${currentId}`);
    return null;
  }

  // Can go forwards if we have outgoing connections (even if current is endpoint with 0 incoming)
  if (conn.outgoing.length === 0) {
    console.log(`  ⏹️ Stopping forwards: ${currentId} has no outgoing connections`);
    return null;
  }

  if (conn.outgoing.length > 1) {
    console.log(`  ⏹️ Stopping forwards: ${currentId} has ${conn.outgoing.length} outgoing (multiple paths diverge here)`);
    return null;
  }

  const nextNodeId = conn.outgoing[0].nodeId;

  if (visited.has(nextNodeId)) {
    console.log(`  🔄 Stopping forwards: ${nextNodeId} already visited (cycle detected)`);
    return null; // Cycle detection
  }

  const nextConnections = connections.get(nextNodeId);
  if (!nextConnections) {
    console.log(`  ❌ Stopping forwards: No connection data for ${nextNodeId}`);
    return null; // Node not found
  }

  // SIMPLE: Next node can be part of chain if it's not branching
  const totalConnections = nextConnections.incoming.length + nextConnections.outgoing.length;

  if (totalConnections > 2) {
    console.log(`  🌳 Stopping forwards: ${nextNodeId} is branching (${totalConnections} total connections)`);
    return null; // This is a branching node, stop here
  }

  const nextNode = nodes.find(n => normalizeNodeId(n.id) === nextNodeId);

  if (!nextNode) {
    console.log(`  ❌ Stopping forwards: Node ${nextNodeId} not found in nodes array`);
  }

  return nextNode || null;
}

/**
 * SIMPLIFIED: Check if a node can be part of a linear chain
 * Linear chain = any node with ≤ 2 total connections (not branching)
 */
function isLinearOrEndpointNode(nodeId, connections) {
  const normalizedId = normalizeNodeId(nodeId);
  const conn = connections.get(normalizedId);
  if (!conn) return false;

  const totalConnections = conn.incoming.length + conn.outgoing.length;

  // Can be part of linear chain if it has 1 or 2 connections (not branching)
  return totalConnections <= 2;
}

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
    const sourceId = normalizeNodeId(
      link.source?.id !== undefined ? link.source.id : link.source
    );
    const targetId = normalizeNodeId(
      link.target?.id !== undefined ? link.target.id : link.target
    );
    
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
    const sourceId = normalizeNodeId(
      link.source?.id !== undefined ? link.source.id : link.source
    );
    const targetId = normalizeNodeId(
      link.target?.id !== undefined ? link.target.id : link.target
    );
    
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
  
  const modifiedCount = savedPaths.length - updatedPaths.filter(p => !p.mergeUpdated).length;
  console.log(`📊 Updated ${modifiedCount} paths affected by merge`);
  
  return updatedPaths;
}