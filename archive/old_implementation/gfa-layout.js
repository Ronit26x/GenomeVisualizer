// gfa-layout.js - FOCUSED FIX: Simple node orientation based on edges

// Align GFA nodes based on their connections (simple and effective)
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
  
  // Calculate node orientations - FIXED: Ensure arrow points in flow direction
  gfaNodes.forEach(node => {
    const conn = connections.get(node.id);
    let targetAngle = 0;
    let angleSet = false;
    
    // Priority 1: If node has outgoing edges, point toward them
    if (conn.outgoing.length > 0) {
      let totalX = 0, totalY = 0, count = 0;
      
      conn.outgoing.forEach(({ nodeId }) => {
        const targetNode = nodeMap.get(nodeId);
        if (targetNode) {
          const dx = targetNode.x - node.x;
          const dy = targetNode.y - node.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0) {
            totalX += dx / dist;
            totalY += dy / dist;
            count++;
          }
        }
      });
      
      if (count > 0) {
        targetAngle = Math.atan2(totalY / count, totalX / count);
        angleSet = true;
        // console.log(`Node ${node.id}: pointing toward ${conn.outgoing.length} outgoing edge(s) at ${(targetAngle * 180 / Math.PI).toFixed(1)}°`);
      }
    }
    
    // Priority 2: If no outgoing edges but has incoming, point away from incoming
    if (!angleSet && conn.incoming.length > 0) {
      let totalX = 0, totalY = 0, count = 0;
      
      conn.incoming.forEach(({ nodeId }) => {
        const sourceNode = nodeMap.get(nodeId);
        if (sourceNode) {
          const dx = node.x - sourceNode.x;
          const dy = node.y - sourceNode.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0) {
            totalX += dx / dist;
            totalY += dy / dist;
            count++;
          }
        }
      });
      
      if (count > 0) {
        targetAngle = Math.atan2(totalY / count, totalX / count);
        angleSet = true;
        // console.log(`Node ${node.id}: pointing away from ${conn.incoming.length} incoming edge(s) at ${(targetAngle * 180 / Math.PI).toFixed(1)}°`);
      }
    }
    
    // Set the calculated angle
    if (angleSet) {
      node.angle = targetAngle;
    } else {
      // Default orientation if no connections
      node.angle = 0;
      // console.log(`Node ${node.id}: no connections, using default orientation`);
    }
    
    // Update node position with new angle
    node.updatePosition();
  });
  
  // Single pass refinement for linear paths
  gfaNodes.forEach(node => {
    const conn = connections.get(node.id);
    
    // Special case: linear path (1 in, 1 out) - ensure smooth flow
    if (conn.incoming.length === 1 && conn.outgoing.length === 1) {
      const sourceNode = nodeMap.get(conn.incoming[0].nodeId);
      const targetNode = nodeMap.get(conn.outgoing[0].nodeId);
      
      if (sourceNode && targetNode) {
        // Calculate the flow direction from source through this node to target
        const inDx = node.x - sourceNode.x;
        const inDy = node.y - sourceNode.y;
        const outDx = targetNode.x - node.x;
        const outDy = targetNode.y - node.y;
        
        const inDist = Math.sqrt(inDx * inDx + inDy * inDy);
        const outDist = Math.sqrt(outDx * outDx + outDy * outDy);
        
        if (inDist > 0 && outDist > 0) {
          // Average the normalized directions
          const avgDx = (inDx / inDist + outDx / outDist) / 2;
          const avgDy = (inDy / inDist + outDy / outDist) / 2;
          
          if (avgDx !== 0 || avgDy !== 0) {
            node.angle = Math.atan2(avgDy, avgDx);
            node.updatePosition();
            // console.log(`Linear node ${node.id}: smoothed to ${(node.angle * 180 / Math.PI).toFixed(1)}°`);
          }
        }
      }
    }
  });

  // console.log('Node orientation completed');
}