// node-merger.js - ENHANCED: Automatic linear chain detection and merging

/**
 * NEW: Automatically find and merge linear chain of nodes starting from a selected node
 * @param {Object} selectedNode - The starting node for chain detection
 * @param {Array} nodes - All nodes in the graph
 * @param {Array} links - All links in the graph
 * @returns {Object} Result of the merge operation
 */
export function mergeLinearChainFromNode(selectedNode, nodes, links) {
  console.log(`\n🔍 === AUTOMATIC LINEAR CHAIN DETECTION ===`);
  console.log(`Starting from node: ${selectedNode.id}`);
  
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
 * A linear chain consists of nodes where each node has exactly 1 incoming and 1 outgoing connection
 * (except for the endpoints which can have 0 incoming or 0 outgoing)
 */
function findLinearChain(startNode, nodes, links) {
  console.log(`\n🔗 === FINDING LINEAR CHAIN FROM ${startNode.id} ===`);
  
  // Build adjacency information for all nodes
  const nodeConnections = buildNodeConnections(nodes, links);
  
  // Check if the start node is part of a linear chain
  const startConnections = nodeConnections.get(startNode.id);
  if (!startConnections) {
    console.log(`❌ Start node ${startNode.id} has no connections`);
    return [startNode];
  }
  
  console.log(`🔍 Start node ${startNode.id}: ${startConnections.incoming.length} in, ${startConnections.outgoing.length} out`);
  
  // If start node itself is branching, only return itself
  if (!isLinearNode(startNode.id, nodeConnections) && !isEndpointNode(startNode.id, nodeConnections)) {
    console.log(`❌ Start node ${startNode.id} is branching - returning single node`);
    return [startNode];
  }
  
  // Build chain in both directions from start node
  const chainNodes = [startNode];
  const visitedIds = new Set([startNode.id]);
  
  // Trace backwards
  let currentNode = startNode;
  while (true) {
    const prevNode = getLinearPreviousNode(currentNode, nodeConnections, nodes, visitedIds);
    if (!prevNode) break;
    
    chainNodes.unshift(prevNode);
    visitedIds.add(prevNode.id);
    currentNode = prevNode;
    
    console.log(`  ⬅️ Added ${prevNode.id} to start of chain`);
  }
  
  // Trace forwards
  currentNode = startNode;
  while (true) {
    const nextNode = getLinearNextNode(currentNode, nodeConnections, nodes, visitedIds);
    if (!nextNode) break;
    
    chainNodes.push(nextNode);
    visitedIds.add(nextNode.id);
    currentNode = nextNode;
    
    console.log(`  ➡️ Added ${nextNode.id} to end of chain`);
  }
  
  console.log(`📊 Final chain: ${chainNodes.map(n => n.id).join(' → ')}`);
  
  // Validate the final chain more carefully
  const isValid = validateLinearChainCarefully(chainNodes, nodeConnections);
  if (!isValid) {
    console.log(`❌ Chain validation failed - returning only start node`);
    return [startNode];
  }
  
  return chainNodes;
}

function validateLinearChainCarefully(chain, connections) {
  console.log(`✅ CAREFUL validation of chain with ${chain.length} nodes...`);
  
  if (chain.length === 0) {
    console.log(`❌ Empty chain`);
    return false;
  }
  
  if (chain.length === 1) {
    console.log(`✅ Single node chain is valid`);
    return true;
  }
  
  for (let i = 0; i < chain.length; i++) {
    const node = chain[i];
    const conn = connections.get(node.id);
    
    if (!conn) {
      console.log(`❌ Node ${node.id} has no connection info`);
      return false;
    }
    
    const inCount = conn.incoming.length;
    const outCount = conn.outgoing.length;
    
    console.log(`  📍 Node ${node.id} (position ${i + 1}/${chain.length}): ${inCount} in, ${outCount} out`);
    
    if (i === 0) {
      // First node: 0 or 1 incoming, exactly 1 outgoing (unless single node)
      if (chain.length === 1) {
        // Single node can have any configuration
        console.log(`    ✅ Single node: any configuration OK`);
      } else {
        if (outCount !== 1) {
          console.log(`    ❌ First node should have exactly 1 outgoing (has ${outCount})`);
          return false;
        }
        if (inCount > 1) {
          console.log(`    ❌ First node has too many incoming (${inCount})`);
          return false;
        }
        console.log(`    ✅ Valid chain start`);
      }
    } else if (i === chain.length - 1) {
      // Last node: exactly 1 incoming, 0 or 1 outgoing
      if (inCount !== 1) {
        console.log(`    ❌ Last node should have exactly 1 incoming (has ${inCount})`);
        return false;
      }
      if (outCount > 1) {
        console.log(`    ❌ Last node has too many outgoing (${outCount})`);
        return false;
      }
      console.log(`    ✅ Valid chain end`);
    } else {
      // Middle node: exactly 1 incoming, exactly 1 outgoing
      if (inCount !== 1 || outCount !== 1) {
        console.log(`    ❌ Middle node should have exactly 1 in, 1 out (has ${inCount} in, ${outCount} out)`);
        return false;
      }
      console.log(`    ✅ Valid chain middle`);
    }
  }
  
  console.log(`✅ Chain validation successful!`);
  return true;
}

function getLinearPreviousNode(currentNode, connections, nodes, visited) {
  const conn = connections.get(currentNode.id);
  if (!conn || conn.incoming.length !== 1) {
    return null; // No single incoming connection
  }
  
  const prevNodeId = conn.incoming[0].nodeId;
  if (visited.has(prevNodeId)) {
    return null; // Already visited (cycle)
  }
  
  const prevConnections = connections.get(prevNodeId);
  if (!prevConnections) {
    return null; // Previous node not found
  }
  
  // STRICT CHECK: Previous node must have exactly 1 outgoing connection to current node
  // OR be an endpoint (0 incoming, 1 outgoing)
  const isValidPrevious = 
    (prevConnections.outgoing.length === 1 && prevConnections.incoming.length <= 1) ||
    (prevConnections.outgoing.length === 1 && prevConnections.incoming.length === 0); // Start of chain
  
  if (!isValidPrevious) {
    console.log(`  ⚠️ Previous node ${prevNodeId} is branching (${prevConnections.incoming.length} in, ${prevConnections.outgoing.length} out) - stopping`);
    return null;
  }
  
  const prevNode = nodes.find(n => normalizeNodeId(n.id) === prevNodeId);
  return prevNode || null;
}

/**
 * Get the next linear node (more conservative)
 */
function getLinearNextNode(currentNode, connections, nodes, visited) {
  const conn = connections.get(currentNode.id);
  if (!conn || conn.outgoing.length !== 1) {
    return null; // No single outgoing connection
  }
  
  const nextNodeId = conn.outgoing[0].nodeId;
  if (visited.has(nextNodeId)) {
    return null; // Already visited (cycle)
  }
  
  const nextConnections = connections.get(nextNodeId);
  if (!nextConnections) {
    return null; // Next node not found
  }
  
  // STRICT CHECK: Next node must have exactly 1 incoming connection from current node
  // OR be an endpoint (1 incoming, 0 outgoing)
  const isValidNext = 
    (nextConnections.incoming.length === 1 && nextConnections.outgoing.length <= 1) ||
    (nextConnections.incoming.length === 1 && nextConnections.outgoing.length === 0); // End of chain
  
  if (!isValidNext) {
    console.log(`  ⚠️ Next node ${nextNodeId} is branching (${nextConnections.incoming.length} in, ${nextConnections.outgoing.length} out) - stopping`);
    return null;
  }
  
  const nextNode = nodes.find(n => normalizeNodeId(n.id) === nextNodeId);
  return nextNode || null;
}

/**
 * Build connection information for all nodes based on physical GFA connections
 */
function buildNodeConnections(nodes, links) {
  console.log(`📋 Building node connections from ${links.length} links...`);
  
  const connections = new Map();
  
  // Initialize all nodes
  nodes.forEach(node => {
    connections.set(node.id, {
      incoming: [], // Array of {nodeId, linkIndex, orientation}
      outgoing: []  // Array of {nodeId, linkIndex, orientation}
    });
  });
  
  // Process all links to build connections based on GFA semantics
  links.forEach((link, linkIndex) => {
    const sourceId = normalizeNodeId(link.source.id || link.source);
    const targetId = normalizeNodeId(link.target.id || link.target);
    const srcOrientation = link.srcOrientation || '+';
    const tgtOrientation = link.tgtOrientation || '+';
    
    if (!connections.has(sourceId) || !connections.has(targetId)) {
      return; // Skip links to non-existent nodes
    }
    
    // For GFA links, the physical connections depend on orientations:
    // - Positive orientation connects to the "outgoing" end (green subnode)
    // - Negative orientation connects to the "incoming" end (red subnode)
    
    // Source node connection
    if (srcOrientation === '+') {
      // Link goes out from source's outgoing end
      connections.get(sourceId).outgoing.push({
        nodeId: targetId,
        linkIndex: linkIndex,
        orientation: srcOrientation,
        targetOrientation: tgtOrientation
      });
    } else {
      // Link goes out from source's incoming end
      connections.get(sourceId).incoming.push({
        nodeId: targetId,
        linkIndex: linkIndex,
        orientation: srcOrientation,
        targetOrientation: tgtOrientation
      });
    }
    
    // Target node connection
    if (tgtOrientation === '+') {
      // Link comes into target's incoming end
      connections.get(targetId).incoming.push({
        nodeId: sourceId,
        linkIndex: linkIndex,
        orientation: tgtOrientation,
        sourceOrientation: srcOrientation
      });
    } else {
      // Link comes into target's outgoing end
      connections.get(targetId).outgoing.push({
        nodeId: sourceId,
        linkIndex: linkIndex,
        orientation: tgtOrientation,
        sourceOrientation: srcOrientation
      });
    }
  });
  
  // Log connection summary
  let linearNodes = 0;
  let branchingNodes = 0;
  let endpointNodes = 0;
  
  connections.forEach((conn, nodeId) => {
    const totalConnections = conn.incoming.length + conn.outgoing.length;
    const isLinear = isLinearNode(nodeId, connections);
    const isEndpoint = totalConnections === 1;
    
    if (isLinear && !isEndpoint) {
      linearNodes++;
    } else if (isEndpoint) {
      endpointNodes++;
    } else {
      branchingNodes++;
    }
    
    console.log(`  Node ${nodeId}: ${conn.incoming.length} in, ${conn.outgoing.length} out ${isLinear ? '(linear)' : '(branching)'}`);
  });
  
  console.log(`📊 Connection summary: ${linearNodes} linear, ${branchingNodes} branching, ${endpointNodes} endpoints`);
  
  return connections;
}

/**
 * Check if a node is linear (exactly 1 incoming and 1 outgoing, or endpoint)
 */
function isLinearNode(nodeId, connections) {
  const conn = connections.get(nodeId);
  if (!conn) return false;
  
  const inCount = conn.incoming.length;
  const outCount = conn.outgoing.length;
  
  // Linear node: exactly 1 in and 1 out, OR endpoint (exactly 1 total connection)
  return (inCount === 1 && outCount === 1) || (inCount + outCount === 1);
}


/**
 * Check if a node is an endpoint (has only 1 total connection)
 */
function isEndpointNode(nodeId, connections) {
  const conn = connections.get(nodeId);
  if (!conn) return false;
  
  const total = conn.incoming.length + conn.outgoing.length;
  return total === 1;
}

/**
 * Trace backwards from a node to find the start of the linear chain
 */
function traceChainBackwards(startNode, connections, nodes) {
  console.log(`⬅️ Tracing backwards from ${startNode.id}...`);
  
  let currentNode = startNode;
  const visited = new Set();
  
  while (true) {
    // Prevent infinite loops
    if (visited.has(currentNode.id)) {
      console.log(`🔄 Cycle detected at ${currentNode.id}, stopping backwards trace`);
      break;
    }
    visited.add(currentNode.id);
    
    const conn = connections.get(currentNode.id);
    if (!conn || conn.incoming.length === 0) {
      // No incoming connections - this is the start
      console.log(`🎯 Found chain start: ${currentNode.id} (no incoming connections)`);
      break;
    }
    
    if (conn.incoming.length > 1) {
      // Multiple incoming - this is a branch point, current node is the start
      console.log(`🌳 Found branch point: ${currentNode.id} (${conn.incoming.length} incoming), stopping here`);
      break;
    }
    
    // Single incoming connection - check if the previous node is also linear
    const prevNodeId = conn.incoming[0].nodeId;
    const prevConnections = connections.get(prevNodeId);
    
    if (!prevConnections) {
      console.log(`❌ Previous node ${prevNodeId} not found, stopping`);
      break;
    }
    
    if (prevConnections.outgoing.length > 1) {
      // Previous node has multiple outgoing - it's a branch point
      console.log(`🌳 Previous node ${prevNodeId} is branching (${prevConnections.outgoing.length} outgoing), stopping at current`);
      break;
    }
    
    // Move to previous node
    const prevNode = nodes.find(n => normalizeNodeId(n.id) === prevNodeId);
    if (!prevNode) {
      console.log(`❌ Previous node object ${prevNodeId} not found, stopping`);
      break;
    }
    
    console.log(`  ← Moving to ${prevNodeId}`);
    currentNode = prevNode;
  }
  
  return currentNode;
}

/**
 * Trace forwards from a node to build the complete linear chain
 */
function traceChainForwards(startNode, connections, nodes) {
  console.log(`➡️ Tracing forwards from ${startNode.id}...`);
  
  const chain = [startNode];
  let currentNode = startNode;
  const visited = new Set([startNode.id]);
  
  while (true) {
    const conn = connections.get(currentNode.id);
    if (!conn || conn.outgoing.length === 0) {
      // No outgoing connections - end of chain
      console.log(`🏁 End of chain: ${currentNode.id} (no outgoing connections)`);
      break;
    }
    
    if (conn.outgoing.length > 1) {
      // Multiple outgoing - this is a branch point
      console.log(`🌳 Branch point reached: ${currentNode.id} (${conn.outgoing.length} outgoing), stopping`);
      break;
    }
    
    // Single outgoing connection - check if the next node is also linear
    const nextNodeId = conn.outgoing[0].nodeId;
    
    // Prevent infinite loops
    if (visited.has(nextNodeId)) {
      console.log(`🔄 Cycle detected with ${nextNodeId}, stopping`);
      break;
    }
    
    const nextConnections = connections.get(nextNodeId);
    
    if (!nextConnections) {
      console.log(`❌ Next node ${nextNodeId} not found, stopping`);
      break;
    }
    
    if (nextConnections.incoming.length > 1) {
      // Next node has multiple incoming - it's a branch point
      console.log(`🌳 Next node ${nextNodeId} is branching (${nextConnections.incoming.length} incoming), stopping at current`);
      break;
    }
    
    // Move to next node
    const nextNode = nodes.find(n => normalizeNodeId(n.id) === nextNodeId);
    if (!nextNode) {
      console.log(`❌ Next node object ${nextNodeId} not found, stopping`);
      break;
    }
    
    console.log(`  → Adding ${nextNodeId} to chain`);
    chain.push(nextNode);
    visited.add(nextNodeId);
    currentNode = nextNode;
  }
  
  return chain;
}

/**
 * Validate that the found chain is indeed linear
 */
function validateLinearChain(chain, connections) {
  console.log(`✅ Validating linear chain of ${chain.length} nodes...`);
  
  for (let i = 0; i < chain.length; i++) {
    const node = chain[i];
    const conn = connections.get(node.id);
    
    if (!conn) {
      throw new Error(`Validation failed: Node ${node.id} has no connection info`);
    }
    
    const inCount = conn.incoming.length;
    const outCount = conn.outgoing.length;
    
    if (i === 0) {
      // First node: can have 0 or 1 incoming, must have 1 outgoing (unless single node)
      if (chain.length > 1 && outCount !== 1) {
        throw new Error(`Validation failed: First node ${node.id} should have 1 outgoing (has ${outCount})`);
      }
      if (inCount > 1) {
        throw new Error(`Validation failed: First node ${node.id} has too many incoming (${inCount})`);
      }
    } else if (i === chain.length - 1) {
      // Last node: must have 1 incoming, can have 0 or 1 outgoing
      if (inCount !== 1) {
        throw new Error(`Validation failed: Last node ${node.id} should have 1 incoming (has ${inCount})`);
      }
      if (outCount > 1) {
        throw new Error(`Validation failed: Last node ${node.id} has too many outgoing (${outCount})`);
      }
    } else {
      // Middle node: must have exactly 1 incoming and 1 outgoing
      if (inCount !== 1 || outCount !== 1) {
        throw new Error(`Validation failed: Middle node ${node.id} should have 1 in, 1 out (has ${inCount} in, ${outCount} out)`);
      }
    }
    
    console.log(`  ✓ Node ${node.id}: ${inCount} in, ${outCount} out (position ${i + 1}/${chain.length})`);
  }
  
  console.log(`✅ Chain validation successful!`);
}

/**
 * EXISTING FUNCTIONS - Keep all the existing merge functionality unchanged
 */

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
  
  console.log(`\n📄 Updating ${savedPaths.length} saved paths after merge...`);
  
  savedPaths.forEach((path, pathIndex) => {
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