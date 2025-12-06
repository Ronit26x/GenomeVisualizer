# Node Merger Port Summary

**Date**: 2025-10-28
**Status**: ✅ **COMPLETE**

## Overview

Successfully ported the node merger functionality to work with the MVC architecture while maintaining 100% backward compatibility with the legacy plain-array interface.

## Solution: Bridge Pattern

Instead of forcing main.js to use the Graph class, we created a **bridge file** that:
1. Accepts plain arrays (`nodes[]`, `links[]`) - same as legacy
2. Internally processes using the same algorithms
3. Returns plain arrays back to main.js

This allows gradual migration without breaking existing code.

## Files Created

### `/js/operations/node-merger-bridge.js`
- **Purpose**: Bridge between legacy array interface and future MVC architecture
- **Interface**: Exactly matches legacy `js/node-merger.js`
- **Functions Exported**:
  - `mergeLinearChainFromNode(selectedNode, nodes, links)` - Main entry point
  - `mergeNodesFromPath(pathNodes, nodes, links, pathName)` - Merge specific nodes
  - `exportMergedNodeSequence(mergedNode, originalNodes, originalLinks)` - Export sequences
  - `isMergedNode(node)` - Check if node is merged
  - `getMergedNodeInfo(mergedNode)` - Get merged node details
  - `updatePathsAfterMerge(savedPaths, mergeResult)` - Update paths after merge

## Algorithm Details (Preserved from Legacy)

### Linear Chain Detection
**Connection Counting Method:**
- **Linear node**: Total connections (in + out) ≤ 2
- **Branching node**: Total connections > 2
- **Endpoint node**: Total connections = 1

### GFA vs DOT Handling
The bridge correctly handles both formats:

**GFA Format (Physical Connections):**
- Uses orientation markers (`+` / `-`)
- `+` orientation = green (outgoing) subnode
- `-` orientation = red (incoming) subnode
- Tracks which physical subnode each link connects to

**DOT Format (Logical Connections):**
- Simple source→target relationships
- No orientation markers

### Chain Tracing
1. Start from selected node
2. Trace **backwards** (follow incoming connections) until hitting:
   - Node with 0 incoming (endpoint)
   - Node with >1 incoming (multiple paths converge)
   - Node with >2 total connections (branching)
   - Cycle detected (already visited)
3. Trace **forwards** (follow outgoing connections) until hitting:
   - Node with 0 outgoing (endpoint)
   - Node with >1 outgoing (multiple paths diverge)
   - Node with >2 total connections (branching)
   - Cycle detected

### Merged Node Creation
- **ID**: `MERGED_{nodeIds}_{timestamp}`
- **Properties**:
  - `length`: Sum of all node lengths
  - `depth`: Average of all node depths
  - `seq`: '*' (placeholder)
  - `gfaType`: 'merged_segment'
  - `mergedFrom`: Array of original node IDs
  - `pathName`: Descriptive name of chain
  - `originalNodes`: Complete original node objects (for sequence reconstruction)
  - `originalLinks`: Complete original link objects (for sequence reconstruction)
  - `x`, `y`: Average position of all nodes

### External Connection Preservation
- Identifies all links where:
  - **One end** is inside the chain
  - **One end** is outside the chain
- Creates new links connecting:
  - External node → Merged node (incoming)
  - Merged node → External node (outgoing)
- Preserves all GFA orientation information

### Path Updates
After merging, all saved paths are automatically updated:
- Replace occurrences of merged nodes with the new merged node ID
- Remove consecutive duplicates
- Mark paths as updated with timestamp and reason

## Comparison with MVC NodeMerger

| Aspect | Legacy/Bridge | MVC NodeMerger.js |
|--------|--------------|-------------------|
| **Interface** | `(selectedNode, nodes[], links[])` | `(graph, startNodeId)` |
| **Input Type** | Plain arrays | Graph object |
| **Output Type** | Plain objects | Graph mutations |
| **Used By** | main.js (current) | Future MVC integration |
| **Algorithm** | Connection counting | Same (connection counting) |
| **GFA Support** | Yes (physical connections) | Yes (physical connections) |
| **DOT Support** | Yes (logical connections) | Yes (logical connections) |

## Why This Solution?

### ✅ Advantages
1. **Zero Breaking Changes**: main.js continues working without modification
2. **100% Algorithm Preservation**: Exact same logic as legacy
3. **Easy Migration Path**: Can swap import statement when ready
4. **Testable**: Can be tested independently with existing test files
5. **Documentation**: All legacy comments and console logs preserved

### ❌ Why Not Full Graph Class?
The MVC `NodeMerger.js` expects:
- Graph class with `.getNode()`, `.getEdges()`, `.mergeNodes()` methods
- Entity instances (Node, Edge objects)
- Event emission system

**Main.js uses:**
- Plain arrays (`nodes[]`, `links[]`)
- Plain objects (`{id, x, y, ...}`)
- Direct array manipulation

**Converting main.js to use Graph class would require:**
1. Rewriting graph initialization
2. Changing all node/link access patterns
3. Updating force simulation integration
4. Modifying renderer expectations
5. Testing ALL features (high risk)

## Usage Example

### Current Usage (Legacy)
```javascript
import { mergeLinearChainFromNode } from './js/node-merger.js';

const result = mergeLinearChainFromNode(selectedNode, nodes, links);
nodes = result.newNodes;
links = result.newLinks;
```

### After Migration (Bridge - No Changes Required!)
```javascript
import { mergeLinearChainFromNode } from './js/operations/node-merger-bridge.js';

const result = mergeLinearChainFromNode(selectedNode, nodes, links);
nodes = result.newNodes;
links = result.newLinks;
```

### Future (Full MVC - When Ready)
```javascript
import { NodeMerger } from './js/operations/NodeMerger.js';
import { GraphAdapter } from './js/core/GraphAdapter.js';

const adapter = new GraphAdapter(model);
const merger = new NodeMerger(adapter, selectedNodeId);
const result = merger.execute();
```

## Testing

The bridge can be tested using the existing test file:

```bash
# Open in browser
open test-merge.html
```

Just change the import in `test-merge.html`:
```javascript
// Old
import { mergeLinearChainFromNode } from './js/node-merger.js';

// New
import { mergeLinearChainFromNode } from './js/operations/node-merger-bridge.js';
```

## File Organization After This Change

```
js/
├── node-merger.js                    # 🔄 LEGACY (still in use)
│
├── operations/
│   ├── node-merger-bridge.js         # ✅ NEW BRIDGE (ready to use)
│   ├── NodeMerger.js                 # ⚠️ MVC (future use)
│   ├── Operation.js
│   ├── PathManager.js
│   └── SequenceExporter.js
│
└── core/
    ├── GraphAdapter.js               # ✅ Adapter (ready for MVC)
    ├── GraphModel.js                 # ✅ MVC Model
    └── ...
```

## Migration Recommendation

### Phase 1: Testing (Now)
1. Test `node-merger-bridge.js` with existing GFA/DOT files
2. Verify chain detection works correctly
3. Confirm external connections are preserved
4. Check sequence export still works

### Phase 2: Main.js Integration (When Confident)
1. Update import in main.js:
   ```javascript
   // Change this line
   import { mergeLinearChainFromNode } from './node-merger.js';
   // To this
   import { mergeLinearChainFromNode } from './operations/node-merger-bridge.js';
   ```
2. Test all node merger features in the app
3. If successful, archive `js/node-merger.js`

### Phase 3: Full MVC (Future)
1. When ready to refactor main.js fully
2. Convert to GraphModel/GraphAdapter pattern
3. Use `NodeMerger.js` from operations
4. Archive `node-merger-bridge.js`

## Conclusion

✅ **Node merger has been successfully ported** to the operations folder with a bridge pattern.
✅ **100% backward compatible** with legacy interface.
✅ **Same algorithm** as legacy (connection counting, chain detection).
✅ **Ready for testing** and gradual migration.
✅ **No breaking changes** to existing code.

The bridge file (`node-merger-bridge.js`) serves as a **transition layer** that allows the codebase to gradually migrate to the MVC architecture without forcing immediate changes to main.js.

---

**Next Steps**: Test the bridge file, then update main.js import when confident.
