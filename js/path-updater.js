// path-updater.js - System to update paths after vertex resolution

/**
 * Updates all saved paths after a vertex resolution operation
 * @param {Array} savedPaths - Array of saved path objects
 * @param {Object} resolutionData - Data about the resolution operation
 * @returns {Array} Updated paths array
 */
export function updatePathsAfterResolution(savedPaths, resolutionData) {
  const { originalVertex, newVertices, resolutionType } = resolutionData;
  const updatedPaths = [];
  
  console.log(`=== UPDATING PATHS AFTER ${resolutionType.toUpperCase()} RESOLUTION ===`);
  console.log(`Original vertex: ${originalVertex.id}`);
  console.log(`New vertices: ${newVertices.map(v => v.id).join(', ')}`);
  
  savedPaths.forEach((path, pathIndex) => {
    const pathNodes = Array.from(path.nodes);
    const coreIndex = pathNodes.indexOf(originalVertex.id);
    
    if (coreIndex === -1) {
      // Path doesn't contain the resolved vertex, keep as-is
      updatedPaths.push({ ...path });
      console.log(`Path "${path.name}": No update needed (doesn't contain ${originalVertex.id})`);
      return;
    }
    
    console.log(`Path "${path.name}": Contains ${originalVertex.id} at position ${coreIndex}`);
    
    // Determine the replacement vertex based on path flow
    const replacement = findReplacementVertex(
      pathNodes, 
      coreIndex, 
      newVertices, 
      resolutionType
    );
    
    if (!replacement) {
      console.warn(`Path "${path.name}": Could not find suitable replacement, removing path`);
      return; // Skip this path (remove it)
    }
    
    // Create updated path
    const updatedSequence = [...pathNodes];
    updatedSequence[coreIndex] = replacement.id;
    
    const updatedPath = {
      ...path,
      sequence: updatedSequence.join(','),
      nodes: new Set(updatedSequence),
      // Edges will be recalculated
      edges: new Set(),
      lastUpdated: new Date(),
      updateReason: `Vertex ${originalVertex.id} resolved → ${replacement.id}`,
      originalCoreVertex: originalVertex.id
    };
    
    // Recalculate edges for the updated path
    recalculatePathEdges(updatedPath, window.links);
    
    updatedPaths.push(updatedPath);
    console.log(`Path "${path.name}": Updated ${originalVertex.id} → ${replacement.id}`);
  });
  
  console.log(`Path update complete: ${savedPaths.length} → ${updatedPaths.length} paths`);
  return updatedPaths;
}

/**
 * Finds the appropriate replacement vertex based on path flow
 */
function findReplacementVertex(pathNodes, coreIndex, newVertices, resolutionType) {
  const coreId = pathNodes[coreIndex];
  const prevNodeId = coreIndex > 0 ? pathNodes[coreIndex - 1] : null;
  const nextNodeId = coreIndex < pathNodes.length - 1 ? pathNodes[coreIndex + 1] : null;
  
  console.log(`  Finding replacement for flow: ${prevNodeId || 'START'} → ${coreId} → ${nextNodeId || 'END'}`);
  
  if (resolutionType === 'logical') {
    return findLogicalReplacement(prevNodeId, nextNodeId, newVertices);
  } else if (resolutionType === 'physical') {
    return findPhysicalReplacement(prevNodeId, nextNodeId, newVertices);
  }
  
  return null;
}

/**
 * Find replacement for logical resolution (based on pathDescription)
 */
function findLogicalReplacement(prevNodeId, nextNodeId, newVertices) {
  // For logical resolution, match the path description pattern
  const expectedPattern = `${prevNodeId || 'START'} → ${nextNodeId || 'END'}`;
  
  for (const vertex of newVertices) {
    if (vertex.pathDescription === expectedPattern) {
      console.log(`  Logical match found: ${vertex.id} (${vertex.pathDescription})`);
      return vertex;
    }
  }
  
  // Fallback: try partial matches
  for (const vertex of newVertices) {
    const desc = vertex.pathDescription || '';
    
    // Check if the path flow matches what this vertex represents
    if (prevNodeId && nextNodeId) {
      // Middle of path - need exact match
      if (desc.includes(prevNodeId) && desc.includes(nextNodeId)) {
        console.log(`  Logical partial match: ${vertex.id} (${desc})`);
        return vertex;
      }
    } else if (prevNodeId && !nextNodeId) {
      // End of path - need incoming match
      if (desc.includes(prevNodeId) && desc.includes('End')) {
        console.log(`  Logical end match: ${vertex.id} (${desc})`);
        return vertex;
      }
    } else if (!prevNodeId && nextNodeId) {
      // Start of path - need outgoing match
      if (desc.includes('Start') && desc.includes(nextNodeId)) {
        console.log(`  Logical start match: ${vertex.id} (${desc})`);
        return vertex;
      }
    }
  }
  
  console.log(`  No logical match found for ${prevNodeId || 'START'} → ${nextNodeId || 'END'}`);
  return newVertices[0]; // Fallback to first vertex
}

/**
 * Find replacement for physical resolution (based on actual edge connections)
 */
function findPhysicalReplacement(prevNodeId, nextNodeId, newVertices) {
  // For physical resolution, check actual edge connections
  for (const vertex of newVertices) {
    const hasIncomingFromPrev = prevNodeId ? 
      hasDirectEdge(prevNodeId, vertex.id, window.links) : true;
    const hasOutgoingToNext = nextNodeId ? 
      hasDirectEdge(vertex.id, nextNodeId, window.links) : true;
    
    if (hasIncomingFromPrev && hasOutgoingToNext) {
      console.log(`  Physical match found: ${vertex.id} (edges: ${prevNodeId || 'START'} → ${vertex.id} → ${nextNodeId || 'END'})`);
      return vertex;
    }
  }
  
  console.log(`  No physical match found for ${prevNodeId || 'START'} → ${nextNodeId || 'END'}`);
  return newVertices[0]; // Fallback to first vertex
}

/**
 * Check if there's a direct edge between two vertices
 */
function hasDirectEdge(sourceId, targetId, links) {
  return links.some(link => {
    const linkSourceId = String(link.source.id || link.source);
    const linkTargetId = String(link.target.id || link.target);
    return (linkSourceId === sourceId && linkTargetId === targetId) ||
           (linkSourceId === targetId && linkTargetId === sourceId);
  });
}

/**
 * Recalculate edges for an updated path
 */
function recalculatePathEdges(updatedPath, links) {
  const nodeIds = updatedPath.sequence.split(',').map(id => id.trim());
  const pathEdges = new Set();
  
  // Find edges between consecutive nodes
  for (let i = 0; i < nodeIds.length - 1; i++) {
    const sourceId = nodeIds[i];
    const targetId = nodeIds[i + 1];
    
    links.forEach((link, index) => {
      const linkSourceId = String(link.source.id || link.source);
      const linkTargetId = String(link.target.id || link.target);
      
      if ((linkSourceId === sourceId && linkTargetId === targetId) ||
          (linkSourceId === targetId && linkTargetId === sourceId)) {
        pathEdges.add(index);
      }
    });
  }
  
  updatedPath.edges = pathEdges;
  console.log(`  Recalculated ${pathEdges.size} edges for updated path`);
}

/**
 * Show a summary of path updates to the user
 */
export function showPathUpdateSummary(originalPaths, updatedPaths, originalVertexId) {
  const affectedPaths = originalPaths.filter(path => 
    Array.from(path.nodes).includes(originalVertexId)
  );
  
  const removedCount = affectedPaths.length - updatedPaths.filter(path => 
    path.originalCoreVertex === originalVertexId
  ).length;
  
  const message = [
    `Path Update Summary:`,
    `• ${affectedPaths.length} paths contained vertex ${originalVertexId}`,
    `• ${affectedPaths.length - removedCount} paths successfully updated`,
    removedCount > 0 ? `• ${removedCount} paths removed (no valid replacement found)` : null,
    `• ${originalPaths.length - affectedPaths.length} paths unaffected`
  ].filter(Boolean).join('\n');
  
  console.log(message);
  
  // Log details of each updated path
  updatedPaths.forEach(path => {
    if (path.originalCoreVertex === originalVertexId) {
      console.log(`  Updated: "${path.name}" - ${path.updateReason}`);
    }
  });
  
  return message;
}