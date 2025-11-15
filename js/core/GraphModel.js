// GraphModel.js - Data layer with state management and event emission

import { EventEmitter } from './EventEmitter.js';

/**
 * GraphModel is the single source of truth for all graph data.
 * Emits events when state changes, but never directly manipulates the DOM.
 *
 * Events emitted:
 * - graphLoaded: {nodes, links, format}
 * - nodeAdded: {node, source}
 * - nodeRemoved: {nodeId, source}
 * - nodeMoved: {nodeId, x, y, source}
 * - nodeSelected: {nodeIds, source}
 * - nodePinned: {nodeId, pinned, source}
 * - linkAdded: {link, source}
 * - linkRemoved: {linkId, source}
 * - pathSaved: {path, source}
 * - pathRemoved: {pathId, source}
 * - pathSelected: {pathIndex, source}
 * - stateChanged: {type, data, source}
 * - historyChanged: {canUndo, canRedo}
 */
export class GraphModel extends EventEmitter {
  constructor() {
    super();

    // Core graph data
    this._nodes = [];
    this._links = [];
    this._format = 'dot'; // 'dot' or 'gfa'

    // Selection state
    this._selectedNodes = new Set();
    this._selectedEdges = new Set();
    this._pinnedNodes = new Set();

    // Path management
    this._savedPaths = [];
    this._currentPathIndex = -1;
    this._nextPathId = 1;
    this._pathColors = [
      '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57',
      '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3', '#ff9f43'
    ];

    // History (undo/redo)
    this._history = [];
    this._maxHistorySize = 20;

    // Metadata
    this._nodeMap = new Map(); // id -> node for fast lookup
    this._linkMap = new Map(); // index -> link for fast lookup

    // Visualization options
    this._showComponentBounds = false;
  }

  // ===== GRAPH DATA ACCESSORS =====

  /**
   * Get all nodes (read-only copy)
   */
  get nodes() {
    return [...this._nodes];
  }

  /**
   * Get all links (read-only copy)
   */
  get links() {
    return [...this._links];
  }

  /**
   * Get current format
   */
  get format() {
    return this._format;
  }

  /**
   * Get node by ID
   */
  getNode(nodeId) {
    return this._nodeMap.get(String(nodeId));
  }

  /**
   * Get link by index
   */
  getLink(linkIndex) {
    return this._linkMap.get(linkIndex);
  }

  // ===== SELECTION ACCESSORS =====

  get selectedNodes() {
    return new Set(this._selectedNodes);
  }

  get selectedEdges() {
    return new Set(this._selectedEdges);
  }

  get pinnedNodes() {
    return new Set(this._pinnedNodes);
  }

  // ===== PATH ACCESSORS =====

  get savedPaths() {
    return [...this._savedPaths];
  }

  get currentPathIndex() {
    return this._currentPathIndex;
  }

  get currentPath() {
    if (this._currentPathIndex >= 0 && this._currentPathIndex < this._savedPaths.length) {
      return this._savedPaths[this._currentPathIndex];
    }
    return null;
  }

  // ===== HISTORY ACCESSORS =====

  get canUndo() {
    return this._history.length >= 2; // Need at least 2 entries to undo
  }

  // ===== VISUALIZATION OPTIONS =====

  get showComponentBounds() {
    return this._showComponentBounds;
  }

  toggleComponentBounds(source = 'user') {
    this._showComponentBounds = !this._showComponentBounds;
    this.emit('visualizationOptionChanged', {
      option: 'showComponentBounds',
      value: this._showComponentBounds,
      source
    });
    return this._showComponentBounds;
  }

  // ===== GRAPH MUTATIONS =====

  /**
   * Load a complete graph (replaces existing data)
   */
  loadGraph(nodes, links, format = 'dot', source = 'user') {
    // Save to history before replacing
    this._saveHistory('loadGraph');

    this._nodes = [...nodes];
    this._links = [...links];
    this._format = format;

    // Rebuild lookup maps
    this._rebuildMaps();

    // Clear selections when loading new graph
    this._selectedNodes.clear();
    this._selectedEdges.clear();
    this._pinnedNodes.clear();

    this.emit('graphLoaded', { nodes: this.nodes, links: this.links, format, source });
    this.emit('stateChanged', { type: 'graphLoaded', data: { nodeCount: nodes.length, linkCount: links.length }, source });
    this.emit('historyChanged', { canUndo: this.canUndo, canRedo: false });
  }

  /**
   * Add a node to the graph
   */
  addNode(node, source = 'user') {
    this._saveHistory('addNode');

    this._nodes.push(node);
    this._nodeMap.set(String(node.id), node);

    this.emit('nodeAdded', { node: { ...node }, source });
    this.emit('stateChanged', { type: 'nodeAdded', data: { nodeId: node.id }, source });
  }

  /**
   * Remove nodes by IDs
   */
  removeNodes(nodeIds, source = 'user') {
    this._saveHistory('removeNodes');

    const idsToRemove = new Set(Array.isArray(nodeIds) ? nodeIds : [nodeIds]);

    // Remove nodes
    this._nodes = this._nodes.filter(node => !idsToRemove.has(node.id));

    // Remove associated links
    this._links = this._links.filter(link => {
      const sourceId = link.source?.id || link.source;
      const targetId = link.target?.id || link.target;
      return !idsToRemove.has(sourceId) && !idsToRemove.has(targetId);
    });

    // Update selections
    idsToRemove.forEach(id => {
      this._selectedNodes.delete(id);
      this._pinnedNodes.delete(id);
    });

    // Rebuild maps
    this._rebuildMaps();

    this.emit('nodeRemoved', { nodeIds: Array.from(idsToRemove), source });
    this.emit('stateChanged', { type: 'nodeRemoved', data: { count: idsToRemove.size }, source });
  }

  /**
   * Merge multiple nodes into a single node (complex atomic operation)
   * This is a specialized operation for node merging that handles edges properly
   */
  mergeNodes(nodeIdsToMerge, mergedNode, newEdges, source = 'operation') {
    console.log(`[GraphModel] 🔄 mergeNodes called:`, {
      nodeIdsToMerge,
      mergedNode: mergedNode.id,
      newEdgesCount: newEdges.length,
      currentNodeCount: this._nodes.length
    });

    this._saveHistory('mergeNodes');

    const idsToRemove = new Set(nodeIdsToMerge.map(id => String(id)));
    console.log(`[GraphModel] IDs to remove:`, Array.from(idsToRemove));

    // Remove original nodes
    const nodeCountBefore = this._nodes.length;
    this._nodes = this._nodes.filter(node => !idsToRemove.has(String(node.id)));
    const nodeCountAfter = this._nodes.length;
    console.log(`[GraphModel] Node count: ${nodeCountBefore} → ${nodeCountAfter} (removed ${nodeCountBefore - nodeCountAfter})`);

    // Remove ALL links involving the removed nodes (internal and external)
    this._links = this._links.filter(link => {
      const sourceId = String(link.source?.id || link.source);
      const targetId = String(link.target?.id || link.target);
      return !idsToRemove.has(sourceId) && !idsToRemove.has(targetId);
    });

    // Add the merged node
    this._nodes.push(mergedNode);
    console.log(`[GraphModel] Added merged node ${mergedNode.id}, new count: ${this._nodes.length}`);

    // Add new edges
    console.log(`[GraphModel] Adding ${newEdges.length} new edges to model`);
    newEdges.forEach((edge, i) => {
      const srcOri = edge.srcOrientation || '';
      const tgtOri = edge.tgtOrientation || '';
      console.log(`  [${i+1}] ${edge.source}${srcOri} → ${edge.target}${tgtOri}`, edge);
      this._links.push(edge);
    });
    console.log(`[GraphModel] Total links after merge: ${this._links.length}`);

    // DEBUG: Check if merged node has any links
    const mergedNodeId = mergedNode.id;
    const mergedNodeLinks = this._links.filter(link => {
      const sourceId = String(link.source?.id || link.source);
      const targetId = String(link.target?.id || link.target);
      return sourceId === mergedNodeId || targetId === mergedNodeId;
    });
    console.log(`[GraphModel] DEBUG: Merged node ${mergedNodeId} has ${mergedNodeLinks.length} links:`, mergedNodeLinks);

    // Update selections
    idsToRemove.forEach(id => {
      this._selectedNodes.delete(id);
      this._pinnedNodes.delete(id);
    });

    // Rebuild maps
    this._rebuildMaps();

    console.log(`[GraphModel] Emitting nodesMerged event`);
    this.emit('nodesMerged', {
      removedNodeIds: Array.from(idsToRemove),
      mergedNode: { ...mergedNode },
      newEdgeCount: newEdges.length,
      source
    });
    this.emit('stateChanged', {
      type: 'nodesMerged',
      data: { mergedNodeId: mergedNode.id, removedCount: idsToRemove.size },
      source
    });
    this.emit('historyChanged', { canUndo: this.canUndo, canRedo: false });
  }

  /**
   * Update node position
   */
  updateNodePosition(nodeId, x, y, source = 'user') {
    const node = this._nodeMap.get(String(nodeId));

    if (!node) {
      console.warn(`[GraphModel] Node ${nodeId} not found`);
      return;
    }

    // Check if position actually changed (avoid unnecessary events)
    if (node.x === x && node.y === y) {
      return;
    }

    node.x = x;
    node.y = y;

    this.emit('nodeMoved', { nodeId, x, y, source });
  }

  /**
   * Update multiple node positions (batch update)
   */
  updateNodePositions(updates, source = 'layout') {
    updates.forEach(({ nodeId, x, y }) => {
      const node = this._nodeMap.get(String(nodeId));
      if (node) {
        node.x = x;
        node.y = y;
      }
    });

    this.emit('nodesMovedBatch', { updates, source });
  }

  // ===== SELECTION MUTATIONS =====

  /**
   * Select nodes
   */
  selectNodes(nodeIds, options = {}) {
    const { additive = false, source = 'user' } = options;

    if (!additive) {
      this._selectedNodes.clear();
    }

    const ids = Array.isArray(nodeIds) ? nodeIds : [nodeIds];
    ids.forEach(id => this._selectedNodes.add(id));

    this.emit('nodeSelected', { nodeIds: Array.from(this._selectedNodes), source });
  }

  /**
   * Deselect nodes
   */
  deselectNodes(nodeIds = null, source = 'user') {
    if (nodeIds === null) {
      this._selectedNodes.clear();
    } else {
      const ids = Array.isArray(nodeIds) ? nodeIds : [nodeIds];
      ids.forEach(id => this._selectedNodes.delete(id));
    }

    this.emit('nodeSelected', { nodeIds: Array.from(this._selectedNodes), source });
  }

  /**
   * Pin/unpin a node
   */
  pinNode(nodeId, pinned = true, source = 'user') {
    const node = this._nodeMap.get(String(nodeId));

    if (!node) {
      console.warn(`[GraphModel] Node ${nodeId} not found`);
      return;
    }

    if (pinned) {
      this._pinnedNodes.add(nodeId);
      node.fx = node.x;
      node.fy = node.y;
    } else {
      this._pinnedNodes.delete(nodeId);
      node.fx = null;
      node.fy = null;
    }

    this.emit('nodePinned', { nodeId, pinned, source });
  }

  /**
   * Pin selected nodes
   */
  pinSelectedNodes(source = 'user') {
    this._selectedNodes.forEach(nodeId => {
      this.pinNode(nodeId, true, source);
    });
  }

  // ===== PATH MUTATIONS =====

  /**
   * Save a new path
   */
  savePath(nodeSequence, pathName = null, source = 'user') {
    const nodeIds = typeof nodeSequence === 'string'
      ? nodeSequence.split(',').map(id => id.trim())
      : nodeSequence;

    // Validate nodes exist
    const validNodes = nodeIds.filter(id => this._nodeMap.has(String(id)));

    if (validNodes.length === 0) {
      console.warn('[GraphModel] No valid nodes in path sequence');
      return null;
    }

    // Find edges in path
    const pathEdges = new Set();
    for (let i = 0; i < validNodes.length - 1; i++) {
      const sourceId = validNodes[i];
      const targetId = validNodes[i + 1];

      this._links.forEach((link, index) => {
        const linkSourceId = String(link.source?.id || link.source);
        const linkTargetId = String(link.target?.id || link.target);

        if ((linkSourceId === String(sourceId) && linkTargetId === String(targetId)) ||
            (linkSourceId === String(targetId) && linkTargetId === String(sourceId))) {
          pathEdges.add(index);
        }
      });
    }

    const path = {
      id: this._nextPathId++,
      name: pathName || `Path ${this._savedPaths.length + 1}`,
      sequence: validNodes.join(','),
      nodes: new Set(validNodes.map(String)),
      edges: pathEdges,
      color: this._getNextPathColor(),
      timestamp: new Date()
    };

    this._savedPaths.push(path);
    this._currentPathIndex = this._savedPaths.length - 1;

    this.emit('pathSaved', { path: { ...path, nodes: Array.from(path.nodes), edges: Array.from(path.edges) }, source });
    this.emit('stateChanged', { type: 'pathSaved', data: { pathId: path.id }, source });

    return path;
  }

  /**
   * Remove a path
   */
  removePath(pathIndex, source = 'user') {
    if (pathIndex < 0 || pathIndex >= this._savedPaths.length) {
      return;
    }

    const removed = this._savedPaths.splice(pathIndex, 1)[0];

    // Adjust current index
    if (this._currentPathIndex === pathIndex) {
      this._currentPathIndex = -1;
    } else if (this._currentPathIndex > pathIndex) {
      this._currentPathIndex--;
    }

    this.emit('pathRemoved', { pathId: removed.id, pathIndex, source });
    this.emit('stateChanged', { type: 'pathRemoved', data: { pathId: removed.id }, source });
  }

  /**
   * Select a path (for highlighting)
   */
  selectPath(pathIndex, source = 'user') {
    if (pathIndex < -1 || pathIndex >= this._savedPaths.length) {
      return;
    }

    this._currentPathIndex = pathIndex;

    this.emit('pathSelected', { pathIndex, path: this.currentPath, source });
  }

  /**
   * Clear all paths
   */
  clearAllPaths(source = 'user') {
    this._savedPaths = [];
    this._currentPathIndex = -1;
    this._nextPathId = 1;

    this.emit('pathsCleared', { source });
    this.emit('stateChanged', { type: 'pathsCleared', data: {}, source });
  }

  // ===== HISTORY (UNDO/REDO) =====

  /**
   * Undo last operation
   */
  undo(source = 'user') {
    if (!this.canUndo) {
      return;
    }

    // Remove current state
    this._history.pop();

    // Restore previous state
    const previousState = this._history[this._history.length - 1];
    this._nodes = JSON.parse(JSON.stringify(previousState.nodes));
    this._links = JSON.parse(JSON.stringify(previousState.links));

    this._rebuildMaps();

    this.emit('stateRestored', { type: 'undo', source });
    this.emit('graphLoaded', { nodes: this.nodes, links: this.links, format: this._format, source: 'undo' });
    this.emit('historyChanged', { canUndo: this.canUndo, canRedo: false });
  }

  // ===== INTERNAL HELPERS =====

  /**
   * Save current state to history
   */
  _saveHistory(operation) {
    this._history.push({
      operation,
      nodes: JSON.parse(JSON.stringify(this._nodes)),
      links: JSON.parse(JSON.stringify(this._links)),
      timestamp: Date.now()
    });

    // Limit history size
    if (this._history.length > this._maxHistorySize) {
      this._history.shift();
    }

    this.emit('historyChanged', { canUndo: this.canUndo, canRedo: false });
  }

  /**
   * Rebuild node and link lookup maps
   */
  _rebuildMaps() {
    this._nodeMap.clear();
    this._linkMap.clear();

    this._nodes.forEach(node => {
      this._nodeMap.set(String(node.id), node);
    });

    this._links.forEach((link, index) => {
      this._linkMap.set(index, link);
    });
  }

  /**
   * Get next color from palette
   */
  _getNextPathColor() {
    return this._pathColors[this._savedPaths.length % this._pathColors.length];
  }

  /**
   * Get connected components in the graph
   * Returns an array of components, where each component is an array of node IDs
   */
  getConnectedComponents() {
    const visited = new Set();
    const components = [];

    // Helper function to perform DFS
    const dfs = (nodeId, component) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      component.push(nodeId);

      // Find all connected nodes
      this._links.forEach(link => {
        const sourceId = String(link.source?.id || link.source);
        const targetId = String(link.target?.id || link.target);

        if (sourceId === String(nodeId) && !visited.has(targetId)) {
          dfs(targetId, component);
        } else if (targetId === String(nodeId) && !visited.has(sourceId)) {
          dfs(sourceId, component);
        }
      });
    };

    // Find all connected components
    this._nodes.forEach(node => {
      if (!visited.has(node.id)) {
        const component = [];
        dfs(node.id, component);
        components.push(component);
      }
    });

    return components;
  }

  /**
   * Reset the entire model
   */
  reset() {
    this._nodes = [];
    this._links = [];
    this._format = 'dot';
    this._selectedNodes.clear();
    this._selectedEdges.clear();
    this._pinnedNodes.clear();
    this._savedPaths = [];
    this._currentPathIndex = -1;
    this._nextPathId = 1;
    this._history = [];
    this._nodeMap.clear();
    this._linkMap.clear();

    this.emit('modelReset', { source: 'system' });
  }
}
