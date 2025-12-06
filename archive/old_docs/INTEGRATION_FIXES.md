# MVC Integration Fixes

## Issues Found After Initial Testing

### 1. Node Flipping Not Working ✅ FIXED
**Problem**: GFA node flipping wasn't working because `_gfaNodes` property is attached to the View's nodes array, not the Model's.

**Root Cause**:
- GFA renderer creates `_gfaNodes` property on the nodes array it draws
- In MVC architecture, View has its own copy of nodes
- Flip function was being called on `model.nodes` which doesn't have `_gfaNodes`

**Fix Applied**:
```javascript
// OLD (broken):
const flipped = flipSelectedNode(model.nodes, { nodes: selectedNodes });

// NEW (fixed):
const flipped = flipSelectedNode(view._nodes, { nodes: selectedNodes });
```

**Location**: `js/main.js` line 656

### 2. Linear Chain Merging Not Working
**Problem**: Node merging functionality isn't executing properly.

**Possible Root Causes**:
1. D3 simulation converts link source/target from IDs to node objects
2. The merger expects string IDs but gets node objects
3. View and Model have separate node/link arrays

**Diagnostic Steps**:
1. Check browser console for errors during merge
2. Verify that `mergeLinearChainFromNode` is being called
3. Check if the function returns `{success: true}`
4. Verify error messages in the catch block

**Expected Behavior**:
- User selects one node in a linear chain
- Clicks "Merge Linear Chain" button
- System should:
  1. Detect chain by tracing backwards/forwards
  2. Create merged node with combined properties
  3. Remove original nodes
  4. Update paths to reference merged node
  5. Restart layout with new graph

### 3. General Integration Issues

**View vs Model Synchronization**:
- View has its own copies of nodes/links for rendering
- Model has the canonical copies
- Some operations need View's copies (GFA rendering)
- Some operations need Model's copies (graph operations)

**Solution Strategy**:
Keep both synchronized:
```javascript
// After operations that modify graph structure:
view.updateNodes(model.nodes);
view.updateLinks(model.links);
view.render();
```

## Testing Checklist

After fixes are applied, test these scenarios:

### GFA Node Flipping
- [ ] Load a GFA file
- [ ] Select a node
- [ ] Click "Flip Node" button
- [ ] Verify node rotates 180 degrees
- [ ] Check info panel shows "Flipped: Yes"
- [ ] Verify red/green subnodes swap positions

### Linear Chain Merging
- [ ] Load a graph with linear chains
- [ ] Select a node that's part of a chain
- [ ] Click "Merge Linear Chain" button
- [ ] Verify console shows chain detection
- [ ] Verify merged node appears
- [ ] Verify original nodes are removed
- [ ] Click merged node to see info
- [ ] Click "Export Merged Sequence" button

### Vertex Resolution
- [ ] Select a node with multiple connections
- [ ] Click "Resolve Vertex" (logical)
- [ ] Choose paths to keep
- [ ] Verify new vertices are created
- [ ] Test "Resolve Physical" (GFA only)

### Path Management
- [ ] Save a path with node sequence
- [ ] Navigate between paths
- [ ] Import paths from file
- [ ] Export all paths
- [ ] Export sequence for a path
- [ ] Verify paths update after resolution/merge

## Debug Commands

Use these in browser console to diagnose issues:

```javascript
// Check MVC system
console.log('MVC:', window.graphApp);
console.log('Model nodes:', window.graphApp.model.nodes.length);
console.log('View nodes:', window.graphApp.view._nodes.length);

// Check GFA nodes
console.log('GFA nodes:', window.graphApp.view._nodes._gfaNodes);

// Check selection
console.log('Selected:', window.graphApp.model.selectedNodes);

// Test merge manually
const selectedNodeId = Array.from(window.graphApp.model.selectedNodes)[0];
const selectedNode = window.graphApp.model.getNode(selectedNodeId);
console.log('Selected node:', selectedNode);

// Check links format
console.log('Sample link:', window.graphApp.model.links[0]);
console.log('Link source type:', typeof window.graphApp.model.links[0].source);
```

## Next Steps

1. **Test node flipping** - Should work now with View fix
2. **Debug node merging**:
   - Open browser console
   - Try to merge a chain
   - Check for JavaScript errors
   - Check console.log output from merger
   - Report exact error message
3. **Test vertex resolution** - Should work as-is
4. **Test path operations** - Should work as-is

## Files Modified

1. `js/main.js` (line 656) - Fixed flip to use view._nodes
2. `js/core/GraphView.js` - Fixed click detection
3. `js/core/GraphController.js` - Optimized rendering
4. `js/core/LayoutManager.js` - Added throttling

## Rollback

If issues persist:
```bash
# Restore from backup
cp js/main.old.js js/main.js
git restore index.html

# Or just revert specific changes
git diff js/main.js  # Review changes
git restore js/main.js  # Revert if needed
```

---

**Status**: Flipping fixed, merging under investigation
**Date**: 2025-10-13
**Next**: Test in browser and check console for merge errors
