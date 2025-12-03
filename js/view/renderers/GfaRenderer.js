// GfaRenderer.js - GFA Bandage-style renderer with rounded nodes and curved edges

import { Renderer } from './Renderer.js';
import { GfaNode as GfaNodeEntity } from '../../model/entities/GfaNode.js';

/**
 * GfaRenderer renders graphs in GFA format (Bandage-style).
 * Features rounded rectangular nodes, curved edges, subnodes, and node flipping.
 */
export class GfaRenderer extends Renderer {
  constructor() {
    super('gfa');

    // Bandage-style settings
    this.settings = {
      averageNodeWidth: 12.0,
      depthPower: 0.5,
      depthEffectOnWidth: 0.8,
      nodeSegmentLength: 25,
      minimumNodeLength: 10,
      edgeLength: 40,
      minDepth: 0.1,
      maxDepth: 50,
      meanNodeLength: 50.0,
      minTotalGraphLength: 2000.0,
      autoNodeLengthPerMegabase: 5000.0
    };

    // Cached GFA visual nodes
    this.gfaVisualNodes = [];
    this.lastScaleFactor = 1.0;
    this.lastNodeCount = 0;
  }

  /**
   * Render the GFA graph
   */
  render(renderData) {
    if (!this.isInitialized) {
      throw new Error('GfaRenderer not initialized');
    }

    const {
      nodes = [],
      edges = [],
      transform,
      selection = { nodes: new Set(), edges: new Set() },
      pinnedNodes = new Set(),
      highlightedPath = null,
      scaleFactor = 1.0,
      componentBounds = [],
      showComponentBounds = false
    } = renderData;

    // Create or update GFA visual nodes
    // Recreate if: no nodes, scale changed, OR node count changed (merge/split operations)
    if (this.gfaVisualNodes.length === 0 ||
        this.lastScaleFactor !== scaleFactor ||
        this.lastNodeCount !== nodes.length) {
      console.log(`[GfaRenderer] 🔄 Recreating visual nodes (count: ${this.lastNodeCount} → ${nodes.length})`);
      console.log(`[GfaRenderer] Reason: length=${this.gfaVisualNodes.length}, scale=${this.lastScaleFactor}→${scaleFactor}, nodeCount=${this.lastNodeCount}→${nodes.length}`);
      this.calculateAutoNodeLength(nodes);
      this.gfaVisualNodes = nodes.map(node => new GfaVisualNode(node, scaleFactor, this.settings));
      this.lastScaleFactor = scaleFactor;
      this.lastNodeCount = nodes.length;

      console.log(`[GfaRenderer] Created ${this.gfaVisualNodes.length} visual nodes:`, this.gfaVisualNodes.map(n => n.id));

      // Run layout algorithm to calculate initial orientations
      this.layoutGfaNodes(this.gfaVisualNodes, edges);
    }

    // ALWAYS update positions from simulation (whether recreated or not)
    // This ensures visual nodes sync with D3 simulation positions every frame
    this.gfaVisualNodes.forEach((gfaNode) => {
      const modelNode = nodes.find(n => n.id === gfaNode.id);
      if (modelNode) {
        gfaNode.x = modelNode.x;
        gfaNode.y = modelNode.y;

        // Use calculated angle if available (from rotational alignment after warm start)
        if (modelNode.calculatedAngle !== undefined) {
          gfaNode.angle = modelNode.calculatedAngle;
        } else {
          // Apply dynamic rotation (skipped for merged nodes)
          gfaNode.applyDynamicRotation(nodes, edges, 0.05);
        }

        gfaNode.updatePosition(); // Update segments and subnodes
      }
    });

    // Clear canvas
    this.clear();

    // Set antialiasing
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';

    // Draw component bounds first (if enabled)
    if (showComponentBounds && componentBounds.length > 0) {
      this.ctx.save();
      this.ctx.setTransform(transform.k, 0, 0, transform.k, transform.x, transform.y);
      this.drawComponentBounds(componentBounds, transform);
      this.ctx.restore();
    }

    // Draw edges first
    this.ctx.globalAlpha = 0.6;
    edges.forEach((edge, index) => {
      const isHighlighted = highlightedPath && highlightedPath.edges &&
                           highlightedPath.edges.has(index);
      this.drawGfaEdge(edge, index, transform, isHighlighted, highlightedPath);
    });
    this.ctx.globalAlpha = 1.0;

    // Draw nodes on top
    this.gfaVisualNodes.forEach(gfaNode => {
      const isSelected = selection.nodes && selection.nodes.has(gfaNode.id);
      const isPinned = pinnedNodes.has(gfaNode.id);
      const isHighlighted = highlightedPath && highlightedPath.nodes &&
                           highlightedPath.nodes.has(String(gfaNode.id));

      // Draw node body
      gfaNode.draw(this.ctx, transform, isSelected, isPinned, isHighlighted);

      // Draw visual subvertices for longer nodes (threshold: 100px drawn length)
      if (gfaNode.drawnLength > 100) {
        this.drawSubvertices(gfaNode, transform);
      }
    });
  }

  /**
   * Draw small visual subvertices along the node body
   * These are just visual markers (no physics) to show internal structure
   */
  drawSubvertices(gfaNode, transform) {
    const numSubvertices = 5; // Number of internal markers
    const ctx = this.ctx;

    // Calculate positions along the node's drawn length
    for (let i = 1; i <= numSubvertices; i++) {
      const ratio = i / (numSubvertices + 1); // Evenly spaced: 0.16, 0.33, 0.5, 0.66, 0.83

      // Calculate position along node body
      const offset = (ratio - 0.5) * gfaNode.drawnLength;
      const x = gfaNode.x + Math.cos(gfaNode.angle) * offset;
      const y = gfaNode.y + Math.sin(gfaNode.angle) * offset;

      // Transform to screen coordinates
      const screenX = x * transform.k + transform.x;
      const screenY = y * transform.k + transform.y;

      // Draw small blue dot (distinct from red/green subnodes)
      ctx.fillStyle = 'rgba(100, 149, 237, 0.6)'; // Cornflower blue, semi-transparent
      ctx.beginPath();
      ctx.arc(screenX, screenY, 3 * transform.k, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  /**
   * Calculate auto-scaling factor based on total graph size
   */
  calculateAutoNodeLength(nodes) {
    let totalLength = 0;
    let nodeCount = 0;

    nodes.forEach(node => {
      if (node.length && node.length > 0) {
        totalLength += node.length;
        nodeCount++;
      }
    });

    const targetDrawnGraphLength = Math.max(
      nodeCount * this.settings.meanNodeLength,
      this.settings.minTotalGraphLength
    );

    const megabases = totalLength / 1000000.0;
    if (megabases > 0.0) {
      this.settings.autoNodeLengthPerMegabase = targetDrawnGraphLength / megabases;
    } else {
      this.settings.autoNodeLengthPerMegabase = 10000.0;
    }
  }

  /**
   * Layout GFA nodes - calculate optimal orientation based on connections
   * Ported from legacy gfa-layout.js
   */
  layoutGfaNodes(gfaNodes, links) {
    // Create node map for quick lookup
    const nodeMap = new Map();
    gfaNodes.forEach(node => nodeMap.set(node.id, node));

    // Build adjacency lists
    const connections = new Map();
    gfaNodes.forEach(node => connections.set(node.id, { incoming: [], outgoing: [] }));

    links.forEach(link => {
      const sourceId = link.source.id || link.source;
      const targetId = link.target.id || link.target;

      if (connections.has(sourceId)) {
        connections.get(sourceId).outgoing.push({
          nodeId: targetId,
          orientation: link.tgtOrientation || '+'
        });
      }
      if (connections.has(targetId)) {
        connections.get(targetId).incoming.push({
          nodeId: sourceId,
          orientation: link.srcOrientation || '+'
        });
      }
    });

    // Phase 1: Calculate base angles - point toward outgoing or away from incoming
    gfaNodes.forEach(node => {
      const conn = connections.get(node.id);
      let targetAngle = 0;
      let angleSet = false;

      // Priority 1: Point toward outgoing edges
      if (conn.outgoing.length > 0) {
        let totalX = 0, totalY = 0, count = 0;

        conn.outgoing.forEach(({ nodeId }) => {
          const targetNode = nodeMap.get(nodeId);
          if (targetNode) {
            const dx = targetNode.x - node.x;
            const dy = targetNode.y - node.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0) {
              totalX += dx / dist;
              totalY += dy / dist;
              count++;
            }
          }
        });

        if (count > 0) {
          targetAngle = Math.atan2(totalY / count, totalX / count);
          angleSet = true;
        }
      }

      // Priority 2: Point away from incoming edges
      if (!angleSet && conn.incoming.length > 0) {
        let totalX = 0, totalY = 0, count = 0;

        conn.incoming.forEach(({ nodeId }) => {
          const sourceNode = nodeMap.get(nodeId);
          if (sourceNode) {
            const dx = node.x - sourceNode.x;
            const dy = node.y - sourceNode.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0) {
              totalX += dx / dist;
              totalY += dy / dist;
              count++;
            }
          }
        });

        if (count > 0) {
          targetAngle = Math.atan2(totalY / count, totalX / count);
          angleSet = true;
        }
      }

      // Set calculated angle or default
      node.angle = angleSet ? targetAngle : 0;
      node.updatePosition();
    });

    // Phase 2: Smooth linear paths (1 in, 1 out)
    gfaNodes.forEach(node => {
      const conn = connections.get(node.id);

      if (conn.incoming.length === 1 && conn.outgoing.length === 1) {
        const sourceNode = nodeMap.get(conn.incoming[0].nodeId);
        const targetNode = nodeMap.get(conn.outgoing[0].nodeId);

        if (sourceNode && targetNode) {
          const inDx = node.x - sourceNode.x;
          const inDy = node.y - sourceNode.y;
          const outDx = targetNode.x - node.x;
          const outDy = targetNode.y - node.y;

          const inDist = Math.sqrt(inDx * inDx + inDy * inDy);
          const outDist = Math.sqrt(outDx * outDx + outDy * outDy);

          if (inDist > 0 && outDist > 0) {
            const avgDx = (inDx / inDist + outDx / outDist) / 2;
            const avgDy = (inDy / inDist + outDy / outDist) / 2;

            if (avgDx !== 0 || avgDy !== 0) {
              node.angle = Math.atan2(avgDy, avgDx);
              node.updatePosition();
            }
          }
        }
      }
    });
  }

  /**
   * Draw GFA edge with curve
   */
  drawGfaEdge(edge, index, transform, isHighlighted, highlightedPath) {
    const sourceId = edge.source.id || edge.source;
    const targetId = edge.target.id || edge.target;

    const sourceNode = this.gfaVisualNodes.find(n => n.id === sourceId);
    const targetNode = this.gfaVisualNodes.find(n => n.id === targetId);

    if (!sourceNode || !targetNode) {
      // Debug: Why is this edge not rendering?
      if (!sourceNode) {
        console.warn(`[GfaRenderer] Edge ${index}: source node "${sourceId}" not found in visual nodes`);
      }
      if (!targetNode) {
        console.warn(`[GfaRenderer] Edge ${index}: target node "${targetId}" not found in visual nodes`);
      }
      return;
    }

    // Determine edge direction based on GFA orientations
    const edgeInfo = this.determineEdgeDirection(sourceNode, targetNode, edge);
    const start = edgeInfo.fromSubnode;
    const end = edgeInfo.toSubnode;

    this.ctx.save();

    // Edge styling
    if (isHighlighted) {
      this.ctx.strokeStyle = '#FF0000'; // Always use red for path highlights
      this.ctx.lineWidth = Math.max(1, 6 * transform.k);
    } else {
      this.ctx.strokeStyle = edge.color || '#333333';
      this.ctx.lineWidth = Math.max(1, 2 * transform.k);
    }

    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    // Transform coordinates
    const startX = start.x * transform.k + transform.x;
    const startY = start.y * transform.k + transform.y;
    const endX = end.x * transform.k + transform.x;
    const endY = end.y * transform.k + transform.y;

    // Draw curved edge
    this.drawCurvedEdge(startX, startY, endX, endY, 0.1);

    this.ctx.restore();
  }

  /**
   * Determine edge direction based on GFA semantics
   */
  determineEdgeDirection(sourceNode, targetNode, linkData) {
    if (linkData.gfaType === 'link' || linkData.srcOrientation) {
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

  /**
   * Draw curved edge using quadratic bezier
   */
  drawCurvedEdge(startX, startY, endX, endY, curvature) {
    const ctx = this.ctx;

    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;

    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length > 0) {
      const perpX = -dy / length;
      const perpY = dx / length;

      const offset = length * curvature;
      const controlX = midX + perpX * offset;
      const controlY = midY + perpY * offset;

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(controlX, controlY, endX, endY);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }
  }

  /**
   * Flip selected node
   */
  flipNode(nodeId) {
    const gfaNode = this.gfaVisualNodes.find(n => n.id === nodeId);
    if (gfaNode) {
      gfaNode.flip();
      return true;
    }
    return false;
  }

  /**
   * Get subnode at screen coordinates
   */
  getSubnodeAt(x, y, transform, threshold = 15) {
    const simX = (x - transform.x) / transform.k;
    const simY = (y - transform.y) / transform.k;

    for (const gfaNode of this.gfaVisualNodes) {
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

  /**
   * Hit test for GFA nodes
   */
  hitTest(node, x, y) {
    const gfaNode = this.gfaVisualNodes.find(n => n.id === node.id);
    if (!gfaNode) return false;

    return gfaNode.contains(x, y);
  }

  /**
   * Clear cached visual nodes
   */
  clearCache() {
    this.gfaVisualNodes = [];
    this.lastScaleFactor = 1.0;
    this.lastNodeCount = 0;
  }

  /**
   * Draw component bounding rectangles
   */
  drawComponentBounds(componentBounds, transform) {
    const ctx = this.ctx;

    // Generate distinct colors for each component
    const colors = [
      'rgba(255, 99, 71, 0.25)',   // Tomato - increased opacity
      'rgba(54, 162, 235, 0.25)',  // Blue
      'rgba(75, 192, 192, 0.25)',  // Teal
      'rgba(255, 206, 86, 0.25)',  // Yellow
      'rgba(153, 102, 255, 0.25)', // Purple
      'rgba(255, 159, 64, 0.25)',  // Orange
      'rgba(199, 199, 199, 0.25)', // Gray
      'rgba(83, 102, 255, 0.25)',  // Indigo
      'rgba(255, 99, 132, 0.25)',  // Pink
      'rgba(34, 193, 195, 0.25)'   // Cyan
    ];

    const borderColors = [
      'rgba(255, 99, 71, 0.8)',   // Increased opacity
      'rgba(54, 162, 235, 0.8)',
      'rgba(75, 192, 192, 0.8)',
      'rgba(255, 206, 86, 0.8)',
      'rgba(153, 102, 255, 0.8)',
      'rgba(255, 159, 64, 0.8)',
      'rgba(199, 199, 199, 0.8)',
      'rgba(83, 102, 255, 0.8)',
      'rgba(255, 99, 132, 0.8)',
      'rgba(34, 193, 195, 0.8)'
    ];

    componentBounds.forEach((bounds, index) => {
      const { minX, minY, maxX, maxY } = bounds;
      const width = maxX - minX;
      const height = maxY - minY;
      const componentSize = Math.sqrt(width * width + height * height);

      // Use modulo to cycle through colors if more components than colors
      const colorIndex = index % colors.length;

      // Thick solid border - scale-independent for visibility at all zoom levels
      // Divide by transform.k to make line width constant in screen space
      const screenBorderWidth = 4 / transform.k; // 4px in screen space always

      // Draw thick solid border (no dashes, no fill)
      ctx.strokeStyle = borderColors[colorIndex];
      ctx.lineWidth = screenBorderWidth;
      ctx.strokeRect(minX, minY, width, height);
    });

    // Draw labels in screen space (after restoring transform)
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset to screen coordinates

    componentBounds.forEach((bounds, index) => {
      const { minX, minY } = bounds;
      const colorIndex = index % colors.length;

      // Transform simulation coordinates to screen coordinates
      const screenX = minX * transform.k + transform.x;
      const screenY = minY * transform.k + transform.y;

      // Draw component label with background for better readability
      ctx.font = 'bold 14px sans-serif';
      const label = `Component ${index + 1}`;
      const metrics = ctx.measureText(label);
      const textWidth = metrics.width;
      const textHeight = 14;

      // Draw label background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(screenX + 5, screenY + 5, textWidth + 10, textHeight + 6);

      // Draw label border
      ctx.strokeStyle = borderColors[colorIndex];
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(screenX + 5, screenY + 5, textWidth + 10, textHeight + 6);

      // Draw label text
      ctx.fillStyle = borderColors[colorIndex];
      ctx.fillText(label, screenX + 10, screenY + 17);
    });

    ctx.restore();
  }
}

/**
 * GfaVisualNode - Visual representation of a GFA node
 * This is a rendering helper class, separate from the data model GfaNode
 */
class GfaVisualNode {
  constructor(nodeData, scaleFactor, settings) {
    this.id = nodeData.id;
    this.depth = nodeData.depth || 1.0;
    this.length = nodeData.length || 1000;
    this.seq = nodeData.seq || '';
    this.x = nodeData.x || 0;
    this.y = nodeData.y || 0;
    this.angle = 0;
    this.isFlipped = false;
    this.segments = [];
    this.scaleFactor = scaleFactor;
    this.settings = settings;

    // Disable dynamic rotation for merged nodes to preserve orientation
    this.isMergedNode = nodeData.gfaType === 'merged_segment';

    this.width = this.calculateWidth();
    this.drawnLength = this.calculateDrawnLength(scaleFactor);

    this.createSubnodes();
    this.createSegments();
  }

  flip() {
    this.isFlipped = !this.isFlipped;
    this.angle += Math.PI;

    // Normalize angle
    while (this.angle > Math.PI) this.angle -= 2 * Math.PI;
    while (this.angle < -Math.PI) this.angle += 2 * Math.PI;

    // Swap subnodes
    const temp = { ...this.inSubnode };
    this.inSubnode = { ...this.outSubnode };
    this.outSubnode = temp;

    this.inSubnode.id = `${this.id}_in`;
    this.inSubnode.type = 'incoming';
    this.outSubnode.id = `${this.id}_out`;
    this.outSubnode.type = 'outgoing';

    this.updatePosition();
  }

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

  updateSubnodePositions() {
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    const halfLength = this.drawnLength / 2;

    this.inSubnode.x = this.x - cos * halfLength;
    this.inSubnode.y = this.y - sin * halfLength;

    this.outSubnode.x = this.x + cos * halfLength;
    this.outSubnode.y = this.y + sin * halfLength;
  }

  calculateOptimalRotation(allNodes, links) {
    const connections = { incoming: [], outgoing: [] };

    links.forEach(link => {
      const sourceId = link.source.id || link.source;
      const targetId = link.target.id || link.target;

      if (sourceId === this.id) {
        const targetNode = allNodes.find(n => n.id === targetId);
        if (targetNode && targetNode.x !== undefined && targetNode.y !== undefined) {
          connections.outgoing.push({
            node: targetNode,
            dx: targetNode.x - this.x,
            dy: targetNode.y - this.y
          });
        }
      } else if (targetId === this.id) {
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

    let optimalAngle = this.angle;

    if (connections.outgoing.length > 0) {
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
      let totalX = 0, totalY = 0;

      connections.incoming.forEach(({ dx, dy }) => {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
          totalX -= dx / dist;
          totalY -= dy / dist;
        }
      });

      if (totalX !== 0 || totalY !== 0) {
        optimalAngle = Math.atan2(totalY, totalX);
      }
    }

    return optimalAngle;
  }

  applyDynamicRotation(allNodes, links, rotationStrength = 0.1) {
    if (this._skipDynamicRotation || this.isMergedNode) return;

    const optimalAngle = this.calculateOptimalRotation(allNodes, links);

    let angleDiff = optimalAngle - this.angle;

    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    this.angle += angleDiff * rotationStrength;

    this.updatePosition();
  }

  calculateWidth() {
    const depthRelativeToMean = Math.max(0.1, this.depth / 10);
    const widthRelativeToAverage = (Math.pow(depthRelativeToMean, this.settings.depthPower) - 1.0) *
                                   this.settings.depthEffectOnWidth + 1.0;
    return Math.max(4, this.settings.averageNodeWidth * widthRelativeToAverage);
  }

  calculateDrawnLength(scaleFactor = 1.0) {
    const drawnNodeLength = this.settings.autoNodeLengthPerMegabase * this.length / 1000000.0 * scaleFactor;
    return Math.max(this.settings.minimumNodeLength, drawnNodeLength);
  }

  createSegments() {
    const numSegments = Math.max(2, Math.round(this.drawnLength / this.settings.nodeSegmentLength) + 1);
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

    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    const segmentLength = this.drawnLength / (this.segments.length - 1);

    this.segments.forEach((segment, i) => {
      const offset = (i * segmentLength) - (this.drawnLength / 2);
      segment.x = centerX + cos * offset;
      segment.y = centerY + sin * offset;
    });

    this.updateSubnodePositions();
  }

  getColor() {
    const hash = this.id.toString().split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0);
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 60%)`;
  }

  contains(x, y) {
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

  draw(ctx, transform, isSelected = false, isPinned = false, isHighlighted = false) {
    if (this.segments.length < 2) return;

    ctx.save();

    const width = this.width * transform.k;
    const minWidth = 2;
    const effectiveWidth = Math.max(width, minWidth);

    // Determine colors
    if (isHighlighted) {
      ctx.fillStyle = '#FF0000'; // Always use red for path highlights
      ctx.strokeStyle = '#CC0000'; // Darker red for stroke
      ctx.lineWidth = Math.max(0.5, 3 * transform.k);
    } else {
      ctx.fillStyle = this.getColor();
      ctx.strokeStyle = isSelected ? '#FF0000' : (isPinned ? '#FF8800' : '#000000');
      ctx.lineWidth = Math.max(0.5, (isSelected ? 2 : 0.5) * transform.k);
    }

    // Transform segments
    const transformedSegments = this.segments.map(segment => ({
      x: segment.x * transform.k + transform.x,
      y: segment.y * transform.k + transform.y
    }));

    // Create and draw path
    const nodeWidth = isHighlighted ? effectiveWidth * 1.5 : effectiveWidth;
    const path = this.createNodePath(transformedSegments, nodeWidth);

    ctx.fill(path);
    ctx.stroke(path);

    // Draw label if zoomed in
    if (transform.k > 0.3 && this.drawnLength > 30) {
      const centerX = this.x * transform.k + transform.x;
      const centerY = this.y * transform.k + transform.y;

      const fontSize = Math.min(12, Math.max(8, 10 * transform.k));
      ctx.font = `${fontSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // For merged nodes, use compact label with just the ID
      // (pathName contains long descriptive text like "Linear Chain: A → B")
      const label = this.drawnLength > 80 ?
        `${this.id} (${this.formatLength(this.length)})${this.isFlipped ? ' ↻' : ''}` :
        `${this.id}${this.isFlipped ? ' ↻' : ''}`;
      const metrics = ctx.measureText(label);
      const textWidth = metrics.width;
      const textHeight = fontSize;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(
        centerX - textWidth / 2 - 2,
        centerY - textHeight / 2 - 1,
        textWidth + 4,
        textHeight + 2
      );

      ctx.fillStyle = '#000000';
      ctx.fillText(label, centerX, centerY);
    }

    // Draw subnodes when zoomed in
    if (transform.k > 1.5) {
      // Incoming subnode (red)
      ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
      ctx.beginPath();
      ctx.arc(
        this.inSubnode.x * transform.k + transform.x,
        this.inSubnode.y * transform.k + transform.y,
        4 * transform.k, 0, 2 * Math.PI
      );
      ctx.fill();

      // Outgoing subnode (green)
      ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
      ctx.beginPath();
      ctx.arc(
        this.outSubnode.x * transform.k + transform.x,
        this.outSubnode.y * transform.k + transform.y,
        4 * transform.k, 0, 2 * Math.PI
      );
      ctx.fill();
    }

    ctx.restore();
  }

  createNodePath(segments, width) {
    if (segments.length < 2) return new Path2D();

    const path = new Path2D();
    const halfWidth = width / 2;

    const topPoints = [];
    const bottomPoints = [];

    segments.forEach((segment, i) => {
      let dx = 0, dy = 0;

      if (i === 0) {
        dx = segments[1].x - segments[0].x;
        dy = segments[1].y - segments[0].y;
      } else if (i === segments.length - 1) {
        dx = segments[i].x - segments[i - 1].x;
        dy = segments[i].y - segments[i - 1].y;
      } else {
        const dx1 = segments[i].x - segments[i - 1].x;
        const dy1 = segments[i].y - segments[i - 1].y;
        const dx2 = segments[i + 1].x - segments[i].x;
        const dy2 = segments[i + 1].y - segments[i].y;
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

    // Rounded start cap
    const firstTop = topPoints[0];
    const firstBottom = bottomPoints[0];
    const firstCenter = segments[0];

    const startAngle = Math.atan2(firstTop.y - firstBottom.y, firstTop.x - firstBottom.x);
    path.arc(firstCenter.x, firstCenter.y, halfWidth, startAngle, startAngle + Math.PI);

    // Top edge
    for (let i = 1; i < topPoints.length; i++) {
      path.lineTo(topPoints[i].x, topPoints[i].y);
    }

    // Arrow end
    const lastTop = topPoints[topPoints.length - 1];
    const lastBottom = bottomPoints[bottomPoints.length - 1];
    const lastCenter = segments[segments.length - 1];

    if (segments.length > 1) {
      const secondLastCenter = segments[segments.length - 2];
      const arrowDx = lastCenter.x - secondLastCenter.x;
      const arrowDy = lastCenter.y - secondLastCenter.y;
      const arrowLen = Math.sqrt(arrowDx * arrowDx + arrowDy * arrowDy);

      if (arrowLen > 0) {
        const arrowSize = Math.min(width * 1.5, arrowLen * 0.5);
        const arrowUnitX = arrowDx / arrowLen;
        const arrowUnitY = arrowDy / arrowLen;

        const arrowTipX = lastCenter.x + arrowUnitX * arrowSize * 0.5;
        const arrowTipY = lastCenter.y + arrowUnitY * arrowSize * 0.5;

        path.lineTo(arrowTipX, arrowTipY);
        path.lineTo(lastBottom.x, lastBottom.y);
      }
    }

    // Bottom edge (reverse)
    for (let i = bottomPoints.length - 2; i >= 0; i--) {
      path.lineTo(bottomPoints[i].x, bottomPoints[i].y);
    }

    path.closePath();
    return path;
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
