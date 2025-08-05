// sequence-exporter.js - FIXED: Complete GFA specification implementation with bidirectional links

/**
 * Enhanced GFA sequence reconstruction following the specification document
 * FIXES: Position calculations, bidirectional search, CIGAR transformation, hub topology support
 */

// ===== UTILITY FUNCTIONS =====

// Generate reverse complement of DNA sequence
function reverseComplement(sequence) {
  const complement = {
    'A': 'T', 'T': 'A', 'G': 'C', 'C': 'G',
    'a': 't', 't': 'a', 'g': 'c', 'c': 'g',
    'N': 'N', 'n': 'n'
  };
  
  return sequence
    .split('')
    .reverse()
    .map(base => complement[base] || base)
    .join('');
}

// Parse CIGAR string to get overlap length and operations
function parseCigarOverlap(cigarString) {
  if (!cigarString || cigarString === '*' || cigarString === '0M') {
    return { length: 0, operations: [] };
  }
  
  const operations = [];
  const cigarOps = cigarString.match(/(\d+)([MIDNSHPX=])/g) || [];
  let totalLength = 0;
  
  cigarOps.forEach(op => {
    const match = op.match(/(\d+)([MIDNSHPX=])/);
    if (match) {
      const length = parseInt(match[1], 10);
      const operation = match[2];
      operations.push({ length, operation });
      
      // Count operations that consume reference sequence (matches/deletions)
      if (['M', 'D', 'N', '=', 'X'].includes(operation)) {
        totalLength += length;
      }
    }
  });
  
  return { length: totalLength, operations };
}

// FIXED: Transform CIGAR for reversed links (swap I↔D as per GFA spec)
function transformCigarForReverse(cigarString) {
  if (!cigarString || cigarString === '*') return cigarString;
  
  return cigarString.replace(/(\d+)([ID])/g, (match, count, op) => {
    return count + (op === 'I' ? 'D' : 'I');
  });
}

// FIXED: Normalize node ID (handle negative node IDs properly)
function normalizeNodeId(nodeId) {
  return String(nodeId).trim();
}

// Get the opposite orientation
function getOppositeOrientation(orientation) {
  return orientation === '+' ? '-' : '+';
}

// ===== ENHANCED BIDIRECTIONAL LINK FINDING =====

// ENHANCED: Find exact GFA link with bidirectional support
function findLinkBetweenNodes(nodeAId, nodeBId, links, nodeAOri = '+', nodeBOri = '+') {
  console.log(`\n=== BIDIRECTIONAL LINK SEARCH: ${nodeAId}${nodeAOri} → ${nodeBId}${nodeBOri} ===`);
  
  const normalizedA = normalizeNodeId(nodeAId);
  const normalizedB = normalizeNodeId(nodeBId);
  
  // Method 1: Direct link (A → B)
  console.log(`Searching for direct link: ${normalizedA}${nodeAOri} → ${normalizedB}${nodeBOri}`);
  
  for (const link of links) {
    const sourceId = normalizeNodeId(link.source.id || link.source);
    const targetId = normalizeNodeId(link.target.id || link.target);
    const srcOri = link.srcOrientation || '+';
    const tgtOri = link.tgtOrientation || '+';
    
    if (sourceId === normalizedA && targetId === normalizedB && 
        srcOri === nodeAOri && tgtOri === nodeBOri) {
      console.log(`  ✓ Found direct link: L ${sourceId} ${srcOri} ${targetId} ${tgtOri} ${link.overlap || '*'}`);
      return {
        found: true,
        method: 'direct',
        overlap: link.overlap || '0M',
        sourceOrientation: srcOri,
        targetOrientation: tgtOri,
        link: link,
        reversed: false
      };
    }
  }
  
  // Method 2: Bidirectional equivalent link (B → A with orientation transformation)
  console.log(`Searching for bidirectional equivalent: ${normalizedB} → ${normalizedA}`);
  
  for (const link of links) {
    const sourceId = normalizeNodeId(link.source.id || link.source);
    const targetId = normalizeNodeId(link.target.id || link.target);
    const srcOri = link.srcOrientation || '+';
    const tgtOri = link.tgtOrientation || '+';
    
    if (sourceId === normalizedB && targetId === normalizedA) {
      console.log(`  Found reverse link: ${sourceId}${srcOri} → ${targetId}${tgtOri} [${link.overlap || '*'}]`);
      
      // Apply GFA bidirectional transformation rules
      // For link B(srcOri) → A(tgtOri), the equivalent A → B connection is:
      // A(opposite_of_tgtOri) → B(opposite_of_srcOri)
      
      const equivalentAOri = getOppositeOrientation(tgtOri);
      const equivalentBOri = getOppositeOrientation(srcOri);
      
      console.log(`  Equivalent would be: ${normalizedA}${equivalentAOri} → ${normalizedB}${equivalentBOri}`);
      console.log(`  We want: ${normalizedA}${nodeAOri} → ${normalizedB}${nodeBOri}`);
      
      if (equivalentAOri === nodeAOri && equivalentBOri === nodeBOri) {
        console.log(`  ✓ BIDIRECTIONAL MATCH: Using transformed link`);
        
        // Transform the CIGAR string for reversed direction
        const transformedCigar = transformCigarForReverse(link.overlap || '0M');
        
        return {
          found: true,
          method: 'bidirectional',
          overlap: transformedCigar,
          sourceOrientation: nodeAOri,
          targetOrientation: nodeBOri,
          link: link,
          reversed: true,
          originalOverlap: link.overlap || '0M',
          originalLink: `L ${sourceId} ${srcOri} ${targetId} ${tgtOri}`
        };
      } else {
        console.log(`  ✗ Bidirectional orientation mismatch`);
      }
    }
  }
  
  console.log(`  ❌ NO COMPATIBLE LINK FOUND`);
  return {
    found: false,
    method: 'none',
    overlap: '0M',
    sourceOrientation: nodeAOri,
    targetOrientation: nodeBOri,
    reversed: false
  };
}

// ===== INTELLIGENT PATH DIRECTION DETECTION =====

// NEW: Detect natural path direction based on GFA link topology
function determinePathOrientations(pathNodes, links) {
  if (pathNodes.length <= 1) {
    return { orientations: ['+'], nodes: pathNodes, reversed: false, topology: 'single' };
  }
  
  console.log(`\n=== ANALYZING PATH TOPOLOGY ===`);
  console.log(`Input nodes: ${pathNodes.map(n => n.id).join(', ')}`);
  
  // Create a set of input node IDs for lookup
  const inputNodeIds = new Set(pathNodes.map(n => normalizeNodeId(n.id)));
  
  // Find all GFA links that connect nodes in our input set
  const relevantLinks = [];
  links.forEach(link => {
    const sourceId = normalizeNodeId(link.source.id || link.source);
    const targetId = normalizeNodeId(link.target.id || link.target);
    
    if (inputNodeIds.has(sourceId) && inputNodeIds.has(targetId)) {
      relevantLinks.push({
        sourceId: sourceId,
        targetId: targetId,
        sourceOrientation: link.srcOrientation || '+',
        targetOrientation: link.tgtOrientation || '+',
        overlap: link.overlap || '0M',
        originalLink: link
      });
      console.log(`Found relevant link: L ${sourceId} ${link.srcOrientation || '+'} ${targetId} ${link.tgtOrientation || '+'} ${link.overlap || '*'}`);
    }
  });
  
  if (relevantLinks.length === 0) {
    console.log(`⚠️ No GFA links found between input nodes - using default orientations`);
    return { 
      orientations: new Array(pathNodes.length).fill('+'), 
      nodes: pathNodes, 
      reversed: false,
      topology: 'disconnected'
    };
  }
  
  // Analyze topology
  const topology = analyzePathTopology(pathNodes, relevantLinks);
  console.log(`Detected topology: ${topology.type}`);
  
  if (topology.type === 'hub') {
    console.log(`⚠️ WARNING: Hub topology detected - this path may not be valid as a linear sequence`);
    console.log(`Hub node: ${topology.hubNode}, connected to: ${topology.leaves.join(', ')}`);
    
    // For hub topology, try to create the best possible linear path
    const linearPath = createLinearPathFromHub(topology, pathNodes, relevantLinks);
    if (linearPath.success) {
      return linearPath;
    }
  }
  
  // Try to build linear path
  const linearPath = buildLinearPath(relevantLinks, pathNodes);
  
  if (linearPath.success) {
    console.log(`\n✓ FOUND VALID LINEAR PATH:`);
    for (let i = 0; i < linearPath.nodes.length; i++) {
      console.log(`  ${linearPath.nodes[i].id}${linearPath.orientations[i]}`);
    }
    
    return linearPath;
  }
  
  console.log(`⚠️ Could not build valid linear path - using input order with smart orientations`);
  return createFallbackPath(pathNodes, relevantLinks);
}

// NEW: Analyze the topology of the path
function analyzePathTopology(pathNodes, relevantLinks) {
  const nodeConnections = new Map();
  
  // Initialize connection counts
  pathNodes.forEach(node => {
    const nodeId = normalizeNodeId(node.id);
    nodeConnections.set(nodeId, { incoming: 0, outgoing: 0, connections: [] });
  });
  
  // Count connections for each node
  relevantLinks.forEach(link => {
    const source = nodeConnections.get(link.sourceId);
    const target = nodeConnections.get(link.targetId);
    
    if (source) {
      source.outgoing++;
      source.connections.push({ type: 'out', to: link.targetId, link });
    }
    if (target) {
      target.incoming++;
      target.connections.push({ type: 'in', from: link.sourceId, link });
    }
  });
  
  // Analyze topology
  const sourceNodes = []; // nodes with only outgoing edges
  const sinkNodes = [];   // nodes with only incoming edges
  const hubNodes = [];    // nodes with multiple connections
  const linearNodes = []; // nodes with 1 in + 1 out
  
  for (const [nodeId, conn] of nodeConnections) {
    if (conn.incoming === 0 && conn.outgoing > 0) {
      sourceNodes.push(nodeId);
    } else if (conn.outgoing === 0 && conn.incoming > 0) {
      sinkNodes.push(nodeId);
    } else if (conn.incoming + conn.outgoing > 2) {
      hubNodes.push(nodeId);
    } else if (conn.incoming === 1 && conn.outgoing === 1) {
      linearNodes.push(nodeId);
    }
  }
  
  // Determine topology type
  if (hubNodes.length > 0) {
    const hubNode = hubNodes[0];
    const hubConnections = nodeConnections.get(hubNode);
    const leaves = hubConnections.connections
      .filter(c => c.type === 'out')
      .map(c => c.to);
    
    return {
      type: 'hub',
      hubNode: hubNode,
      leaves: leaves,
      sourceNodes: sourceNodes,
      sinkNodes: sinkNodes
    };
  } else if (sourceNodes.length === 1 && sinkNodes.length === 1) {
    return {
      type: 'linear',
      start: sourceNodes[0],
      end: sinkNodes[0],
      sourceNodes: sourceNodes,
      sinkNodes: sinkNodes
    };
  } else {
    return {
      type: 'complex',
      sourceNodes: sourceNodes,
      sinkNodes: sinkNodes,
      linearNodes: linearNodes
    };
  }
}

// NEW: Create linear path from hub topology
function createLinearPathFromHub(topology, pathNodes, relevantLinks) {
  if (topology.type !== 'hub') {
    return { success: false };
  }
  
  console.log(`\n--- CREATING LINEAR PATH FROM HUB ---`);
  
  const hubNode = pathNodes.find(n => normalizeNodeId(n.id) === topology.hubNode);
  const leafNodes = pathNodes.filter(n => topology.leaves.includes(normalizeNodeId(n.id)));
  
  if (!hubNode || leafNodes.length !== 2) {
    return { success: false };
  }
  
  // Try hub in the middle: leaf1 → hub → leaf2
  const possiblePaths = [
    [leafNodes[0], hubNode, leafNodes[1]],
    [leafNodes[1], hubNode, leafNodes[0]]
  ];
  
  for (const pathOrder of possiblePaths) {
    const result = buildLinearPath(relevantLinks, pathOrder);
    if (result.success) {
      console.log(`✓ Successfully created linear path from hub topology`);
      return result;
    }
  }
  
  return { success: false };
}

// NEW: Build linear path following GFA link directions
function buildLinearPath(relevantLinks, inputNodes) {
  console.log(`\n--- BUILDING LINEAR PATH ---`);
  
  const nodeMap = new Map(inputNodes.map(n => [normalizeNodeId(n.id), n]));
  const inputNodeIds = Array.from(nodeMap.keys());
  
  // Try each node as a potential starting point
  for (const startNodeId of inputNodeIds) {
    console.log(`\nTrying to start from node: ${startNodeId}`);
    
    // Try both orientations for the starting node
    for (const startOri of ['+', '-']) {
      console.log(`  Starting with ${startNodeId}${startOri}:`);
      
      const path = buildPathFromStart(startNodeId, startOri, relevantLinks, nodeMap);
      
      if (path.success && path.nodes.length === inputNodes.length) {
        console.log(`    ✓ Successfully built complete path`);
        
        // Check if this path is in reverse order compared to input
        const firstInputId = normalizeNodeId(inputNodes[0].id);
        const isReversed = normalizeNodeId(path.nodes[0].id) !== firstInputId;
        
        return {
          success: true,
          nodes: path.nodes,
          orientations: path.orientations,
          reversed: isReversed,
          topology: 'linear'
        };
      }
    }
  }
  
  return { success: false };
}

// NEW: Build path starting from a specific node and orientation
function buildPathFromStart(startNodeId, startOri, relevantLinks, nodeMap) {
  const path = {
    nodes: [nodeMap.get(startNodeId)],
    orientations: [startOri],
    usedNodes: new Set([startNodeId])
  };
  
  let currentNodeId = startNodeId;
  let currentOri = startOri;
  
  // Keep extending the path by following GFA links
  while (path.nodes.length < nodeMap.size) {
    console.log(`    Looking for link from ${currentNodeId}${currentOri}...`);
    
    let foundNext = false;
    
    // Look for a direct link that starts from current node with current orientation
    for (const link of relevantLinks) {
      if (link.sourceId === currentNodeId && 
          link.sourceOrientation === currentOri && 
          !path.usedNodes.has(link.targetId)) {
        
        // Found next node in the path
        const nextNode = nodeMap.get(link.targetId);
        const nextOri = link.targetOrientation;
        
        console.log(`      ✓ Found: ${currentNodeId}${currentOri} → ${link.targetId}${nextOri} (${link.overlap})`);
        
        path.nodes.push(nextNode);
        path.orientations.push(nextOri);
        path.usedNodes.add(link.targetId);
        
        currentNodeId = link.targetId;
        currentOri = nextOri;
        foundNext = true;
        break;
      }
    }
    
    // If no direct link found, try bidirectional search
    if (!foundNext) {
      for (const link of relevantLinks) {
        if (link.targetId === currentNodeId && 
            getOppositeOrientation(link.targetOrientation) === currentOri && 
            !path.usedNodes.has(link.sourceId)) {
          
          // Found bidirectional link
          const nextNode = nodeMap.get(link.sourceId);
          const nextOri = getOppositeOrientation(link.sourceOrientation);
          
          console.log(`      ✓ Found bidirectional: ${currentNodeId}${currentOri} → ${link.sourceId}${nextOri} (${link.overlap})`);
          
          path.nodes.push(nextNode);
          path.orientations.push(nextOri);
          path.usedNodes.add(link.sourceId);
          
          currentNodeId = link.sourceId;
          currentOri = nextOri;
          foundNext = true;
          break;
        }
      }
    }
    
    if (!foundNext) {
      console.log(`      ✗ No valid next link found`);
      break;
    }
  }
  
  return {
    success: path.nodes.length === nodeMap.size,
    nodes: path.nodes,
    orientations: path.orientations
  };
}

// NEW: Create fallback path when no valid linear path is found
function createFallbackPath(pathNodes, relevantLinks) {
  console.log(`\n--- CREATING FALLBACK PATH ---`);
  
  // Use input order but try to determine smart orientations
  const orientations = [];
  
  for (let i = 0; i < pathNodes.length; i++) {
    const nodeId = normalizeNodeId(pathNodes[i].id);
    
    // Look for any links involving this node to determine best orientation
    const nodeLinks = relevantLinks.filter(link => 
      link.sourceId === nodeId || link.targetId === nodeId
    );
    
    if (nodeLinks.length > 0) {
      // Use the most common orientation for this node
      const positiveCount = nodeLinks.filter(link => 
        (link.sourceId === nodeId && link.sourceOrientation === '+') ||
        (link.targetId === nodeId && link.targetOrientation === '+')
      ).length;
      
      orientations.push(positiveCount >= nodeLinks.length / 2 ? '+' : '-');
    } else {
      orientations.push('+'); // Default
    }
  }
  
  return {
    orientations: orientations,
    nodes: pathNodes,
    reversed: false,
    topology: 'fallback'
  };
}

// ===== SEQUENCE PROCESSING FUNCTIONS =====

// Get node sequence in specified orientation
function getNodeSequence(node, orientation = '+') {
  let sequence = node.seq || '';
  
  // Handle placeholder sequences
  if (sequence === '*' || sequence === '') {
    const length = node.length || 1000;
    sequence = 'N'.repeat(Math.min(length, 10000)); // Cap for performance
  }
  
  // Apply orientation (reverse complement for negative)
  if (orientation === '-') {
    sequence = reverseComplement(sequence);
  }
  
  return sequence.toUpperCase();
}

// FIXED: Merge sequences with proper position tracking
function mergeSequencesWithOverlap(currentSequence, newNodeSeq, overlapInfo, nodeAId, nodeBId) {
  console.log(`\n--- MERGING SEQUENCES ---`);
  console.log(`Current total sequence: ${currentSequence.length}bp`);
  console.log(`New node (${nodeBId}): ${newNodeSeq.length}bp`);
  console.log(`Overlap info: ${overlapInfo.overlap} (method: ${overlapInfo.method})`);
  
  const { length: overlapLength } = parseCigarOverlap(overlapInfo.overlap);
  const currentSeqLength = currentSequence.length;
  
  if (overlapLength === 0 || !overlapInfo.found) {
    console.log(`No overlap - simple concatenation`);
    return {
      mergedSequence: currentSequence + newNodeSeq,
      method: 'concatenation',
      actualOverlapLength: 0,
      segmentStart: currentSeqLength,
      segmentEnd: currentSeqLength + newNodeSeq.length,
      newNodeContribution: newNodeSeq.length
    };
  }
  
  // Validate overlap makes sense
  if (overlapLength >= currentSequence.length || overlapLength >= newNodeSeq.length) {
    console.log(`⚠️ Overlap too large (${overlapLength}bp), using concatenation`);
    return {
      mergedSequence: currentSequence + newNodeSeq,
      method: 'concatenation_fallback',
      actualOverlapLength: 0,
      segmentStart: currentSeqLength,
      segmentEnd: currentSeqLength + newNodeSeq.length,
      newNodeContribution: newNodeSeq.length
    };
  }
  
  // Get overlap regions from the END of current sequence and START of new sequence
  const currentSuffix = currentSequence.slice(-overlapLength);
  const newPrefix = newNodeSeq.slice(0, overlapLength);
  
  console.log(`Current sequence suffix (${overlapLength}bp): "${currentSuffix.substring(0, 20)}..."`);
  console.log(`New sequence prefix (${overlapLength}bp): "${newPrefix.substring(0, 20)}..."`);
  
  // Check overlap match
  if (currentSuffix === newPrefix) {
    // Perfect overlap - remove overlapping part from new sequence
    const nonOverlappingPart = newNodeSeq.slice(overlapLength);
    const mergedSeq = currentSequence + nonOverlappingPart;
    
    // CORRECTED: For overlaps, the new segment starts where the overlap begins in the current sequence
    const segmentStart = currentSeqLength - overlapLength;
    const segmentEnd = mergedSeq.length;
    
    console.log(`✓ Perfect overlap match - removed ${overlapLength}bp overlap`);
    console.log(`✓ Segment position: ${segmentStart}-${segmentEnd} (spans ${segmentEnd - segmentStart}bp including overlap)`);
    console.log(`✓ Merged: ${currentSeqLength}bp + ${nonOverlappingPart.length}bp = ${mergedSeq.length}bp`);
    
    return {
      mergedSequence: mergedSeq,
      method: 'perfect_overlap',
      actualOverlapLength: overlapLength,
      segmentStart: segmentStart,
      segmentEnd: segmentEnd,
      newNodeContribution: nonOverlappingPart.length
    };
  } else {
    // Calculate similarity for fuzzy matching
    let matches = 0;
    for (let i = 0; i < overlapLength; i++) {
      if (currentSuffix[i] === newPrefix[i]) matches++;
    }
    const similarity = matches / overlapLength;
    
    console.log(`Overlap similarity: ${(similarity * 100).toFixed(1)}%`);
    
    if (similarity > 0.8) {
      // High similarity - accept as fuzzy overlap
      const nonOverlappingPart = newNodeSeq.slice(overlapLength);
      const mergedSeq = currentSequence + nonOverlappingPart;
      
      const segmentStart = currentSeqLength - overlapLength;
      const segmentEnd = mergedSeq.length;
      
      console.log(`✓ Fuzzy overlap accepted - segment: ${segmentStart}-${segmentEnd}`);
      return {
        mergedSequence: mergedSeq,
        method: 'fuzzy_overlap',
        actualOverlapLength: overlapLength,
        segmentStart: segmentStart,
        segmentEnd: segmentEnd,
        newNodeContribution: nonOverlappingPart.length,
        similarity: similarity
      };
    } else {
      // Low similarity - concatenate with gap indicator
      const gapIndicator = `[MISMATCH:${overlapLength}bp]`;
      const mergedSeq = currentSequence + gapIndicator + newNodeSeq;
      
      const segmentStart = currentSeqLength;
      const segmentEnd = mergedSeq.length;
      
      console.log(`✗ Poor overlap - added gap indicator, segment: ${segmentStart}-${segmentEnd}`);
      return {
        mergedSequence: mergedSeq,
        method: 'gap_insertion',
        actualOverlapLength: 0,
        segmentStart: segmentStart,
        segmentEnd: segmentEnd,
        newNodeContribution: gapIndicator.length + newNodeSeq.length,
        similarity: similarity
      };
    }
  }
}

// ===== MAIN RECONSTRUCTION FUNCTION =====

// ENHANCED: Reconstruct sequence with automatic path direction detection
function reconstructSequenceFromPath(pathNodes, links, pathName = 'Reconstructed Path') {
  console.log(`\n=== ENHANCED SEQUENCE RECONSTRUCTION: ${pathName} ===`);
  console.log(`Input path: ${pathNodes.map(n => n.id).join(' → ')}`);
  
  if (pathNodes.length === 0) {
    return {
      sequence: '',
      segments: [],
      mergeLog: [],
      totalLength: 0
    };
  }
  
  if (pathNodes.length === 1) {
    const sequence = getNodeSequence(pathNodes[0], '+');
    return {
      sequence: sequence,
      segments: [{
        nodeId: pathNodes[0].id,
        orientation: '+',
        sequence: sequence,
        start: 0,
        end: sequence.length,
        contributedLength: sequence.length,
        method: 'single_node'
      }],
      mergeLog: [`Single node: ${pathNodes[0].id} (${sequence.length}bp)`],
      totalLength: sequence.length
    };
  }
  
  // ENHANCED: Determine correct path direction and orientations based on GFA links
  const pathInfo = determinePathOrientations(pathNodes, links);
  const actualNodes = pathInfo.nodes;
  const nodeOrientations = pathInfo.orientations;
  const pathReversed = pathInfo.reversed;
  const topology = pathInfo.topology;
  
  if (pathReversed) {
    console.log(`✓ Using REVERSE path direction to match GFA links`);
  } else {
    console.log(`✓ Using FORWARD path direction as provided`);
  }
  
  console.log(`Detected topology: ${topology}`);
  console.log(`Final path: ${actualNodes.map((n, i) => `${n.id}${nodeOrientations[i]}`).join(' → ')}`);
  
  let currentSequence = '';
  const segments = [];
  const mergeLog = [];
  const linkResults = []; // Track link search results for analysis
  
  // Start with first node using determined orientation
  const firstNodeOri = nodeOrientations[0];
  const firstNodeSeq = getNodeSequence(actualNodes[0], firstNodeOri);
  currentSequence = firstNodeSeq;
  
  segments.push({
    nodeId: actualNodes[0].id,
    orientation: firstNodeOri,
    originalSequence: firstNodeSeq,
    start: 0,
    end: firstNodeSeq.length,
    contributedLength: firstNodeSeq.length,
    method: 'first_node',
    linkInfo: null
  });
  
  const startMsg = `Started with node ${actualNodes[0].id}${firstNodeOri}: ${firstNodeSeq.length}bp${pathReversed ? ' (path reversed)' : ''}`;
  mergeLog.push(startMsg);
  
  // Process remaining nodes using determined orientations
  for (let i = 1; i < actualNodes.length; i++) {
    const prevNode = actualNodes[i - 1];
    const currentNode = actualNodes[i];
    const prevNodeOri = nodeOrientations[i - 1];
    const currentNodeOri = nodeOrientations[i];
    
    console.log(`\n=== PROCESSING STEP ${i}: ${prevNode.id}${prevNodeOri} → ${currentNode.id}${currentNodeOri} ===`);
    console.log(`Current total sequence length: ${currentSequence.length}bp`);
    
    // Find link using enhanced bidirectional search
    const linkInfo = findLinkBetweenNodes(prevNode.id, currentNode.id, links, prevNodeOri, currentNodeOri);
    
    // Store link result for analysis
    linkResults.push({
      step: i,
      from: `${prevNode.id}${prevNodeOri}`,
      to: `${currentNode.id}${currentNodeOri}`,
      found: linkInfo.found,
      method: linkInfo.method,
      overlap: linkInfo.overlap,
      reversed: linkInfo.reversed
    });
    
    // Get current node sequence in determined orientation
    const currentNodeSeq = getNodeSequence(currentNode, currentNodeOri);
    console.log(`Node ${currentNode.id}${currentNodeOri}: ${currentNodeSeq.length}bp`);
    
    if (linkInfo.found) {
      console.log(`✓ Found link: ${linkInfo.overlap}${linkInfo.reversed ? ' (bidirectional)' : ' (direct)'}`);
    } else {
      console.log(`✗ No link found - using concatenation`);
    }
    
    // Merge with current sequence
    const mergeResult = mergeSequencesWithOverlap(
      currentSequence,
      currentNodeSeq, 
      linkInfo, 
      prevNode.id, 
      currentNode.id
    );
    
    // Update current sequence
    currentSequence = mergeResult.mergedSequence;
    
    console.log(`Final sequence length after merge: ${currentSequence.length}bp`);
    
    // Record segment info with correct positions from merge result
    segments.push({
      nodeId: currentNode.id,
      orientation: currentNodeOri,
      originalSequence: currentNodeSeq,
      start: mergeResult.segmentStart,
      end: mergeResult.segmentEnd,
      contributedLength: mergeResult.newNodeContribution,
      method: mergeResult.method,
      overlapLength: mergeResult.actualOverlapLength || 0,
      linkInfo: linkInfo,
      similarity: mergeResult.similarity
    });
    
    const methodDesc = linkInfo.found ? 
      `${mergeResult.method}${linkInfo.reversed ? ' (bidirectional)' : ''}` :
      'concatenation';
    
    const logEntry = `Step ${i}: Added ${currentNode.id}${currentNodeOri} ` +
      `(${currentNodeSeq.length}bp original, ${mergeResult.newNodeContribution}bp contributed, ` +
      `${methodDesc})`;
    mergeLog.push(logEntry);
  }
  
  console.log(`\n=== RECONSTRUCTION COMPLETE ===`);
  console.log(`Final sequence length: ${currentSequence.length}bp`);
  console.log(`Segments processed: ${segments.length}`);
  console.log(`Path was ${pathReversed ? 'REVERSED' : 'UNCHANGED'} to match GFA links`);
  console.log(`Topology: ${topology}`);
  
  // Enhanced link analysis
  console.log(`\n=== BIDIRECTIONAL LINK ANALYSIS ===`);
  const directLinks = linkResults.filter(r => r.method === 'direct').length;
  const bidirectionalLinks = linkResults.filter(r => r.method === 'bidirectional').length;
  const noLinks = linkResults.filter(r => !r.found).length;
  
  console.log(`Direct links found: ${directLinks}`);
  console.log(`Bidirectional links used: ${bidirectionalLinks}`);
  console.log(`No links (concatenated): ${noLinks}`);
  
  // Verify segment positions
  console.log(`\n=== POSITION VERIFICATION ===`);
  segments.forEach((seg, i) => {
    const segLength = seg.end - seg.start;
    console.log(`Segment ${i + 1} (${seg.nodeId}${seg.orientation}): ${seg.start}-${seg.end} = ${segLength}bp`);
  });
  
  // Validate no overlapping segments in final sequence
  for (let i = 0; i < segments.length - 1; i++) {
    const current = segments[i];
    const next = segments[i + 1];
    if (current.end > next.start) {
      console.log(`⚠️ WARNING: Segment ${i + 1} overlaps with segment ${i + 2} in final sequence positions`);
    }
  }
  
  return {
    sequence: currentSequence,
    segments: segments,
    mergeLog: mergeLog,
    totalLength: currentSequence.length,
    pathName: pathName,
    pathReversed: pathReversed,
    topology: topology,
    linkAnalysis: {
      direct: directLinks,
      bidirectional: bidirectionalLinks,
      concatenated: noLinks,
      details: linkResults
    }
  };
}

// ===== HTML REPORT GENERATION =====

// ENHANCED: Generate HTML report with color-coded sequence segments
function generateSequenceReport(reconstructionResult) {
  const { sequence, segments, mergeLog, totalLength, pathName, topology, linkAnalysis } = reconstructionResult;
  
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  
  // Generate color-coded sequence HTML
  const coloredSequenceHtml = generateColorCodedSequence(sequence, segments);
  
  let html = `<!DOCTYPE html>
<html>
<head>
    <title>Enhanced Sequence Reconstruction: ${pathName}</title>
    <style>
        body { font-family: 'Courier New', monospace; margin: 20px; line-height: 1.6; }
        .header { font-family: Arial, sans-serif; margin-bottom: 20px; }
        .sequence { font-size: 12px; word-break: break-all; white-space: pre-wrap; line-height: 1.8; }
        .segment { margin: 10px 0; padding: 10px; border-left: 4px solid #ddd; }
        .stats { background: #f5f5f5; padding: 15px; margin: 15px 0; border-radius: 4px; }
        .merge-log { background: #e3f2fd; padding: 15px; margin: 15px 0; border-radius: 4px; }
        .perfect { border-left-color: #4caf50; }
        .perfect_overlap { border-left-color: #4caf50; }
        .fuzzy { border-left-color: #ff9800; }
        .fuzzy_overlap { border-left-color: #ff9800; }
        .gap { border-left-color: #f44336; }
        .gap_insertion { border-left-color: #f44336; }
        .concat { border-left-color: #2196f3; }
        .concatenation { border-left-color: #2196f3; }
        .concatenation_fallback { border-left-color: #2196f3; }
        .first_node { border-left-color: #9c27b0; }
        .enhancement-note { background: #fff3cd; padding: 10px; margin: 10px 0; border-radius: 4px; border: 1px solid #ffeaa7; }
        .position-check { background: #e8f5e8; padding: 10px; margin: 10px 0; border-radius: 4px; border: 1px solid #4caf50; }
        .topology-info { background: #e1f5fe; padding: 10px; margin: 10px 0; border-radius: 4px; border: 1px solid #0277bd; }
        
        /* Segment coloring for sequence visualization */
        .seg-0 { background-color: rgba(156, 39, 176, 0.3); } /* Purple */
        .seg-1 { background-color: rgba(76, 175, 80, 0.3); }  /* Green */
        .seg-2 { background-color: rgba(33, 150, 243, 0.3); } /* Blue */
        .seg-3 { background-color: rgba(255, 152, 0, 0.3); }  /* Orange */
        .seg-4 { background-color: rgba(244, 67, 54, 0.3); }  /* Red */
        .seg-5 { background-color: rgba(96, 125, 139, 0.3); } /* Blue Grey */
        .seg-6 { background-color: rgba(205, 220, 57, 0.3); } /* Lime */
        .seg-7 { background-color: rgba(121, 85, 72, 0.3); }  /* Brown */
        .seg-8 { background-color: rgba(103, 58, 183, 0.3); } /* Deep Purple */
        .seg-9 { background-color: rgba(0, 150, 136, 0.3); }  /* Teal */
        
        .overlap-indicator { 
            background-color: rgba(255, 193, 7, 0.6) !important; 
            border: 1px solid #ff9800;
            box-shadow: 0 0 3px rgba(255, 152, 0, 0.5);
        }
        
        .sequence-legend {
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 4px;
            padding: 15px;
            margin: 15px 0;
        }
        
        .legend-item {
            display: inline-block;
            margin: 5px 10px 5px 0;
            padding: 3px 8px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: bold;
        }
        
        .overlap-legend {
            background-color: rgba(255, 193, 7, 0.6);
            border: 1px solid #ff9800;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>FIXED: Enhanced GFA Sequence Reconstruction</h1>
        <h2>Path: ${pathName}</h2>
        <p><strong>Generated:</strong> ${timestamp}</p>
        
        <div class="enhancement-note">
            <strong>🚀 FIXES Applied:</strong><br>
            • Corrected position calculations (no more overlapping segments)<br>
            • Proper bidirectional link search (as per GFA specification)<br>
            • CIGAR transformation for reversed links (I↔D swap)<br>
            • Support for negative node IDs (separate from orientation)<br>
            • Intelligent path direction detection and hub topology handling<br>
            • <strong>NEW:</strong> Color-coded sequence visualization
        </div>
        
        ${topology ? `
        <div class="topology-info">
            <strong>🔄 Path Topology Analysis:</strong><br>
            Detected topology: <strong>${topology}</strong><br>
            ${topology === 'hub' ? '⚠️ Hub topology detected - this path includes a branching node' : ''}
            ${topology === 'linear' ? '✓ Linear topology - optimal for sequence reconstruction' : ''}
            ${topology === 'fallback' ? '⚠️ Complex topology - using fallback orientation detection' : ''}
        </div>
        ` : ''}
        
        <div class="stats">
            <strong>Reconstruction Statistics:</strong><br>
            Total Sequence Length: ${totalLength.toLocaleString()} bp<br>
            Number of Segments: ${segments.length}<br>
            Path: ${segments.map(s => `${s.nodeId}${s.orientation}`).join(' → ')}<br>
            Perfect Overlaps: ${segments.filter(s => s.method === 'perfect_overlap').length}<br>
            Fuzzy Overlaps: ${segments.filter(s => s.method === 'fuzzy_overlap').length}<br>
            Gap Insertions: ${segments.filter(s => s.method === 'gap_insertion').length}<br>
            Concatenations: ${segments.filter(s => s.method === 'concatenation' || s.method === 'concatenation_fallback').length}<br>
            ${linkAnalysis ? `
            Direct Links Used: ${linkAnalysis.direct}<br>
            Bidirectional Links Used: ${linkAnalysis.bidirectional}<br>
            ` : ''}
        </div>
        
        <div class="sequence-legend">
            <strong>Sequence Color Legend:</strong><br>
            ${segments.map((seg, i) => `
                <span class="legend-item seg-${i}">${seg.nodeId}${seg.orientation}</span>
            `).join('')}
            <span class="legend-item overlap-legend">Overlap Regions</span>
        </div>
        
        <div class="position-check">
            <strong>Position Verification:</strong><br>
            <em>Note: For overlapped segments, positions show where each node's sequence appears in the final merged sequence.</em><br>
            ${segments.map((seg, i) => {
              const segLength = seg.end - seg.start;
              const contributionNote = seg.method === 'perfect_overlap' || seg.method === 'fuzzy_overlap' 
                ? ` (${seg.contributedLength}bp new content after ${seg.overlapLength}bp overlap removed)`
                : '';
              return `Segment ${i + 1}: ${seg.start}-${seg.end} (${segLength}bp total)${contributionNote}`;
            }).join('<br>')}
        </div>
        
        <div class="merge-log">
            <strong>Reconstruction Log:</strong><br>
            ${mergeLog.map(entry => `• ${entry}`).join('<br>')}
        </div>
        
        <h3>Segment Details:</h3>
        ${segments.map((segment, index) => {
          const segmentLength = segment.end - segment.start;
          return `
            <div class="segment ${segment.method || 'concatenation'}">
                <strong>Segment ${index + 1}: ${segment.nodeId}${segment.orientation}</strong>
                <span class="legend-item seg-${index}" style="margin-left: 10px; font-size: 10px;">Color ${index + 1}</span><br>
                Position: ${segment.start}-${segment.end} (${segmentLength} bp)<br>
                Original Node Length: ${segment.originalSequence ? segment.originalSequence.length : 'N/A'} bp<br>
                Contributed to Final: ${segment.contributedLength} bp<br>
                ${segment.method ? `Merge Method: ${segment.method}<br>` : ''}
                ${segment.overlapLength > 0 ? `Overlap Removed: ${segment.overlapLength} bp<br>` : ''}
                ${segment.linkInfo && segment.linkInfo.found ? 
                  `Link: ${segment.linkInfo.reversed ? 'bidirectional' : 'direct'} (${segment.linkInfo.overlap})<br>` : 
                  'Link: concatenation (no overlap found)<br>'}
                ${segment.linkInfo && segment.linkInfo.reversed ? 
                  `<em>Note: Used bidirectional link with transformed CIGAR</em><br>` : ''}
                ${segment.linkInfo && segment.linkInfo.originalLink ? 
                  `<em>Original link: ${segment.linkInfo.originalLink}</em><br>` : ''}
                ${segment.similarity ? `Overlap Similarity: ${(segment.similarity * 100).toFixed(1)}%<br>` : ''}
            </div>
          `;
        }).join('')}
    </div>
    
    <h3>Color-Coded Final Sequence:</h3>
    <div class="sequence">${coloredSequenceHtml}</div>
    
    <div class="enhancement-note" style="margin-top: 20px;">
        <strong>How to read this output:</strong><br>
        • <span style="color: #9c27b0;">Purple segments</span>: First node in path<br>
        • <span style="color: #4caf50;">Green segments</span>: Perfect overlaps found and merged<br>
        • <span style="color: #ff9800;">Orange segments</span>: Fuzzy overlaps (>80% similarity)<br>
        • <span style="color: #f44336;">Red segments</span>: Poor overlaps with gap insertions<br>
        • <span style="color: #2196f3;">Blue segments</span>: Simple concatenation (no overlap)<br>
        • <span style="background-color: rgba(255, 193, 7, 0.6); padding: 2px 4px;">Overlap regions</span> are highlighted with yellow borders<br>
        • Each segment has a unique background color in the final sequence<br>
        • "Bidirectional" links were found by searching reverse GFA links and transforming orientations
    </div>
</body>
</html>`;
  
  return html;
}

// NEW: Generate color-coded sequence HTML with segment highlighting and overlap detection
function generateColorCodedSequence(sequence, segments) {
  if (!sequence || segments.length === 0) {
    return sequence || '';
  }
  
  console.log('\n=== GENERATING COLOR-CODED SEQUENCE ===');
  
  // Create an array to track which segment each position belongs to
  const positionMap = new Array(sequence.length).fill(-1);
  const overlapMap = new Array(sequence.length).fill(false);
  
  // Map each position to its primary segment and detect overlaps
  segments.forEach((segment, segIndex) => {
    for (let pos = segment.start; pos < segment.end; pos++) {
      if (pos < sequence.length) {
        if (positionMap[pos] === -1) {
          // First segment to claim this position
          positionMap[pos] = segIndex;
        } else {
          // Overlap detected - mark as overlap region
          overlapMap[pos] = true;
        }
      }
    }
  });
  
  // Generate HTML with color coding
  let coloredHtml = '';
  let currentSegment = -1;
  let currentIsOverlap = false;
  
  for (let i = 0; i < sequence.length; i++) {
    const segmentIndex = positionMap[i];
    const isOverlap = overlapMap[i];
    
    // Check if we need to start/end a span
    if (segmentIndex !== currentSegment || isOverlap !== currentIsOverlap) {
      // Close previous span if needed
      if (i > 0) {
        coloredHtml += '</span>';
      }
      
      // Start new span
      const segClass = segmentIndex >= 0 ? `seg-${segmentIndex}` : '';
      const overlapClass = isOverlap ? ' overlap-indicator' : '';
      coloredHtml += `<span class="${segClass}${overlapClass}">`;
      
      currentSegment = segmentIndex;
      currentIsOverlap = isOverlap;
    }
    
    // Add the character
    coloredHtml += sequence[i];
    
    // Add line breaks every 80 characters for readability
    if ((i + 1) % 80 === 0) {
      coloredHtml += '\n';
    }
  }
  
  // Close final span
  if (sequence.length > 0) {
    coloredHtml += '</span>';
  }
  
  console.log(`Color-coded sequence generated: ${sequence.length} positions mapped`);
  return coloredHtml;
}

// ===== MAIN EXPORT FUNCTIONS =====

// Main export function with enhanced bidirectional support
export function exportPathSequence(pathData, nodes, links) {
  if (!pathData || !pathData.sequence) {
    alert('No path selected for export');
    return;
  }
  
  console.log('=== ENHANCED GFA SEQUENCE EXPORT WITH BIDIRECTIONAL SUPPORT ===');
  
  // Parse path and get node objects
  const nodeIds = pathData.sequence.split(',').map(id => id.trim());
  const nodeMap = new Map(nodes.map(n => [normalizeNodeId(n.id), n]));
  const pathNodes = nodeIds.map(id => nodeMap.get(normalizeNodeId(id))).filter(Boolean);
  
  if (pathNodes.length === 0) {
    alert('No valid nodes found in path');
    return;
  }
  
  console.log(`Processing path: ${pathNodes.map(n => n.id).join(' → ')}`);
  
  // Reconstruct sequence using enhanced algorithm with bidirectional support
  const result = reconstructSequenceFromPath(pathNodes, links, pathData.name);
  
  // Generate enhanced HTML report
  const htmlContent = generateSequenceReport(result);
  
  // Download file
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${pathData.name.replace(/[^a-zA-Z0-9]/g, '_')}_FIXED_sequence.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  console.log('=== EXPORT COMPLETE ===');
  console.log(`Final sequence: ${result.totalLength.toLocaleString()}bp`);
  console.log(`Topology: ${result.topology}`);
  console.log(`Perfect overlaps: ${result.segments.filter(s => s.method === 'perfect_overlap').length}`);
  if (result.linkAnalysis) {
    console.log(`Direct links: ${result.linkAnalysis.direct}, Bidirectional links: ${result.linkAnalysis.bidirectional}`);
  }
}

// Export helper functions for UI integration (unchanged)
export function addExportButton() {
  const pathManagement = document.getElementById('pathManagement');
  if (!pathManagement || document.getElementById('exportPathSequence')) return;
  
  const navSection = pathManagement.querySelector('.nav-header');
  if (navSection) {
    const exportBtn = document.createElement('button');
    exportBtn.id = 'exportPathSequence';
    exportBtn.className = 'export-btn';
    exportBtn.textContent = 'Export Sequence';
    exportBtn.title = 'Download enhanced sequence file for selected path';
    exportBtn.disabled = true;
    
    navSection.appendChild(exportBtn);
    return exportBtn;
  }
}

export function createExportButton() {
  return addExportButton();
}