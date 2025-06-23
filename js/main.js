// main.js

import { parseDot, parseGfa }       from './parser.js';
import { createSimulation }         from './simulation.js';
import { clearCanvas, drawGraph }   from './renderer.js';
import { setupUI }                  from './ui.js';

const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');
let transform = d3.zoomIdentity;
let simulation, nodes = [], links = [], history = [];
let currentFormat = 'dot'; // NEW: track current format
const selected    = { nodes: new Set(), edges: new Set() };
const pinnedNodes = new Set();
const highlightedPath = { nodes: new Set(), edges: new Set() }; // NEW: track highlighted path

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
  drawGraph(ctx, canvas, transform, nodes, links, pinnedNodes, selected, currentFormat, highlightedPath); // CHANGED: pass highlightedPath
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

d3.select(canvas).call(
  d3.zoom()
    .scaleExtent([0.01, 10])
    .on('zoom', ({transform: t}) => {
      transform = t;
      drawGraph(ctx, canvas, transform, nodes, links, pinnedNodes, selected, currentFormat, highlightedPath); // CHANGED: pass highlightedPath
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
    () => drawGraph(ctx, canvas, transform, nodes, links, pinnedNodes, selected, currentFormat, highlightedPath) // CHANGED: pass highlightedPath
  );
}

function parseGraph(text, name) {
  let fmt = name.toLowerCase().endsWith('.gfa') ? 'gfa' : 'dot';
  if (fmt==='dot' && (/^H\t|^S\t/m).test(text)) {
    logEvent('→ Detected GFA content despite .dot; switching');
    fmt = 'gfa';
  }
  currentFormat = fmt; // NEW: store format
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
  currentFormat = 'dot'; // NEW: set format for random
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
    document.getElementById('infoContent').innerHTML =
      `<strong>Node ${found.id}</strong><pre>${JSON.stringify(found,null,2)}</pre>`;
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

setupUI({
  canvas,
  onFileLoad:    parseGraph,
  onGenerate:    generateRandom,
  onPin:         pinSelected,
  onRedraw:      startSimulation,
  onHighlightPath: highlightPaths,  // CHANGED: new handler
  onClearPaths:     clearPaths,
  onRemoveNodes:    removeSelected,
  onUndo:            undo,
  onSelectNode:      selectNode
});

// initial render
startSimulation();