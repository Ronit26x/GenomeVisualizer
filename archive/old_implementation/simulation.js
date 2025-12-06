// simulation.js - REVERTED: Back to your original working simulation

export function createSimulation(nodes, links, width, height, onTick) {
  // Check if this is a GFA graph
  const isGfaGraph = nodes.some(n => n.gfaType === 'segment');
  
  if (isGfaGraph) {
    // GFA-specific simulation with adjusted forces - BACK TO ORIGINAL SETTINGS
    const getLinkDistance = (link) => {
      const sourceLength = link.source._drawnLength || 50;
      const targetLength = link.target._drawnLength || 50;
      // Tighter coupling for connected segments
      return (sourceLength + targetLength) / 2 + 10;
    };
    
    // Initialize positions for better layout
    if (nodes.some(n => n.x === undefined)) {
      // Arrange nodes in a rough grid initially
      const cols = Math.ceil(Math.sqrt(nodes.length));
      nodes.forEach((node, i) => {
        if (node.x === undefined) {
          node.x = (i % cols) * 100 + width / 4;
          node.y = Math.floor(i / cols) * 100 + height / 4;
        }
      });
    }
    
    // ORIGINAL: Simple, clean simulation without conflicting forces
    return d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links)
        .id(d => d.id)
        .distance(getLinkDistance)
        .strength(1.0))
      .force('charge', d3.forceManyBody()
        .strength(d => {
          // Variable repulsion based on node size
          if (d._drawnLength) {
            // Less repulsion for GFA nodes to allow tighter packing
            return -50 - (d._drawnLength * 0.2);
          }
          return -100;
        })
        .distanceMax(300))  // Limit repulsion distance
      .force('center', d3.forceCenter(width/2, height/2).strength(0.1))
      .force('collision', d3.forceCollide()
        .radius(d => {
          // Collision radius based on node size
          if (d._drawnLength) {
            return Math.max(20, d._drawnLength / 3);
          }
          return 20;
        })
        .strength(0.7))
      .velocityDecay(0.4)  // More damping for stable layout
      .alphaDecay(0.02)    // Slower cooling for better convergence
      .on('tick', () => {
        // Store drawn lengths for force calculations
        nodes.forEach((node, i) => {
          if (nodes._gfaNodes && nodes._gfaNodes[i]) {
            node._drawnLength = nodes._gfaNodes[i].drawnLength;
          }
        });
        onTick();
      });
  } else {
    // Original DOT simulation - unchanged from original
    return d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(50))
      .force('charge', d3.forceManyBody().strength(-100))
      .force('center', d3.forceCenter(width/2, height/2))
      .on('tick', onTick);
  }
}