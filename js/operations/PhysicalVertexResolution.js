// PhysicalVertexResolution.js - Physical (GFA) vertex resolution operation

import { Operation } from './Operation.js';

/**
 * PhysicalVertexResolution operation splits a vertex into multiple vertices
 * based on physical subnode connections (red × green subnodes).
 *
 * This is GFA-specific and uses orientation markers to determine connections.
 * Preserves the exact logic from the legacy implementation.
 */
export class PhysicalVertexResolution extends Operation {
  constructor(graph, vertexId, selectedCombinations) {
    super('PhysicalVertexResolution', `Resolve vertex ${vertexId} physically (GFA)`);

    this.graph = graph;
    this.vertexId = vertexId;
    this.selectedCombinations = selectedCombinations;

    // Operation results
    this.vertex = null;
    this.newNodes = [];
    this.newLinks = [];
    this.connections = null;
  }

  /**
   * Validate if operation can be executed
   */
  validate() {
    const vertex = this.graph.getNode(this.vertexId);
    if (!vertex) {
      throw new Error(`Vertex ${this.vertexId} not found`);
    }

    if (!this.selectedCombinations || this.selectedCombinations.length === 0) {
      throw new Error('No physical path combinations selected');
    }

    return true;
  }

  /**
   * Execute the physical vertex resolution operation
   */
  execute() {
    this.validate();

    // Save state before execution
    this.saveBeforeState({
      nodes: this.graph.getNodes().map(n => this.cloneObject(n)),
      edges: this.graph.getEdges().map(e => this.cloneObject(e))
    });

    // Get vertex
    this.vertex = this.graph.getNode(this.vertexId);

    // Get physical connections
    this.connections = this.getPhysicalConnections(this.vertexId);

    console.log(`[PhysicalVertexResolution] Physically resolving vertex ${this.vertexId} into ${this.selectedCombinations.length} copies`);

    // Create new nodes
    this.newNodes = this.createNewNodes();

    // MATCH LEGACY: Directly manipulate model's internal arrays to preserve D3 references
    // Remove original vertex
    const model = this.graph.getModel();
    model._nodes = model._nodes.filter(n => n.id !== this.vertexId);

    // Remove edges connected to original vertex
    // CRITICAL: Use String() to ensure type-safe comparison (IDs might be numbers or strings)
    const vertexIdStr = String(this.vertexId);
    model._links = model._links.filter(link => {
      const sourceId = String((typeof link.source === 'object') ? link.source.id : link.source);
      const targetId = String((typeof link.target === 'object') ? link.target.id : link.target);
      return sourceId !== vertexIdStr && targetId !== vertexIdStr;
    });

    // Add new nodes (don't clone - D3 needs to mutate these directly)
    model._nodes.push(...this.newNodes);

    // Create new edges based on physical connections
    this.newLinks = this.createNewLinks();

    // Add new links (don't clone - D3 needs to mutate these directly)
    console.log('[PhysicalVertexResolution] About to push new links. Current link count:', model._links.length);
    console.log('[PhysicalVertexResolution] New links to add:', this.newLinks);
    model._links.push(...this.newLinks);
    console.log('[PhysicalVertexResolution] After push. Link count:', model._links.length);

    // Rebuild maps for the model
    model._rebuildMaps();
    console.log('[PhysicalVertexResolution] Maps rebuilt');

    // CRITICAL: Emit event to trigger simulation recreation
    // This is necessary because we directly manipulated the arrays
    model.emit('graphStructureChanged', {
      reason: 'physicalVertexResolution',
      nodesAdded: this.newNodes.length,
      nodesRemoved: 1,
      edgesAdded: this.newLinks.length,
      edgesRemoved: this.connections.red.length + this.connections.green.length
    });

    // Save state after execution
    this.saveAfterState({
      nodes: this.graph.getNodes().map(n => this.cloneObject(n)),
      edges: this.graph.getEdges().map(e => this.cloneObject(e))
    });

    this.markExecuted();

    return {
      success: true,
      originalVertexId: this.vertexId,
      newVertexIds: this.newNodes.map(n => n.id),
      newVertexCount: this.newNodes.length,
      newEdgeCount: this.newLinks.length,
      resolutionType: 'physical',
      newVertices: this.newNodes
    };
  }

  /**
   * Reverse the resolution operation (undo)
   */
  reverse() {
    if (!this.beforeState) {
      throw new Error('No state to restore');
    }

    // Clear graph
    this.graph.clear();

    // Restore original nodes
    this.beforeState.nodes.forEach(node => {
      this.graph.addNode(this.cloneObject(node));
    });

    // Restore original edges
    this.beforeState.edges.forEach(edge => {
      this.graph.addEdge(this.cloneObject(edge));
    });

    this.markReversed();
  }

  /**
   * Get physical connections (GFA - red/green subnodes)
   * EXACT COPY from main.js getPhysicalConnections()
   */
  getPhysicalConnections(vertexId) {
    const redConnections = [];
    const greenConnections = [];
    const links = this.graph.getEdges();
    const nodes = this.graph.getNodes();

    links.forEach((link, index) => {
      const sourceId = (typeof link.source === 'object') ? link.source.id : link.source;
      const targetId = (typeof link.target === 'object') ? link.target.id : link.target;

      if (sourceId === vertexId) {
        const srcOrientation = link.srcOrientation || '+';
        if (srcOrientation === '+') {
          greenConnections.push({
            linkIndex: index,
            link: link,
            targetId: targetId,
            targetNode: (typeof link.target === 'object') ? link.target : nodes.find(n => n.id === targetId),
            orientation: srcOrientation,
            direction: 'outgoing'
          });
        } else {
          redConnections.push({
            linkIndex: index,
            link: link,
            targetId: targetId,
            targetNode: (typeof link.target === 'object') ? link.target : nodes.find(n => n.id === targetId),
            orientation: srcOrientation,
            direction: 'outgoing'
          });
        }
      }

      if (targetId === vertexId) {
        const tgtOrientation = link.tgtOrientation || '+';
        if (tgtOrientation === '+') {
          redConnections.push({
            linkIndex: index,
            link: link,
            sourceId: sourceId,
            sourceNode: (typeof link.source === 'object') ? link.source : nodes.find(n => n.id === sourceId),
            orientation: tgtOrientation,
            direction: 'incoming'
          });
        } else {
          greenConnections.push({
            linkIndex: index,
            link: link,
            sourceId: sourceId,
            sourceNode: (typeof link.source === 'object') ? link.source : nodes.find(n => n.id === sourceId),
            orientation: tgtOrientation,
            direction: 'incoming'
          });
        }
      }
    });

    console.log(`[PhysicalVertexResolution] Physical connections for ${vertexId}: ${redConnections.length} red subnode, ${greenConnections.length} green subnode`);
    return { red: redConnections, green: greenConnections };
  }

  /**
   * Create new nodes from selected combinations
   * EXACT COPY from main.js performPhysicalResolution()
   */
  createNewNodes() {
    const newNodes = [];
    const selectedCombos = this.selectedCombinations;
    const vertex = this.vertex;

    selectedCombos.forEach((combo, index) => {
      const newNodeId = selectedCombos.length === 1 ? vertex.id : `${vertex.id}_p${index + 1}`;
      const newNode = {
        ...vertex,
        id: newNodeId,
        originalId: vertex.id,
        pathDescription: combo.description,
        resolutionType: 'physical',
        x: vertex.x,
        y: vertex.y,
        vx: 0,
        vy: 0,
        // CRITICAL: Explicitly set fx/fy to null to prevent D3 from treating as pinned
        fx: null,
        fy: null
      };

      // Position nodes in circle if multiple
      if (selectedCombos.length > 1) {
        const angleOffset = (index * 2 * Math.PI) / selectedCombos.length;
        const radius = 60;
        newNode.x = vertex.x + radius * Math.cos(angleOffset);
        newNode.y = vertex.y + radius * Math.sin(angleOffset);
      }

      newNodes.push(newNode);
    });

    return newNodes;
  }

  /**
   * Create new links from selected physical combinations
   * EXACT COPY from main.js performPhysicalResolution()
   */
  createNewLinks() {
    const newLinks = [];
    const selectedCombos = this.selectedCombinations;
    const vertex = this.vertex;

    console.log(`[PhysicalVertexResolution] Creating links for ${selectedCombos.length} combinations`);

    selectedCombos.forEach((combo, index) => {
      const newNodeId = selectedCombos.length === 1 ? vertex.id : `${vertex.id}_p${index + 1}`;

      console.log(`[PhysicalVertexResolution] Combo ${index}: newNodeId=${newNodeId}`);
      console.log(`[PhysicalVertexResolution]   Red:`, combo.red);
      console.log(`[PhysicalVertexResolution]   Green:`, combo.green);

      // Red connection
      if (combo.red) {
        const originalLink = combo.red.link;
        let newLink;

        if (combo.red.direction === 'incoming') {
          newLink = {
            ...originalLink,
            target: newNodeId,
            source: combo.red.sourceId
          };
        } else {
          newLink = {
            ...originalLink,
            source: newNodeId,
            target: combo.red.targetId
          };
        }

        // Ensure IDs are not objects
        if (typeof newLink.source === 'object') newLink.source = newLink.source.id;
        if (typeof newLink.target === 'object') newLink.target = newLink.target.id;

        console.log(`[PhysicalVertexResolution]   Created RED link: ${newLink.source} -> ${newLink.target}`, newLink);
        newLinks.push(newLink);
      }

      // Green connection
      if (combo.green) {
        const originalLink = combo.green.link;
        let newLink;

        if (combo.green.direction === 'incoming') {
          newLink = {
            ...originalLink,
            target: newNodeId,
            source: combo.green.sourceId
          };
        } else {
          newLink = {
            ...originalLink,
            source: newNodeId,
            target: combo.green.targetId
          };
        }

        // Ensure IDs are not objects
        if (typeof newLink.source === 'object') newLink.source = newLink.source.id;
        if (typeof newLink.target === 'object') newLink.target = newLink.target.id;

        console.log(`[PhysicalVertexResolution]   Created GREEN link: ${newLink.source} -> ${newLink.target}`, newLink);
        newLinks.push(newLink);
      }
    });

    console.log(`[PhysicalVertexResolution] Total new links created: ${newLinks.length}`);
    return newLinks;
  }

  /**
   * Generate all possible physical path combinations for a vertex
   * EXACT COPY from main.js generatePhysicalCombinations()
   */
  static generatePhysicalCombinations(redConnections, greenConnections) {
    const combinations = [];

    if (redConnections.length === 0) {
      greenConnections.forEach(green => {
        combinations.push({
          red: null,
          green: green,
          id: `start_${green.targetId || green.sourceId}`,
          description: `Start → ${green.targetId || green.sourceId} (green)`
        });
      });
    } else if (greenConnections.length === 0) {
      redConnections.forEach(red => {
        combinations.push({
          red: red,
          green: null,
          id: `${red.sourceId || red.targetId}_end`,
          description: `${red.sourceId || red.targetId} (red) → End`
        });
      });
    } else {
      redConnections.forEach(red => {
        greenConnections.forEach(green => {
          const redNode = red.sourceId || red.targetId;
          const greenNode = green.targetId || green.sourceId;
          combinations.push({
            red: red,
            green: green,
            id: `${redNode}_${greenNode}`,
            description: `${redNode} (red) ↔ ${greenNode} (green)`
          });
        });
      });
    }

    console.log(`[PhysicalVertexResolution] Generated ${combinations.length} physical combinations`);
    return combinations;
  }

  /**
   * Get operation summary
   */
  getSummary() {
    return {
      ...super.getSummary(),
      originalVertexId: this.vertexId,
      newVertexIds: this.newNodes.map(n => n.id),
      newVertexCount: this.newNodes.length,
      resolutionType: 'physical'
    };
  }

  /**
   * Deep clone a plain object
   */
  cloneObject(obj) {
    if (!obj) return obj;
    return JSON.parse(JSON.stringify(obj));
  }
}
