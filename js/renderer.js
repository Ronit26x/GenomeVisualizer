// renderer.js

// color helper for Graphlib‐style values
function parseColor(val, fallback) {
  let c = Array.isArray(val) ? val[0] : val;
  if (!c || typeof c !== 'string') return fallback;
  c = c.trim().split(':')[0];
  return c || fallback;
}

export function clearCanvas(ctx, canvas) {
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.restore();
}

export function drawGraph(ctx, canvas, transform, nodes, links, pinnedNodes) {
  clearCanvas(ctx, canvas);
  ctx.save();
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.k, transform.k);

  // draw edges
  links.forEach(d => {
    ctx.beginPath();
    ctx.strokeStyle = parseColor(d.color, '#999');
    ctx.lineWidth   = +d.penwidth || 1;
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
    // fill
    ctx.beginPath();
    ctx.fillStyle = parseColor(d.fillcolor, '#69b3a2');
    ctx.arc(d.x, d.y, r, 0, 2*Math.PI);
    ctx.fill();
    // stroke
    ctx.beginPath();
    const isPinned = pinnedNodes.has(d.id);
    ctx.strokeStyle = isPinned
      ? 'orange'
      : parseColor(d.color, '#333');
    ctx.lineWidth = isPinned ? 3 : (+d.penwidth||1);
    if (d.style==='dashed') ctx.setLineDash([4,2]);
    else if (d.style==='dotted') ctx.setLineDash([1,2]);
    else ctx.setLineDash([]);
    ctx.arc(d.x, d.y, r, 0, 2*Math.PI);
    ctx.stroke();
  });

  ctx.restore();
}
