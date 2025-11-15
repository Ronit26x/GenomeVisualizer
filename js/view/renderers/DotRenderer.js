// DotRenderer.js - DOT format renderer

import { Renderer } from './Renderer.js';

/**
 * DotRenderer renders graphs in DOT format (simple nodes and edges).
 * Uses Graphlib-style attributes for styling.
 */
export class DotRenderer extends Renderer {
  constructor() {
    super('dot');

    // DOT-specific settings
    this.defaultNodeRadius = 8;
    this.defaultEdgeWidth = 1;
    this.highlightNodeScale = 1.5;
    this.highlightEdgeScale = 3;
  }

  /**
   * Render the DOT graph
   * @param {Object} renderData - {nodes, edges, transform, selection, pinnedNodes, highlightedPath, componentBounds, showComponentBounds}
   */
  render(renderData) {
    if (!this.isInitialized) {
      throw new Error('DotRenderer not initialized');
    }

    const {
      nodes = [],
      edges = [],
      transform,
      selection = { nodes: new Set(), edges: new Set() },
      pinnedNodes = new Set(),
      highlightedPath = null,
      componentBounds = [],
      showComponentBounds = false
    } = renderData;

    // Clear canvas
    this.clear();

    // Apply transform
    this.applyTransform(transform);

    // Draw component bounds first (if enabled)
    if (showComponentBounds && componentBounds.length > 0) {
      this.drawComponentBounds(componentBounds, transform);
    }

    // Draw edges (so nodes appear on top)
    edges.forEach((edge, index) => {
      this.drawDotEdge(edge, index, highlightedPath, selection);
    });

    // Draw nodes on top
    nodes.forEach(node => {
      this.drawDotNode(node, selection, pinnedNodes, highlightedPath);
    });

    // Restore transform
    this.restoreTransform();
  }

  /**
   * Draw a DOT edge
   */
  drawDotEdge(edge, index, highlightedPath, selection) {
    const ctx = this.ctx;

    const source = edge.source;
    const target = edge.target;

    if (!source || !target) return;

    // Check if highlighted
    const isHighlighted = highlightedPath && highlightedPath.edges &&
                         highlightedPath.edges.has(index);

    // Edge styling
    if (isHighlighted) {
      ctx.strokeStyle = '#FF0000'; // Always use red for path highlights
      ctx.lineWidth = (edge.penwidth || this.defaultEdgeWidth) * this.highlightEdgeScale;
    } else {
      ctx.strokeStyle = this.parseColor(edge.color) || this.edgeColor;
      ctx.lineWidth = edge.penwidth || this.defaultEdgeWidth;
    }

    // Line style
    if (edge.style === 'dashed') {
      ctx.setLineDash([4, 2]);
    } else if (edge.style === 'dotted') {
      ctx.setLineDash([1, 2]);
    } else {
      ctx.setLineDash([]);
    }

    // Draw line
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
  }

  /**
   * Draw a DOT node
   */
  drawDotNode(node, selection, pinnedNodes, highlightedPath) {
    const ctx = this.ctx;

    const r = node.penwidth ? 4 + Number(node.penwidth) : this.defaultNodeRadius;

    const isHighlighted = highlightedPath && highlightedPath.nodes &&
                         highlightedPath.nodes.has(String(node.id));
    const isSelected = selection.nodes && selection.nodes.has(node.id);
    const isPinned = pinnedNodes.has(node.id);

    const nodeRadius = r * (isHighlighted ? this.highlightNodeScale : 1);

    // Fill
    ctx.beginPath();
    if (isHighlighted) {
      ctx.fillStyle = '#FF0000'; // Always use red for path highlights
    } else {
      ctx.fillStyle = this.parseColor(node.fillcolor) || this.nodeColor;
    }
    ctx.arc(node.x, node.y, nodeRadius, 0, 2 * Math.PI);
    ctx.fill();

    // Stroke
    ctx.beginPath();
    if (isHighlighted) {
      ctx.strokeStyle = '#CC0000'; // Darker red for stroke
      ctx.lineWidth = 3;
    } else {
      ctx.strokeStyle = isSelected ? '#FF0000' :
                       isPinned ? '#FF8800' :
                       this.parseColor(node.color) || '#333';
      ctx.lineWidth = (isPinned || isSelected) ? 3 : (node.penwidth || 1);
    }

    // Line style
    if (node.style === 'dashed') {
      ctx.setLineDash([4, 2]);
    } else if (node.style === 'dotted') {
      ctx.setLineDash([1, 2]);
    } else {
      ctx.setLineDash([]);
    }

    ctx.arc(node.x, node.y, nodeRadius, 0, 2 * Math.PI);
    ctx.stroke();
  }

  /**
   * Parse Graphlib-style color values
   */
  parseColor(val) {
    if (!val) return null;

    let c = Array.isArray(val) ? val[0] : val;
    if (!c || typeof c !== 'string') return null;

    c = c.trim().split(':')[0];
    return c || null;
  }

  /**
   * Darken a color by a factor
   * @param {string} color - Color to darken
   * @param {number} factor - Darkening factor (0-1)
   * @returns {string} Darkened color
   */
  darkenColor(color, factor) {
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

  /**
   * Hit test for DOT nodes
   */
  hitTest(node, x, y) {
    const r = node.penwidth ? 4 + Number(node.penwidth) : this.defaultNodeRadius;
    const dx = x - node.x;
    const dy = y - node.y;

    return (dx * dx + dy * dy) <= (r * r);
  }
}
