// complete-improved-sequence-exporter.js - Full code with individual overlap colors

/**
 * Parse GFA overlap string (e.g., "100M", "50M10I40M") 
 * Returns the overlap length in base pairs
 */
function parseGfaOverlap(overlapStr) {
  if (!overlapStr || overlapStr === '*' || overlapStr === '0M') {
    return 0;
  }
  
  // Handle simple cases like "100M" (100 matches)
  const simpleMatch = overlapStr.match(/^(\d+)M$/);
  if (simpleMatch) {
    return parseInt(simpleMatch[1], 10);
  }
  
  // Handle complex CIGAR strings - sum up matches and insertions/deletions
  const cigarOps = overlapStr.match(/(\d+)([MIDNSHPX=])/g);
  if (cigarOps) {
    let overlapLength = 0;
    cigarOps.forEach(op => {
      const match = op.match(/(\d+)([MIDNSHPX=])/);
      if (match) {
        const length = parseInt(match[1], 10);
        const operation = match[2];
        
        // Count operations that consume reference sequence
        if (['M', 'D', 'N', '=', 'X'].includes(operation)) {
          overlapLength += length;
        }
      }
    });
    return overlapLength;
  }
  
  // Fallback: try to extract any number
  const numberMatch = overlapStr.match(/(\d+)/);
  return numberMatch ? parseInt(numberMatch[1], 10) : 0;
}

/**
 * Find the overlap information between two consecutive nodes in a path
 */
function findOverlapBetweenNodes(nodeA, nodeB, links) {
  // Look for a link between these two nodes
  for (const link of links) {
    const sourceId = String(link.source.id || link.source);
    const targetId = String(link.target.id || link.target);
    
    if ((sourceId === String(nodeA.id) && targetId === String(nodeB.id)) ||
        (sourceId === String(nodeB.id) && targetId === String(nodeA.id))) {
      
      const overlapStr = link.overlap || '0M';
      const overlapLength = parseGfaOverlap(overlapStr);
      
      return {
        length: overlapLength,
        overlapStr: overlapStr,
        isReversed: sourceId === String(nodeB.id), // true if the link goes B->A instead of A->B
        srcOrientation: link.srcOrientation || '+',
        tgtOrientation: link.tgtOrientation || '+'
      };
    }
  }
  
  return { length: 0, overlapStr: '0M', isReversed: false, srcOrientation: '+', tgtOrientation: '+' };
}

/**
 * Get the sequence for a node, handling orientation
 */
function getNodeSequence(node, isReversed = false) {
  let sequence = node.seq || '';
  
  // Handle placeholder sequences
  if (sequence === '*' || sequence === '') {
    // Generate a placeholder sequence based on node length
    const length = node.length || 1000;
    sequence = 'N'.repeat(Math.min(length, 10000)); // Cap at 10kb for performance
  }
  
  // Reverse complement if needed
  if (isReversed) {
    sequence = reverseComplement(sequence);
  }
  
  return sequence.toUpperCase();
}

/**
 * Generate reverse complement of a DNA sequence
 */
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

/**
 * Determine if we need reverse complement based on GFA orientations
 */
function shouldReverseComplement(overlapInfo, isIntermediateNode) {
  // This is a simplified orientation logic - you may need to adjust based on your GFA specification
  const { srcOrientation, tgtOrientation, isReversed } = overlapInfo;
  
  // Basic logic: if target orientation is negative, we might need reverse complement
  if (tgtOrientation === '-') {
    return true;
  }
  
  return false;
}

/**
 * Calculate sequence similarity (0-1)
 */
function calculateSequenceSimilarity(seq1, seq2) {
  if (seq1.length !== seq2.length) return 0;
  if (seq1.length === 0) return 1;
  
  let matches = 0;
  for (let i = 0; i < seq1.length; i++) {
    if (seq1[i] === seq2[i]) matches++;
  }
  
  return matches / seq1.length;
}

/**
 * Debug function to analyze overlap patterns
 */
function debugOverlapAnalysis(pathNodes, links, mergedData) {
  console.log('=== OVERLAP ANALYSIS DEBUG ===');
  console.log(`Path: ${pathNodes.map(n => n.id).join(' → ')}`);
  
  pathNodes.forEach((node, i) => {
    console.log(`Node ${i} (${node.id}): length=${node.seq?.length || 'unknown'}`);
  });
  
  console.log('\nOverlap Details:');
  mergedData.overlaps.forEach((overlap, i) => {
    console.log(`Overlap ${i + 1}: ${overlap.nodeA} → ${overlap.nodeB}`);
    console.log(`  Position: ${overlap.start}-${overlap.end} (${overlap.end - overlap.start}bp)`);
    console.log(`  GFA String: "${overlap.overlapStr}"`);
    console.log(`  Sequence: "${overlap.sequence.substring(0, 50)}${overlap.sequence.length > 50 ? '...' : ''}"`);
  });
  
  console.log('\nSegment Analysis:');
  mergedData.segments.forEach((seg, i) => {
    console.log(`Segment ${i} (${seg.nodeId}): ${seg.start}-${seg.end} (${seg.sequence.length}bp)`);
    if (seg.hasGap) console.log(`  ⚠️  Has gap: ${seg.gapLength}bp`);
  });
  
  // Check for overlapping overlaps
  const sortedOverlaps = [...mergedData.overlaps].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sortedOverlaps.length - 1; i++) {
    const current = sortedOverlaps[i];
    const next = sortedOverlaps[i + 1];
    
    if (current.end > next.start) {
      console.log(`⚠️  OVERLAPPING OVERLAPS DETECTED:`);
      console.log(`   Overlap ${i + 1} (${current.nodeA}→${current.nodeB}): ${current.start}-${current.end}`);
      console.log(`   Overlap ${i + 2} (${next.nodeA}→${next.nodeB}): ${next.start}-${next.end}`);
      console.log(`   Overlap amount: ${current.end - next.start}bp`);
    }
  }
}

/**
 * Enhanced sequence merging with better overlap detection
 */
function mergePathSequencesImproved(pathNodes, links) {
  if (pathNodes.length === 0) {
    return { sequence: '', overlaps: [], segments: [] };
  }
  
  if (pathNodes.length === 1) {
    const sequence = getNodeSequence(pathNodes[0]);
    return { 
      sequence: sequence, 
      overlaps: [],
      segments: [{ nodeId: pathNodes[0].id, start: 0, end: sequence.length, sequence: sequence }]
    };
  }
  
  console.log('=== ENHANCED SEQUENCE MERGING ===');
  
  let mergedSequence = '';
  const overlaps = [];
  const segments = [];
  let currentPosition = 0;
  
  // Start with the first node
  const firstNodeSeq = getNodeSequence(pathNodes[0]);
  mergedSequence = firstNodeSeq;
  segments.push({
    nodeId: pathNodes[0].id,
    start: 0,
    end: firstNodeSeq.length,
    sequence: firstNodeSeq
  });
  currentPosition = firstNodeSeq.length;
  
  console.log(`Starting with node ${pathNodes[0].id}: ${firstNodeSeq.length}bp`);
  
  // Process each subsequent node
  for (let i = 1; i < pathNodes.length; i++) {
    const prevNode = pathNodes[i - 1];
    const currentNode = pathNodes[i];
    
    console.log(`\n--- Processing ${prevNode.id} → ${currentNode.id} ---`);
    
    // Find overlap between consecutive nodes
    const overlapInfo = findOverlapBetweenNodes(prevNode, currentNode, links);
    const overlapLength = overlapInfo.length;
    
    console.log(`Overlap info: ${overlapLength}bp (${overlapInfo.overlapStr})`);
    
    // Get the sequence for the current node
    const needsReverseComplement = shouldReverseComplement(overlapInfo, i > 1);
    const currentNodeSeq = getNodeSequence(currentNode, needsReverseComplement);
    
    console.log(`Current node ${currentNode.id}: ${currentNodeSeq.length}bp${needsReverseComplement ? ' (reverse complement)' : ''}`);
    
    if (overlapLength > 0) {
      // Check if overlap is reasonable (not longer than either sequence)
      const maxReasonableOverlap = Math.min(
        Math.floor(mergedSequence.length * 0.9), // Max 90% of previous sequence
        Math.floor(currentNodeSeq.length * 0.9)   // Max 90% of current sequence
      );
      
      const effectiveOverlap = Math.min(overlapLength, maxReasonableOverlap);
      
      if (effectiveOverlap !== overlapLength) {
        console.log(`⚠️  Overlap too large! Reducing from ${overlapLength}bp to ${effectiveOverlap}bp`);
      }
      
      // Verify overlap matches
      const prevNodeEnd = mergedSequence.slice(-effectiveOverlap);
      const currentNodeStart = currentNodeSeq.slice(0, effectiveOverlap);
      
      console.log(`Checking overlap match:`);
      console.log(`  Previous end (${effectiveOverlap}bp): "${prevNodeEnd.substring(0, 50)}${prevNodeEnd.length > 50 ? '...' : ''}"`);
      console.log(`  Current start (${effectiveOverlap}bp): "${currentNodeStart.substring(0, 50)}${currentNodeStart.length > 50 ? '...' : ''}"`);
      
      if (prevNodeEnd === currentNodeStart) {
        console.log(`✓ Perfect overlap match`);
        
        // Perfect overlap - merge by removing overlapping portion from current node
        const nonOverlappingPart = currentNodeSeq.slice(effectiveOverlap);
        
        // Record overlap information
        overlaps.push({
          start: currentPosition - effectiveOverlap,
          end: currentPosition,
          sequence: prevNodeEnd,
          nodeA: prevNode.id,
          nodeB: currentNode.id,
          overlapStr: overlapInfo.overlapStr,
          originalLength: overlapLength,
          effectiveLength: effectiveOverlap
        });
        
        console.log(`Adding overlap: pos ${currentPosition - effectiveOverlap}-${currentPosition}`);
        
        // Add non-overlapping part
        mergedSequence += nonOverlappingPart;
        
        segments.push({
          nodeId: currentNode.id,
          start: currentPosition,
          end: currentPosition + nonOverlappingPart.length,
          sequence: nonOverlappingPart,
          overlapStart: currentPosition - effectiveOverlap,
          overlapLength: effectiveOverlap
        });
        
        currentPosition += nonOverlappingPart.length;
        console.log(`Added ${nonOverlappingPart.length}bp from ${currentNode.id}, total length now ${currentPosition}bp`);
        
      } else {
        // Overlap mismatch - try fuzzy matching
        const similarity = calculateSequenceSimilarity(prevNodeEnd, currentNodeStart);
        console.log(`✗ Overlap mismatch (${(similarity * 100).toFixed(1)}% similarity)`);
        
        if (similarity > 0.8) {
          // High similarity - treat as valid overlap with warning
          console.log(`Using fuzzy overlap due to high similarity`);
          
          const nonOverlappingPart = currentNodeSeq.slice(effectiveOverlap);
          
          overlaps.push({
            start: currentPosition - effectiveOverlap,
            end: currentPosition,
            sequence: prevNodeEnd, // Use the previous sequence as reference
            nodeA: prevNode.id,
            nodeB: currentNode.id,
            overlapStr: overlapInfo.overlapStr + ' (fuzzy)',
            originalLength: overlapLength,
            effectiveLength: effectiveOverlap,
            isFuzzy: true
          });
          
          mergedSequence += nonOverlappingPart;
          
          segments.push({
            nodeId: currentNode.id,
            start: currentPosition,
            end: currentPosition + nonOverlappingPart.length,
            sequence: nonOverlappingPart,
            overlapStart: currentPosition - effectiveOverlap,
            overlapLength: effectiveOverlap,
            isFuzzy: true
          });
          
          currentPosition += nonOverlappingPart.length;
          
        } else {
          // Low similarity - add a gap indicator and continue
          const gapIndicator = `[MISMATCH:${effectiveOverlap}bp]`;
          mergedSequence += gapIndicator + currentNodeSeq;
          
          console.log(`Added gap indicator: ${gapIndicator}`);
          
          segments.push({
            nodeId: currentNode.id,
            start: currentPosition + gapIndicator.length,
            end: currentPosition + gapIndicator.length + currentNodeSeq.length,
            sequence: currentNodeSeq,
            hasGap: true,
            gapLength: effectiveOverlap,
            gapType: 'mismatch'
          });
          
          currentPosition += gapIndicator.length + currentNodeSeq.length;
        }
      }
    } else {
      // No overlap - just concatenate
      console.log(`No overlap - concatenating sequences`);
      mergedSequence += currentNodeSeq;
      
      segments.push({
        nodeId: currentNode.id,
        start: currentPosition,
        end: currentPosition + currentNodeSeq.length,
        sequence: currentNodeSeq
      });
      
      currentPosition += currentNodeSeq.length;
    }
  }
  
  const result = {
    sequence: mergedSequence,
    overlaps: overlaps,
    segments: segments
  };
  
  // Debug the final result
  debugOverlapAnalysis(pathNodes, links, result);
  
  return result;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Enhanced HTML generation with individual overlap colors
 */
function generateSequenceHTMLImproved(pathName, pathSequence, mergedData) {
  const { sequence, overlaps, segments } = mergedData;
  
  let html = `<!DOCTYPE html>
<html>
<head>
    <title>Path Sequence: ${pathName}</title>
    <style>
        body { font-family: 'Courier New', monospace; margin: 20px; line-height: 1.6; }
        .header { font-family: Arial, sans-serif; margin-bottom: 20px; }
        .sequence { font-size: 12px; word-break: break-all; white-space: pre-wrap; }
        
        /* Base overlap styles */
        .overlap { font-weight: bold; padding: 1px 2px; border: 1px solid rgba(0,0,0,0.3); }
        .fuzzy-overlap { font-weight: bold; padding: 1px 2px; border: 2px dashed rgba(0,0,0,0.5); }
        
        /* Individual overlap colors */
        .overlap-0 { background-color: #ffeb3b; border-color: #f57f17; } /* Yellow */
        .overlap-1 { background-color: #4caf50; border-color: #2e7d32; color: white; } /* Green */
        .overlap-2 { background-color: #2196f3; border-color: #1565c0; color: white; } /* Blue */
        .overlap-3 { background-color: #ff9800; border-color: #e65100; color: white; } /* Orange */
        .overlap-4 { background-color: #9c27b0; border-color: #6a1b9a; color: white; } /* Purple */
        .overlap-5 { background-color: #f44336; border-color: #c62828; color: white; } /* Red */
        .overlap-6 { background-color: #00bcd4; border-color: #00838f; color: white; } /* Cyan */
        .overlap-7 { background-color: #795548; border-color: #4e342e; color: white; } /* Brown */
        .overlap-8 { background-color: #607d8b; border-color: #37474f; color: white; } /* Blue Grey */
        .overlap-9 { background-color: #e91e63; border-color: #ad1457; color: white; } /* Pink */
        
        /* Other styles */
        .stats { background-color: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 4px; }
        .node-info { margin: 5px 0; font-size: 11px; color: #666; }
        .warning { color: #d32f2f; font-weight: bold; }
        .debug-info { background-color: #e3f2fd; padding: 10px; margin: 10px 0; border-radius: 4px; font-size: 11px; }
        
        /* Legend styles */
        .overlap-legend { 
          background-color: #f8f9fa; 
          padding: 15px; 
          margin: 15px 0; 
          border-radius: 4px; 
          border: 1px solid #dee2e6;
        }
        .legend-item { 
          display: inline-block; 
          margin: 3px 8px; 
          padding: 2px 6px; 
          border-radius: 3px; 
          font-size: 11px;
          font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Path Sequence Export</h1>
        <h2>Path: ${pathName}</h2>
        <p><strong>Original Path:</strong> ${pathSequence}</p>
        
        <div class="stats">
            <strong>Statistics:</strong><br>
            Total Length: ${sequence.length.toLocaleString()} bp<br>
            Number of Nodes: ${segments.length}<br>
            Number of Overlaps: ${overlaps.length}<br>
            Total Overlap Length: ${overlaps.reduce((sum, o) => sum + o.effectiveLength, 0)} bp<br>
            ${overlaps.some(o => o.isFuzzy) ? '<span class="warning">⚠️ Contains fuzzy overlaps</span><br>' : ''}
            ${segments.some(s => s.hasGap) ? '<span class="warning">⚠️ Contains gaps/mismatches</span><br>' : ''}
        </div>
        
        <div class="overlap-legend">
            <strong>Overlap Legend:</strong><br>
            ${overlaps.map((overlap, index) => {
              const colorClass = overlap.isFuzzy ? 'fuzzy-overlap' : `overlap overlap-${index % 10}`;
              return `<span class="${colorClass}" style="margin: 2px 4px; padding: 2px 6px; font-size: 10px;">
                ${index + 1}. ${overlap.nodeA} → ${overlap.nodeB} (${overlap.effectiveLength}bp)
              </span>`;
            }).join('<br>')}
        </div>
        
        <div class="debug-info">
            <strong>Detailed Overlap Analysis:</strong><br>
            ${overlaps.map((o, i) => 
              `${i + 1}. ${o.nodeA} → ${o.nodeB}: ${o.effectiveLength}bp at pos ${o.start}-${o.end}${o.originalLength !== o.effectiveLength ? ` (reduced from ${o.originalLength}bp)` : ''}${o.isFuzzy ? ' (fuzzy match)' : ''}`
            ).join('<br>')}
        </div>
        
        <div class="node-info">
            <strong>Node Segments:</strong><br>
            ${segments.map(seg => 
              `${seg.nodeId}: ${seg.start}-${seg.end} (${seg.sequence.length} bp)${seg.hasGap ? ` [${seg.gapType?.toUpperCase() || 'GAP'}: ${seg.gapLength} bp]` : ''}${seg.isFuzzy ? ' (fuzzy overlap)' : ''}`
            ).join('<br>')}
        </div>
    </div>
    
    <h3>Merged Sequence (overlaps highlighted with unique colors):</h3>
    <div class="sequence">`;
  
  // Build sequence with properly separated overlaps using unique colors
  let lastPos = 0;
  const sortedOverlaps = [...overlaps].sort((a, b) => a.start - b.start);
  
  sortedOverlaps.forEach((overlap, index) => {
    // Add normal sequence before overlap
    if (overlap.start > lastPos) {
      html += escapeHtml(sequence.slice(lastPos, overlap.start));
    }
    
    // Find the original index of this overlap for consistent coloring
    const originalIndex = overlaps.indexOf(overlap);
    
    // Add highlighted overlap with unique color
    const overlapClass = overlap.isFuzzy ? 
      'fuzzy-overlap' : 
      `overlap overlap-${originalIndex % 10}`;
    
    const title = `Overlap ${originalIndex + 1}: ${overlap.nodeA} → ${overlap.nodeB} (${overlap.overlapStr})${overlap.isFuzzy ? ' - Fuzzy match' : ''}`;
    
    html += `<span class="${overlapClass}" title="${title}">${escapeHtml(overlap.sequence)}</span>`;
    
    lastPos = overlap.end;
  });
  
  // Add remaining sequence
  if (lastPos < sequence.length) {
    html += escapeHtml(sequence.slice(lastPos));
  }
  
  html += `</div>
</body>
</html>`;
  
  return html;
}

/**
 * Add export button to the path management UI
 */
export function addExportButton() {
  const pathManagement = document.getElementById('pathManagement');
  if (!pathManagement) return;
  
  // Check if button already exists
  if (document.getElementById('exportPathSequence')) return;
  
  // Find the navigation section to add the button
  const navSection = pathManagement.querySelector('.nav-header');
  if (navSection) {
    const exportBtn = document.createElement('button');
    exportBtn.id = 'exportPathSequence';
    exportBtn.className = 'export-btn';
    exportBtn.textContent = 'Export Sequence';
    exportBtn.title = 'Download sequence file for selected path';
    exportBtn.disabled = true; // Initially disabled
    
    navSection.appendChild(exportBtn);
    
    return exportBtn;
  }
}

/**
 * Enhanced export function with individual overlap colors
 */
export function exportPathSequenceImproved(pathData, nodes, links) {
  if (!pathData || !pathData.sequence) {
    alert('No path selected for export');
    return;
  }
  
  // Get node objects for the path
  const nodeIds = pathData.sequence.split(',').map(id => id.trim());
  const nodeMap = new Map(nodes.map(n => [String(n.id), n]));
  const pathNodes = nodeIds.map(id => nodeMap.get(id)).filter(Boolean);
  
  if (pathNodes.length === 0) {
    alert('No valid nodes found in path');
    return;
  }
  
  console.log('=== ENHANCED PATH SEQUENCE EXPORT ===');
  console.log('Path:', pathData.name);
  console.log('Nodes:', pathNodes.map(n => `${n.id} (${n.seq?.length || 'unknown'}bp)`));
  
  // Merge sequences with improved overlap handling
  const mergedData = mergePathSequencesImproved(pathNodes, links);
  
  // Generate improved HTML content with individual overlap colors
  const htmlContent = generateSequenceHTMLImproved(pathData.name, pathData.sequence, mergedData);
  
  // Create and download file
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${pathData.name.replace(/[^a-zA-Z0-9]/g, '_')}_sequence_improved.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  console.log('=== EXPORT SUMMARY ===');
  console.log(`Final sequence length: ${mergedData.sequence.length.toLocaleString()}bp`);
  console.log(`Overlaps processed: ${mergedData.overlaps.length}`);
  console.log(`Segments created: ${mergedData.segments.length}`);
  
  if (mergedData.overlaps.some(o => o.isFuzzy)) {
    console.log('⚠️  Some overlaps were fuzzy matches');
  }
  
  if (mergedData.segments.some(s => s.hasGap)) {
    console.log('⚠️  Some segments have gaps or mismatches');
  }
}

/**
 * Original export function for backward compatibility
 */
export function exportPathSequence(pathData, nodes, links) {
  // Just call the improved version
  return exportPathSequenceImproved(pathData, nodes, links);
}