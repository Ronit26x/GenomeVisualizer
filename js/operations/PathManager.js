// PathManager.js - Operation for managing path updates after graph modifications

import { Operation } from './Operation.js';

/**
 * PathManager handles updating saved paths after graph modifications.
 * Updates paths when nodes are merged or vertices are resolved.
 */
export class PathManager extends Operation {
  constructor(pathCollection, modificationType, modificationData) {
    super('PathManager', `Update paths after ${modificationType}`);

    this.pathCollection = pathCollection;
    this.modificationType = modificationType; // 'merge' or 'resolution'
    this.modificationData = modificationData;

    this.updatedPaths = [];
    this.updateCount = 0;
  }

  /**
   * Execute path updates
   */
  execute() {
    this.saveBeforeState({
      paths: this.pathCollection.getAllPaths().map(p => ({ ...p }))
    });

    const allPaths = this.pathCollection.getAllPaths();

    if (this.modificationType === 'merge') {
      this.updatedPaths = this.updatePathsAfterMerge(allPaths);
    } else if (this.modificationType === 'resolution') {
      this.updatedPaths = this.updatePathsAfterResolution(allPaths);
    }

    // Update path collection
    this.pathCollection.clearAll();
    this.updatedPaths.forEach(path => {
      this.pathCollection.addPath(path);
    });

    this.saveAfterState({
      paths: this.updatedPaths.map(p => ({ ...p }))
    });

    this.markExecuted();

    return {
      success: true,
      updateCount: this.updateCount,
      totalPaths: this.updatedPaths.length
    };
  }

  /**
   * Reverse path updates
   */
  reverse() {
    if (!this.beforeState) {
      throw new Error('No state to restore');
    }

    this.pathCollection.clearAll();
    this.beforeState.paths.forEach(path => {
      this.pathCollection.addPath(path);
    });

    this.markReversed();
  }

  /**
   * Update paths after node merging
   */
  updatePathsAfterMerge(paths) {
    const { mergedNodeId, originalNodeIds } = this.modificationData;
    const updatedPaths = [];

    paths.forEach(path => {
      const pathNodeIds = path.sequence.split(',').map(id => id.trim());

      const hasOriginalNodes = originalNodeIds.some(origId =>
        pathNodeIds.includes(String(origId))
      );

      if (hasOriginalNodes) {
        let newSequence = pathNodeIds.map(nodeId => {
          if (originalNodeIds.includes(nodeId) || originalNodeIds.includes(Number(nodeId))) {
            return mergedNodeId;
          }
          return nodeId;
        });

        // Remove consecutive duplicates
        newSequence = this.deduplicateSequence(newSequence);

        updatedPaths.push({
          ...path,
          sequence: newSequence.join(','),
          nodes: new Set(newSequence),
          edges: new Set(),
          mergeUpdated: true,
          updateReason: `Nodes merged: ${originalNodeIds.join(', ')} → ${mergedNodeId}`
        });

        this.updateCount++;
      } else {
        updatedPaths.push(path);
      }
    });

    return updatedPaths;
  }

  /**
   * Update paths after vertex resolution
   */
  updatePathsAfterResolution(paths) {
    const { originalNodeId, newVertices } = this.modificationData;
    const updatedPaths = [];

    paths.forEach(path => {
      const pathNodeIds = path.sequence.split(',').map(id => id.trim());

      if (pathNodeIds.includes(String(originalNodeId))) {
        // Show dialog or use first vertex as default
        const replacementVertex = newVertices[0];

        const newSequence = pathNodeIds.map(nodeId => {
          if (String(nodeId) === String(originalNodeId)) {
            return replacementVertex;
          }
          return nodeId;
        });

        updatedPaths.push({
          ...path,
          sequence: newSequence.join(','),
          nodes: new Set(newSequence),
          edges: new Set(),
          resolutionUpdated: true,
          updateReason: `Vertex resolved: ${originalNodeId} → ${replacementVertex}`
        });

        this.updateCount++;
      } else {
        updatedPaths.push(path);
      }
    });

    return updatedPaths;
  }

  /**
   * Remove consecutive duplicates from sequence
   */
  deduplicateSequence(sequence) {
    const deduplicated = [];
    let lastNode = null;

    sequence.forEach(nodeId => {
      if (nodeId !== lastNode) {
        deduplicated.push(nodeId);
        lastNode = nodeId;
      }
    });

    return deduplicated;
  }
}
