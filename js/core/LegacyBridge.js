// LegacyBridge.js - Adapter to connect legacy code with new MVC architecture

/**
 * LegacyBridge acts as an adapter between the existing main.js code
 * and the new MVC architecture. It allows gradual migration without
 * breaking existing functionality.
 *
 * Strategy:
 * 1. Keep existing main.js functions working
 * 2. Intercept state changes and sync to Model
 * 3. Subscribe to Model events and update legacy state
 * 4. Gradually move functionality from legacy to MVC
 */

export class LegacyBridge {
  constructor(model, controller, legacyState) {
    this.model = model;
    this.controller = controller;
    this.legacy = legacyState; // Reference to existing main.js state

    this._setupBidirectionalSync();
  }

  /**
   * Set up bidirectional sync between legacy state and Model
   */
  _setupBidirectionalSync() {
    // When Model changes, update legacy state
    this.model.on('graphLoaded', ({ nodes, links, format }) => {
      this.legacy.nodes.splice(0, this.legacy.nodes.length, ...nodes);
      this.legacy.links.splice(0, this.legacy.links.length, ...links);
      this.legacy.currentFormat = format;
    });

    this.model.on('nodeSelected', ({ nodeIds }) => {
      this.legacy.selected.nodes.clear();
      nodeIds.forEach(id => this.legacy.selected.nodes.add(id));
    });

    this.model.on('nodePinned', ({ nodeId, pinned }) => {
      if (pinned) {
        this.legacy.pinnedNodes.add(nodeId);
      } else {
        this.legacy.pinnedNodes.delete(nodeId);
      }
    });

    this.model.on('pathSelected', ({ path }) => {
      if (path) {
        this.legacy.highlightedPath.nodes = new Set(path.nodes);
        this.legacy.highlightedPath.edges = new Set(path.edges);
        this.legacy.highlightedPath.currentColor = path.color;
      } else {
        this.legacy.highlightedPath.nodes.clear();
        this.legacy.highlightedPath.edges.clear();
      }
    });

    // Paths sync
    this.model.on('pathSaved', () => {
      this.legacy.savedPaths = this.model.savedPaths;
    });

    this.model.on('pathRemoved', () => {
      this.legacy.savedPaths = this.model.savedPaths;
    });
  }

  /**
   * Sync legacy state to Model (called after legacy operations)
   */
  syncToModel() {
    // Push legacy changes to model
    if (this.legacy.nodes.length > 0) {
      // Check if model needs update
      const modelNodes = this.model.nodes;
      if (modelNodes.length !== this.legacy.nodes.length) {
        this.model.loadGraph(
          [...this.legacy.nodes],
          [...this.legacy.links],
          this.legacy.currentFormat,
          'legacy'
        );
      }
    }
  }

  /**
   * Wrap a legacy function to sync with Model
   */
  wrapLegacyFunction(fn, syncAfter = true) {
    return (...args) => {
      const result = fn(...args);
      if (syncAfter) {
        this.syncToModel();
      }
      return result;
    };
  }

  /**
   * Replace legacy state references with Model accessors
   */
  createProxies() {
    // Create proxy for nodes array
    const nodesProxy = new Proxy(this.legacy.nodes, {
      set: (target, prop, value) => {
        const result = Reflect.set(target, prop, value);
        this.syncToModel();
        return result;
      }
    });

    const linksProxy = new Proxy(this.legacy.links, {
      set: (target, prop, value) => {
        const result = Reflect.set(target, prop, value);
        this.syncToModel();
        return result;
      }
    });

    return { nodesProxy, linksProxy };
  }
}
