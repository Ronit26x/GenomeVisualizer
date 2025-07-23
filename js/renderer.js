// renderer.js

import { drawGfaGraph } from './gfa-renderer.js'; // NEW import

// color helper for Graphlib‐style values (UNCHANGED)
function parseColor(val, fallback) {
  let c = Array.isArray(val) ? val[0] : val;
  if (!c || typeof c !== 'string') return fallback;
  c = c.trim().split(':')[0];
  return c || fallback;
}

export function clearCanvas(ctx, canvas) {
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.restore();
}

// UPDATED: Main draw function that routes between DOT and GFA renderers
export function drawGraph(ctx, canvas, transform, nodes, links, pinnedNodes, selected, format = 'dot', highlightedPath = null) {
  clearCanvas(ctx, canvas);
  
  if (format === 'gfa') {
    // Use Bandage-style GFA renderer with subnodes
    drawGfaGraph(ctx, canvas, transform, nodes, links, pinnedNodes, selected, highlightedPath);
  } else {
    // Use original DOT renderer
    drawDotGraph(ctx, canvas, transform, nodes, links, pinnedNodes, selected, highlightedPath);
  }
}

// UNCHANGED: Original rendering logic for DOT graphs
function drawDotGraph(ctx, canvas, transform, nodes, links, pinnedNodes, selected, highlightedPath) {
  ctx.save();
  
  // Clear background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.k, transform.k);

  // draw edges
  links.forEach((d, index) => {
    ctx.beginPath();
    
    // Check if edge is highlighted
    const isHighlighted = highlightedPath && highlightedPath.edges && highlightedPath.edges.has(index);
    
    if (isHighlighted) {
      ctx.strokeStyle = '#ff6b6b';  // Bright red for highlighted paths
      ctx.lineWidth = (+d.penwidth || 1) * 3; // Thicker lines
    } else {
      ctx.strokeStyle = parseColor(d.color, '#999');
      ctx.lineWidth = +d.penwidth || 1;
    }
    
    if (d.style==='dashed') ctx.setLineDash([4,2]);
    else if (d.style==='dotted') ctx.setLineDash([1,2]);
    else ctx.setLineDash([]);
    
    ctx.moveTo(d.source.x, d.source.y);
    ctx.lineTo(d.target.x, d.target.y);
    ctx.stroke();
  });

  // draw nodes
  nodes.forEach(d => {
    const r = d.penwidth ? 4 + +d.penwidth : 8;
    const isHighlighted = highlightedPath && highlightedPath.nodes && highlightedPath.nodes.has(String(d.id));
    
    // fill
    ctx.beginPath();
    ctx.fillStyle = isHighlighted 
      ? '#ff6b6b'  // Bright red for highlighted nodes
      : parseColor(d.fillcolor, '#69b3a2');
    ctx.arc(d.x, d.y, r * (isHighlighted ? 1.5 : 1), 0, 2*Math.PI);
    ctx.fill();
    
    // stroke
    ctx.beginPath();
    const isPinned = pinnedNodes.has(d.id);
    const isSelected = selected && selected.nodes && selected.nodes.has(d.id);
    
    if (isHighlighted) {
      ctx.strokeStyle = '#cc0000';  // Darker red border
      ctx.lineWidth = 3;
    } else {
      ctx.strokeStyle = isSelected 
        ? 'red'
        : isPinned
        ? 'orange'
        : parseColor(d.color, '#333');
      ctx.lineWidth = (isPinned || isSelected) ? 3 : (+d.penwidth||1);
    }
    
    if (d.style==='dashed') ctx.setLineDash([4,2]);
    else if (d.style==='dotted') ctx.setLineDash([1,2]);
    else ctx.setLineDash([]);
    ctx.arc(d.x, d.y, r * (isHighlighted ? 1.5 : 1), 0, 2*Math.PI);
    ctx.stroke();
  });

  ctx.restore();
}