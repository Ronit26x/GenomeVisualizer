// main.js - COMPLETE: Enhanced with node merging functionality

import { exportAllPathsToFile, showExportPreviewDialog, addExportStyles } from './path-exporter.js';
import { importPathsFromText, showImportResultsDialog, addImportStyles } from './path-importer.js';
import { parseDot, parseGfa }       from './parser.js';
import { createSimulation }         from './simulation.js';
import { clearCanvas, drawGraph }   from './renderer.js';
import { flipSelectedNode, getSubnodeAt } from './gfa-renderer.js';
import { updatePathsAfterResolution, showPathUpdateSummary } from './path-updater.js';
import { showPathUpdateDialog, markUpdatedPathsInUI, addPathUpdateStyles } from './path-update-ui.js';
import { setupUI }                  from './ui.js';
import { exportPathSequence, addExportButton } from './sequence-exporter.js';
import { mergeNodesFromPath, exportMergedNodeSequence, isMergedNode, getMergedNodeInfo, updatePathsAfterMerge, mergeLinearChainFromNode } from './node-merger.js';

const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');
let transform = d3.zoomIdentity;
let simulation, nodes = [], links = [], history = [];
let currentFormat = 'dot'; // Track current format
const selected    = { nodes: new Set(), edges: new Set() };
const pinnedNodes = new Set();
const highlightedPath = { nodes: new Set(), edges: new Set(), currentColor: '#ff6b6b' }; // Track highlighted path with color

// NEW: Multi-path management state
let exportButton = null;
let savedPaths = []; // Array of saved path objects
let currentPathIndex = -1; // Index of currently displayed path (-1 = none)
let nextPathId = 1; // Counter for generating unique path IDs

// Color palette for different paths
const PATH_COLORS = [
  '#ff6b6b', // Red
  '#4ecdc4', // Teal
  '#45b7d1', // Blue
  '#96ceb4', // Green
  '#feca57', // Yellow
  '#ff9ff3', // Pink
  '#54a0ff', // Light Blue
  '#5f27cd', // Purple
  '#00d2d3', // Cyan
  '#ff9f43'  // Orange
];

function getNextPathColor() {
  return PATH_COLORS[(savedPaths.length) % PATH_COLORS.length];
}

function logEvent(msg) {
  document.getElementById('debug').innerText += msg + '\n';
}

function resizeCanvas() {
  canvas.width  = document.getElementById('viz').clientWidth;
  canvas.height = document.getElementById('viz').clientHeight;
  if (simulation) {
    simulation.force(
      'center',
      d3.forceCenter(canvas.width/2, canvas.height/2)
    );
  }
  drawGraph(ctx, canvas, transform, nodes, links, pinnedNodes, selected, currentFormat, highlightedPath);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Initialize path update styles
addPathUpdateStyles();

d3.select(canvas).call(
  d3.zoom()
    .scaleExtent([0.01, 10])
    .on('zoom', ({transform: t}) => {
      transform = t;
      drawGraph(ctx, canvas, transform, nodes, links, pinnedNodes, selected, currentFormat, highlightedPath);
    })
);

function startSimulation() {
  logEvent(`Rendering graph: ${nodes.length} nodes, ${links.length} edges`);
  history.push({
    nodes: JSON.parse(JSON.stringify(nodes)),
    links: JSON.parse(JSON.stringify(links))
  });
  if (history.length > 20) history.shift();

  if (simulation) simulation.stop();
  simulation = createSimulation(
    nodes, links,
    canvas.width, canvas.height,
    () => drawGraph(ctx, canvas, transform, nodes, links, pinnedNodes, selected, currentFormat, highlightedPath)
  );

  // ADD THESE LINES:
  window.nodes = nodes;
  window.links = links;
}

function parseGraph(text, name) {
  let fmt = name.toLowerCase().endsWith('.gfa') ? 'gfa' : 'dot';
  if (fmt==='dot' && (/^H\t|^S\t/m).test(text)) {
    logEvent('→ Detected GFA content despite .dot; switching');
    fmt = 'gfa';
  }
  currentFormat = fmt;
  
  // Update UI based on format
  if (window.updateUIForFormat) {
    window.updateUIForFormat(fmt);
  }
  
  logEvent(`Parsing ${fmt} graph`);
  const parsed = fmt==='dot'
    ? parseDot(text, logEvent)
    : parseGfa(text, logEvent);

  const nodeSet = new Set(parsed.nodes.map(n=>n.id));
  nodes = parsed.nodes;
  links = parsed.links.filter(l=>nodeSet.has(l.source)&&nodeSet.has(l.target));
  startSimulation();

  // ADD THESE LINES:
  window.nodes = nodes;
  window.links = links;
}

function generateRandom() {
  currentFormat = 'dot';
  
  // Update UI based on format
  if (window.updateUIForFormat) {
    window.updateUIForFormat('dot');
  }
  
  nodes = d3.range(50).map(i=>({id:i}));
  links = d3.range(49).map(i=>({source:i,target:i+1}));
  startSimulation();

  // ADD THESE LINES:
  window.nodes = nodes;
  window.links = links;
}

function pinSelected() {
  nodes.forEach(d=>{
    if (selected.nodes.has(d.id)) {
      d.fx = d.x; d.fy = d.y;
      pinnedNodes.add(d.id);
    }
  });
  simulation.alpha(0.1).restart();
}

// Flip selected nodes
function flipSelected() {
  if (currentFormat !== 'gfa') {
    logEvent('Node flipping is only available for GFA graphs');
    return;
  }
  
  if (selected.nodes.size === 0) {
    logEvent('No nodes selected for flipping');
    return;
  }
  
  const flipped = flipSelectedNode(nodes, selected);
  if (flipped) {
    logEvent(`Flipped ${selected.nodes.size} node(s)`);
    // Restart simulation with low alpha to settle the layout
    simulation.alpha(0.1).restart();
    drawGraph(ctx, canvas, transform, nodes, links, pinnedNodes, selected, currentFormat, highlightedPath);
  }
}

// NEW: Merge selected nodes from current path
function mergeSelectedNodes() {
  if (selected.nodes.size !== 1) {
    alert('Please select exactly one node to start linear chain detection');
    logEvent('Linear chain merge requires exactly one selected node');
    return;
  }
  
  const selectedNodeId = Array.from(selected.nodes)[0];
  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  
  if (!selectedNode) {
    alert('Selected node not found');
    logEvent('Selected node not found in graph');
    return;
  }
  
  try {
    logEvent(`Starting linear chain detection from node: ${selectedNode.id}`);
    
    // Store original state for undo
    history.push({
      nodes: JSON.parse(JSON.stringify(nodes)),
      links: JSON.parse(JSON.stringify(links))
    });
    if (history.length > 20) history.shift();
    
    // Use the new linear chain detection
    const mergeResult = mergeLinearChainFromNode(selectedNode, nodes, links);
    
    if (mergeResult.success) {
      // Update the graph
      nodes = mergeResult.newNodes;
      links = mergeResult.newLinks;
      
      // Update global references
      window.nodes = nodes;
      window.links = links;
      
      // Update saved paths to reflect the merge
      savedPaths = updatePathsAfterMerge(savedPaths, mergeResult);
      
      // Clear current path selection since nodes may have been merged
      currentPathIndex = -1;
      highlightedPath.nodes.clear();
      highlightedPath.edges.clear();
      
      // Clear node selection
      selected.nodes.clear();
      selected.edges.clear();
      
      // Update UI
      updatePathUI();
      updateMergeButtons();
      
      // Restart simulation
      startSimulation();
      
      logEvent(`✅ Successfully merged linear chain: ${mergeResult.originalNodeIds.join(' → ')} into ${mergeResult.mergedNodeId}`);
      logEvent(`   Chain length: ${mergeResult.removedNodes} nodes`);
      logEvent(`   Preserved ${mergeResult.externalConnections} external connections`);
      
    } else {
      throw new Error('Linear chain merge operation failed');
    }
    
  } catch (error) {
    console.error('Error during linear chain merge:', error);
    alert(`Error merging linear chain: ${error.message}`);
    logEvent(`❌ Linear chain merge failed: ${error.message}`);
  }
}

function exportMergedSequence() {
  if (selected.nodes.size !== 1) {
    alert('Please select exactly one merged node to export its sequence');
    return;
  }
  
  const selectedNodeId = Array.from(selected.nodes)[0];
  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  
  if (!selectedNode || !isMergedNode(selectedNode)) {
    alert('Selected node is not a merged node');
    return;
  }
  
  try {
    logEvent(`Exporting sequence for merged node: ${selectedNode.id}`);
    
    // Use the data stored directly in the merged node
    const originalNodes = selectedNode.originalNodes || [];
    const originalLinks = selectedNode.originalLinks || [];
    
    console.log(`Using stored data: ${originalNodes.length} nodes, ${originalLinks.length} links`);
    
    if (originalNodes.length === 0) {
      throw new Error('No original nodes stored in merged node');
    }
    
    exportMergedNodeSequence(selectedNode, originalNodes, originalLinks);
    logEvent(`Exported sequence for merged node "${selectedNode.pathName || selectedNode.id}"`);
    
  } catch (error) {
    console.error('Error exporting merged sequence:', error);
    alert(`Error exporting sequence: ${error.message}`);
    logEvent(`Export failed: ${error.message}`);
  }
}

// NEW: Update merge button states
function updateMergeButtons() {
  const mergeBtn = document.getElementById('mergeNodes');
  const exportMergedBtn = document.getElementById('exportMergedSequence');
  
  // Merge button: enabled when exactly one node is selected
  if (mergeBtn) {
    const hasValidSelection = selected.nodes.size === 1;
    
    mergeBtn.disabled = !hasValidSelection;
    
    if (hasValidSelection) {
      const selectedNodeId = Array.from(selected.nodes)[0];
      mergeBtn.textContent = `Merge Linear Chain from ${selectedNodeId}`;
    } else {
      mergeBtn.textContent = 'Merge Linear Chain';
    }
  }
  
  // Export merged sequence button: enabled when exactly one merged node is selected
  if (exportMergedBtn) {
    const hasSelectedMergedNode = selected.nodes.size === 1 && 
                                 nodes.find(n => n.id === Array.from(selected.nodes)[0] && isMergedNode(n));
    
    exportMergedBtn.disabled = !hasSelectedMergedNode;
  }
}
// DEBUG: Pre-resolution debugging function
function debugVertexConnections(vertexId) {
  console.log('=== PRE-RESOLUTION DEBUG ===');
  console.log('Debugging vertex:', vertexId);
  
  const vertex = nodes.find(n => n.id === vertexId);
  console.log('Vertex object:', vertex);
  
  console.log('\n=== ALL LINKS IN GRAPH ===');
  links.forEach((link, index) => {
    const sourceId = (typeof link.source === 'object') ? link.source.id : link.source;
    const targetId = (typeof link.target === 'object') ? link.target.id : link.target;
    
    if (sourceId === vertexId || targetId === vertexId) {
      console.log(`Link ${index}:`, {
        sourceId,
        targetId,
        sourceType: typeof link.source,
        targetType: typeof link.target,
        fullLink: link
      });
    }
  });
  
  const connections = getVertexConnections(vertexId);
  console.log('\n=== PARSED CONNECTIONS ===');
  console.log('Incoming connections:', connections.incoming);
  console.log('Outgoing connections:', connections.outgoing);
  
  const combinations = generatePathCombinations(connections.incoming, connections.outgoing);
  console.log('\n=== GENERATED COMBINATIONS ===');
  combinations.forEach((combo, index) => {
    console.log(`Combo ${index}:`, {
      description: combo.description,
      hasIncoming: !!combo.incoming,
      hasOutgoing: !!combo.outgoing,
      incomingDetails: combo.incoming ? {
        sourceId: combo.incoming.sourceId,
        linkIndex: combo.incoming.linkIndex
      } : null,
      outgoingDetails: combo.outgoing ? {
        targetId: combo.outgoing.targetId,
        linkIndex: combo.outgoing.linkIndex
      } : null
    });
  });
  
  // Also debug physical connections
  const physicalConnections = getPhysicalConnections(vertexId);
  console.log('\n=== PHYSICAL CONNECTIONS ===');
  console.log('Red subnode connections:', physicalConnections.red);
  console.log('Green subnode connections:', physicalConnections.green);
}

// LOGICAL RESOLUTION FUNCTIONS (existing)
function getVertexConnections(vertexId) {
  const incoming = [];
  const outgoing = [];

  links.forEach((link, index) => {
    // Handle both string IDs and object references (post-simulation)
    const sourceId = (typeof link.source === 'object') ? link.source.id : link.source;
    const targetId = (typeof link.target === 'object') ? link.target.id : link.target;

    if (targetId === vertexId) {
      incoming.push({
        linkIndex: index,
        link: link,
        sourceId: sourceId,
        sourceNode: (typeof link.source === 'object') ? link.source : nodes.find(n => n.id === sourceId),
        orientation: link.tgtOrientation || '+'
      });
    }
    if (sourceId === vertexId) {
      outgoing.push({
        linkIndex: index,
        link: link,
        targetId: targetId,
        targetNode: (typeof link.target === 'object') ? link.target : nodes.find(n => n.id === targetId),
        orientation: link.srcOrientation || '+'
      });
    }
  });

  console.log(`Vertex ${vertexId}: ${incoming.length} incoming, ${outgoing.length} outgoing edges`);
  return { incoming, outgoing };
}

function generatePathCombinations(incoming, outgoing) {
  const combinations = [];
  
  // If no incoming edges, create combinations with just outgoing
  if (incoming.length === 0) {
    outgoing.forEach(out => {
      combinations.push({
        incoming: null,
        outgoing: out,
        id: `start_${out.targetId}`,
        description: `Start → ${out.targetId}`
      });
    });
  }
  // If no outgoing edges, create combinations with just incoming
  else if (outgoing.length === 0) {
    incoming.forEach(inc => {
      combinations.push({
        incoming: inc,
        outgoing: null,
        id: `${inc.sourceId}_end`,
        description: `${inc.sourceId} → End`
      });
    });
  }
  // Normal case: all combinations of incoming and outgoing
  else {
    incoming.forEach(inc => {
      outgoing.forEach(out => {
        combinations.push({
          incoming: inc,
          outgoing: out,
          id: `${inc.sourceId}_${out.targetId}`,
          description: `${inc.sourceId} → ${out.targetId}`
        });
      });
    });
  }

  console.log(`Generated ${combinations.length} path combinations`);
  return combinations;
}

// PHYSICAL RESOLUTION FUNCTIONS (existing)
function getPhysicalConnections(vertexId) {
  const redConnections = [];   // Edges connected to red subnode (incoming end)
  const greenConnections = [];  // Edges connected to green subnode (outgoing end)

  links.forEach((link, index) => {
    const sourceId = (typeof link.source === 'object') ? link.source.id : link.source;
    const targetId = (typeof link.target === 'object') ? link.target.id : link.target;
    
    // Check if this link involves our vertex
    if (sourceId === vertexId) {
      // This vertex is the SOURCE of the edge
      const srcOrientation = link.srcOrientation || '+';
      
      if (srcOrientation === '+') {
        // Positive orientation: edge leaves from green subnode (outgoing end)
        greenConnections.push({
          linkIndex: index,
          link: link,
          targetId: targetId,
          targetNode: (typeof link.target === 'object') ? link.target : nodes.find(n => n.id === targetId),
          orientation: srcOrientation,
          direction: 'outgoing'
        });
      } else {
        // Negative orientation: edge leaves from red subnode (incoming end)
        redConnections.push({
          linkIndex: index,
          link: link,
          targetId: targetId,
          targetNode: (typeof link.target === 'object') ? link.target : nodes.find(n => n.id === targetId),
          orientation: srcOrientation,
          direction: 'outgoing'
        });
      }
    }
    
    if (targetId === vertexId) {
      // This vertex is the TARGET of the edge
      const tgtOrientation = link.tgtOrientation || '+';
      
      if (tgtOrientation === '+') {
        // Positive orientation: edge enters through red subnode (incoming end)
        redConnections.push({
          linkIndex: index,
          link: link,
          sourceId: sourceId,
          sourceNode: (typeof link.source === 'object') ? link.source : nodes.find(n => n.id === sourceId),
          orientation: tgtOrientation,
          direction: 'incoming'
        });
      } else {
        // Negative orientation: edge enters through green subnode (outgoing end)
        greenConnections.push({
          linkIndex: index,
          link: link,
          sourceId: sourceId,
          sourceNode: (typeof link.source === 'object') ? link.source : nodes.find(n => n.id === sourceId),
          orientation: tgtOrientation,
          direction: 'incoming'
        });
      }
    }
  });

  console.log(`Physical connections for ${vertexId}: ${redConnections.length} red subnode, ${greenConnections.length} green subnode`);
  return { red: redConnections, green: greenConnections };
}

function generatePhysicalCombinations(redConnections, greenConnections) {
  const combinations = [];
  
  // If no red connections, create combinations with just green
  if (redConnections.length === 0) {
    greenConnections.forEach(green => {
      combinations.push({
        red: null,
        green: green,
        id: `start_${green.targetId || green.sourceId}`,
        description: `Start → ${green.targetId || green.sourceId} (green)`
      });
    });
  }
  // If no green connections, create combinations with just red
  else if (greenConnections.length === 0) {
    redConnections.forEach(red => {
      combinations.push({
        red: red,
        green: null,
        id: `${red.sourceId || red.targetId}_end`,
        description: `${red.sourceId || red.targetId} (red) → End`
      });
    });
  }
  // Normal case: all combinations of red and green connections
  else {
    redConnections.forEach(red => {
      greenConnections.forEach(green => {
        const redNode = red.sourceId || red.targetId;
        const greenNode = green.targetId || green.sourceId;
        combinations.push({
          red: red,
          green: green,
          id: `${redNode}_${greenNode}`,
          description: `${redNode} (red) ↔ ${greenNode} (green)`
        });
      });
    });
  }

  console.log(`Generated ${combinations.length} physical combinations`);
  return combinations;
}

// SHARED DIALOG FUNCTIONS
function showResolveDialog(vertexId) {
  const vertex = nodes.find(n => n.id === vertexId);
  if (!vertex) return;

  const connections = getVertexConnections(vertexId);
  const combinations = generatePathCombinations(connections.incoming, connections.outgoing);

  // Populate vertex info
  document.getElementById('vertexInfo').innerHTML = `
    <strong>Logical Resolution for Vertex:</strong> ${vertexId}<br>
    <strong>Incoming edges:</strong> ${connections.incoming.length}<br>
    <strong>Outgoing edges:</strong> ${connections.outgoing.length}<br>
    <strong>Possible paths:</strong> ${combinations.length}<br>
    <em>Note: Based on logical graph connections (source → target)</em>
  `;

  // Populate path combinations
  const pathContainer = document.getElementById('pathCombinations');
  pathContainer.innerHTML = '';

  combinations.forEach((combo, index) => {
    const div = document.createElement('div');
    div.className = 'path-combination';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `path_${index}`;
    checkbox.checked = true; // Default to all selected
    checkbox.dataset.comboIndex = index;

    const label = document.createElement('label');
    label.setAttribute('for', `path_${index}`);
    
    let labelHTML = `<span class="incoming-edge">${combo.incoming ? combo.incoming.sourceId : 'START'}</span>`;
    labelHTML += ` → <strong>${vertexId}</strong> → `;
    labelHTML += `<span class="outgoing-edge">${combo.outgoing ? combo.outgoing.targetId : 'END'}</span>`;
    
    if (combo.incoming || combo.outgoing) {
      labelHTML += `<span class="edge-info">(${combo.description})</span>`;
    }

    label.innerHTML = labelHTML;
    
    div.appendChild(checkbox);
    div.appendChild(label);
    pathContainer.appendChild(div);
  });

  // Update stats
  updateResolutionStats(combinations.length, combinations.length);

  // Add event listeners for checkboxes
  pathContainer.addEventListener('change', () => {
    const checked = pathContainer.querySelectorAll('input[type="checkbox"]:checked').length;
    updateResolutionStats(combinations.length, checked);
  });

  // Store data for resolution
  window.currentResolution = {
    vertex: vertex,
    combinations: combinations,
    connections: connections
  };

  // Show dialog
  document.getElementById('dialogOverlay').style.display = 'block';
  document.getElementById('resolveDialog').style.display = 'block';
}

function showPhysicalResolveDialog(vertexId) {
  const vertex = nodes.find(n => n.id === vertexId);
  if (!vertex) return;

  const connections = getPhysicalConnections(vertexId);
  const combinations = generatePhysicalCombinations(connections.red, connections.green);

  // Populate vertex info
  document.getElementById('vertexInfo').innerHTML = `
    <strong>Physical Resolution for Vertex:</strong> ${vertexId}<br>
    <strong>Red subnode connections:</strong> ${connections.red.length}<br>
    <strong>Green subnode connections:</strong> ${connections.green.length}<br>
    <strong>Physical path combinations:</strong> ${combinations.length}<br>
    <em>Note: Based on physical red/green subnode connections</em>
  `;

  // Populate path combinations
  const pathContainer = document.getElementById('pathCombinations');
  pathContainer.innerHTML = '';

  combinations.forEach((combo, index) => {
    const div = document.createElement('div');
    div.className = 'path-combination physical-combination';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `physical_path_${index}`;
    checkbox.checked = true; // Default to all selected
    checkbox.dataset.comboIndex = index;

    const label = document.createElement('label');
    label.setAttribute('for', `physical_path_${index}`);
    
    let labelHTML = `<span class="red-connection">${combo.red ? (combo.red.sourceId || combo.red.targetId) : 'NONE'}</span>`;
    labelHTML += ` → <strong>${vertexId}</strong> → `;
    labelHTML += `<span class="green-connection">${combo.green ? (combo.green.targetId || combo.green.sourceId) : 'NONE'}</span>`;
    labelHTML += `<span class="edge-info">(${combo.description})</span>`;

    label.innerHTML = labelHTML;
    
    div.appendChild(checkbox);
    div.appendChild(label);
    pathContainer.appendChild(div);
  });

  // Update stats
  updateResolutionStats(combinations.length, combinations.length);

  // Add event listeners for checkboxes
  pathContainer.addEventListener('change', () => {
    const checked = pathContainer.querySelectorAll('input[type="checkbox"]:checked').length;
    updateResolutionStats(combinations.length, checked);
  });

  // Store data for resolution
  window.currentPhysicalResolution = {
    vertex: vertex,
    combinations: combinations,
    connections: connections
  };

  // Show dialog with physical resolution mode
  document.getElementById('physicalModeIndicator').style.display = 'block';
  document.getElementById('dialogOverlay').style.display = 'block';
  document.getElementById('resolveDialog').style.display = 'block';
}

function updateResolutionStats(total, selected) {
  document.getElementById('resolutionStats').textContent = 
    `${selected} of ${total} paths selected. ${total - selected} paths will be removed.`;
}

function hideResolveDialog() {
  document.getElementById('physicalModeIndicator').style.display = 'none';
  document.getElementById('dialogOverlay').style.display = 'none';
  document.getElementById('resolveDialog').style.display = 'none';
  window.currentResolution = null;
  window.currentPhysicalResolution = null;
}

// UPDATED: Logical resolution execution with path updates
function performVertexResolution() {
  if (!window.currentResolution) return;

  const { vertex, combinations, connections } = window.currentResolution;
  const selectedCombos = [];

  // Get selected combinations
  document.querySelectorAll('#pathCombinations input[type="checkbox"]:checked').forEach(checkbox => {
    const index = parseInt(checkbox.dataset.comboIndex);
    selectedCombos.push(combinations[index]);
  });

  if (selectedCombos.length === 0) {
    alert('Please select at least one path to keep.');
    return;
  }

  console.log('=== LOGICAL VERTEX RESOLUTION WITH PATH UPDATES ===');
  console.log('Original vertex:', vertex.id);
  console.log('Selected combinations:', selectedCombos.length);
  
  // Store original paths before resolution
  const originalPaths = [...savedPaths];
  
  logEvent(`Resolving vertex ${vertex.id} into ${selectedCombos.length} copies`);

  // Create new nodes first
  const newNodes = [];
  selectedCombos.forEach((combo, index) => {
    const newNodeId = selectedCombos.length === 1 ? vertex.id : `${vertex.id}_${index + 1}`;
    const newNode = {
      ...vertex,
      id: newNodeId,
      originalId: vertex.id,
      pathDescription: combo.description,
      resolutionType: 'logical',
      x: vertex.x,
      y: vertex.y,
      vx: 0,
      vy: 0
    };
    
    if (selectedCombos.length > 1) {
      const angleOffset = (index * 2 * Math.PI) / selectedCombos.length;
      const radius = 60;
      newNode.x = vertex.x + radius * Math.cos(angleOffset);
      newNode.y = vertex.y + radius * Math.sin(angleOffset);
    }

    newNodes.push(newNode);
  });

  // Remove original vertex and edges, add new nodes and edges
  nodes = nodes.filter(n => n.id !== vertex.id);
  links = links.filter(link => {
    const sourceId = (typeof link.source === 'object') ? link.source.id : link.source;
    const targetId = (typeof link.target === 'object') ? link.target.id : link.target;
    return sourceId !== vertex.id && targetId !== vertex.id;
  });

  nodes.push(...newNodes);

  // Create new edges
  const newLinks = [];
  selectedCombos.forEach((combo, index) => {
    const newNodeId = selectedCombos.length === 1 ? vertex.id : `${vertex.id}_${index + 1}`;
    
    if (combo.incoming) {
      newLinks.push({
        ...combo.incoming.link,
        target: newNodeId,
        source: combo.incoming.sourceId
      });
    }

    if (combo.outgoing) {
      newLinks.push({
        ...combo.outgoing.link,
        source: newNodeId,
        target: combo.outgoing.targetId
      });
    }
  });

  links.push(...newLinks);

  // Update global references for path updater
  window.nodes = nodes;
  window.links = links;

  // UPDATE PATHS AFTER RESOLUTION
  const resolutionData = {
    originalVertex: vertex,
    newVertices: newNodes,
    resolutionType: 'logical'
  };
  
  const updatedPaths = updatePathsAfterResolution(originalPaths, resolutionData);
  
  // Update global savedPaths
  savedPaths.splice(0, savedPaths.length, ...updatedPaths);
  
  // Update current path index if needed
  if (currentPathIndex >= 0 && currentPathIndex < savedPaths.length) {
    const currentPath = savedPaths[currentPathIndex];
    highlightedPath.nodes = new Set(currentPath.nodes);
    highlightedPath.edges = new Set(currentPath.edges);
    highlightedPath.currentColor = currentPath.color;
  } else {
    currentPathIndex = -1;
    highlightedPath.nodes.clear();
    highlightedPath.edges.clear();
  }
  
  // Show summary of path updates
  const summary = showPathUpdateSummary(originalPaths, updatedPaths, vertex.id);
  logEvent(summary);

  // Show detailed dialog if there were affected paths
  const affectedPaths = originalPaths.filter(path => 
    Array.from(path.nodes).includes(vertex.id)
  );
  if (affectedPaths.length > 0) {
    showPathUpdateDialog(originalPaths, updatedPaths, vertex.id);
  }

  // Clear selection and update UI
  selected.nodes.clear();
  pinnedNodes.delete(vertex.id);
  updateResolveButton();
  updatePhysicalResolveButton();
  updateMergeButtons();
  updatePathUI();
  hideResolveDialog();

  // Restart simulation
  startSimulation();

  logEvent(`Logical vertex resolution complete: created ${newNodes.length} new vertices with ${newLinks.length} edges`);
}

// UPDATED: Physical resolution execution with path updates
function performPhysicalResolution() {
  if (!window.currentPhysicalResolution) return;

  const { vertex, combinations, connections } = window.currentPhysicalResolution;
  const selectedCombos = [];

  // Get selected combinations
  document.querySelectorAll('#pathCombinations input[type="checkbox"]:checked').forEach(checkbox => {
    const index = parseInt(checkbox.dataset.comboIndex);
    selectedCombos.push(combinations[index]);
  });

  if (selectedCombos.length === 0) {
    alert('Please select at least one physical path to keep.');
    return;
  }

  console.log('=== PHYSICAL VERTEX RESOLUTION WITH PATH UPDATES ===');
  console.log('Original vertex:', vertex.id);
  console.log('Selected physical combinations:', selectedCombos.length);
  
  // Store original paths before resolution
  const originalPaths = [...savedPaths];
  
  logEvent(`Physical resolving vertex ${vertex.id} into ${selectedCombos.length} copies`);

  // Create new nodes first
  const newNodes = [];
  selectedCombos.forEach((combo, index) => {
    const newNodeId = selectedCombos.length === 1 ? vertex.id : `${vertex.id}_p${index + 1}`;
    const newNode = {
      ...vertex,
      id: newNodeId,
      originalId: vertex.id,
      pathDescription: combo.description,
      resolutionType: 'physical',
      x: vertex.x,
      y: vertex.y,
      vx: 0,
      vy: 0
    };
    
    if (selectedCombos.length > 1) {
      const angleOffset = (index * 2 * Math.PI) / selectedCombos.length;
      const radius = 60;
      newNode.x = vertex.x + radius * Math.cos(angleOffset);
      newNode.y = vertex.y + radius * Math.sin(angleOffset);
    }

    newNodes.push(newNode);
  });

  // Remove original vertex and edges
  nodes = nodes.filter(n => n.id !== vertex.id);
  links = links.filter(link => {
    const sourceId = (typeof link.source === 'object') ? link.source.id : link.source;
    const targetId = (typeof link.target === 'object') ? link.target.id : link.target;
    return sourceId !== vertex.id && targetId !== vertex.id;
  });

  nodes.push(...newNodes);

  // Create new edges based on physical connections
  const newLinks = [];
  selectedCombos.forEach((combo, index) => {
    const newNodeId = selectedCombos.length === 1 ? vertex.id : `${vertex.id}_p${index + 1}`;
    
    // Create edge for RED subnode connection
    if (combo.red) {
      const originalLink = combo.red.link;
      let newLink;
      
      if (combo.red.direction === 'incoming') {
        newLink = {
          ...originalLink,
          target: newNodeId,
          source: combo.red.sourceId
        };
      } else {
        newLink = {
          ...originalLink,
          source: newNodeId,
          target: combo.red.targetId
        };
      }
      
      if (typeof newLink.source === 'object') newLink.source = newLink.source.id;
      if (typeof newLink.target === 'object') newLink.target = newLink.target.id;
      
      newLinks.push(newLink);
    }

    // Create edge for GREEN subnode connection
    if (combo.green) {
      const originalLink = combo.green.link;
      let newLink;
      
      if (combo.green.direction === 'incoming') {
        newLink = {
          ...originalLink,
          target: newNodeId,
          source: combo.green.sourceId
        };
      } else {
        newLink = {
          ...originalLink,
          source: newNodeId,
          target: combo.green.targetId
        };
      }
      
      if (typeof newLink.source === 'object') newLink.source = newLink.source.id;
      if (typeof newLink.target === 'object') newLink.target = newLink.target.id;
      
      newLinks.push(newLink);
    }
  });

  links.push(...newLinks);

  // Update global references for path updater
  window.nodes = nodes;
  window.links = links;

  // UPDATE PATHS AFTER RESOLUTION
  const resolutionData = {
    originalVertex: vertex,
    newVertices: newNodes,
    resolutionType: 'physical'
  };
  
  const updatedPaths = updatePathsAfterResolution(originalPaths, resolutionData);
  
  // Update global savedPaths
  savedPaths.splice(0, savedPaths.length, ...updatedPaths);
  
  // Update current path index if needed
  if (currentPathIndex >= 0 && currentPathIndex < savedPaths.length) {
    const currentPath = savedPaths[currentPathIndex];
    highlightedPath.nodes = new Set(currentPath.nodes);
    highlightedPath.edges = new Set(currentPath.edges);
    highlightedPath.currentColor = currentPath.color;
  } else {
    currentPathIndex = -1;
    highlightedPath.nodes.clear();
    highlightedPath.edges.clear();
  }
  
  // Show summary of path updates
  const summary = showPathUpdateSummary(originalPaths, updatedPaths, vertex.id);
  logEvent(summary);

  // Show detailed dialog if there were affected paths
  const affectedPaths = originalPaths.filter(path => 
    Array.from(path.nodes).includes(vertex.id)
  );
  if (affectedPaths.length > 0) {
    showPathUpdateDialog(originalPaths, updatedPaths, vertex.id);
  }

  // Clear selection and update UI
  selected.nodes.clear();
  pinnedNodes.delete(vertex.id);
  updateResolveButton();
  updatePhysicalResolveButton();
  updateMergeButtons();
  updatePathUI();
  hideResolveDialog();

  // Restart simulation
  startSimulation();

  logEvent(`Physical vertex resolution complete: created ${newNodes.length} new vertices with ${newLinks.length} edges`);
}

function updateResolveButton() {
  const resolveBtn = document.getElementById('resolveVertex');
  const hasSelection = selected.nodes.size === 1;
  
  resolveBtn.disabled = !hasSelection;
  
  if (hasSelection) {
    const vertexId = Array.from(selected.nodes)[0];
    const connections = getVertexConnections(vertexId);
    const totalConnections = connections.incoming.length + connections.outgoing.length;
    
    if (totalConnections > 1) {
      resolveBtn.textContent = `Resolve Vertex (${totalConnections} edges)`;
      resolveBtn.disabled = false;
    } else {
      resolveBtn.textContent = 'Resolve Vertex';
      resolveBtn.disabled = true;
    }
  } else {
    resolveBtn.textContent = 'Resolve Vertex';
  }
}

function updatePhysicalResolveButton() {
  const resolveBtn = document.getElementById('resolvePhysical');
  const hasSelection = selected.nodes.size === 1;
  
  resolveBtn.disabled = !hasSelection;
  
  if (hasSelection) {
    const vertexId = Array.from(selected.nodes)[0];
    const connections = getPhysicalConnections(vertexId);
    const totalConnections = connections.red.length + connections.green.length;
    
    if (totalConnections > 1) {
      resolveBtn.textContent = `Resolve Physical (${connections.red.length}R+${connections.green.length}G)`;
      resolveBtn.disabled = false;
    } else {
      resolveBtn.textContent = 'Resolve Physical';
      resolveBtn.disabled = true;
    }
  } else {
    resolveBtn.textContent = 'Resolve Physical';
  }
}

// NEW: Enhanced highlightPaths function for multi-path management
function highlightPaths(sequence, pathName = null) {
  if (!sequence || !sequence.trim()) {
    logEvent('No sequence provided');
    return;
  }
  
  // Parse the sequence
  const nodeIds = sequence.split(',').map(id => id.trim());
  
  // Validate nodes exist
  const nodeMap = new Map(nodes.map(n => [String(n.id), n]));
  const validNodes = nodeIds.filter(id => nodeMap.has(id));
  
  if (validNodes.length === 0) {
    logEvent('No valid nodes in sequence');
    return;
  }
  
  // Create new path object
  const pathNodes = new Set(validNodes);
  const pathEdges = new Set();
  
  // Find edges between consecutive nodes
  for (let i = 0; i < validNodes.length - 1; i++) {
    const sourceId = validNodes[i];
    const targetId = validNodes[i + 1];
    
    links.forEach((link, index) => {
      const linkSourceId = String(link.source.id || link.source);
      const linkTargetId = String(link.target.id || link.target);
      
      if ((linkSourceId === sourceId && linkTargetId === targetId) ||
          (linkSourceId === targetId && linkTargetId === sourceId)) {
        pathEdges.add(index);
      }
    });
  }
  
  const newPath = {
    id: nextPathId++,
    name: pathName || `Path ${savedPaths.length + 1}`,
    sequence: sequence.trim(),
    nodes: pathNodes,
    edges: pathEdges,
    color: getNextPathColor(),
    timestamp: new Date()
  };
  
  // Add to saved paths
  savedPaths.push(newPath);
  currentPathIndex = savedPaths.length - 1;
  
  // Update current highlight
  highlightedPath.nodes = new Set(pathNodes);
  highlightedPath.edges = new Set(pathEdges);
  highlightedPath.currentColor = newPath.color;
  
  updatePathUI();
  updateMergeButtons(); // Update merge buttons when path changes
  logEvent(`Saved path "${newPath.name}": ${validNodes.join(' → ')}`);
  drawGraph(ctx, canvas, transform, nodes, links, pinnedNodes, selected, currentFormat, highlightedPath);
}

function showPath(index) {
  if (index < 0 || index >= savedPaths.length) {
    // Clear highlighting
    currentPathIndex = -1;
    highlightedPath.nodes.clear();
    highlightedPath.edges.clear();
    highlightedPath.currentColor = '#ff6b6b';
  } else {
    // Show selected path
    currentPathIndex = index;
    const path = savedPaths[index];
    highlightedPath.nodes = new Set(path.nodes);
    highlightedPath.edges = new Set(path.edges);
    highlightedPath.currentColor = path.color;
    
    logEvent(`Showing path "${path.name}": ${path.sequence}`);
  }
  
  updatePathUI(); // This will now handle export button state
  updateMergeButtons(); // Update merge buttons when path selection changes
  drawGraph(ctx, canvas, transform, nodes, links, pinnedNodes, selected, currentFormat, highlightedPath);
}

function deletePath(index) {
  if (index < 0 || index >= savedPaths.length) return;
  
  const deletedPath = savedPaths[index];
  savedPaths.splice(index, 1);
  
  // Adjust current index
  if (currentPathIndex === index) {
    currentPathIndex = -1;
    highlightedPath.nodes.clear();
    highlightedPath.edges.clear();
  } else if (currentPathIndex > index) {
    currentPathIndex--;
  }
  
  updatePathUI();
  updateMergeButtons(); // Update merge buttons when path is deleted
  logEvent(`Deleted path "${deletedPath.name}"`);
  drawGraph(ctx, canvas, transform, nodes, links, pinnedNodes, selected, currentFormat, highlightedPath);
}

function clearAllPaths() {
  savedPaths = [];
  currentPathIndex = -1;
  highlightedPath.nodes.clear();
  highlightedPath.edges.clear();
  highlightedPath.currentColor = '#ff6b6b';
  nextPathId = 1;
  
  updatePathUI();
  updateMergeButtons(); // Update merge buttons when all paths cleared
  logEvent('Cleared all saved paths');
  drawGraph(ctx, canvas, transform, nodes, links, pinnedNodes, selected, currentFormat, highlightedPath);
}

// FIXED: Enhanced updatePathUI function with proper export button handling
// FIXED: Enhanced updatePathUI function with event delegation
function updatePathUI() {
  const pathList = document.getElementById('savedPathsList');
  const pathNav = document.getElementById('pathNavigation');
  const pathCounter = document.getElementById('pathCounter');
  
  // Update path list
  pathList.innerHTML = '';
  
  if (savedPaths.length === 0) {
    pathList.innerHTML = '<div class="no-paths">No saved paths</div>';
    pathNav.style.display = 'none';
    pathCounter.textContent = '0 paths saved';
  } else {
    pathNav.style.display = 'flex';
    pathCounter.textContent = `${savedPaths.length} path${savedPaths.length === 1 ? '' : 's'} saved`;
    
    savedPaths.forEach((path, index) => {
      const pathDiv = document.createElement('div');
      pathDiv.className = `saved-path ${index === currentPathIndex ? 'active' : ''}`;
      
      pathDiv.innerHTML = `
        <div class="path-header">
          <span class="path-color" style="background-color: ${path.color}"></span>
          <span class="path-name">${path.name}</span>
          <button class="delete-path" onclick="deletePath(${index})" title="Delete path">×</button>
        </div>
        <div class="path-sequence">${path.sequence}</div>
        <div class="path-stats">${path.nodes.size} nodes, ${path.edges.size} edges</div>
      `;
      
      pathDiv.addEventListener('click', (e) => {
        if (!e.target.classList.contains('delete-path')) {
          showPath(index === currentPathIndex ? -1 : index);
        }
      });
      
      pathList.appendChild(pathDiv);
    });
  }
  
  // Update navigation buttons
  const prevBtn = document.getElementById('prevPath');
  const nextBtn = document.getElementById('nextPath');
  const clearBtn = document.getElementById('clearAllPaths');
  const exportAllBtn = document.getElementById('exportAllPaths');
  const exportBtn = document.getElementById('exportPathSequence');
  
  if (prevBtn) prevBtn.disabled = savedPaths.length === 0;
  if (nextBtn) nextBtn.disabled = savedPaths.length === 0;
  if (clearBtn) clearBtn.disabled = savedPaths.length === 0;
  
  if (exportAllBtn) {
    exportAllBtn.disabled = savedPaths.length === 0;
  }
  
  // FIXED: Properly handle export sequence button
  if (exportBtn) {
    const hasValidSelection = currentPathIndex >= 0 && 
                             currentPathIndex < savedPaths.length && 
                             savedPaths.length > 0;
    
    exportBtn.disabled = !hasValidSelection;
    
    // Remove any existing event listeners and add a fresh one
    exportBtn.onclick = null;
    exportBtn.onclick = () => {
      console.log('=== EXPORT SEQUENCE BUTTON CLICKED ===');
      console.log('currentPathIndex:', currentPathIndex);
      console.log('savedPaths.length:', savedPaths.length);
      
      if (currentPathIndex >= 0 && currentPathIndex < savedPaths.length) {
        const currentPath = savedPaths[currentPathIndex];
        console.log('Exporting path:', currentPath);
        
        if (!nodes || !links) {
          alert('Error: Graph data not available');
          return;
        }
        
        try {
          exportPathSequence(currentPath, nodes, links);
          logEvent(`Exported sequence for path "${currentPath.name}"`);
        } catch (error) {
          console.error('Export error:', error);
          alert(`Export failed: ${error.message}`);
        }
      } else {
        alert('No path selected for export');
      }
    };
  }
  
  const currentPathDisplay = document.getElementById('currentPathDisplay');
  if (currentPathDisplay) {
    if (currentPathIndex >= 0 && currentPathIndex < savedPaths.length) {
      const currentPath = savedPaths[currentPathIndex];
      currentPathDisplay.textContent = `${currentPath.name} (${currentPathIndex + 1}/${savedPaths.length})`;
    } else {
      currentPathDisplay.textContent = savedPaths.length > 0 ? `None selected (0/${savedPaths.length})` : 'No paths';
    }
  }
  
  markUpdatedPathsInUI(savedPaths);
}

function navigatePath(direction) {
  if (savedPaths.length === 0) return;
  
  let newIndex;
  if (direction === 'prev') {
    newIndex = currentPathIndex <= 0 ? savedPaths.length - 1 : currentPathIndex - 1;
  } else {
    newIndex = currentPathIndex >= savedPaths.length - 1 ? 0 : currentPathIndex + 1;
  }
  
  showPath(newIndex);
}

function removeSelected() {
  nodes = nodes.filter(n=>!selected.nodes.has(n.id));
  links = links.filter(l=>!selected.nodes.has(l.source)&&!selected.nodes.has(l.target));
  selected.nodes.clear();
  startSimulation();
}

function undo() {
  if (history.length<2) return;
  history.pop();
  const prev = history.pop();
  nodes = prev.nodes; links = prev.links;
  startSimulation();
}

function selectNode(evt) {
  const rect = canvas.getBoundingClientRect();
  const x = (evt.clientX-rect.left  - transform.x)/transform.k;
  const y = (evt.clientY-rect.top   - transform.y)/transform.k;
  let found=null;
  
  // For GFA format, use the GFA node hit detection
  if (currentFormat === 'gfa' && nodes._gfaNodes) {
    for (let i = 0; i < nodes.length; i++) {
      const gfaNode = nodes._gfaNodes[i];
      if (gfaNode && gfaNode.contains(x, y)) {
        found = nodes[i];
        break;
      }
    }
  } else {
    // For DOT format, use circular hit detection
    let minD=Infinity;
    nodes.forEach(d=>{
      const dx=d.x-x, dy=d.y-y, dist2=dx*dx+dy*dy;
      if(dist2<100&&dist2<minD){
        minD=dist2; found=d;
      }
    });
  }
  
  if(found){
    selected.nodes.clear();
    selected.nodes.add(found.id);
    
    // Show node information with enhanced info for merged nodes
    let infoHTML = `<strong>Node ${found.id}</strong>`;
    
    // Check if this is a merged node
    if (isMergedNode(found)) {
      const mergedInfo = getMergedNodeInfo(found);
      infoHTML += `<br><em>Type: ${mergedInfo.type}</em>`;
      infoHTML += `<br><em>Merged from: ${mergedInfo.originalNodes.join(', ')}</em>`;
      infoHTML += `<br><em>Original nodes: ${mergedInfo.nodeCount}</em>`;
      infoHTML += `<br><em>Total length: ${mergedInfo.totalLength}bp</em>`;
      infoHTML += `<br><em>Average depth: ${mergedInfo.averageDepth.toFixed(2)}</em>`;
      infoHTML += `<br><em>Path: ${mergedInfo.pathName}</em>`;
      infoHTML += `<br><br><em>Note: Click "Export Merged Sequence" to view the combined sequence</em>`;
    } else {
      // Regular node info
      if (currentFormat === 'gfa' && nodes._gfaNodes) {
        const gfaNode = nodes._gfaNodes.find(n => n.id === found.id);
        if (gfaNode) {
          infoHTML += `<br><em>Flipped: ${gfaNode.isFlipped ? 'Yes' : 'No'}</em>`;
          infoHTML += `<br><em>Angle: ${(gfaNode.angle * 180 / Math.PI).toFixed(1)}°</em>`;
        }
      }

      // Add resolution info
      const logicalConnections = getVertexConnections(found.id);
      const physicalConnections = getPhysicalConnections(found.id);
      infoHTML += `<br><em>Logical: ${logicalConnections.incoming.length} in, ${logicalConnections.outgoing.length} out</em>`;
      infoHTML += `<br><em>Physical: ${physicalConnections.red.length} red, ${physicalConnections.green.length} green</em>`;
      infoHTML += `<pre>${JSON.stringify(found,null,2)}</pre>`;
    }
    
    document.getElementById('infoContent').innerHTML = infoHTML;
    
    // DEBUG: Add pre-resolution debugging
    debugVertexConnections(found.id);
    
    // Update button states
    updateResolveButton();
    updatePhysicalResolveButton();
    updateMergeButtons();
    
    drawGraph(ctx, canvas, transform, nodes, links, pinnedNodes, selected, currentFormat, highlightedPath);
  }
}

// pointer drag for nodes
let dragNode = null;
function screenToSim(px,py){
  return { x:(px-transform.x)/transform.k, y:(py-transform.y)/transform.k };
}
canvas.addEventListener('pointerdown', e=>{
  const r = canvas.getBoundingClientRect();
  const {x,y} = screenToSim(e.clientX-r.left, e.clientY-r.top);
  
  // For GFA format, use the GFA node hit detection
  if (currentFormat === 'gfa' && nodes._gfaNodes) {
    dragNode = null;
    for (let i = 0; i < nodes.length; i++) {
      const gfaNode = nodes._gfaNodes[i];
      if (gfaNode && gfaNode.contains(x, y)) {
        dragNode = nodes[i];
        break;
      }
    }
  } else {
    // For DOT format, use circular hit detection
    dragNode = nodes.find(d=>{
      const dx=d.x-x, dy=d.y-y, rr=d.penwidth?4+ +d.penwidth:8;
      return dx*dx+dy*dy<rr*rr;
    });
  }
  
  if(dragNode){
    simulation.alphaTarget(0.3).restart();
    dragNode.fx=x; dragNode.fy=y;
    e.preventDefault();
  }
});
canvas.addEventListener('pointermove', e=>{
  if(!dragNode) return;
  const r=canvas.getBoundingClientRect();
  const {x,y}=screenToSim(e.clientX-r.left,e.clientY-r.top);
  dragNode.fx=x; dragNode.fy=y;
  e.preventDefault();
});
function endDrag(){
  if(!dragNode) return;
  dragNode.fx=null; dragNode.fy=null;
  simulation.alphaTarget(0);
  dragNode=null;
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointerleave', endDrag);

// Dialog event listeners
document.getElementById('cancelResolve').addEventListener('click', hideResolveDialog);
document.getElementById('confirmResolve').addEventListener('click', () => {
  if (window.currentPhysicalResolution) {
    performPhysicalResolution();
  } else {
    performVertexResolution();
  }
});
document.getElementById('dialogOverlay').addEventListener('click', hideResolveDialog);

setupUI({
  canvas,
  onFileLoad: parseGraph,
  onGenerate: generateRandom,
  onPin: pinSelected,
  onFlip: flipSelected,
  onResolve: () => {
    if (selected.nodes.size === 1) {
      const vertexId = Array.from(selected.nodes)[0];
      showResolveDialog(vertexId);
    }
  },
  onResolvePhysical: () => {
    if (selected.nodes.size === 1) {
      const vertexId = Array.from(selected.nodes)[0];
      showPhysicalResolveDialog(vertexId);
    }
  },
  onMergeNodes: mergeSelectedNodes,
  onExportMergedSequence: exportMergedSequence,
  onRedraw: startSimulation,
  onHighlightPath: (sequence, pathName) => highlightPaths(sequence, pathName),
  onClearPaths: clearAllPaths,
  onNavigatePath: navigatePath,
  onRemoveNodes: removeSelected,
  onUndo: undo,
  onSelectNode: selectNode
});

addImportStyles();

// Path import functionality
let selectedPathFile = null;

const pathFileInput = document.getElementById('pathFileInput');
const importPathsBtn = document.getElementById('importPaths');

if (pathFileInput && importPathsBtn) {
  // Handle file selection
  pathFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      selectedPathFile = file;
      importPathsBtn.disabled = false;
      importPathsBtn.textContent = `Import ${file.name}`;
      logEvent(`Path file selected: ${file.name} (${file.size} bytes)`);
    } else {
      selectedPathFile = null;
      importPathsBtn.disabled = true;
      importPathsBtn.textContent = 'Import Paths';
    }
  });

  // Handle import button click
  importPathsBtn.addEventListener('click', () => {
    if (!selectedPathFile) {
      alert('Please select a path file first');
      return;
    }

    if (!nodes || nodes.length === 0) {
      alert('Please load a graph first before importing paths');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const textContent = e.target.result;
        logEvent(`Importing paths from ${selectedPathFile.name}...`);
        
        // Import paths using the existing highlightPaths function
        const results = importPathsFromText(textContent, nodes, savedPaths, highlightPaths);
        
        // Show results dialog
        showImportResultsDialog(results);
        
        // Update the UI to reflect new paths
        updatePathUI();
        updateMergeButtons();
        
        // Log summary
        const summary = `Import completed: ${results.successful.length} successful, ${results.failed.length} failed`;
        logEvent(summary);
        
        // Clear the file input
        pathFileInput.value = '';
        selectedPathFile = null;
        importPathsBtn.disabled = true;
        importPathsBtn.textContent = 'Import Paths';
        
      } catch (error) {
        console.error('Error importing paths:', error);
        alert(`Error importing paths: ${error.message}`);
        logEvent(`Import error: ${error.message}`);
      }
    };

    reader.onerror = () => {
      alert('Error reading file');
      logEvent('Error reading path file');
    };

    reader.readAsText(selectedPathFile);
  });
}

// Enhanced error handling for file operations
window.addEventListener('error', (e) => {
  if (e.filename && e.filename.includes('path-importer')) {
    logEvent(`Path import error: ${e.message}`);
  }
});

// Add keyboard shortcut for import (Ctrl+I)
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
    e.preventDefault();
    if (pathFileInput) {
      pathFileInput.click();
    }
  }
});

// Initialize export styles
addExportStyles();

// Path export functionality
const exportAllPathsBtn = document.getElementById('exportAllPaths');

if (exportAllPathsBtn) {
  exportAllPathsBtn.addEventListener('click', () => {
    if (!savedPaths || savedPaths.length === 0) {
      alert('No paths to export');
      return;
    }

    // Show preview dialog before export
    showExportPreviewDialog(savedPaths, () => {
      try {
        const result = exportAllPathsToFile(savedPaths);
        logEvent(`Exported ${result.pathCount} paths to ${result.filename}`);
        
        // Show success message
        setTimeout(() => {
          alert(`Successfully exported ${result.pathCount} paths to ${result.filename}`);
        }, 100);
        
      } catch (error) {
        console.error('Error exporting paths:', error);
        alert(`Error exporting paths: ${error.message}`);
        logEvent(`Export error: ${error.message}`);
      }
    });
  });
}

// Add keyboard shortcut for export (Ctrl+E)
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
    e.preventDefault();
    if (exportAllPathsBtn && !exportAllPathsBtn.disabled) {
      exportAllPathsBtn.click();
    }
  }
});

// FIXED: Force create export button after page load
// document.addEventListener('DOMContentLoaded', () => {
//   console.log('DOM loaded, ensuring export button exists...');
//   setTimeout(() => {
//     if (!exportButton) {
//       exportButton = createExportButton();
//       console.log('Export button created on DOM load');
//     }
//   }, 100);
// });

// Make functions globally available for UI
window.deletePath = deletePath;
window.showPath = showPath;
window.navigatePath = navigatePath;

// FIXED: Make export function and current variables globally available
window.exportPathSequence = exportPathSequence;
window.getCurrentPathIndex = () => currentPathIndex;
window.getSavedPaths = () => savedPaths;
window.getNodes = () => nodes;
window.getLinks = () => links;

// Make global references available for renderer
window.highlightedPath = highlightedPath;
window.nodes = nodes;
window.links = links;
window.ctx = ctx;
window.canvas = canvas;
window.transform = transform;
window.pinnedNodes = pinnedNodes;
window.selected = selected;
window.currentFormat = currentFormat;
window.drawGraph = drawGraph;