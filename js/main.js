// main.js - FINAL DEBUG VERSION: Enhanced vertex resolution debugging with outgoing edge fix

import { parseDot, parseGfa }       from './parser.js';
import { createSimulation }         from './simulation.js';
import { clearCanvas, drawGraph }   from './renderer.js';
import { flipSelectedNode, getSubnodeAt } from './gfa-renderer.js';
import { setupUI }                  from './ui.js';

const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');
let transform = d3.zoomIdentity;
let simulation, nodes = [], links = [], history = [];
let currentFormat = 'dot'; // Track current format
const selected    = { nodes: new Set(), edges: new Set() };
const pinnedNodes = new Set();
const highlightedPath = { nodes: new Set(), edges: new Set() }; // Track highlighted path

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
}

// DEBUG: Edge creation validation
function debugEdgeCreation(newLinks, newNodes) {
  console.log('\n=== EDGE CREATION DEBUG ===');
  
  // Check if all expected source/target nodes exist
  const nodeIds = new Set(nodes.map(n => n.id));
  
  newLinks.forEach((link, index) => {
    const sourceExists = nodeIds.has(link.source);
    const targetExists = nodeIds.has(link.target);
    
    console.log(`Edge ${index}: ${link.source} → ${link.target}`);
    console.log(`  Source exists: ${sourceExists}, Target exists: ${targetExists}`);
    
    if (!sourceExists) {
      console.error(`❌ Source node "${link.source}" does not exist in graph!`);
    }
    if (!targetExists) {
      console.error(`❌ Target node "${link.target}" does not exist in graph!`);
    }
  });
  
  // Check if any source nodes are the original vertex (shouldn't happen)
  newLinks.forEach(link => {
    if (link.source === window.currentResolution.vertex.id) {
      console.error(`❌ Edge still references original vertex ${link.source} as source!`);
    }
    if (link.target === window.currentResolution.vertex.id) {
      console.error(`❌ Edge still references original vertex ${link.target} as target!`);
    }
  });
}

// FIXED: Vertex Resolution Functions with enhanced debugging
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

function showResolveDialog(vertexId) {
  const vertex = nodes.find(n => n.id === vertexId);
  if (!vertex) return;

  const connections = getVertexConnections(vertexId);
  const combinations = generatePathCombinations(connections.incoming, connections.outgoing);

  // Populate vertex info
  document.getElementById('vertexInfo').innerHTML = `
    <strong>Vertex:</strong> ${vertexId}<br>
    <strong>Incoming edges:</strong> ${connections.incoming.length}<br>
    <strong>Outgoing edges:</strong> ${connections.outgoing.length}<br>
    <strong>Possible paths:</strong> ${combinations.length}
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

function updateResolutionStats(total, selected) {
  document.getElementById('resolutionStats').textContent = 
    `${selected} of ${total} paths selected. ${total - selected} paths will be removed.`;
}

function hideResolveDialog() {
  document.getElementById('dialogOverlay').style.display = 'none';
  document.getElementById('resolveDialog').style.display = 'none';
  window.currentResolution = null;
}

// UPDATED performVertexResolution with enhanced outgoing edge debugging
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

  console.log('=== VERTEX RESOLUTION DEBUG ===');
  console.log('Original vertex:', vertex.id);
  console.log('Selected combinations:', selectedCombos.length);
  
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

  // Remove original vertex FIRST (before creating edges)
  console.log('\n=== REMOVING ORIGINAL VERTEX ===');
  const originalNodeCount = nodes.length;
  nodes = nodes.filter(n => n.id !== vertex.id);
  console.log(`Removed vertex ${vertex.id}`);

  // Remove original edges SECOND
  console.log('\n=== REMOVING ORIGINAL EDGES ===');
  const originalLinksCount = links.length;
  links = links.filter(link => {
    const sourceId = (typeof link.source === 'object') ? link.source.id : link.source;
    const targetId = (typeof link.target === 'object') ? link.target.id : link.target;
    const shouldRemove = sourceId === vertex.id || targetId === vertex.id;
    if (shouldRemove) {
      console.log(`Removing edge: ${sourceId} → ${targetId}`);
    }
    return !shouldRemove;
  });
  console.log(`Removed ${originalLinksCount - links.length} edges`);

  // Add new nodes THIRD
  console.log('\n=== ADDING NEW NODES ===');
  nodes.push(...newNodes);
  newNodes.forEach(node => {
    console.log(`Added node: ${node.id}`);
  });

  // Create and add new edges LAST - ENHANCED DEBUGGING
  console.log('\n=== CREATING NEW EDGES ===');
  const newLinks = [];

  selectedCombos.forEach((combo, index) => {
    const newNodeId = selectedCombos.length === 1 ? vertex.id : `${vertex.id}_${index + 1}`;
    
    console.log(`\nProcessing combo ${index} for node ${newNodeId}:`);
    console.log(`  Description: ${combo.description}`);
    console.log(`  Combo object:`, combo);

    // Create INCOMING edge
    if (combo.incoming) {
      const sourceId = combo.incoming.sourceId;
      
      console.log(`  Processing incoming edge from ${sourceId}`);
      
      // Verify source node exists
      const sourceNode = nodes.find(n => n.id === sourceId);
      if (!sourceNode) {
        console.error(`❌ Source node ${sourceId} not found for incoming edge!`);
        console.log(`Available nodes:`, nodes.map(n => n.id));
      } else {
        const newIncomingLink = {
          source: sourceId,
          target: newNodeId,
          srcOrientation: combo.incoming.link.srcOrientation,
          tgtOrientation: combo.incoming.link.tgtOrientation,
          gfaType: combo.incoming.link.gfaType,
          overlap: combo.incoming.link.overlap
        };
        
        newLinks.push(newIncomingLink);
        console.log(`✓ Created incoming: ${sourceId} → ${newNodeId}`);
      }
    } else {
      console.log(`⚠ No incoming edge for this combo`);
    }

    // Create OUTGOING edge - ENHANCED DEBUGGING
    if (combo.outgoing) {
      const targetId = combo.outgoing.targetId;
      
      console.log(`  Processing outgoing edge to ${targetId}`);
      
      // Verify target node exists
      const targetNode = nodes.find(n => n.id === targetId);
      if (!targetNode) {
        console.error(`❌ Target node ${targetId} not found for outgoing edge!`);
        console.log(`Available nodes:`, nodes.map(n => n.id));
      } else {
        const newOutgoingLink = {
          source: newNodeId,
          target: targetId,
          srcOrientation: combo.outgoing.link.srcOrientation,
          tgtOrientation: combo.outgoing.link.tgtOrientation,
          gfaType: combo.outgoing.link.gfaType,
          overlap: combo.outgoing.link.overlap
        };
        
        newLinks.push(newOutgoingLink);
        console.log(`✓ Created outgoing: ${newNodeId} → ${targetId}`);
      }
    } else {
      console.log(`❌ No outgoing edge for this combo - combo.outgoing is:`, combo.outgoing);
    }
  });

  // Debug the edges we're about to add
  debugEdgeCreation(newLinks, newNodes);

  // Add new edges
  console.log(`\n=== ADDING ${newLinks.length} NEW EDGES ===`);
  links.push(...newLinks);
  
  console.log(`Final graph: ${nodes.length} nodes, ${links.length} edges`);

  // Clear selection and UI state
  selected.nodes.clear();
  pinnedNodes.delete(vertex.id);
  updateResolveButton();
  hideResolveDialog();

  // Restart simulation
  console.log('\n=== RESTARTING SIMULATION ===');
  startSimulation();

  // Verify after simulation starts
  setTimeout(() => {
    console.log('\n=== POST-SIMULATION VERIFICATION ===');
    newNodes.forEach(node => {
      const nodeConnections = getVertexConnections(node.id);
      console.log(`${node.id}: ${nodeConnections.incoming.length} incoming, ${nodeConnections.outgoing.length} outgoing`);
      
      // Show the actual connections for debugging
      if (nodeConnections.incoming.length === 0) {
        console.error(`❌ ${node.id} has NO incoming connections!`);
      }
      if (nodeConnections.outgoing.length === 0) {
        console.error(`❌ ${node.id} has NO outgoing connections!`);
      }
    });
  }, 100);

  logEvent(`Vertex resolution complete: created ${newNodes.length} new vertices with ${newLinks.length} edges`);
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
      resolveBtn.disabled = true; // Can't resolve vertex with 0-1 connections
    }
  } else {
    resolveBtn.textContent = 'Resolve Vertex';
  }
}

function highlightPaths(sequence) {
  // Clear previous highlights
  highlightedPath.nodes.clear();
  highlightedPath.edges.clear();
  
  if (!sequence || !sequence.trim()) {
    drawGraph(ctx, canvas, transform, nodes, links, pinnedNodes, selected, currentFormat, highlightedPath);
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
  
  // Highlight nodes
  validNodes.forEach(id => highlightedPath.nodes.add(id));
  
  // Highlight edges between consecutive nodes
  for (let i = 0; i < validNodes.length - 1; i++) {
    const sourceId = validNodes[i];
    const targetId = validNodes[i + 1];
    
    // Find edge between these nodes
    links.forEach((link, index) => {
      const linkSourceId = String(link.source.id || link.source);
      const linkTargetId = String(link.target.id || link.target);
      
      if ((linkSourceId === sourceId && linkTargetId === targetId) ||
          (linkSourceId === targetId && linkTargetId === sourceId)) {
        highlightedPath.edges.add(index);
      }
    });
  }
  
  logEvent(`Highlighted path: ${validNodes.join(' → ')}`);
  drawGraph(ctx, canvas, transform, nodes, links, pinnedNodes, selected, currentFormat, highlightedPath);
}

function clearPaths() {
  highlightedPath.nodes.clear();
  highlightedPath.edges.clear();
  logEvent('Cleared path highlights');
  drawGraph(ctx, canvas, transform, nodes, links, pinnedNodes, selected, currentFormat, highlightedPath);
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
    
    // Show node information with flip status for GFA nodes
    let infoHTML = `<strong>Node ${found.id}</strong>`;
    if (currentFormat === 'gfa' && nodes._gfaNodes) {
      const gfaNode = nodes._gfaNodes.find(n => n.id === found.id);
      if (gfaNode) {
        infoHTML += `<br><em>Flipped: ${gfaNode.isFlipped ? 'Yes' : 'No'}</em>`;
        infoHTML += `<br><em>Angle: ${(gfaNode.angle * 180 / Math.PI).toFixed(1)}°</em>`;
      }
    }

    // Add resolution info
    const connections = getVertexConnections(found.id);
    infoHTML += `<br><em>Incoming: ${connections.incoming.length}, Outgoing: ${connections.outgoing.length}</em>`;
    infoHTML += `<pre>${JSON.stringify(found,null,2)}</pre>`;
    
    document.getElementById('infoContent').innerHTML = infoHTML;
    
    // DEBUG: Add pre-resolution debugging
    debugVertexConnections(found.id);
    
    // Update resolve button state
    updateResolveButton();
    
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
document.getElementById('confirmResolve').addEventListener('click', performVertexResolution);
document.getElementById('dialogOverlay').addEventListener('click', hideResolveDialog);

setupUI({
  canvas,
  onFileLoad:    parseGraph,
  onGenerate:    generateRandom,
  onPin:         pinSelected,
  onFlip:        flipSelected,
  onResolve:     () => {
    if (selected.nodes.size === 1) {
      const vertexId = Array.from(selected.nodes)[0];
      showResolveDialog(vertexId);
    }
  },
  onRedraw:      startSimulation,
  onHighlightPath: highlightPaths,
  onClearPaths:     clearPaths,
  onRemoveNodes:    removeSelected,
  onUndo:            undo,
  onSelectNode:      selectNode
});

// initial render
startSimulation();