// PathCollection.js - Manages collection of saved paths

import { EventEmitter } from '../core/EventEmitter.js';

/**
 * PathCollection manages multiple saved paths.
 * Handles path creation, selection, and updates.
 */
export class PathCollection extends EventEmitter {
  constructor() {
    super();

    this.paths = [];
    this.currentPathIndex = -1; // -1 = no path selected

    // Color palette for paths (10 colors)
    this.colorPalette = [
      '#FF6B6B', // red
      '#4ECDC4', // teal
      '#45B7D1', // blue
      '#96CEB4', // green
      '#FFEAA7', // yellow
      '#DFE6E9', // light gray
      '#74B9FF', // light blue
      '#A29BFE', // purple
      '#00CEC9', // cyan
      '#FDCB6E'  // orange
    ];
    this.nextColorIndex = 0;
  }

  /**
   * Add a new path
   * @param {Object} pathData - Path data {name, sequence, nodes, edges}
   * @returns {Object} The created path
   */
  addPath(pathData) {
    const path = {
      id: Date.now(),
      name: pathData.name || `Path ${this.paths.length + 1}`,
      sequence: pathData.sequence || '',
      nodes: new Set(pathData.nodes || []),
      edges: new Set(pathData.edges || []),
      color: this.getNextColor(),
      timestamp: new Date(),
      mergeUpdated: false,
      updateReason: ''
    };

    this.paths.push(path);

    this.emit('pathAdded', { path, index: this.paths.length - 1 });

    return path;
  }

  /**
   * Remove a path by index
   * @param {number} index - Path index
   * @returns {Object|null} The removed path or null
   */
  removePath(index) {
    if (index < 0 || index >= this.paths.length) {
      console.warn(`Invalid path index: ${index}`);
      return null;
    }

    const path = this.paths[index];
    this.paths.splice(index, 1);

    // Update current index if needed
    if (this.currentPathIndex === index) {
      this.currentPathIndex = -1;
    } else if (this.currentPathIndex > index) {
      this.currentPathIndex--;
    }

    this.emit('pathRemoved', { path, index });

    return path;
  }

  /**
   * Get path by index
   * @param {number} index - Path index
   * @returns {Object|null} Path or null
   */
  getPath(index) {
    if (index < 0 || index >= this.paths.length) {
      return null;
    }
    return this.paths[index];
  }

  /**
   * Get current path
   * @returns {Object|null} Current path or null
   */
  getCurrentPath() {
    return this.getPath(this.currentPathIndex);
  }

  /**
   * Set current path index
   * @param {number} index - Path index (-1 for none)
   */
  setCurrentPath(index) {
    if (index < -1 || index >= this.paths.length) {
      console.warn(`Invalid path index: ${index}`);
      return;
    }

    const previousIndex = this.currentPathIndex;
    this.currentPathIndex = index;

    this.emit('currentPathChanged', {
      index,
      previousIndex,
      path: this.getCurrentPath()
    });
  }

  /**
   * Navigate to next path
   * @returns {Object|null} Next path or null
   */
  nextPath() {
    if (this.paths.length === 0) return null;

    const newIndex = (this.currentPathIndex + 1) % this.paths.length;
    this.setCurrentPath(newIndex);

    return this.getCurrentPath();
  }

  /**
   * Navigate to previous path
   * @returns {Object|null} Previous path or null
   */
  previousPath() {
    if (this.paths.length === 0) return null;

    let newIndex = this.currentPathIndex - 1;
    if (newIndex < 0) {
      newIndex = this.paths.length - 1;
    }

    this.setCurrentPath(newIndex);

    return this.getCurrentPath();
  }

  /**
   * Get all paths
   * @returns {Array} Array of all paths
   */
  getAllPaths() {
    return [...this.paths];
  }

  /**
   * Get path count
   * @returns {number} Number of paths
   */
  getPathCount() {
    return this.paths.length;
  }

  /**
   * Check if has any paths
   * @returns {boolean} True if has paths
   */
  hasPaths() {
    return this.paths.length > 0;
  }

  /**
   * Check if path is current
   * @param {number} index - Path index
   * @returns {boolean} True if is current path
   */
  isCurrentPath(index) {
    return this.currentPathIndex === index;
  }

  /**
   * Clear all paths
   */
  clearAll() {
    const hadPaths = this.paths.length > 0;

    this.paths = [];
    this.currentPathIndex = -1;
    this.nextColorIndex = 0;

    if (hadPaths) {
      this.emit('cleared', {});
    }
  }

  /**
   * Update path nodes and edges
   * @param {number} index - Path index
   * @param {Set} nodes - New nodes set
   * @param {Set} edges - New edges set
   * @param {string} reason - Update reason
   */
  updatePath(index, nodes, edges, reason = '') {
    const path = this.getPath(index);
    if (!path) return;

    path.nodes = new Set(nodes);
    path.edges = new Set(edges);
    path.mergeUpdated = true;
    path.updateReason = reason;

    this.emit('pathUpdated', { path, index, reason });
  }

  /**
   * Update path sequence
   * @param {number} index - Path index
   * @param {string} sequence - New sequence
   */
  updatePathSequence(index, sequence) {
    const path = this.getPath(index);
    if (!path) return;

    path.sequence = sequence;

    this.emit('pathSequenceUpdated', { path, index });
  }

  /**
   * Find paths containing node
   * @param {string|number} nodeId - Node ID
   * @returns {Array} Array of paths containing node
   */
  findPathsContainingNode(nodeId) {
    return this.paths.filter(path => path.nodes.has(nodeId));
  }

  /**
   * Find paths containing edge
   * @param {string} edgeKey - Edge key
   * @returns {Array} Array of paths containing edge
   */
  findPathsContainingEdge(edgeKey) {
    return this.paths.filter(path => path.edges.has(edgeKey));
  }

  /**
   * Get next color from palette
   * @returns {string} Color hex code
   */
  getNextColor() {
    const color = this.colorPalette[this.nextColorIndex];
    this.nextColorIndex = (this.nextColorIndex + 1) % this.colorPalette.length;
    return color;
  }

  /**
   * Set path color
   * @param {number} index - Path index
   * @param {string} color - Color hex code
   */
  setPathColor(index, color) {
    const path = this.getPath(index);
    if (!path) return;

    path.color = color;

    this.emit('pathColorChanged', { path, index, color });
  }

  /**
   * Rename path
   * @param {number} index - Path index
   * @param {string} name - New name
   */
  renamePath(index, name) {
    const path = this.getPath(index);
    if (!path) return;

    const oldName = path.name;
    path.name = name;

    this.emit('pathRenamed', { path, index, oldName, newName: name });
  }

  /**
   * Get path statistics
   * @param {number} index - Path index
   * @returns {Object|null} Path statistics or null
   */
  getPathStats(index) {
    const path = this.getPath(index);
    if (!path) return null;

    return {
      nodeCount: path.nodes.size,
      edgeCount: path.edges.size,
      name: path.name,
      color: path.color,
      timestamp: path.timestamp,
      updated: path.mergeUpdated,
      updateReason: path.updateReason
    };
  }

  /**
   * Export path as sequence string
   * @param {number} index - Path index
   * @returns {string} Sequence string (node IDs)
   */
  exportPathSequence(index) {
    const path = this.getPath(index);
    if (!path) return '';

    return path.sequence || Array.from(path.nodes).join(',');
  }

  /**
   * Import paths from text
   * @param {string} text - Path text (format: "node1,node2,node3 /Path Name")
   * @returns {Array} Array of created paths
   */
  importPaths(text) {
    const lines = text.split('\n').filter(line => line.trim());
    const importedPaths = [];

    lines.forEach(line => {
      const parts = line.trim().split('/');
      const sequence = parts[0].trim();
      const name = parts[1] ? parts[1].trim() : `Imported Path ${this.paths.length + 1}`;

      const nodeIds = sequence.split(',').map(id => id.trim());

      const path = this.addPath({
        name,
        sequence,
        nodes: nodeIds,
        edges: [] // Edges will be computed later
      });

      importedPaths.push(path);
    });

    this.emit('pathsImported', { paths: importedPaths, count: importedPaths.length });

    return importedPaths;
  }

  /**
   * Export all paths as text
   * @returns {string} All paths as text
   */
  exportAllPaths() {
    return this.paths.map(path => {
      const sequence = path.sequence || Array.from(path.nodes).join(',');
      return `${sequence} /${path.name}`;
    }).join('\n');
  }

  /**
   * Serialize to JSON
   */
  toJSON() {
    return {
      paths: this.paths.map(path => ({
        id: path.id,
        name: path.name,
        sequence: path.sequence,
        nodes: Array.from(path.nodes),
        edges: Array.from(path.edges),
        color: path.color,
        timestamp: path.timestamp,
        mergeUpdated: path.mergeUpdated,
        updateReason: path.updateReason
      })),
      currentPathIndex: this.currentPathIndex
    };
  }

  /**
   * Load from JSON
   */
  fromJSON(data) {
    this.clearAll();

    data.paths.forEach(pathData => {
      const path = {
        id: pathData.id,
        name: pathData.name,
        sequence: pathData.sequence,
        nodes: new Set(pathData.nodes),
        edges: new Set(pathData.edges),
        color: pathData.color,
        timestamp: new Date(pathData.timestamp),
        mergeUpdated: pathData.mergeUpdated || false,
        updateReason: pathData.updateReason || ''
      };

      this.paths.push(path);
    });

    this.currentPathIndex = data.currentPathIndex || -1;

    return this;
  }
}
