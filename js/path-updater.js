// path-updater.js - FULL DEBUG: Show exactly what edges exist

/**
 * Updates all saved paths after a vertex resolution operation
 */
export function updatePathsAfterResolution(savedPaths, resolutionData) {
  const { originalVertex, newVertices, resolutionType } = resolutionData;
  const updatedPaths = [];
  
  console.log(`=== FULL DEBUG PATH UPDATE ===`);
  console.log(`Original vertex: "${originalVertex.id}"`);
  console.log(`New vertices: ${newVertices.map(v => v.id).join(', ')}`);
  
  // FIRST: Show the complete graph state
  debugGraphState();
  
  savedPaths.forEach((path, pathIndex) => {
    const pathSequence = path.sequence.split(',').map(id => id.trim());
    const resolvedIndex = pathSequence.findIndex(id => normalizeId(id) === normalizeId(originalVertex.id));
    
    if (resolvedIndex === -1) {
      updatedPaths.push({ ...path });
      return;
    }
    
    console.log(`\n=== DEBUGGING PATH "${path.name}" ===`);
    console.log(`Original sequence: [${pathSequence.map(id => `"${id}"`).join(', ')}]`);
    console.log(`Resolved vertex: "${originalVertex.id}" at index ${resolvedIndex}`);
    
    // Show what connections we need for this path
    debugRequiredConnections(pathSequence, resolvedIndex);
    
    // Try each replacement vertex with full debugging
    let foundReplacement = null;
    
    for (let i = 0; i < newVertices.length; i++) {
      const newVertex = newVertices[i];
      const testSequence = [...pathSequence];
      testSequence[resolvedIndex] = newVertex.id;
      
      console.log(`\n--- TESTING REPLACEMENT ${i + 1}/${newVertices.length}: "${newVertex.id}" ---`);
      console.log(`Test sequence: [${testSequence.map(id => `"${id}"`).join(', ')}]`);
      
      const isValid = debugPathValidation(testSequence);
      
      if (isValid) {
        console.log(`✓ FOUND VALID REPLACEMENT: ${newVertex.id}`);
        foundReplacement = newVertex;
        break;
      } else {
        console.log(`✗ INVALID REPLACEMENT: ${newVertex.id}`);
      }
    }
    
    if (foundReplacement) {
      const updatedSequence = [...pathSequence];
      updatedSequence[resolvedIndex] = foundReplacement.id;
      
      const updatedPath = {
        ...path,
        sequence: updatedSequence.join(','),
        nodes: new Set(updatedSequence),
        edges: new Set(),
        lastUpdated: new Date(),
        updateReason: `${originalVertex.id} → ${foundReplacement.id}`,
        originalCoreVertex: originalVertex.id
      };
      
      recalculatePathEdges(updatedPath);
      updatedPaths.push(updatedPath);
      
      console.log(`✓ PATH SUCCESSFULLY UPDATED`);
    } else {
      console.log(`✗ NO VALID REPLACEMENT FOUND - PATH WILL BE REMOVED`);
    }
  });
  
  return updatedPaths;
}

/**
 * Show complete graph state for debugging
 */
function debugGraphState() {
  console.log(`\n=== GRAPH STATE DEBUG ===`);
  
  if (!window.nodes) {
    console.log(`ERROR: No window.nodes available`);
    return;
  }
  
  if (!window.links) {
    console.log(`ERROR: No window.links available`);
    return;
  }
  
  console.log(`Total nodes: ${window.nodes.length}`);
  console.log(`Total links: ${window.links.length}`);
  
  // Show all nodes
  console.log(`\nAll nodes in graph:`);
  window.nodes.forEach((node, i) => {
    console.log(`  ${i}: "${node.id}" (type: ${typeof node.id})`);
  });
  
  // Show all links
  console.log(`\nAll links in graph:`);
  window.links.forEach((link, i) => {
    const sourceId = link.source.id || link.source;
    const targetId = link.target.id || link.target;
    console.log(`  ${i}: "${sourceId}" → "${targetId}" (types: ${typeof sourceId}, ${typeof targetId})`);
  });
}

/**
 * Debug what connections are required for this path
 */
function debugRequiredConnections(pathSequence, resolvedIndex) {
  console.log(`\nRequired connections for path validation:`);
  
  for (let i = 0; i < pathSequence.length - 1; i++) {
    const nodeA = pathSequence[i];
    const nodeB = pathSequence[i + 1];
    
    if (i === resolvedIndex - 1) {
      console.log(`  ${i}: "${nodeA}" → [RESOLVED_VERTEX] (connection FROM previous)`);
    } else if (i === resolvedIndex) {
      console.log(`  ${i}: [RESOLVED_VERTEX] → "${nodeB}" (connection TO next)`);
    } else {
      console.log(`  ${i}: "${nodeA}" → "${nodeB}" (normal connection)`);
    }
  }
}

/**
 * Debug path validation with detailed edge checking
 */
function debugPathValidation(testSequence) {
  console.log(`Validating path: [${testSequence.map(id => `"${id}"`).join(', ')}]`);
  
  if (testSequence.length < 2) {
    console.log(`Single node path - automatically valid`);
    return true;
  }
  
  // Check each consecutive pair
  for (let i = 0; i < testSequence.length - 1; i++) {
    const nodeA = normalizeId(testSequence[i]);
    const nodeB = normalizeId(testSequence[i + 1]);
    
    console.log(`\n  Checking connection ${i}: "${nodeA}" → "${nodeB}"`);
    
    // Find all edges involving these nodes
    const relevantEdges = findRelevantEdges(nodeA, nodeB);
    
    if (relevantEdges.length === 0) {
      console.log(`    ✗ NO EDGES FOUND between these nodes`);
      return false;
    } else {
      console.log(`    ✓ Found ${relevantEdges.length} relevant edge(s):`);
      relevantEdges.forEach((edge, idx) => {
        console.log(`      ${idx + 1}. Index ${edge.index}: "${edge.source}" → "${edge.target}"`);
      });
    }
  }
  
  console.log(`  ✓ All connections verified`);
  return true;
}

/**
 * Find all edges that could connect two nodes
 */
function findRelevantEdges(nodeA, nodeB) {
  if (!window.links) return [];
  
  const normalizedA = normalizeId(nodeA);
  const normalizedB = normalizeId(nodeB);
  
  const relevantEdges = [];
  
  window.links.forEach((link, index) => {
    const linkSourceId = normalizeId(link.source.id || link.source);
    const linkTargetId = normalizeId(link.target.id || link.target);
    
    // Check both directions
    if ((linkSourceId === normalizedA && linkTargetId === normalizedB) ||
        (linkSourceId === normalizedB && linkTargetId === normalizedA)) {
      relevantEdges.push({
        index: index,
        source: linkSourceId,
        target: linkTargetId,
        direction: linkSourceId === normalizedA ? 'forward' : 'reverse'
      });
    }
  });
  
  return relevantEdges;
}

/**
 * Normalize node IDs for consistent comparison
 */
function normalizeId(id) {
  return String(id).trim();
}

/**
 * Recalculate edges for an updated path
 */
function recalculatePathEdges(updatedPath) {
  if (!window.links) return;
  
  const nodeIds = updatedPath.sequence.split(',').map(id => normalizeId(id.trim()));
  const pathEdges = new Set();
  
  for (let i = 0; i < nodeIds.length - 1; i++) {
    const sourceId = nodeIds[i];
    const targetId = nodeIds[i + 1];
    
    window.links.forEach((link, index) => {
      const linkSourceId = normalizeId(link.source.id || link.source);
      const linkTargetId = normalizeId(link.target.id || link.target);
      
      if ((linkSourceId === sourceId && linkTargetId === targetId) ||
          (linkSourceId === targetId && linkTargetId === sourceId)) {
        pathEdges.add(index);
      }
    });
  }
  
  updatedPath.edges = pathEdges;
  console.log(`Recalculated ${pathEdges.size} edges`);
}

/**
 * Show a summary of path updates to the user
 */
export function showPathUpdateSummary(originalPaths, updatedPaths, originalVertexId) {
  const affectedPaths = originalPaths.filter(path => {
    const pathNodes = path.sequence.split(',').map(id => normalizeId(id.trim()));
    return pathNodes.includes(normalizeId(originalVertexId));
  });
  
  const updatedCount = updatedPaths.filter(path => 
    path.originalCoreVertex === originalVertexId
  ).length;
  
  const removedCount = affectedPaths.length - updatedCount;
  
  const message = [
    `Path Update Summary:`,
    `• ${affectedPaths.length} paths contained vertex ${originalVertexId}`,
    `• ${updatedCount} paths successfully updated`,
    removedCount > 0 ? `• ${removedCount} paths removed (no valid replacement found)` : null,
    `• ${originalPaths.length - affectedPaths.length} paths unaffected`
  ].filter(Boolean).join('\n');
  
  console.log(message);
  return message;
}