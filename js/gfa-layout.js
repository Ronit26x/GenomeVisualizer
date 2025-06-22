// gfa-layout.js

// Align GFA nodes based on their connections (like Bandage does)
export function layoutGfaNodes(gfaNodes, links) {
  // Create a map for quick node lookup
  const nodeMap = new Map();
  gfaNodes.forEach(node => nodeMap.set(node.id, node));
  
  // Calculate node orientations based on connections
  gfaNodes.forEach(node => {
    const connectedNodes = [];
    
    links.forEach(link => {
      const sourceId = link.source.id || link.source;
      const targetId = link.target.id || link.target;
      
      if (sourceId === node.id) {
        const targetNode = nodeMap.get(targetId);
        if (targetNode) {
          connectedNodes.push({ node: targetNode, isOutgoing: true });
        }
      } else if (targetId === node.id) {
        const sourceNode = nodeMap.get(sourceId);
        if (sourceNode) {
          connectedNodes.push({ node: sourceNode, isOutgoing: false });
        }
      }
    });
    
    if (connectedNodes.length > 0) {
      // Calculate average direction to connected nodes
      let avgX = 0, avgY = 0;
      let count = 0;
      
      connectedNodes.forEach(conn => {
        if (conn.isOutgoing) {
          const dx = conn.node.x - node.x;
          const dy = conn.node.y - node.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          if (length > 0) {
            avgX += dx / length;
            avgY += dy / length;
            count++;
          }
        }
      });
      
      if (count > 0) {
        node.angle = Math.atan2(avgY / count, avgX / count);
      }
      
      node.updatePosition();
    }
  });
}