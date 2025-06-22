// gfa-renderer.js

import { layoutGfaNodes } from './gfa-layout.js';

// Bandage-style settings
const GFA_SETTINGS = {
  averageNodeWidth: 12.0,
  depthPower: 0.5,
  depthEffectOnWidth: 0.8,
  nodeSegmentLength: 50,
  minimumNodeLength: 30,
  edgeLength: 40,
  minDepth: 0.1,
  maxDepth: 50
};

// GFA Node class for Bandage-style rendering
class GfaNode {
  constructor(nodeData) {
    this.id = nodeData.id;
    this.depth = nodeData.depth || 1.0;
    this.length = nodeData.length || 1000;
    this.seq = nodeData.seq || '';
    this.x = nodeData.x || 0;
    this.y = nodeData.y || 0;
    this.angle = 0;
    this.segments = [];
    
    this.width = this.calculateWidth();
    this.drawnLength = this.calculateDrawnLength();
    this.createSegments();
  }

  calculateWidth() {
    const depthRelativeToMean = Math.max(0.1, this.depth / 10);
    const widthRelativeToAverage = (Math.pow(depthRelativeToMean, GFA_SETTINGS.depthPower) - 1.0) * 
                                   GFA_SETTINGS.depthEffectOnWidth + 1.0;
    return Math.max(4, GFA_SETTINGS.averageNodeWidth * widthRelativeToAverage);
  }

  calculateDrawnLength() {
    const pixelsPerBp = 0.05;
    const calculatedLength = this.length * pixelsPerBp;
    return Math.max(GFA_SETTINGS.minimumNodeLength, Math.min(200, calculatedLength));
  }

  createSegments() {
    const numSegments = Math.max(1, Math.ceil(this.drawnLength / GFA_SETTINGS.nodeSegmentLength));
    const segmentLength = this.drawnLength / numSegments;
    
    this.segments = [];
    for (let i = 0; i <= numSegments; i++) {
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

  draw(ctx, transform, isSelected = false) {
    if (this.segments.length < 2) return;

    ctx.save();
    
    const width = this.width * transform.k;
    ctx.fillStyle = this.getColor();
    ctx.strokeStyle = isSelected ? '#ff0000' : '#333333';
    ctx.lineWidth = (isSelected ? 3 : 1) * transform.k;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Create path outline
    const topPath = [];
    const bottomPath = [];
    
    for (let i = 0; i < this.segments.length; i++) {
      const segment = this.segments[i];
      const x = segment.x * transform.k + transform.x;
      const y = segment.y * transform.k + transform.y;
      
      let perpX = 0, perpY = 1;
      
      if (i > 0 && i < this.segments.length - 1) {
        const prev = this.segments[i - 1];
        const next = this.segments[i + 1];
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
          perpX = -dy / len;
          perpY = dx / len;
        }
      } else if (i === 0 && this.segments.length > 1) {
        const next = this.segments[i + 1];
        const dx = next.x - segment.x;
        const dy = next.y - segment.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
          perpX = -dy / len;
          perpY = dx / len;
        }
      } else if (i === this.segments.length - 1 && this.segments.length > 1) {
        const prev = this.segments[i - 1];
        const dx = segment.x - prev.x;
        const dy = segment.y - prev.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
          perpX = -dy / len;
          perpY = dx / len;
        }
      }
      
      topPath.push({
        x: x + perpX * width / 2,
        y: y + perpY * width / 2
      });
      bottomPath.push({
        x: x - perpX * width / 2,
        y: y - perpY * width / 2
      });
    }
    
    // Draw filled shape
    ctx.beginPath();
    ctx.moveTo(topPath[0].x, topPath[0].y);
    for (let i = 1; i < topPath.length; i++) {
      ctx.lineTo(topPath[i].x, topPath[i].y);
    }
    
    // Add simple arrow head
    if (topPath.length >= 2) {
      const last = topPath[topPath.length - 1];
      const secondLast = topPath[topPath.length - 2];
      const bottom = bottomPath[bottomPath.length - 1];
      
      const arrowLength = width * 0.6;
      const dx = last.x - secondLast.x;
      const dy = last.y - secondLast.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      
      if (len > 0) {
        const tipX = last.x + (dx / len) * arrowLength;
        const tipY = last.y + (dy / len) * arrowLength;
        ctx.lineTo(tipX, tipY);
        ctx.lineTo(bottom.x + (dx / len) * arrowLength, bottom.y + (dy / len) * arrowLength);
      }
    }
    
    for (let i = bottomPath.length - 1; i >= 0; i--) {
      ctx.lineTo(bottomPath[i].x, bottomPath[i].y);
    }
    
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Draw label if zoomed in enough
    if (transform.k > 0.5) {
      const centerX = this.x * transform.k + transform.x;
      const centerY = this.y * transform.k + transform.y;
      
      ctx.fillStyle = '#000000';
      ctx.font = `${Math.max(8, 10 * transform.k)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.id, centerX, centerY);
    }
    
    ctx.restore();
  }
}

// Main GFA rendering function
export function drawGfaGraph(ctx, canvas, transform, nodes, links, pinnedNodes, selected) {
  // Create GFA node objects if not already created
  if (!nodes._gfaNodes) {
    nodes._gfaNodes = nodes.map(nodeData => new GfaNode(nodeData));
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
  
  // Draw edges first
  links.forEach(link => {
    const sourceGfaNode = nodes._gfaNodes.find(n => n.id === link.source.id || n.id === link.source);
    const targetGfaNode = nodes._gfaNodes.find(n => n.id === link.target.id || n.id === link.target);
    
    if (sourceGfaNode && targetGfaNode) {
      drawGfaEdge(ctx, transform, sourceGfaNode, targetGfaNode);
    }
  });
  
  // Draw nodes
  nodes._gfaNodes.forEach(gfaNode => {
    const isSelected = selected && selected.nodes && selected.nodes.has(gfaNode.id);
    gfaNode.draw(ctx, transform, isSelected);
  });
  
  ctx.restore();
}

// Draw GFA edge with proper end-to-end connection
function drawGfaEdge(ctx, transform, sourceNode, targetNode) {
  const start = sourceNode.getEndPoint();
  const end = targetNode.getStartPoint();
  
  ctx.save();
  ctx.strokeStyle = '#666666';
  ctx.lineWidth = 2 * transform.k;
  ctx.lineCap = 'round';
  
  const startX = start.x * transform.k + transform.x;
  const startY = start.y * transform.k + transform.y;
  const endX = end.x * transform.k + transform.x;
  const endY = end.y * transform.k + transform.y;
  
  // Simple bezier curve
  const controlDistance = GFA_SETTINGS.edgeLength * transform.k;
  
  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const offset = Math.min(controlDistance, distance * 0.3);
  
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  
  // Control points perpendicular to the line
  const perpX = -dy / distance * offset;
  const perpY = dx / distance * offset;
  
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.quadraticCurveTo(midX + perpX, midY + perpY, endX, endY);
  ctx.stroke();
  
  ctx.restore();
}