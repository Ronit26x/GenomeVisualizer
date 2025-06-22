// gfa-layout.js

// Align GFA nodes based on their connections (like Bandage does)
export function layoutGfaNodes(gfaNodes, links) {
  // Create maps for quick lookup
  const nodeMap = new Map();
  gfaNodes.forEach(node => nodeMap.set(node.id, node));
  
  // Build adjacency lists
  const connections = new Map();
  gfaNodes.forEach(node => connections.set(node.id, { incoming: [], outgoing: [] }));
  
  links.forEach(link => {
    const sourceId = link.source.id || link.source;
    const targetId = link.target.id || link.target;
    
    if (connections.has(sourceId)) {
      connections.get(sourceId).outgoing.push({
        nodeId: targetId,
        orientation: link.tgtOrientation || '+'
      });
    }
    if (connections.has(targetId)) {
      connections.get(targetId).incoming.push({
        nodeId: sourceId,
        orientation: link.srcOrientation || '+'
      });
    }
  });
  
  // Calculate node orientations based on connections
  gfaNodes.forEach(node => {
    const conn = connections.get(node.id);
    
    // For nodes with single connections, align them properly
    if (conn.outgoing.length === 1 && conn.incoming.length === 0) {
      // Start of a path - point towards the next node
      const targetNode = nodeMap.get(conn.outgoing[0].nodeId);
      if (targetNode) {
        const dx = targetNode.x - node.x;
        const dy = targetNode.y - node.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
          node.angle = Math.atan2(dy, dx);
        }
      }
    } else if (conn.incoming.length === 1 && conn.outgoing.length === 1) {
      // Middle of a path - align between previous and next
      const prevNode = nodeMap.get(conn.incoming[0].nodeId);
      const nextNode = nodeMap.get(conn.outgoing[0].nodeId);
      
      if (prevNode && nextNode) {
        // Calculate angle from previous to next
        const dx1 = node.x - prevNode.x;
        const dy1 = node.y - prevNode.y;
        const dx2 = nextNode.x - node.x;
        const dy2 = nextNode.y - node.y;
        
        // Average the angles
        const angle1 = Math.atan2(dy1, dx1);
        const angle2 = Math.atan2(dy2, dx2);
        
        // Handle angle wrapping
        let angleDiff = angle2 - angle1;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        
        node.angle = angle1 + angleDiff / 2;
      }
    } else if (conn.incoming.length === 1 && conn.outgoing.length === 0) {
      // End of a path - point away from previous
      const prevNode = nodeMap.get(conn.incoming[0].nodeId);
      if (prevNode) {
        const dx = node.x - prevNode.x;
        const dy = node.y - prevNode.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
          node.angle = Math.atan2(dy, dx);
        }
      }
    } else if (conn.outgoing.length > 1 || conn.incoming.length > 1) {
      // Junction node - calculate weighted average direction
      let totalX = 0, totalY = 0;
      let count = 0;
      
      conn.incoming.forEach(({ nodeId }) => {
        const otherNode = nodeMap.get(nodeId);
        if (otherNode) {
          const dx = node.x - otherNode.x;
          const dy = node.y - otherNode.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0) {
            totalX += dx / dist;
            totalY += dy / dist;
            count++;
          }
        }
      });
      
      conn.outgoing.forEach(({ nodeId }) => {
        const otherNode = nodeMap.get(nodeId);
        if (otherNode) {
          const dx = otherNode.x - node.x;
          const dy = otherNode.y - node.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0) {
            totalX += dx / dist;
            totalY += dy / dist;
            count++;
          }
        }
      });
      
      if (count > 0 && (totalX !== 0 || totalY !== 0)) {
        node.angle = Math.atan2(totalY / count, totalX / count);
      }
    }
    
    // Update node position with calculated angle
    node.updatePosition();
  });
  
  // Second pass: refine angles for smoother paths
  for (let iteration = 0; iteration < 3; iteration++) {
    gfaNodes.forEach(node => {
      const conn = connections.get(node.id);
      
      // For linear paths, smooth the angles
      if (conn.incoming.length === 1 && conn.outgoing.length === 1) {
        const prevNode = nodeMap.get(conn.incoming[0].nodeId);
        const nextNode = nodeMap.get(conn.outgoing[0].nodeId);
        
        if (prevNode && nextNode) {
          // Calculate the ideal angle for a smooth curve
          const toPrev = Math.atan2(prevNode.y - node.y, prevNode.x - node.x);
          const toNext = Math.atan2(nextNode.y - node.y, nextNode.x - node.x);
          
          // The node should be perpendicular to the line between prev and next
          let idealAngle = (toPrev + Math.PI + toNext) / 2;
          
          // Smooth transition
          const smoothingFactor = 0.5;
          node.angle = node.angle + smoothingFactor * (idealAngle - node.angle);
          node.updatePosition();
        }
      }
    });
  }
}