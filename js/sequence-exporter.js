// sequence-exporter.js - ENHANCED: Intelligent starting orientation based on GFA links

/**
 * Enhanced GFA sequence reconstruction that:
 * 1. Uses actual GFA link between first two nodes to determine starting orientations
 * 2. Supports both direct and bidirectional link analysis
 * 3. Provides comprehensive diagnostics for all orientation decisions
 */

// ===== UTILITY FUNCTIONS =====

// Check if a node is a merged node
function isMergedNode(node) {
  return node && node.gfaType === 'merged_segment' && node.mergedFrom;
}

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

// Transform CIGAR for reversed links (swap I↔D as per GFA spec)
function transformCigarForReverse(cigarString) {
  if (!cigarString || cigarString === '*') return cigarString;
  
  // First reverse the CIGAR operations order
  const operations = [];
  const cigarOps = cigarString.match(/(\d+)([MIDNSHPX=])/g) || [];
  
  // Reverse the order and swap I↔D
  for (let i = cigarOps.length - 1; i >= 0; i--) {
    const op = cigarOps[i];
    const transformed = op.replace(/(\d+)([ID])/g, (match, count, operation) => {
      return count + (operation === 'I' ? 'D' : 'I');
    });
    operations.push(transformed);
  }
  
  return operations.join('');
}

// Normalize node ID (handle negative node IDs properly)
function normalizeNodeId(nodeId) {
  return String(nodeId).trim();
}

// Get the opposite orientation
function getOppositeOrientation(orientation) {
  return orientation === '+' ? '-' : '+';
}

// ===== ENHANCED DIAGNOSTIC FUNCTIONS =====

/**
 * DIAGNOSTIC: Test all possible orientation combinations between two nodes
 */
function diagnoseAllOrientationCombinations(nodeA, nodeB, overlapLength, stepNumber) {
  console.log(`\n🔍 === DIAGNOSTIC: ALL ORIENTATIONS for Step ${stepNumber}: ${nodeA.id} → ${nodeB.id} ===`);
  
  if (overlapLength === 0) {
    console.log(`  No overlap specified (${overlapLength}bp) - skipping orientation testing`);
    return [];
  }
  
  const orientations = ['+', '-'];
  const results = [];
  
  orientations.forEach(oriA => {
    orientations.forEach(oriB => {
      console.log(`\n  --- TESTING: ${nodeA.id}${oriA} → ${nodeB.id}${oriB} ---`);
      
      const seqA = getNodeSequence(nodeA, oriA);
      const seqB = getNodeSequence(nodeB, oriB);
      
      if (seqA.length < overlapLength || seqB.length < overlapLength) {
        console.log(`    ❌ SKIP: Sequences too short (${seqA.length}bp, ${seqB.length}bp) for ${overlapLength}bp overlap`);
        results.push({
          orientationA: oriA,
          orientationB: oriB,
          similarity: 0,
          valid: false,
          reason: 'sequences_too_short'
        });
        return;
      }
      
      // Test suffix of A with prefix of B
      const suffixA = seqA.slice(-overlapLength);
      const prefixB = seqB.slice(0, overlapLength);
      
      let matches = 0;
      for (let i = 0; i < overlapLength; i++) {
        if (suffixA[i] === prefixB[i]) matches++;
      }
      
      const similarity = matches / overlapLength;
      
      console.log(`    Suffix A (${oriA}): ...${suffixA.slice(-20)}`);
      console.log(`    Prefix B (${oriB}): ${prefixB.slice(0, 20)}...`);
      console.log(`    Similarity: ${matches}/${overlapLength} = ${(similarity * 100).toFixed(1)}%`);
      
      results.push({
        orientationA: oriA,
        orientationB: oriB,
        similarity: similarity,
        matches: matches,
        overlapLength: overlapLength,
        suffixA: suffixA,
        prefixB: prefixB,
        valid: true,
        seqALength: seqA.length,
        seqBLength: seqB.length
      });
    });
  });
  
  // Sort by similarity (best first)
  results.sort((a, b) => b.similarity - a.similarity);
  
  console.log(`\n📊 ORIENTATION RANKING:`);
  results.forEach((result, index) => {
    if (result.valid) {
      const status = result.similarity > 0.8 ? '🟢 EXCELLENT' : 
                    result.similarity > 0.5 ? '🟡 GOOD' : 
                    result.similarity > 0.2 ? '🟠 POOR' : '🔴 TERRIBLE';
      console.log(`    ${index + 1}. ${nodeA.id}${result.orientationA} → ${nodeB.id}${result.orientationB}: ${(result.similarity * 100).toFixed(1)}% ${status}`);
    }
  });
  
  return results;
}

/**
 * ENHANCED: Find GFA link with comprehensive orientation testing
 */
function findLinkForPathStepWithDiagnostics(nodeA, nodeB, links, preferredOrientationA = '+', preferredOrientationB = '+', stepNumber = 0) {
  console.log(`\n🔗 === ENHANCED LINK SEARCH: Step ${stepNumber}: ${nodeA.id} → ${nodeB.id} ===`);
  
  const normalizedA = normalizeNodeId(nodeA.id);
  const normalizedB = normalizeNodeId(nodeB.id);
  
  // Find all candidate links between these nodes
  const candidateLinks = [];
  
  links.forEach((link, linkIndex) => {
    const linkSourceId = normalizeNodeId(link.source.id || link.source);
    const linkTargetId = normalizeNodeId(link.target.id || link.target);
    const srcOri = link.srcOrientation || '+';
    const tgtOri = link.tgtOrientation || '+';
    
    // Check if this link involves our two nodes
    if ((linkSourceId === normalizedA && linkTargetId === normalizedB) ||
        (linkSourceId === normalizedB && linkTargetId === normalizedA)) {
      
      candidateLinks.push({
        linkIndex: linkIndex,
        sourceId: linkSourceId,
        targetId: linkTargetId,
        sourceOri: srcOri,
        targetOri: tgtOri,
        overlap: link.overlap || '0M',
        originalLink: link,
        isDirect: linkSourceId === normalizedA && linkTargetId === normalizedB
      });
      
      const direction = linkSourceId === normalizedA ? 'DIRECT' : 'REVERSE';
      console.log(`  📋 Found ${direction} link [${linkIndex}]: L ${linkSourceId} ${srcOri} ${linkTargetId} ${tgtOri} ${link.overlap || '*'}`);
    }
  });
  
  if (candidateLinks.length === 0) {
    console.log(`  ❌ NO LINKS FOUND between ${normalizedA} and ${normalizedB}`);
    return {
      found: false,
      nodeAOrientation: preferredOrientationA,
      nodeBOrientation: preferredOrientationB,
      overlap: '0M',
      method: 'no_link',
      diagnostics: {
        candidateLinks: 0,
        testedOrientations: 0
      }
    };
  }
  
  console.log(`  📊 Found ${candidateLinks.length} candidate link(s). Testing each with all orientations...`);
  
  let bestResult = null;
  let bestSimilarity = -1;
  
  // Test each candidate link
  candidateLinks.forEach((candidate, candidateIndex) => {
    console.log(`\n  🧪 === TESTING CANDIDATE ${candidateIndex + 1}/${candidateLinks.length} ===`);
    console.log(`      Link: L ${candidate.sourceId} ${candidate.sourceOri} ${candidate.targetId} ${candidate.targetOri} ${candidate.overlap}`);
    
    const { length: overlapLength } = parseCigarOverlap(candidate.overlap);
    
    if (overlapLength === 0) {
      console.log(`      ℹ️ No overlap (${candidate.overlap}) - will use concatenation`);
      
      // For no-overlap cases, just use the link as specified
      let nodeAOrientation, nodeBOrientation, transformedOverlap, method;
      
      if (candidate.isDirect) {
        nodeAOrientation = candidate.sourceOri;
        nodeBOrientation = candidate.targetOri;
        transformedOverlap = candidate.overlap;
        method = 'direct';
      } else {
        nodeAOrientation = getOppositeOrientation(candidate.targetOri);
        nodeBOrientation = getOppositeOrientation(candidate.sourceOri);
        transformedOverlap = transformCigarForReverse(candidate.overlap);
        method = 'bidirectional';
      }
      
      if (!bestResult) {
        bestResult = {
          found: true,
          nodeAOrientation: nodeAOrientation,
          nodeBOrientation: nodeBOrientation,
          overlap: transformedOverlap,
          method: method,
          similarity: 1.0, // No overlap = perfect match
          candidate: candidate,
          overlapLength: 0
        };
      }
      return;
    }
    
    // For overlaps, test all orientation combinations
    const orientationResults = diagnoseAllOrientationCombinations(nodeA, nodeB, overlapLength, stepNumber);
    
    if (orientationResults.length === 0) {
      console.log(`      ⚠️ No valid orientation combinations found`);
      return;
    }
    
    // Find the best orientation combination
    const bestOrientation = orientationResults[0]; // Already sorted by similarity
    
    console.log(`      🏆 BEST ORIENTATION: ${nodeA.id}${bestOrientation.orientationA} → ${nodeB.id}${bestOrientation.orientationB} (${(bestOrientation.similarity * 100).toFixed(1)}%)`);
    
    if (bestOrientation.similarity > bestSimilarity) {
      bestSimilarity = bestOrientation.similarity;
      
      let transformedOverlap, method;
      if (candidate.isDirect) {
        transformedOverlap = candidate.overlap;
        method = 'direct';
      } else {
        transformedOverlap = transformCigarForReverse(candidate.overlap);
        method = 'bidirectional';
      }
      
      bestResult = {
        found: true,
        nodeAOrientation: bestOrientation.orientationA,
        nodeBOrientation: bestOrientation.orientationB,
        overlap: transformedOverlap,
        method: method,
        similarity: bestOrientation.similarity,
        matches: bestOrientation.matches,
        candidate: candidate,
        overlapLength: overlapLength,
        orientationDiagnostics: orientationResults,
        originalLink: `L ${candidate.sourceId} ${candidate.sourceOri} ${candidate.targetId} ${candidate.targetOri} ${candidate.overlap}`,
        transformedLink: `L ${normalizedA} ${bestOrientation.orientationA} ${normalizedB} ${bestOrientation.orientationB} ${transformedOverlap}`
      };
    }
  });
  
  if (bestResult) {
    const qualityLevel = bestResult.similarity > 0.8 ? 'EXCELLENT' : 
                        bestResult.similarity > 0.5 ? 'GOOD' : 
                        bestResult.similarity > 0.2 ? 'ACCEPTABLE' : 'POOR';
    
    console.log(`\n  ✅ FINAL CHOICE: ${bestResult.method} link with ${qualityLevel} overlap (${(bestResult.similarity * 100).toFixed(1)}%)`);
    console.log(`     Orientations: ${nodeA.id}${bestResult.nodeAOrientation} → ${nodeB.id}${bestResult.nodeBOrientation}`);
    
    if (bestResult.originalLink) {
      console.log(`     Original: ${bestResult.originalLink}`);
    }
    if (bestResult.transformedLink) {
      console.log(`     Applied:  ${bestResult.transformedLink}`);
    }
    
    return bestResult;
  }
  
  console.log(`  ❌ NO SUITABLE ORIENTATIONS FOUND`);
  return {
    found: false,
    nodeAOrientation: preferredOrientationA,
    nodeBOrientation: preferredOrientationB,
    overlap: '0M',
    method: 'no_suitable_orientation',
    diagnostics: {
      candidateLinks: candidateLinks.length,
      testedOrientations: candidateLinks.length * 4
    }
  };
}

// ===== SEQUENCE PROCESSING FUNCTIONS =====

// Get node sequence in specified orientation
function getNodeSequence(node, orientation = '+', originalNodes = null, originalLinks = null) {
  // Check if this is a merged node
  if (isMergedNode(node)) {
    return getMergedNodeSequence(node, originalNodes, originalLinks, orientation);
  }
  
  let sequence = node.seq || '';
  
  // Handle placeholder sequences
  if (sequence === '*' || sequence === '') {
    const length = node.length || 1000;
    sequence = 'N'.repeat(Math.min(length, 1000)); // Cap for performance
  }
  
  // Apply orientation (reverse complement for negative)
  if (orientation === '-') {
    sequence = reverseComplement(sequence);
  }
  
  return sequence.toUpperCase();
}

function getMergedNodeSequence(mergedNode, originalNodes, originalLinks, orientation = '+') {
  if (!isMergedNode(mergedNode)) {
    return mergedNode.seq || '*';
  }
  
  console.log(`Reconstructing merged node sequence: ${mergedNode.id}`);
  console.log(`Original nodes: ${mergedNode.mergedFrom.join(' → ')}`);
  
  // Get the original node objects
  const nodeMap = new Map();
  if (originalNodes && originalNodes.length > 0) {
    originalNodes.forEach(node => nodeMap.set(String(node.id).trim(), node));
  } else if (mergedNode.originalNodes) {
    mergedNode.originalNodes.forEach(node => nodeMap.set(String(node.id).trim(), node));
  } else {
    console.log(`No original node data available for merged node ${mergedNode.id}`);
    return 'N'.repeat(mergedNode.length || 1000);
  }
  
  const pathNodes = mergedNode.mergedFrom.map(id => nodeMap.get(String(id).trim())).filter(Boolean);
  
  if (pathNodes.length === 0) {
    console.log(`No original nodes found for merged node ${mergedNode.id}`);
    return 'N'.repeat(mergedNode.length || 1000);
  }
  
  // Reconstruct the sequence from the original path
  const reconstructionResult = reconstructSequenceFromPath(pathNodes, originalLinks || [], `Merged: ${mergedNode.pathName || mergedNode.id}`);
  
  let finalSequence = reconstructionResult.sequence || '';
  
  // Apply orientation
  if (orientation === '-') {
    finalSequence = reverseComplement(finalSequence);
    console.log(`Applied reverse complement for negative orientation`);
  }
  
  console.log(`Reconstructed sequence: ${finalSequence.length}bp`);
  return finalSequence.toUpperCase();
}

// ENHANCED: Merge sequences with detailed diagnostics
function mergeSequencesWithOverlap(currentSequence, newNodeSeq, overlapInfo, nodeAId, nodeBId, stepNumber) {
  console.log(`\n🔧 === ENHANCED MERGING: Step ${stepNumber}: ${nodeAId} + ${nodeBId} ===`);
  console.log(`  Current sequence: ${currentSequence.length}bp`);
  console.log(`  New node sequence: ${newNodeSeq.length}bp`);
  console.log(`  Overlap info: ${overlapInfo.overlap} (${overlapInfo.method})`);
  
  const { length: overlapLength } = parseCigarOverlap(overlapInfo.overlap);
  const currentSeqLength = currentSequence.length;
  
  if (overlapLength === 0 || !overlapInfo.found) {
    console.log(`  ✅ CONCATENATION: No overlap specified`);
    return {
      mergedSequence: currentSequence + newNodeSeq,
      method: 'concatenation',
      actualOverlapLength: 0,
      segmentStart: currentSeqLength,
      segmentEnd: currentSeqLength + newNodeSeq.length,
      newNodeContribution: newNodeSeq.length,
      diagnostics: {
        reason: 'no_overlap_specified',
        overlapLength: 0
      }
    };
  }
  
  // Validate overlap length
  if (overlapLength >= currentSequence.length || overlapLength >= newNodeSeq.length) {
    console.log(`  ⚠️ FALLBACK: Overlap too large (${overlapLength}bp) for sequences (${currentSequence.length}bp, ${newNodeSeq.length}bp)`);
    return {
      mergedSequence: currentSequence + newNodeSeq,
      method: 'concatenation_fallback',
      actualOverlapLength: 0,
      segmentStart: currentSeqLength,
      segmentEnd: currentSeqLength + newNodeSeq.length,
      newNodeContribution: newNodeSeq.length,
      diagnostics: {
        reason: 'overlap_too_large',
        requestedOverlap: overlapLength,
        currentSeqLength: currentSequence.length,
        newSeqLength: newNodeSeq.length
      }
    };
  }
  
  // Use pre-computed similarity if available
  if (overlapInfo.similarity !== undefined) {
    console.log(`  📊 Using pre-computed similarity: ${(overlapInfo.similarity * 100).toFixed(1)}%`);
    
    if (overlapInfo.similarity >= 0.8) {
      // Perfect/excellent overlap
      const nonOverlappingPart = newNodeSeq.slice(overlapLength);
      const mergedSeq = currentSequence + nonOverlappingPart;
      
      const segmentStart = currentSeqLength - overlapLength;
      const segmentEnd = mergedSeq.length;
      
      console.log(`  ✅ PERFECT OVERLAP: Removed ${overlapLength}bp overlap, added ${nonOverlappingPart.length}bp new content`);
      console.log(`  📏 Merged length: ${currentSeqLength}bp + ${nonOverlappingPart.length}bp = ${mergedSeq.length}bp`);
      
      return {
        mergedSequence: mergedSeq,
        method: 'perfect_overlap',
        actualOverlapLength: overlapLength,
        segmentStart: segmentStart,
        segmentEnd: segmentEnd,
        newNodeContribution: nonOverlappingPart.length,
        similarity: overlapInfo.similarity,
        diagnostics: {
          reason: 'pre_computed_perfect',
          overlapRemoved: overlapLength,
          newContentAdded: nonOverlappingPart.length
        }
      };
    } else if (overlapInfo.similarity >= 0.5) {
      // Fuzzy but acceptable overlap
      const nonOverlappingPart = newNodeSeq.slice(overlapLength);
      const mergedSeq = currentSequence + nonOverlappingPart;
      
      const segmentStart = currentSeqLength - overlapLength;
      const segmentEnd = mergedSeq.length;
      
      console.log(`  ✅ FUZZY OVERLAP: ${(overlapInfo.similarity * 100).toFixed(1)}% similarity, removed ${overlapLength}bp overlap`);
      
      return {
        mergedSequence: mergedSeq,
        method: 'fuzzy_overlap',
        actualOverlapLength: overlapLength,
        segmentStart: segmentStart,
        segmentEnd: segmentEnd,
        newNodeContribution: nonOverlappingPart.length,
        similarity: overlapInfo.similarity,
        diagnostics: {
          reason: 'pre_computed_fuzzy',
          overlapRemoved: overlapLength,
          newContentAdded: nonOverlappingPart.length
        }
      };
    } else {
      // Poor overlap - insert gap with detailed diagnostics
      const gapIndicator = `[MISMATCH:${overlapLength}bp:${(overlapInfo.similarity * 100).toFixed(1)}%:ORIENTATIONS:${nodeAId}${overlapInfo.nodeAOrientation}-${nodeBId}${overlapInfo.nodeBOrientation}]`;
      const mergedSeq = currentSequence + gapIndicator + newNodeSeq;
      
      const segmentStart = currentSeqLength;
      const segmentEnd = mergedSeq.length;
      
      console.log(`  ❌ POOR OVERLAP: ${(overlapInfo.similarity * 100).toFixed(1)}% similarity - inserting diagnostic gap`);
      console.log(`     Gap: ${gapIndicator}`);
      
      return {
        mergedSequence: mergedSeq,
        method: 'gap_insertion',
        actualOverlapLength: 0,
        segmentStart: segmentStart,
        segmentEnd: segmentEnd,
        newNodeContribution: gapIndicator.length + newNodeSeq.length,
        similarity: overlapInfo.similarity,
        diagnostics: {
          reason: 'pre_computed_poor',
          gapIndicator: gapIndicator,
          originalOverlapLength: overlapLength
        }
      };
    }
  }
  
  // Fallback: manual overlap testing (shouldn't happen with enhanced system)
  console.log(`  🔄 FALLBACK: Manual overlap testing`);
  
  const currentSuffix = currentSequence.slice(-overlapLength);
  const newPrefix = newNodeSeq.slice(0, overlapLength);
  
  console.log(`    Current suffix: ...${currentSuffix.slice(-30)}`);
  console.log(`    New prefix:     ${newPrefix.slice(0, 30)}...`);
  
  // Check for perfect match
  if (currentSuffix === newPrefix) {
    const nonOverlappingPart = newNodeSeq.slice(overlapLength);
    const mergedSeq = currentSequence + nonOverlappingPart;
    
    const segmentStart = currentSeqLength - overlapLength;
    const segmentEnd = mergedSeq.length;
    
    console.log(`  ✅ FALLBACK PERFECT: Exact match found`);
    
    return {
      mergedSequence: mergedSeq,
      method: 'perfect_overlap',
      actualOverlapLength: overlapLength,
      segmentStart: segmentStart,
      segmentEnd: segmentEnd,
      newNodeContribution: nonOverlappingPart.length,
      diagnostics: {
        reason: 'fallback_perfect_match'
      }
    };
  }
  
  // Calculate similarity for fuzzy matching
  let matches = 0;
  for (let i = 0; i < overlapLength; i++) {
    if (currentSuffix[i] === newPrefix[i]) matches++;
  }
  const similarity = matches / overlapLength;
  
  console.log(`    Fallback similarity: ${matches}/${overlapLength} = ${(similarity * 100).toFixed(1)}%`);
  
  if (similarity >= 0.5) {
    // Accept fuzzy overlap
    const nonOverlappingPart = newNodeSeq.slice(overlapLength);
    const mergedSeq = currentSequence + nonOverlappingPart;
    
    const segmentStart = currentSeqLength - overlapLength;
    const segmentEnd = mergedSeq.length;
    
    console.log(`  ✅ FALLBACK FUZZY: Acceptable similarity`);
    return {
      mergedSequence: mergedSeq,
      method: 'fuzzy_overlap',
      actualOverlapLength: overlapLength,
      segmentStart: segmentStart,
      segmentEnd: segmentEnd,
      newNodeContribution: nonOverlappingPart.length,
      similarity: similarity,
      diagnostics: {
        reason: 'fallback_fuzzy_match'
      }
    };
  } else {
    // Poor overlap - add gap indicator
    const gapIndicator = `[FALLBACK_MISMATCH:${overlapLength}bp:${(similarity * 100).toFixed(1)}%]`;
    const mergedSeq = currentSequence + gapIndicator + newNodeSeq;
    
    const segmentStart = currentSeqLength;
    const segmentEnd = mergedSeq.length;
    
    console.log(`  ❌ FALLBACK POOR: Low similarity - adding gap`);
    return {
      mergedSequence: mergedSeq,
      method: 'gap_insertion',
      actualOverlapLength: 0,
      segmentStart: segmentStart,
      segmentEnd: segmentEnd,
      newNodeContribution: gapIndicator.length + newNodeSeq.length,
      similarity: similarity,
      diagnostics: {
        reason: 'fallback_poor_match',
        gapIndicator: gapIndicator
      }
    };
  }
}

// ===== ENHANCED MAIN RECONSTRUCTION FUNCTION =====

/**
 * ENHANCED: Reconstruct sequence with intelligent starting orientation
 */
function reconstructSequenceFromPath(pathNodes, links, pathName = 'Reconstructed Path') {
  console.log(`\n🧬 === ENHANCED SEQUENCE RECONSTRUCTION WITH INTELLIGENT STARTING ORIENTATION ===`);
  console.log(`🎯 Path: ${pathName}`);
  console.log(`📋 Node sequence: ${pathNodes.map(n => n.id).join(' → ')}`);
  console.log(`🔗 Total links available: ${links.length}`);
  
  if (pathNodes.length === 0) {
    return {
      sequence: '',
      segments: [],
      mergeLog: [],
      totalLength: 0,
      pathName: pathName,
      diagnostics: { reason: 'empty_path' }
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
      totalLength: sequence.length,
      pathName: pathName,
      diagnostics: { reason: 'single_node' }
    };
  }
  
  // ===== NEW: INTELLIGENT STARTING ORIENTATION =====
  console.log(`\n🚀 === DETERMINING INTELLIGENT STARTING ORIENTATIONS ===`);
  console.log(`🔍 Analyzing link between first two nodes: ${pathNodes[0].id} → ${pathNodes[1].id}`);
  
  // Find the link between first two nodes to determine starting orientations
  const firstLinkInfo = findLinkForPathStepWithDiagnostics(
    pathNodes[0], 
    pathNodes[1], 
    links, 
    '+', // placeholder - will be determined by link analysis
    '+', // placeholder - will be determined by link analysis
    0
  );
  
  let firstNodeOrientation, secondNodeOrientation;
  
  if (firstLinkInfo.found) {
    firstNodeOrientation = firstLinkInfo.nodeAOrientation;
    secondNodeOrientation = firstLinkInfo.nodeBOrientation;
    
    console.log(`✅ INTELLIGENT START: Using orientations from GFA link analysis`);
    console.log(`   First node ${pathNodes[0].id}: ${firstNodeOrientation} orientation`);
    console.log(`   Second node ${pathNodes[1].id}: ${secondNodeOrientation} orientation`);
    console.log(`   Link method: ${firstLinkInfo.method}`);
    console.log(`   Link overlap: ${firstLinkInfo.overlap}`);
    if (firstLinkInfo.similarity !== undefined) {
      console.log(`   Link quality: ${(firstLinkInfo.similarity * 100).toFixed(1)}% similarity`);
    }
  } else {
    // Fallback to positive orientation if no link found
    firstNodeOrientation = '+';
    secondNodeOrientation = '+';
    
    console.log(`⚠️ FALLBACK START: No link found between first two nodes`);
    console.log(`   Using default positive orientations for both nodes`);
  }
  
  // Initialize reconstruction with intelligent starting orientation
  let currentSequence = '';
  const segments = [];
  const mergeLog = [];
  const linkResults = [];
  const diagnostics = {
    totalSteps: pathNodes.length - 1,
    linksFound: 0,
    directLinks: 0,
    bidirectionalLinks: 0,
    perfectOverlaps: 0,
    fuzzyOverlaps: 0,
    gapInsertions: 0,
    concatenations: 0,
    intelligentStart: firstLinkInfo.found
  };
  
  // Start with first node in the determined orientation
  let currentNodeOrientation = firstNodeOrientation;
  const firstNodeSeq = getNodeSequence(pathNodes[0], currentNodeOrientation);
  currentSequence = firstNodeSeq;
  
  segments.push({
    nodeId: pathNodes[0].id,
    orientation: currentNodeOrientation,
    originalSequence: firstNodeSeq,
    start: 0,
    end: firstNodeSeq.length,
    contributedLength: firstNodeSeq.length,
    method: 'intelligent_start',
    linkInfo: firstLinkInfo.found ? firstLinkInfo : null
  });
  
  const startMethod = firstLinkInfo.found ? 'intelligent' : 'fallback';
  mergeLog.push(`🟢 Started with ${pathNodes[0].id}${currentNodeOrientation}: ${firstNodeSeq.length}bp (${startMethod})`);
  
  console.log(`\n📊 Starting reconstruction with ${pathNodes.length} nodes, expecting ${pathNodes.length - 1} steps...`);
  console.log(`🎯 First node: ${pathNodes[0].id}${currentNodeOrientation} (${firstNodeSeq.length}bp)`);
  
  // Process each subsequent node (starting from the second node)
  for (let i = 1; i < pathNodes.length; i++) {
    const prevNode = pathNodes[i - 1];
    const currentNode = pathNodes[i];
    
    console.log(`\n\n🚀 === PROCESSING STEP ${i}/${pathNodes.length - 1}: ${prevNode.id} → ${currentNode.id} ===`);
    console.log(`📊 Progress: ${i}/${pathNodes.length - 1} steps (${((i / (pathNodes.length - 1)) * 100).toFixed(1)}%)`);
    
    let linkInfo;
    let nextNodeOrientation;
    
    if (i === 1 && firstLinkInfo.found) {
      // For the first step, we already have the link info and orientations
      linkInfo = firstLinkInfo;
      nextNodeOrientation = secondNodeOrientation;
      
      console.log(`🔄 REUSING FIRST LINK: Already analyzed ${prevNode.id}${currentNodeOrientation} → ${currentNode.id}${nextNodeOrientation}`);
      console.log(`   Link method: ${linkInfo.method}`);
      console.log(`   Link overlap: ${linkInfo.overlap}`);
    } else {
      // For subsequent steps, find the link as normal
      linkInfo = findLinkForPathStepWithDiagnostics(
        prevNode, 
        currentNode, 
        links, 
        currentNodeOrientation, 
        '+', 
        i
      );
      nextNodeOrientation = linkInfo.nodeBOrientation || '+';
    }
    
    // Update diagnostics
    if (linkInfo.found) {
      diagnostics.linksFound++;
      if (linkInfo.method === 'direct') {
        diagnostics.directLinks++;
      } else if (linkInfo.method === 'bidirectional') {
        diagnostics.bidirectionalLinks++;
      }
    }
    
    // Record link search result
    linkResults.push({
      step: i,
      from: prevNode.id,
      to: currentNode.id,
      found: linkInfo.found,
      method: linkInfo.method || 'no_link',
      previousOrientation: currentNodeOrientation,
      nextOrientation: nextNodeOrientation,
      overlap: linkInfo.overlap,
      similarity: linkInfo.similarity,
      originalLink: linkInfo.originalLink,
      transformedLink: linkInfo.transformedLink,
      diagnostics: linkInfo.orientationDiagnostics || null,
      reusedFirstLink: i === 1 && firstLinkInfo.found
    });
    
    // Update current node orientation for the next step
    currentNodeOrientation = nextNodeOrientation;
    
    // Get the sequence for current node in determined orientation
    const currentNodeSeq = getNodeSequence(currentNode, nextNodeOrientation);
    
    console.log(`\n💾 Node ${currentNode.id}${nextNodeOrientation}: ${currentNodeSeq.length}bp`);
    console.log(`🔗 Link status: ${linkInfo.found ? '✅ FOUND' : '❌ NOT FOUND'}`);
    
    if (linkInfo.found) {
      const qualityDesc = linkInfo.similarity !== undefined ? 
        `${(linkInfo.similarity * 100).toFixed(1)}% similarity` : 
        'no overlap';
      console.log(`📈 Link quality: ${qualityDesc} (${linkInfo.method})`);
    }
    
    // Merge sequences with enhanced diagnostics
    const mergeResult = mergeSequencesWithOverlap(
      currentSequence,
      currentNodeSeq,
      linkInfo,
      prevNode.id,
      currentNode.id,
      i
    );
    
    // Update diagnostics based on merge result
    switch (mergeResult.method) {
      case 'perfect_overlap':
        diagnostics.perfectOverlaps++;
        break;
      case 'fuzzy_overlap':
        diagnostics.fuzzyOverlaps++;
        break;
      case 'gap_insertion':
        diagnostics.gapInsertions++;
        break;
      case 'concatenation':
      case 'concatenation_fallback':
        diagnostics.concatenations++;
        break;
    }
    
    currentSequence = mergeResult.mergedSequence;
    
    console.log(`🏁 Step ${i} completed: ${currentSequence.length}bp total`);
    
    // Record segment with enhanced info
    segments.push({
      nodeId: currentNode.id,
      orientation: nextNodeOrientation,
      originalSequence: currentNodeSeq,
      start: mergeResult.segmentStart,
      end: mergeResult.segmentEnd,
      contributedLength: mergeResult.newNodeContribution,
      method: mergeResult.method,
      overlapLength: mergeResult.actualOverlapLength || 0,
      linkInfo: linkInfo,
      similarity: mergeResult.similarity,
      diagnostics: mergeResult.diagnostics
    });
    
    const methodIcon = mergeResult.method === 'perfect_overlap' ? '🟢' :
                      mergeResult.method === 'fuzzy_overlap' ? '🟡' :
                      mergeResult.method === 'gap_insertion' ? '🔴' : '🔵';
    
    const methodDesc = linkInfo.found ? 
      `${mergeResult.method} (${linkInfo.method})` : 
      'concatenation';
    
    const similarityDesc = mergeResult.similarity !== undefined ? 
      ` [${(mergeResult.similarity * 100).toFixed(1)}%]` : '';
    
    const reuseNote = (i === 1 && firstLinkInfo.found) ? ' [reused first link]' : '';
    
    mergeLog.push(`${methodIcon} Step ${i}: Added ${currentNode.id}${nextNodeOrientation} ` +
      `(${currentNodeSeq.length}bp → ${mergeResult.newNodeContribution}bp, ${methodDesc}${similarityDesc}${reuseNote})`);
  }
  
  console.log(`\n🎉 === RECONSTRUCTION COMPLETE ===`);
  console.log(`📏 Final sequence: ${currentSequence.length}bp`);
  console.log(`🔗 Final path: ${segments.map(s => `${s.nodeId}${s.orientation}`).join(' → ')}`);
  
  // Enhanced diagnostics summary
  console.log(`\n📊 === COMPREHENSIVE DIAGNOSTICS ===`);
  console.log(`Intelligent start: ${diagnostics.intelligentStart ? 'YES' : 'NO (fallback used)'}`);
  console.log(`Steps processed: ${diagnostics.totalSteps}`);
  console.log(`Links found: ${diagnostics.linksFound}/${diagnostics.totalSteps}`);
  console.log(`  - Direct links: ${diagnostics.directLinks}`);
  console.log(`  - Bidirectional links: ${diagnostics.bidirectionalLinks}`);
  console.log(`Merge results:`);
  console.log(`  - Perfect overlaps: ${diagnostics.perfectOverlaps}`);
  console.log(`  - Fuzzy overlaps: ${diagnostics.fuzzyOverlaps}`);
  console.log(`  - Gap insertions: ${diagnostics.gapInsertions}`);
  console.log(`  - Concatenations: ${diagnostics.concatenations}`);
  
  const successRate = (diagnostics.perfectOverlaps + diagnostics.fuzzyOverlaps) / diagnostics.totalSteps * 100;
  console.log(`Success rate: ${successRate.toFixed(1)}% (${diagnostics.perfectOverlaps + diagnostics.fuzzyOverlaps}/${diagnostics.totalSteps} successful overlaps)`);
  
  return {
    sequence: currentSequence,
    segments: segments,
    mergeLog: mergeLog,
    totalLength: currentSequence.length,
    pathName: pathName,
    linkAnalysis: {
      direct: diagnostics.directLinks,
      bidirectional: diagnostics.bidirectionalLinks,
      concatenated: diagnostics.totalSteps - diagnostics.linksFound,
      details: linkResults
    },
    diagnostics: diagnostics
  };
}

// ===== ENHANCED HTML REPORT GENERATION =====

function generateSequenceReport(reconstructionResult) {
  const { sequence, segments, mergeLog, totalLength, pathName, linkAnalysis, diagnostics } = reconstructionResult;
  
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  
  // Generate color-coded sequence
  const coloredSequenceHtml = generateColorCodedSequence(sequence, segments);
  
  // Generate diagnostic summary
  const diagnosticSummary = generateDiagnosticSummary(diagnostics, linkAnalysis);
  
  let html = `<!DOCTYPE html>
<html>
<head>
    <title>🔬 Enhanced Diagnostic Sequence Reconstruction: ${pathName}</title>
    <style>
        body { font-family: 'Courier New', monospace; margin: 20px; line-height: 1.6; }
        .header { font-family: Arial, sans-serif; margin-bottom: 20px; }
        .sequence { font-size: 12px; word-break: break-all; white-space: pre-wrap; line-height: 1.8; }
        .segment { margin: 10px 0; padding: 10px; border-left: 4px solid #ddd; }
        .stats { background: #f5f5f5; padding: 15px; margin: 15px 0; border-radius: 4px; }
        .merge-log { background: #e3f2fd; padding: 15px; margin: 15px 0; border-radius: 4px; }
        .enhancement-note { background: #d4edda; padding: 10px; margin: 10px 0; border-radius: 4px; border: 1px solid #c3e6cb; }
        .diagnostic-panel { background: #fff3cd; padding: 15px; margin: 15px 0; border-radius: 4px; border: 1px solid #ffeaa7; }
        .intelligent-start { background: #e1f5fe; padding: 15px; margin: 15px 0; border-radius: 4px; border: 1px solid #0277bd; }
        
        /* Method-based coloring */
        .perfect_overlap { border-left-color: #4caf50; }
        .fuzzy_overlap { border-left-color: #ff9800; }
        .gap_insertion { border-left-color: #f44336; }
        .concatenation { border-left-color: #2196f3; }
        .concatenation_fallback { border-left-color: #2196f3; }
        .intelligent_start { border-left-color: #9c27b0; }
        
        /* Segment coloring for visualization */
        .seg-0 { background-color: rgba(156, 39, 176, 0.3); }
        .seg-1 { background-color: rgba(76, 175, 80, 0.3); }
        .seg-2 { background-color: rgba(33, 150, 243, 0.3); }
        .seg-3 { background-color: rgba(255, 152, 0, 0.3); }
        .seg-4 { background-color: rgba(244, 67, 54, 0.3); }
        .seg-5 { background-color: rgba(96, 125, 139, 0.3); }
        .seg-6 { background-color: rgba(205, 220, 57, 0.3); }
        .seg-7 { background-color: rgba(121, 85, 72, 0.3); }
        .seg-8 { background-color: rgba(103, 58, 183, 0.3); }
        .seg-9 { background-color: rgba(0, 150, 136, 0.3); }
        
        .overlap-indicator { 
            background-color: rgba(255, 193, 7, 0.8) !important; 
            border: 1px solid #ff9800;
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
        
        .diagnostic-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 15px 0;
        }
        
        .diagnostic-card {
            background: white;
            border: 1px solid #ddd;
            border-radius: 6px;
            padding: 12px;
        }
        
        .diagnostic-title {
            font-weight: bold;
            color: #333;
            margin-bottom: 8px;
            font-size: 14px;
        }
        
        .diagnostic-value {
            font-size: 20px;
            font-weight: bold;
            color: #2196f3;
        }
        
        .diagnostic-description {
            font-size: 11px;
            color: #666;
            margin-top: 4px;
        }
        
        .success-rate {
            font-size: 24px;
            color: #4caf50;
        }
        
        .warning-rate {
            font-size: 24px;
            color: #ff9800;
        }
        
        .error-rate {
            font-size: 24px;
            color: #f44336;
        }
        
        .orientation-test {
            background: #f0f8ff;
            border: 1px solid #b3d9ff;
            padding: 8px;
            margin: 5px 0;
            border-radius: 4px;
            font-size: 11px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔬 Enhanced Diagnostic GFA Sequence Reconstruction</h1>
        <h2>Path: ${pathName}</h2>
        <p><strong>Generated:</strong> ${timestamp}</p>
        
        <div class="enhancement-note">
            <strong>🚀 NEW INTELLIGENT STARTING ORIENTATION:</strong><br>
            • First two nodes analyzed to determine optimal starting orientations<br>
            • GFA link between first two nodes used for orientation decisions<br>
            • Direct and bidirectional links properly handled from the start<br>
            • Eliminates arbitrary positive orientation assumption<br>
            • Improves overall reconstruction accuracy and consistency
        </div>
        
        ${diagnostics.intelligentStart ? `
        <div class="intelligent-start">
            <strong>✅ INTELLIGENT START SUCCESSFUL:</strong><br>
            Found GFA link between first two nodes (${segments[0]?.nodeId} → ${segments[1]?.nodeId})<br>
            Starting orientations determined from actual GFA data<br>
            First node: ${segments[0]?.nodeId}${segments[0]?.orientation}<br>
            Second node: ${segments[1]?.nodeId}${segments[1]?.orientation}
        </div>
        ` : `
        <div class="intelligent-start" style="background: #fff3cd; border-color: #ffc107;">
            <strong>⚠️ FALLBACK START USED:</strong><br>
            No GFA link found between first two nodes (${segments[0]?.nodeId} → ${segments[1]?.nodeId})<br>
            Using default positive orientations for starting nodes<br>
            Consider checking if these nodes should be connected in your GFA file
        </div>
        `}
        
        ${diagnosticSummary}
        
        <div class="stats">
            <strong>Enhanced Reconstruction Statistics:</strong><br>
            Total Sequence Length: ${totalLength.toLocaleString()} bp<br>
            Path Segments: ${segments.length}<br>
            Final Path: ${segments.map(s => `${s.nodeId}${s.orientation}`).join(' → ')}<br>
            Intelligent Start: ${diagnostics.intelligentStart ? 'YES' : 'NO (fallback)'}<br>
            ${linkAnalysis ? `
            Direct Links Found: ${linkAnalysis.direct}<br>
            Bidirectional Links Used: ${linkAnalysis.bidirectional}<br>
            Concatenated Steps: ${linkAnalysis.concatenated}<br>
            ` : ''}
            Perfect Overlaps: ${segments.filter(s => s.method === 'perfect_overlap').length}<br>
            Fuzzy Overlaps: ${segments.filter(s => s.method === 'fuzzy_overlap').length}<br>
            Gap Insertions: ${segments.filter(s => s.method === 'gap_insertion').length}
        </div>
        
        <div class="sequence-legend">
            <strong>Sequence Segment Legend:</strong><br>
            ${segments.map((seg, i) => `
                <span class="legend-item seg-${i}">${seg.nodeId}${seg.orientation}</span>
            `).join('')}
            <span class="legend-item" style="background-color: rgba(255, 193, 7, 0.8);">Overlap Regions</span>
        </div>
        
        <div class="merge-log">
            <strong>Step-by-Step Reconstruction:</strong><br>
            ${mergeLog.map(entry => `• ${entry}`).join('<br>')}
        </div>
        
        <h3>Detailed Segment Information:</h3>
        ${segments.map((segment, index) => {
          const segmentLength = segment.end - segment.start;
          let diagnosticInfo = '';
          
          if (segment.diagnostics) {
            diagnosticInfo = `<br><em>Diagnostics: ${segment.diagnostics.reason || 'N/A'}</em>`;
          }
          
          let methodDescription = '';
          if (segment.method === 'intelligent_start') {
            methodDescription = `<br><strong>🧠 Intelligent Start:</strong> Orientation determined from GFA link analysis`;
          }
          
          return `
            <div class="segment ${segment.method || 'concatenation'}">
                <strong>Segment ${index + 1}: ${segment.nodeId}${segment.orientation}</strong>
                <span class="legend-item seg-${index}" style="margin-left: 10px;">Visual Color</span><br>
                Position: ${segment.start}-${segment.end} (${segmentLength} bp)<br>
                Original Node Length: ${segment.originalSequence ? segment.originalSequence.length : 'N/A'} bp<br>
                Contributed to Final: ${segment.contributedLength} bp<br>
                Merge Method: ${segment.method || 'concatenation'}<br>
                ${segment.overlapLength > 0 ? `Overlap Processed: ${segment.overlapLength} bp<br>` : ''}
                ${segment.linkInfo && segment.linkInfo.found ? `
                Link Type: ${segment.linkInfo.method}<br>
                ${segment.linkInfo.originalLink ? `Original Link: ${segment.linkInfo.originalLink}<br>` : ''}
                ${segment.linkInfo.transformedLink && segment.linkInfo.method === 'bidirectional' ? 
                  `Transformed Link: ${segment.linkInfo.transformedLink}<br>` : ''}
                ` : segment.method !== 'intelligent_start' ? 'Link: No GFA link found - concatenated<br>' : ''}
                ${segment.similarity !== undefined ? `Overlap Similarity: ${(segment.similarity * 100).toFixed(1)}%<br>` : ''}
                ${methodDescription}
                ${diagnosticInfo}
            </div>
          `;
        }).join('')}
    </div>
    
    <h3>Color-Coded Final Sequence:</h3>
    <div class="sequence">${coloredSequenceHtml}</div>
    
    <div class="enhancement-note" style="margin-top: 20px;">
        <strong>🔍 How to interpret this enhanced diagnostic reconstruction:</strong><br>
        • <strong>Intelligent Start:</strong> First two nodes analyzed to determine optimal starting orientations<br>
        • <strong>GFA Link Analysis:</strong> Actual GFA L lines searched and used for orientation decisions<br>
        • <strong>Direct/Bidirectional Detection:</strong> Link direction properly determined and applied<br>
        • <strong>Comprehensive Testing:</strong> All orientation combinations tested for overlap quality<br>
        • <strong>Gap Diagnostics:</strong> Poor overlaps preserved with detailed diagnostic information<br>
        • <strong>Console Logging:</strong> Complete step-by-step analysis available in browser console
    </div>
</body>
</html>`;
  
  return html;
}

function generateDiagnosticSummary(diagnostics, linkAnalysis) {
  if (!diagnostics) return '';
  
  const successRate = ((diagnostics.perfectOverlaps + diagnostics.fuzzyOverlaps) / diagnostics.totalSteps * 100) || 0;
  const linkSuccessRate = (diagnostics.linksFound / diagnostics.totalSteps * 100) || 0;
  
  const successClass = successRate >= 80 ? 'success-rate' : successRate >= 50 ? 'warning-rate' : 'error-rate';
  const intelligentStartClass = diagnostics.intelligentStart ? 'success-rate' : 'warning-rate';
  
  return `
    <div class="diagnostic-panel">
        <h3>🔬 Enhanced Diagnostic Analysis</h3>
        <div class="diagnostic-grid">
            <div class="diagnostic-card">
                <div class="diagnostic-title">Intelligent Start</div>
                <div class="diagnostic-value ${intelligentStartClass}">${diagnostics.intelligentStart ? 'YES' : 'NO'}</div>
                <div class="diagnostic-description">${diagnostics.intelligentStart ? 'Used GFA link for starting orientations' : 'Fallback to default orientations'}</div>
            </div>
            
            <div class="diagnostic-card">
                <div class="diagnostic-title">Overall Success Rate</div>
                <div class="diagnostic-value ${successClass}">${successRate.toFixed(1)}%</div>
                <div class="diagnostic-description">${diagnostics.perfectOverlaps + diagnostics.fuzzyOverlaps}/${diagnostics.totalSteps} successful overlaps</div>
            </div>
            
            <div class="diagnostic-card">
                <div class="diagnostic-title">Link Discovery Rate</div>
                <div class="diagnostic-value">${linkSuccessRate.toFixed(1)}%</div>
                <div class="diagnostic-description">${diagnostics.linksFound}/${diagnostics.totalSteps} GFA links found</div>
            </div>
            
            <div class="diagnostic-card">
                <div class="diagnostic-title">Perfect Overlaps</div>
                <div class="diagnostic-value success-rate">${diagnostics.perfectOverlaps}</div>
                <div class="diagnostic-description">Exact sequence matches (≥80% similarity)</div>
            </div>
            
            <div class="diagnostic-card">
                <div class="diagnostic-title">Fuzzy Overlaps</div>
                <div class="diagnostic-value warning-rate">${diagnostics.fuzzyOverlaps}</div>
                <div class="diagnostic-description">Acceptable matches (50-79% similarity)</div>
            </div>
            
            <div class="diagnostic-card">
                <div class="diagnostic-title">Gap Insertions</div>
                <div class="diagnostic-value error-rate">${diagnostics.gapInsertions}</div>
                <div class="diagnostic-description">Poor overlaps (&lt;50% similarity)</div>
            </div>
            
            <div class="diagnostic-card">
                <div class="diagnostic-title">Bidirectional Links</div>
                <div class="diagnostic-value">${diagnostics.bidirectionalLinks}</div>
                <div class="diagnostic-description">Reverse links found and transformed</div>
            </div>
            
            <div class="diagnostic-card">
                <div class="diagnostic-title">Direct Links</div>
                <div class="diagnostic-value">${diagnostics.directLinks}</div>
                <div class="diagnostic-description">Forward links used as-is</div>
            </div>
        </div>
    </div>
  `;
}

// Generate color-coded sequence with segment visualization
function generateColorCodedSequence(sequence, segments) {
  if (!sequence || segments.length === 0) {
    return sequence || '';
  }
  
  console.log('\n=== GENERATING COLOR-CODED SEQUENCE ===');
  
  // Create position mapping arrays
  const positionMap = new Array(sequence.length).fill(-1);
  const overlapMap = new Array(sequence.length).fill(false);
  
  // Map each position to its segment and detect overlaps
  segments.forEach((segment, segIndex) => {
    for (let pos = segment.start; pos < segment.end; pos++) {
      if (pos < sequence.length) {
        if (positionMap[pos] === -1) {
          positionMap[pos] = segIndex;
        } else {
          // Multiple segments claim this position - it's an overlap
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
    
    // Check if we need to close/open spans
    if (segmentIndex !== currentSegment || isOverlap !== currentIsOverlap) {
      // Close previous span
      if (i > 0) {
        coloredHtml += '</span>';
      }
      
      // Open new span
      const segClass = segmentIndex >= 0 ? `seg-${segmentIndex}` : '';
      const overlapClass = isOverlap ? ' overlap-indicator' : '';
      coloredHtml += `<span class="${segClass}${overlapClass}">`;
      
      currentSegment = segmentIndex;
      currentIsOverlap = isOverlap;
    }
    
    // Add character with line breaks every 80 characters
    coloredHtml += sequence[i];
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

// ===== EXPORT FUNCTIONS =====

/**
 * Main export function with enhanced intelligent starting orientation
 */
export function exportPathSequence(pathData, nodes, links) {
  if (!pathData || !pathData.sequence) {
    alert('No path selected for export');
    return;
  }
  
  console.log('\n🚀 === DIAGNOSTIC GFA SEQUENCE EXPORT WITH MERGED NODE SUPPORT ===');
  console.log(`📋 Exporting path: ${pathData.name}`);
  console.log(`🔗 Path sequence: ${pathData.sequence}`);
  console.log(`📊 Available nodes: ${nodes.length}`);
  console.log(`🔗 Available links: ${links.length}`);
  
  // Parse path and get node objects
  const nodeIds = pathData.sequence.split(',').map(id => id.trim());
  const nodeMap = new Map(nodes.map(n => [normalizeNodeId(n.id), n]));
  const pathNodes = nodeIds.map(id => nodeMap.get(normalizeNodeId(id))).filter(Boolean);
  
  if (pathNodes.length === 0) {
    alert('No valid nodes found in path');
    return;
  }
  
  console.log(`✅ Processing ${pathNodes.length} nodes in exact order: ${pathNodes.map(n => n.id).join(' → ')}`);
  
  // Check for merged nodes
  const mergedNodes = pathNodes.filter(node => isMergedNode(node));
  if (mergedNodes.length > 0) {
    console.log(`🔗 Found ${mergedNodes.length} merged node(s): ${mergedNodes.map(n => n.id).join(', ')}`);
  }
  
  if (pathNodes.length >= 2) {
    console.log(`🎯 Will analyze first link: ${pathNodes[0].id} → ${pathNodes[1].id} for intelligent starting orientations`);
  }
  
  // Show a quick preview of available links
  console.log(`\n📋 Quick link preview (first 10):`);
  links.slice(0, 10).forEach((link, i) => {
    const sourceId = normalizeNodeId(link.source.id || link.source);
    const targetId = normalizeNodeId(link.target.id || link.target);
    console.log(`  ${i + 1}. L ${sourceId} ${link.srcOrientation || '+'} ${targetId} ${link.tgtOrientation || '+'} ${link.overlap || '*'}`);
  });
  if (links.length > 10) {
    console.log(`  ... and ${links.length - 10} more links`);
  }
  
  // Reconstruct sequence with enhanced diagnostic support and merged node handling
  const result = reconstructSequenceFromPath(pathNodes, links, pathData.name, nodes, links);
  
  // Generate enhanced HTML report
  const htmlContent = generateSequenceReport(result);
  
  // Download file with diagnostic suffix
  const filename = `${pathData.name.replace(/[^a-zA-Z0-9]/g, '_')}_DIAGNOSTIC_sequence.html`;
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  console.log('\n🎉 === DIAGNOSTIC EXPORT COMPLETE ===');
  console.log(`📄 File: ${filename}`);
  console.log(`📏 Final sequence: ${result.totalLength.toLocaleString()}bp`);
  console.log(`🎯 Final path: ${result.segments.map(s => `${s.nodeId}${s.orientation}${s.isMerged ? '[M]' : ''}`).join(' → ')}`);
  
  if (result.diagnostics) {
    const successRate = ((result.diagnostics.perfectOverlaps + result.diagnostics.fuzzyOverlaps) / result.diagnostics.totalSteps * 100) || 0;
    console.log(`📊 Success rate: ${successRate.toFixed(1)}%`);
    console.log(`🔗 Links used: ${result.diagnostics.linksFound}/${result.diagnostics.totalSteps}`);
    if (result.diagnostics.mergedNodesProcessed > 0) {
      console.log(`🔗 Merged nodes processed: ${result.diagnostics.mergedNodesProcessed}`);
    }
  }
  
  console.log(`\n💡 TIP: Check the browser console above for complete diagnostic output!`);
}

export function exportMergedNodeSequence(mergedNode, originalNodes, originalLinks) {
  if (!mergedNode || !mergedNode.mergedFrom) {
    throw new Error('Not a merged node');
  }
  
  console.log(`Exporting merged node sequence: ${mergedNode.id}`);
  
  // Reconstruct the original path data for the sequence exporter
  const pathData = {
    name: `${mergedNode.pathName || 'Merged Node'} Sequence`,
    sequence: mergedNode.mergedFrom.join(','),
    nodes: new Set(mergedNode.mergedFrom),
    edges: new Set() // Will be recalculated by exporter
  };
  
  // Use the existing sequence exporter
  try {
    exportPathSequence(pathData, originalNodes, originalLinks);
    console.log(`Successfully exported merged node sequence`);
  } catch (error) {
    console.error(`Error exporting merged node sequence:`, error);
    throw error;
  }
}

// Export helper functions for UI integration (unchanged from original)
export function addExportButton() {
  const pathManagement = document.getElementById('pathManagement');
  if (!pathManagement || document.getElementById('exportPathSequence')) return;
  
  const navSection = pathManagement.querySelector('.nav-header');
  if (navSection) {
    const exportBtn = document.createElement('button');
    exportBtn.id = 'exportPathSequence';
    exportBtn.className = 'export-btn';
    exportBtn.textContent = 'Export Enhanced';
    exportBtn.title = 'Download enhanced diagnostic sequence file with intelligent starting orientation';
    exportBtn.disabled = true;
    
    navSection.appendChild(exportBtn);
    return exportBtn;
  }
}

export function createExportButton() {
  return addExportButton();
}