// Selection.js - Manages selection state for nodes and edges

import { EventEmitter } from '../core/EventEmitter.js';

/**
 * Selection class manages the current selection state.
 * Supports selecting nodes and edges with events for changes.
 */
export class Selection extends EventEmitter {
  constructor() {
    super();

    this.selectedNodes = new Set();
    this.selectedEdges = new Set();
  }

  /**
   * Select a node
   * @param {string|number} nodeId - Node ID to select
   */
  selectNode(nodeId) {
    if (this.selectedNodes.has(nodeId)) return;

    this.selectedNodes.add(nodeId);
    this.emit('nodeSelected', { nodeId, selectedNodes: this.getSelectedNodes() });
    this.emit('changed', { nodes: this.getSelectedNodes(), edges: this.getSelectedEdges() });
  }

  /**
   * Deselect a node
   * @param {string|number} nodeId - Node ID to deselect
   */
  deselectNode(nodeId) {
    if (!this.selectedNodes.has(nodeId)) return;

    this.selectedNodes.delete(nodeId);
    this.emit('nodeDeselected', { nodeId, selectedNodes: this.getSelectedNodes() });
    this.emit('changed', { nodes: this.getSelectedNodes(), edges: this.getSelectedEdges() });
  }

  /**
   * Toggle node selection
   * @param {string|number} nodeId - Node ID to toggle
   */
  toggleNode(nodeId) {
    if (this.selectedNodes.has(nodeId)) {
      this.deselectNode(nodeId);
    } else {
      this.selectNode(nodeId);
    }
  }

  /**
   * Select an edge
   * @param {string} edgeKey - Edge key (source-target)
   */
  selectEdge(edgeKey) {
    if (this.selectedEdges.has(edgeKey)) return;

    this.selectedEdges.add(edgeKey);
    this.emit('edgeSelected', { edgeKey, selectedEdges: this.getSelectedEdges() });
    this.emit('changed', { nodes: this.getSelectedNodes(), edges: this.getSelectedEdges() });
  }

  /**
   * Deselect an edge
   * @param {string} edgeKey - Edge key to deselect
   */
  deselectEdge(edgeKey) {
    if (!this.selectedEdges.has(edgeKey)) return;

    this.selectedEdges.delete(edgeKey);
    this.emit('edgeDeselected', { edgeKey, selectedEdges: this.getSelectedEdges() });
    this.emit('changed', { nodes: this.getSelectedNodes(), edges: this.getSelectedEdges() });
  }

  /**
   * Toggle edge selection
   * @param {string} edgeKey - Edge key to toggle
   */
  toggleEdge(edgeKey) {
    if (this.selectedEdges.has(edgeKey)) {
      this.deselectEdge(edgeKey);
    } else {
      this.selectEdge(edgeKey);
    }
  }

  /**
   * Check if node is selected
   * @param {string|number} nodeId - Node ID
   * @returns {boolean} True if selected
   */
  isNodeSelected(nodeId) {
    return this.selectedNodes.has(nodeId);
  }

  /**
   * Check if edge is selected
   * @param {string} edgeKey - Edge key
   * @returns {boolean} True if selected
   */
  isEdgeSelected(edgeKey) {
    return this.selectedEdges.has(edgeKey);
  }

  /**
   * Get all selected node IDs
   * @returns {Array} Array of selected node IDs
   */
  getSelectedNodes() {
    return Array.from(this.selectedNodes);
  }

  /**
   * Get all selected edge keys
   * @returns {Array} Array of selected edge keys
   */
  getSelectedEdges() {
    return Array.from(this.selectedEdges);
  }

  /**
   * Get selected node count
   * @returns {number} Number of selected nodes
   */
  getSelectedNodeCount() {
    return this.selectedNodes.size;
  }

  /**
   * Get selected edge count
   * @returns {number} Number of selected edges
   */
  getSelectedEdgeCount() {
    return this.selectedEdges.size;
  }

  /**
   * Check if anything is selected
   * @returns {boolean} True if any nodes or edges are selected
   */
  hasSelection() {
    return this.selectedNodes.size > 0 || this.selectedEdges.size > 0;
  }

  /**
   * Clear all selections
   */
  clearAll() {
    const hadSelection = this.hasSelection();

    this.selectedNodes.clear();
    this.selectedEdges.clear();

    if (hadSelection) {
      this.emit('cleared', {});
      this.emit('changed', { nodes: [], edges: [] });
    }
  }

  /**
   * Clear node selections
   */
  clearNodes() {
    const hadNodes = this.selectedNodes.size > 0;

    this.selectedNodes.clear();

    if (hadNodes) {
      this.emit('nodesCleared', {});
      this.emit('changed', { nodes: [], edges: this.getSelectedEdges() });
    }
  }

  /**
   * Clear edge selections
   */
  clearEdges() {
    const hadEdges = this.selectedEdges.size > 0;

    this.selectedEdges.clear();

    if (hadEdges) {
      this.emit('edgesCleared', {});
      this.emit('changed', { nodes: this.getSelectedNodes(), edges: [] });
    }
  }

  /**
   * Set selected nodes (replaces current selection)
   * @param {Array} nodeIds - Array of node IDs
   */
  setSelectedNodes(nodeIds) {
    this.selectedNodes.clear();
    nodeIds.forEach(id => this.selectedNodes.add(id));

    this.emit('selectionSet', { nodes: nodeIds, edges: this.getSelectedEdges() });
    this.emit('changed', { nodes: nodeIds, edges: this.getSelectedEdges() });
  }

  /**
   * Set selected edges (replaces current selection)
   * @param {Array} edgeKeys - Array of edge keys
   */
  setSelectedEdges(edgeKeys) {
    this.selectedEdges.clear();
    edgeKeys.forEach(key => this.selectedEdges.add(key));

    this.emit('selectionSet', { nodes: this.getSelectedNodes(), edges: edgeKeys });
    this.emit('changed', { nodes: this.getSelectedNodes(), edges: edgeKeys });
  }

  /**
   * Select multiple nodes
   * @param {Array} nodeIds - Array of node IDs
   */
  selectNodes(nodeIds) {
    let changed = false;

    nodeIds.forEach(id => {
      if (!this.selectedNodes.has(id)) {
        this.selectedNodes.add(id);
        changed = true;
      }
    });

    if (changed) {
      this.emit('nodesSelected', { nodeIds, selectedNodes: this.getSelectedNodes() });
      this.emit('changed', { nodes: this.getSelectedNodes(), edges: this.getSelectedEdges() });
    }
  }

  /**
   * Select multiple edges
   * @param {Array} edgeKeys - Array of edge keys
   */
  selectEdges(edgeKeys) {
    let changed = false;

    edgeKeys.forEach(key => {
      if (!this.selectedEdges.has(key)) {
        this.selectedEdges.add(key);
        changed = true;
      }
    });

    if (changed) {
      this.emit('edgesSelected', { edgeKeys, selectedEdges: this.getSelectedEdges() });
      this.emit('changed', { nodes: this.getSelectedNodes(), edges: this.getSelectedEdges() });
    }
  }

  /**
   * Deselect multiple nodes
   * @param {Array} nodeIds - Array of node IDs
   */
  deselectNodes(nodeIds) {
    let changed = false;

    nodeIds.forEach(id => {
      if (this.selectedNodes.has(id)) {
        this.selectedNodes.delete(id);
        changed = true;
      }
    });

    if (changed) {
      this.emit('nodesDeselected', { nodeIds, selectedNodes: this.getSelectedNodes() });
      this.emit('changed', { nodes: this.getSelectedNodes(), edges: this.getSelectedEdges() });
    }
  }

  /**
   * Deselect multiple edges
   * @param {Array} edgeKeys - Array of edge keys
   */
  deselectEdges(edgeKeys) {
    let changed = false;

    edgeKeys.forEach(key => {
      if (this.selectedEdges.has(key)) {
        this.selectedEdges.delete(key);
        changed = true;
      }
    });

    if (changed) {
      this.emit('edgesDeselected', { edgeKeys, selectedEdges: this.getSelectedEdges() });
      this.emit('changed', { nodes: this.getSelectedNodes(), edges: this.getSelectedEdges() });
    }
  }

  /**
   * Serialize to JSON
   */
  toJSON() {
    return {
      selectedNodes: this.getSelectedNodes(),
      selectedEdges: this.getSelectedEdges()
    };
  }

  /**
   * Load from JSON
   */
  fromJSON(data) {
    this.setSelectedNodes(data.selectedNodes || []);
    this.setSelectedEdges(data.selectedEdges || []);
    return this;
  }
}
