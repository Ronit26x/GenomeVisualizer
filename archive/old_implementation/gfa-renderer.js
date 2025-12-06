// gfa-renderer.js - ENHANCED: Rounded nodes, curved edges, and node flipping

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

// NEW: Create smooth bezier curve for node shape
function createNodePath(segments, width) {
  if (segments.length < 2) return new Path2D();
  
  const path = new Path2D();
  const halfWidth = width / 2;
  
  // Calculate control points for smooth curves
  const topPoints = [];
  const bottomPoints = [];
  
  segments.forEach((segment, i) => {
    let dx = 0, dy = 0;
    
    if (i === 0) {
      // First segment: use direction to next
      dx = segments[1].x - segments[0].x;
      dy = segments[1].y - segments[0].y;
    } else if (i === segments.length - 1) {
      // Last segment: use direction from previous
      dx = segments[i].x - segments[i-1].x;
      dy = segments[i].y - segments[i-1].y;
    } else {
      // Middle segments: average of directions
      const dx1 = segments[i].x - segments[i-1].x;
      const dy1 = segments[i].y - segments[i-1].y;
      const dx2 = segments[i+1].x - segments[i].x;
      const dy2 = segments[i+1].y - segments[i].y;
      dx = (dx1 + dx2) / 2;
      dy = (dy1 + dy2) / 2;
    }
    
    const len = Math.sqrt(dx * dx + dy * dy);
    const normalX = len > 0 ? -dy / len : 0;
    const normalY = len > 0 ? dx / len : 1;
    
    topPoints.push({
      x: segment.x + normalX * halfWidth,
      y: segment.y + normalY * halfWidth
    });
    
    bottomPoints.push({
      x: segment.x - normalX * halfWidth,
      y: segment.y - normalY * halfWidth
    });
  });
  
  // Start with rounded cap at the beginning
  const firstTop = topPoints[0];
  const firstBottom = bottomPoints[0];
  const firstCenter = segments[0];
  
  // Create rounded start cap
  const startAngle = Math.atan2(firstTop.y - firstBottom.y, firstTop.x - firstBottom.x);
  path.arc(firstCenter.x, firstCenter.y, halfWidth, startAngle, startAngle + Math.PI);
  
  // Draw top edge with smooth curves
  for (let i = 1; i < topPoints.length; i++) {
    if (i === 1) {
      path.lineTo(topPoints[i].x, topPoints[i].y);
    } else {
      // Use quadratic curve for smoothness
      const prevPoint = topPoints[i-1];
      const currPoint = topPoints[i];
      const controlX = (prevPoint.x + currPoint.x) / 2;
      const controlY = (prevPoint.y + currPoint.y) / 2;
      path.quadraticCurveTo(controlX, controlY, currPoint.x, currPoint.y);
    }
  }

  
  
  // Rounded end cap with arrow
  const lastTop = topPoints[topPoints.length - 1];
  const lastBottom = bottomPoints[bottomPoints.length - 1];
  const lastCenter = segments[segments.length - 1];
  
  // Arrow head
  const secondLastCenter = segments[segments.length - 2];
  const arrowDx = lastCenter.x - secondLastCenter.x;
  const arrowDy = lastCenter.y - secondLastCenter.y;
  const arrowLen = Math.sqrt(arrowDx * arrowDx + arrowDy * arrowDy);
  
  if (arrowLen > 0) {
    const arrowSize = Math.min(width * 1.5, arrowLen * 0.5);
    const arrowUnitX = arrowDx / arrowLen;
    const arrowUnitY = arrowDy / arrowLen;
    
    // Arrow tip
    const arrowTipX = lastCenter.x + arrowUnitX * arrowSize * 0.5;
    const arrowTipY = lastCenter.y + arrowUnitY * arrowSize * 0.5;
    
    path.lineTo(arrowTipX, arrowTipY);
    path.lineTo(lastBottom.x, lastBottom.y);
  } else {
    // Fallback: simple rounded end
    const endAngle = Math.atan2(lastBottom.y - lastTop.y, lastBottom.x - lastTop.x);
    path.arc(lastCenter.x, lastCenter.y, halfWidth, endAngle, endAngle + Math.PI);
  }
  
  // Draw bottom edge with smooth curves (in reverse)
  for (let i = bottomPoints.length - 2; i >= 0; i--) {
    if (i === bottomPoints.length - 2) {
      path.lineTo(bottomPoints[i].x, bottomPoints[i].y);
    } else {
      // Use quadratic curve for smoothness
      const nextPoint = bottomPoints[i+1];
      const currPoint = bottomPoints[i];
      const controlX = (nextPoint.x + currPoint.x) / 2;
      const controlY = (nextPoint.y + currPoint.y) / 2;
      path.quadraticCurveTo(controlX, controlY, currPoint.x, currPoint.y);
    }
  }
  
  path.closePath();
  return path;
}

// GFA Node class - ENHANCED: Rounded rendering and flipping functionality
class GfaNode {
  constructor(nodeData, scaleFactor = 1.0) {
    this.id = nodeData.id;
    this.depth = nodeData.depth || 1.0;
    this.length = nodeData.length || 1000;
    this.seq = nodeData.seq || '';
    this.x = nodeData.x || 0;
    this.y = nodeData.y || 0;
    this.angle = 0;
    this.isFlipped = false; // NEW: Track flip state
    this.segments = [];
    this.scaleFactor = scaleFactor;
    
    this.width = this.calculateWidth();
    this.drawnLength = this.calculateDrawnLength(scaleFactor);
    
    // Create subnodes AFTER calculating drawn length
    this.createSubnodes();
    this.createSegments();
  }

  // NEW: Flip the node 180 degrees
  flip() {
    this.isFlipped = !this.isFlipped;
    this.angle += Math.PI; // Rotate 180 degrees
    
    // Normalize angle to [-π, π]
    while (this.angle > Math.PI) this.angle -= 2 * Math.PI;
    while (this.angle < -Math.PI) this.angle += 2 * Math.PI;
    
    // Swap the subnodes since they represent different ends now
    const tempSubnode = { ...this.inSubnode };
    this.inSubnode = { ...this.outSubnode };
    this.outSubnode = tempSubnode;
    
    // Update IDs to reflect the swap
    this.inSubnode.id = `${this.id}_in`;
    this.inSubnode.type = 'incoming';
    this.outSubnode.id = `${this.id}_out`;
    this.outSubnode.type = 'outgoing';
    
    this.updatePosition();
    
    console.log(`Node ${this.id} flipped. New angle: ${(this.angle * 180 / Math.PI).toFixed(1)}°`);
  }

  // NEW: Check if a point is near a subnode (for flip interaction)
  getSubnodeAt(x, y, threshold = 10) {
    const inDist = Math.sqrt(
      (x - this.inSubnode.x) * (x - this.inSubnode.x) + 
      (y - this.inSubnode.y) * (y - this.inSubnode.y)
    );
    const outDist = Math.sqrt(
      (x - this.outSubnode.x) * (x - this.outSubnode.x) + 
      (y - this.outSubnode.y) * (y - this.outSubnode.y)
    );
    
    if (inDist <= threshold) return 'incoming';
    if (outDist <= threshold) return 'outgoing';
    return null;
  }

  // Create incoming and outgoing subnodes
  createSubnodes() {
    this.inSubnode = {
      id: `${this.id}_in`,
      parentId: this.id,
      type: 'incoming',
      x: this.x,
      y: this.y,
      radius: 3
    };
    
    this.outSubnode = {
      id: `${this.id}_out`,
      parentId: this.id,
      type: 'outgoing',
      x: this.x,
      y: this.y,
      radius: 3
    };
    
    this.updateSubnodePositions();
  }

  // Update subnode positions to be exactly at the node ends
  updateSubnodePositions() {
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    const halfLength = this.drawnLength / 2;
    
    // Position subnodes exactly at the ends of the drawn node
    this.inSubnode.x = this.x - cos * halfLength;
    this.inSubnode.y = this.y - sin * halfLength;
    
    this.outSubnode.x = this.x + cos * halfLength;
    this.outSubnode.y = this.y + sin * halfLength;
  }

  // Calculate optimal rotation based on actual connected node positions
  calculateOptimalRotation(allNodes, links) {
    const connections = { incoming: [], outgoing: [] };
    
    // Find all connected nodes with their actual positions
    links.forEach(link => {
      const sourceId = link.source.id || link.source;
      const targetId = link.target.id || link.target;
      
      if (sourceId === this.id) {
        // This node is the source, find the target
        const targetNode = allNodes.find(n => n.id === targetId);
        if (targetNode && targetNode.x !== undefined && targetNode.y !== undefined) {
          connections.outgoing.push({
            node: targetNode,
            dx: targetNode.x - this.x,
            dy: targetNode.y - this.y
          });
        }
      } else if (targetId === this.id) {
        // This node is the target, find the source
        const sourceNode = allNodes.find(n => n.id === sourceId);
        if (sourceNode && sourceNode.x !== undefined && sourceNode.y !== undefined) {
          connections.incoming.push({
            node: sourceNode,
            dx: sourceNode.x - this.x,
            dy: sourceNode.y - this.y
          });
        }
      }
    });
    
    // Calculate optimal angle based on edge pull directions
    let optimalAngle = this.angle; // Default to current angle
    
    if (connections.outgoing.length > 0) {
      // Priority: Point toward outgoing edges
      let totalX = 0, totalY = 0;
      
      connections.outgoing.forEach(({ dx, dy }) => {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
          totalX += dx / dist;
          totalY += dy / dist;
        }
      });
      
      if (totalX !== 0 || totalY !== 0) {
        optimalAngle = Math.atan2(totalY, totalX);
      }
    } else if (connections.incoming.length > 0) {
      // Fallback: Point away from incoming edges
      let totalX = 0, totalY = 0;
      
      connections.incoming.forEach(({ dx, dy }) => {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
          totalX -= dx / dist; // Negative because we want to point away
          totalY -= dy / dist;
        }
      });
      
      if (totalX !== 0 || totalY !== 0) {
        optimalAngle = Math.atan2(totalY, totalX);
      }
    }
    
    return optimalAngle;
  }

  // Apply smooth rotation toward optimal angle (disabled when manually flipped)
  applyDynamicRotation(allNodes, links, rotationStrength = 0.1) {
    // Skip dynamic rotation if node was manually flipped recently
    if (this._skipDynamicRotation) return;
    
    const optimalAngle = this.calculateOptimalRotation(allNodes, links);
    
    // Calculate the shortest angular distance
    let angleDiff = optimalAngle - this.angle;
    
    // Normalize to [-π, π]
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    
    // Apply gradual rotation
    this.angle += angleDiff * rotationStrength;
    
    // Update positions with new angle
    this.updatePosition();
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
    
    // Update subnode positions when node moves or rotates
    this.updateSubnodePositions();
  }

  // Get subnode for edge connections
  getSubnodeForEdge(isOutgoing) {
    return isOutgoing ? this.outSubnode : this.inSubnode;
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
    
    // Transform segments to screen coordinates
    const transformedSegments = this.segments.map(segment => ({
      x: segment.x * transform.k + transform.x,
      y: segment.y * transform.k + transform.y
    }));
    
    // Create smooth rounded path
    const nodeWidth = isHighlighted ? effectiveWidth * 1.5 : effectiveWidth;
    const path = createNodePath(transformedSegments, nodeWidth);
    
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
        `${this.id} (${this.formatLength(this.length)})${this.isFlipped ? ' ↻' : ''}` : 
        `${this.id}${this.isFlipped ? ' ↻' : ''}`;
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
    
    // Draw subnodes when zoomed in (red = incoming, green = outgoing)
    if (transform.k > 1.5) {
      // Draw incoming subnode in red
      ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
      ctx.beginPath();
      ctx.arc(
        this.inSubnode.x * transform.k + transform.x,
        this.inSubnode.y * transform.k + transform.y,
        4 * transform.k, 0, 2 * Math.PI
      );
      ctx.fill();
      
      // Draw outgoing subnode in green
      ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
      ctx.beginPath();
      ctx.arc(
        this.outSubnode.x * transform.k + transform.x,
        this.outSubnode.y * transform.k + transform.y,
        4 * transform.k, 0, 2 * Math.PI
      );
      ctx.fill();
      
      // Removed flip indicator - no visual clutter when selected
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

// Helper function to determine edge direction based on GFA semantics
function determineEdgeDirection(sourceNode, targetNode, linkData) {
  if (linkData.gfaType === 'link') {
    const srcOri = linkData.srcOrientation || '+';
    const tgtOri = linkData.tgtOrientation || '+';
    
    if (srcOri === '+' && tgtOri === '+') {
      return {
        fromSubnode: sourceNode.outSubnode,
        toSubnode: targetNode.inSubnode
      };
    } else if (srcOri === '-' && tgtOri === '+') {
      return {
        fromSubnode: sourceNode.inSubnode,
        toSubnode: targetNode.inSubnode
      };
    } else if (srcOri === '+' && tgtOri === '-') {
      return {
        fromSubnode: sourceNode.outSubnode,
        toSubnode: targetNode.outSubnode
      };
    } else {
      return {
        fromSubnode: sourceNode.inSubnode,
        toSubnode: targetNode.outSubnode
      };
    }
  }
  
  return {
    fromSubnode: sourceNode.outSubnode,
    toSubnode: targetNode.inSubnode
  };
}

// NEW: Create curved edge path using quadratic bezier
function createCurvedEdgePath(startX, startY, endX, endY, curvature = 0.2) {
  const path = new Path2D();
  
  // Calculate control point for the curve
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  
  // Calculate perpendicular offset for curve
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  if (length > 0) {
    // Perpendicular vector
    const perpX = -dy / length;
    const perpY = dx / length;
    
    // Control point offset (creates the curve)
    const offset = length * curvature;
    const controlX = midX + perpX * offset;
    const controlY = midY + perpY * offset;
    
    path.moveTo(startX, startY);
    path.quadraticCurveTo(controlX, controlY, endX, endY);
  } else {
    // Fallback for zero-length edges
    path.moveTo(startX, startY);
    path.lineTo(endX, endY);
  }
  
  return path;
}

// NEW: Function to flip a selected node
export function flipSelectedNode(nodes, selected) {
  if (!nodes._gfaNodes || !selected || !selected.nodes) return false;
  
  let flipped = false;
  for (const nodeId of selected.nodes) {
    const gfaNode = nodes._gfaNodes.find(n => n.id === nodeId);
    if (gfaNode) {
      gfaNode.flip();
      // Temporarily disable dynamic rotation to preserve manual flip
      gfaNode._skipDynamicRotation = true;
      setTimeout(() => {
        if (gfaNode) gfaNode._skipDynamicRotation = false;
      }, 3000); // Re-enable after 3 seconds
      flipped = true;
    }
  }
  
  return flipped;
}

// NEW: Function to check if click is on a subnode (for flip interaction)
export function getSubnodeAt(nodes, x, y, transform, threshold = 15) {
  if (!nodes._gfaNodes) return null;
  
  // Convert screen coordinates to simulation coordinates
  const simX = (x - transform.x) / transform.k;
  const simY = (y - transform.y) / transform.k;
  
  for (const gfaNode of nodes._gfaNodes) {
    const subnodeType = gfaNode.getSubnodeAt(simX, simY, threshold / transform.k);
    if (subnodeType) {
      return {
        nodeId: gfaNode.id,
        subnodeType: subnodeType,
        gfaNode: gfaNode
      };
    }
  }
  
  return null;
}

// ENHANCED: Main function with rounded nodes, curved edges, and flipping
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
      
      // Apply dynamic rotation based on edge pull
      gfaNode.applyDynamicRotation(nodes, links, 0.05); // Gentle rotation strength
    }
  });
  
  ctx.save();
  
  // Clear background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Set up antialiasing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  // Draw edges using curved paths
  ctx.globalAlpha = 0.6;
  links.forEach((link, index) => {
    const sourceGfaNode = nodes._gfaNodes.find(n => n.id === (link.source.id || link.source));
    const targetGfaNode = nodes._gfaNodes.find(n => n.id === (link.target.id || link.target));
    
    if (sourceGfaNode && targetGfaNode) {
      const isHighlighted = highlightedPath && highlightedPath.edges && highlightedPath.edges.has(index);
      drawCurvedGfaEdge(ctx, transform, sourceGfaNode, targetGfaNode, link, isHighlighted);
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

// NEW: Draw curved GFA edge
function drawCurvedGfaEdge(ctx, transform, sourceNode, targetNode, linkData, isHighlighted = false) {
  const edgeInfo = determineEdgeDirection(sourceNode, targetNode, linkData);
  const start = edgeInfo.fromSubnode;
  const end = edgeInfo.toSubnode;
  
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
  
  // Create curved path
  const curvature = 0.1; // Adjust this value to control curve intensity
  const curvedPath = createCurvedEdgePath(startX, startY, endX, endY, curvature);
  
  ctx.stroke(curvedPath);
  
  ctx.restore();
}