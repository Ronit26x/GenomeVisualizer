// gfa-renderer.js

import { layoutGfaNodes } from './gfa-layout.js';

// Bandage-style settings (matching Bandage defaults)
const GFA_SETTINGS = {
  averageNodeWidth: 12.0,
  depthPower: 0.5,
  depthEffectOnWidth: 0.8,
  nodeSegmentLength: 25,  // Shorter segments for smoother curves
  minimumNodeLength: 10,
  edgeLength: 40,
  minDepth: 0.1,
  maxDepth: 50,
  // Bandage-specific settings
  meanNodeLength: 50.0,  // Reduced for better initial layout
  minTotalGraphLength: 2000.0,  // Reduced for better initial layout
  autoNodeLengthPerMegabase: 5000.0  // Will be calculated dynamically
};

// Calculate auto-scaling factor based on total graph size (Bandage approach)
function calculateAutoNodeLength(nodes) {
  let totalLength = 0;
  let nodeCount = 0;
  
  nodes.forEach(node => {
    if (node.length && node.length > 0) {
      totalLength += node.length;
      nodeCount++;
    }
  });
  
  // Target average node length, but ensure minimum graph size
  const targetDrawnGraphLength = Math.max(
    nodeCount * GFA_SETTINGS.meanNodeLength,
    GFA_SETTINGS.minTotalGraphLength
  );
  
  const megabases = totalLength / 1000000.0;
  if (megabases > 0.0) {
    GFA_SETTINGS.autoNodeLengthPerMegabase = targetDrawnGraphLength / megabases;
  } else {
    GFA_SETTINGS.autoNodeLengthPerMegabase = 10000.0;
  }
}

// GFA Node class for Bandage-style rendering
class GfaNode {
  constructor(nodeData, scaleFactor = 1.0) {
    this.id = nodeData.id;
    this.depth = nodeData.depth || 1.0;
    this.length = nodeData.length || 1000;
    this.seq = nodeData.seq || '';
    this.x = nodeData.x || 0;
    this.y = nodeData.y || 0;
    this.angle = 0;
    this.segments = [];
    this.scaleFactor = scaleFactor;
    
    this.width = this.calculateWidth();
    this.drawnLength = this.calculateDrawnLength(scaleFactor);
    this.createSegments();
  }

  calculateWidth() {
    const depthRelativeToMean = Math.max(0.1, this.depth / 10);
    const widthRelativeToAverage = (Math.pow(depthRelativeToMean, GFA_SETTINGS.depthPower) - 1.0) * 
                                   GFA_SETTINGS.depthEffectOnWidth + 1.0;
    return Math.max(4, GFA_SETTINGS.averageNodeWidth * widthRelativeToAverage);
  }

  calculateDrawnLength(scaleFactor = 1.0) {
    // Bandage approach: scale based on megabases and auto-calculated factor
    const drawnNodeLength = GFA_SETTINGS.autoNodeLengthPerMegabase * this.length / 1000000.0 * scaleFactor;
    return Math.max(GFA_SETTINGS.minimumNodeLength, drawnNodeLength);
  }

  getNumberOfSegments() {
    // Calculate number of segments based on drawn length (like OGDF edges in Bandage)
    const numberOfEdges = Math.max(1, Math.round(this.drawnLength / GFA_SETTINGS.nodeSegmentLength));
    return numberOfEdges + 1;  // nodes = edges + 1
  }

  createSegments() {
    const numSegments = this.getNumberOfSegments();
    const segmentLength = this.drawnLength / (numSegments - 1);
    
    this.segments = [];
    for (let i = 0; i < numSegments; i++) {
      this.segments.push({
        x: this.x + (i * segmentLength) - (this.drawnLength / 2),
        y: this.y
      });
    }
  }

  updatePosition() {
    const centerX = this.x;
    const centerY = this.y;
    
    // Update segments based on current position and angle
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    const segmentLength = this.drawnLength / (this.segments.length - 1);
    
    this.segments.forEach((segment, i) => {
      const offset = (i * segmentLength) - (this.drawnLength / 2);
      segment.x = centerX + cos * offset;
      segment.y = centerY + sin * offset;
    });
  }

  getStartPoint() {
    return this.segments[0];
  }

  getEndPoint() {
    return this.segments[this.segments.length - 1];
  }

  getColor() {
    // Generate consistent color based on node ID
    const hash = this.id.toString().split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0);
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 60%)`;
  }

  contains(x, y) {
    // Check if point is inside the node
    for (let i = 0; i < this.segments.length - 1; i++) {
      const p1 = this.segments[i];
      const p2 = this.segments[i + 1];
      const dist = this.distanceToLineSegment(x, y, p1.x, p1.y, p2.x, p2.y);
      if (dist <= this.width / 2 + 3) {
        return true;
      }
    }
    return false;
  }

  distanceToLineSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length === 0) return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
    
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (length * length)));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    
    return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
  }

  draw(ctx, transform, isSelected = false, isPinned = false, isHighlighted = false) {
    if (this.segments.length < 2) return;

    ctx.save();
    
    const width = this.width * transform.k;
    const minWidth = 2; // Minimum visible width
    const effectiveWidth = Math.max(width, minWidth);
    
    // Determine colors based on state
    if (isHighlighted) {
      ctx.fillStyle = '#ff6b6b';  // Bright red for highlighted
      ctx.strokeStyle = '#cc0000';  // Darker red border
      ctx.lineWidth = Math.max(0.5, 3 * transform.k);
    } else {
      ctx.fillStyle = this.getColor();
      ctx.strokeStyle = isSelected ? '#ff0000' : (isPinned ? '#ff8800' : '#000000');
      ctx.lineWidth = Math.max(0.5, (isSelected ? 2 : 0.5) * transform.k);
    }
    
    // Build the path
    const path = new Path2D();
    
    // Calculate perpendiculars for all segments
    const normals = [];
    for (let i = 0; i < this.segments.length; i++) {
      let dx = 0, dy = 0;
      
      if (i === 0) {
        // First segment: use direction to next
        dx = this.segments[1].x - this.segments[0].x;
        dy = this.segments[1].y - this.segments[0].y;
      } else if (i === this.segments.length - 1) {
        // Last segment: use direction from previous
        dx = this.segments[i].x - this.segments[i-1].x;
        dy = this.segments[i].y - this.segments[i-1].y;
      } else {
        // Middle segments: average of directions
        const dx1 = this.segments[i].x - this.segments[i-1].x;
        const dy1 = this.segments[i].y - this.segments[i-1].y;
        const dx2 = this.segments[i+1].x - this.segments[i].x;
        const dy2 = this.segments[i+1].y - this.segments[i].y;
        dx = (dx1 + dx2) / 2;
        dy = (dy1 + dy2) / 2;
      }
      
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        normals.push({ x: -dy / len, y: dx / len });
      } else {
        normals.push({ x: 0, y: 1 });
      }
    }
    
    // Start from the top of the first segment
    const firstX = this.segments[0].x * transform.k + transform.x;
    const firstY = this.segments[0].y * transform.k + transform.y;
    const nodeWidth = isHighlighted ? effectiveWidth * 1.5 : effectiveWidth;
    path.moveTo(
      firstX + normals[0].x * nodeWidth / 2,
      firstY + normals[0].y * nodeWidth / 2
    );
    
    // Draw top edge
    for (let i = 1; i < this.segments.length; i++) {
      const x = this.segments[i].x * transform.k + transform.x;
      const y = this.segments[i].y * transform.k + transform.y;
      path.lineTo(
        x + normals[i].x * nodeWidth / 2,
        y + normals[i].y * nodeWidth / 2
      );
    }
    
    // Arrow head at the end
    if (this.segments.length >= 2) {
      const lastIdx = this.segments.length - 1;
      const lastX = this.segments[lastIdx].x * transform.k + transform.x;
      const lastY = this.segments[lastIdx].y * transform.k + transform.y;
      const secondLastX = this.segments[lastIdx - 1].x * transform.k + transform.x;
      const secondLastY = this.segments[lastIdx - 1].y * transform.k + transform.y;
      
      const dx = lastX - secondLastX;
      const dy = lastY - secondLastY;
      const len = Math.sqrt(dx * dx + dy * dy);
      
      if (len > 0) {
        const arrowLen = Math.min(nodeWidth * 1.5, len * 0.5);
        const arrowX = dx / len * arrowLen;
        const arrowY = dy / len * arrowLen;
        
        // Arrow tip
        path.lineTo(lastX + arrowX, lastY + arrowY);
        
        // Arrow bottom
        path.lineTo(
          lastX - normals[lastIdx].x * nodeWidth / 2,
          lastY - normals[lastIdx].y * nodeWidth / 2
        );
      }
    }
    
    // Draw bottom edge (reverse)
    for (let i = this.segments.length - 2; i >= 0; i--) {
      const x = this.segments[i].x * transform.k + transform.x;
      const y = this.segments[i].y * transform.k + transform.y;
      path.lineTo(
        x - normals[i].x * nodeWidth / 2,
        y - normals[i].y * nodeWidth / 2
      );
    }
    
    path.closePath();
    
    // Fill and stroke
    ctx.fill(path);
    ctx.stroke(path);
    
    // Draw label if zoomed in enough and node is long enough
    if (transform.k > 0.3 && this.drawnLength > 30) {
      const centerX = this.x * transform.k + transform.x;
      const centerY = this.y * transform.k + transform.y;
      
      // Background for text
      const fontSize = Math.min(12, Math.max(8, 10 * transform.k));
      ctx.font = `${fontSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Measure text
      const label = this.drawnLength > 80 ? 
        `${this.id} (${this.formatLength(this.length)})` : 
        this.id;
      const metrics = ctx.measureText(label);
      const textWidth = metrics.width;
      const textHeight = fontSize;
      
      // Draw white background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(
        centerX - textWidth/2 - 2,
        centerY - textHeight/2 - 1,
        textWidth + 4,
        textHeight + 2
      );
      
      // Draw text
      ctx.fillStyle = '#000000';
      ctx.fillText(label, centerX, centerY);
    }
    
    ctx.restore();
  }
  
  formatLength(length) {
    if (length >= 1000000) {
      return (length / 1000000).toFixed(1) + 'Mb';
    } else if (length >= 1000) {
      return (length / 1000).toFixed(1) + 'kb';
    }
    return length + 'bp';
  }
}

// Main GFA rendering function
export function drawGfaGraph(ctx, canvas, transform, nodes, links, pinnedNodes, selected, highlightedPath = null, scaleFactor = 1.0) {
  // Create GFA node objects if not already created or if scale changed
  if (!nodes._gfaNodes || nodes._lastScale !== scaleFactor) {
    // Calculate auto-scaling factor first
    calculateAutoNodeLength(nodes);
    
    nodes._gfaNodes = nodes.map(nodeData => new GfaNode(nodeData, scaleFactor));
    nodes._lastScale = scaleFactor;
    layoutGfaNodes(nodes._gfaNodes, links);
  }
  
  // Update node positions from D3 simulation
  nodes._gfaNodes.forEach((gfaNode, i) => {
    if (nodes[i]) {
      gfaNode.x = nodes[i].x;
      gfaNode.y = nodes[i].y;
      gfaNode.updatePosition();
    }
  });
  
  ctx.save();
  
  // Clear background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Set up antialiasing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  // Draw edges first (behind nodes)
  ctx.globalAlpha = 0.6;
  links.forEach((link, index) => {
    const sourceGfaNode = nodes._gfaNodes.find(n => n.id === (link.source.id || link.source));
    const targetGfaNode = nodes._gfaNodes.find(n => n.id === (link.target.id || link.target));
    
    if (sourceGfaNode && targetGfaNode) {
      const isHighlighted = highlightedPath && highlightedPath.edges && highlightedPath.edges.has(index);
      drawGfaEdge(ctx, transform, sourceGfaNode, targetGfaNode, link, isHighlighted);
    }
  });
  ctx.globalAlpha = 1.0;
  
  // Draw nodes on top
  nodes._gfaNodes.forEach(gfaNode => {
    const isSelected = selected && selected.nodes && selected.nodes.has(gfaNode.id);
    const isPinned = pinnedNodes && pinnedNodes.has(gfaNode.id);
    const isHighlighted = highlightedPath && highlightedPath.nodes && highlightedPath.nodes.has(String(gfaNode.id));
    gfaNode.draw(ctx, transform, isSelected, isPinned, isHighlighted);
  });
  
  ctx.restore();
}

// Draw GFA edge with proper end-to-end connection
function drawGfaEdge(ctx, transform, sourceNode, targetNode, linkData, isHighlighted = false) {
  const start = sourceNode.getEndPoint();
  const end = targetNode.getStartPoint();
  
  ctx.save();
  
  // Edge styling
  if (isHighlighted) {
    ctx.strokeStyle = '#ff6b6b';  // Bright red for highlighted
    ctx.lineWidth = Math.max(1, 6 * transform.k);
  } else {
    ctx.strokeStyle = linkData.color || '#333333';
    ctx.lineWidth = Math.max(1, 2 * transform.k);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  const startX = start.x * transform.k + transform.x;
  const startY = start.y * transform.k + transform.y;
  const endX = end.x * transform.k + transform.x;
  const endY = end.y * transform.k + transform.y;
  
  // Calculate edge direction based on orientations
  const sourceAngle = sourceNode.angle;
  const targetAngle = targetNode.angle;
  
  // Simple straight line for now (can be enhanced with curves later)
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  
  ctx.restore();
}