// simulation.js

export function createSimulation(nodes, links, width, height, onTick) {
  return d3.forceSimulation(nodes)
    .force('link',   d3.forceLink(links).id(d => d.id).distance(50))
    .force('charge', d3.forceManyBody().strength(-100))
    .force('center', d3.forceCenter(width/2, height/2))
    .on('tick', onTick);
}
