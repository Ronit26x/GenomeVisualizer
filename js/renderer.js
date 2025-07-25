// renderer.js - ENHANCED: Dynamic path colors for both DOT and GFA formats

import { drawGfaGraph } from './gfa-renderer.js';

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
    // Use Bandage-style GFA renderer with subnodes and dynamic colors
    drawGfaGraph(ctx, canvas, transform, nodes, links, pinnedNodes, selected, highlightedPath);
  } else {
    // Use original DOT renderer with dynamic colors
    drawDotGraph(ctx, canvas, transform, nodes, links, pinnedNodes, selected, highlightedPath);
  }
}

// ENHANCED: DOT rendering logic with dynamic path colors
function drawDotGraph(ctx, canvas, transform, nodes, links, pinnedNodes, selected, highlightedPath) {
  ctx.save();
  
  // Clear background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.k, transform.k);

  // draw edges with dynamic highlight colors
  links.forEach((d, index) => {
    ctx.beginPath();
    
    // Check if edge is highlighted
    const isHighlighted = highlightedPath && highlightedPath.edges && highlightedPath.edges.has(index);
    
    if (isHighlighted) {
      // Use dynamic highlight color from the current path
      const highlightColor = highlightedPath?.currentColor || '#ff6b6b';
      ctx.strokeStyle = highlightColor;
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

  // draw nodes with dynamic highlight colors
  nodes.forEach(d => {
    const r = d.penwidth ? 4 + +d.penwidth : 8;
    const isHighlighted = highlightedPath && highlightedPath.nodes && highlightedPath.nodes.has(String(d.id));
    
    // fill with dynamic highlight color
    ctx.beginPath();
    if (isHighlighted) {
      // Use dynamic highlight color from the current path
      const highlightColor = highlightedPath?.currentColor || '#ff6b6b';
      ctx.fillStyle = highlightColor;
    } else {
      ctx.fillStyle = parseColor(d.fillcolor, '#69b3a2');
    }
    ctx.arc(d.x, d.y, r * (isHighlighted ? 1.5 : 1), 0, 2*Math.PI);
    ctx.fill();
    
    // stroke with appropriate border color
    ctx.beginPath();
    const isPinned = pinnedNodes.has(d.id);
    const isSelected = selected && selected.nodes && selected.nodes.has(d.id);
    
    if (isHighlighted) {
      // Darker version of the highlight color for border
      const highlightColor = highlightedPath?.currentColor || '#ff6b6b';
      ctx.strokeStyle = darkenColorForDot(highlightColor, 0.3);
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

// Utility function to darken colors for DOT borders
function darkenColorForDot(color, factor) {
  if (color.startsWith('#')) {
    // Hex color
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    
    const newR = Math.floor(r * (1 - factor));
    const newG = Math.floor(g * (1 - factor));
    const newB = Math.floor(b * (1 - factor));
    
    return `rgb(${newR}, ${newG}, ${newB})`;
  } else if (color.startsWith('hsl')) {
    // HSL color - reduce lightness
    const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (match) {
      const h = match[1];
      const s = match[2];
      const l = Math.floor(match[3] * (1 - factor));
      return `hsl(${h}, ${s}%, ${l}%)`;
    }
  } else if (color.startsWith('rgb')) {
    // RGB color
    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      const r = Math.floor(match[1] * (1 - factor));
      const g = Math.floor(match[2] * (1 - factor));
      const b = Math.floor(match[3] * (1 - factor));
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  
  // Fallback to darker gray
  return '#333333';
}