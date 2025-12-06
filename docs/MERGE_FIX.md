# Node Merge Fix - October 2025

## Problem

The linear chain merge functionality stopped working after the MVC refactoring. When users clicked "Merge Linear Chain", nothing happened or errors occurred.

## Root Cause

The issue was in `js/node-merger.js`, specifically in the `buildNodeConnections()` function and related helper functions. The problem had two parts:

### 1. Inconsistent Node ID Handling

The merge logic was not consistently normalizing node IDs throughout the chain detection process. After D3's force simulation processes links, it converts:

```javascript
// From this (fresh from parser):
{ source: "1", target: "2" }

// To this (after D3 simulation):
{ source: nodeObjectRef, target: nodeObjectRef }
```

The code was extracting IDs in some places but not others, causing mismatches in the connection map lookups.

### 2. Missing Null-Safe Access

The original code used:
```javascript
const sourceId = normalizeNodeId(link.source.id || link.source);
```

This would fail when `link.source` was a string (not an object), because `"1".id` would be `undefined`, but the `|| link.source` fallback would still work. However, it wasn't using optional chaining, so if `link.source` was `null` or `undefined`, it would crash.

## Solution

Applied consistent ID normalization throughout all functions:

### Changes Made

1. **buildNodeConnections()** - Updated to use proper null-safe access:
```javascript
// Before
const sourceId = normalizeNodeId(link.source.id || link.source);

// After
const sourceId = normalizeNodeId(
  link.source?.id !== undefined ? link.source.id : link.source
);
```

2. **getLinearPreviousNode()** - Added ID normalization:
```javascript
// Before
const conn = connections.get(currentNode.id);

// After
const currentId = normalizeNodeId(currentNode.id);
const conn = connections.get(currentId);
```

3. **getLinearNextNode()** - Added ID normalization (same pattern as above)

4. **isLinearOrEndpointNode()** - Added ID normalization:
```javascript
// Before
const conn = connections.get(nodeId);

// After
const normalizedId = normalizeNodeId(nodeId);
const conn = connections.get(normalizedId);
```

5. **findLinearChain()** - Normalized IDs for visited set:
```javascript
// Before
const visitedIds = new Set([startNode.id]);

// After
const startNodeId = normalizeNodeId(startNode.id);
const visitedIds = new Set([startNodeId]);

// And when adding to visited:
visitedIds.add(normalizeNodeId(prevNode.id));
```

6. **Added debug logging** to help diagnose future issues:
```javascript
console.log(`Total nodes in graph: ${nodes.length}`);
console.log(`Total links in graph: ${links.length}`);
console.log(`Sample link structure:`, links[0]);
```

## Testing

The fix ensures that:

1. ✅ Linear chains are correctly detected regardless of how links are structured
2. ✅ Connection counting works with both string IDs and object references
3. ✅ Cycle detection works correctly with normalized IDs
4. ✅ Branching nodes are correctly identified and rejected
5. ✅ Debug output helps identify future issues

## Files Modified

- `js/node-merger.js` - All chain detection and connection analysis functions

## Verification

To verify the fix is working:

1. Load a GFA or DOT file with linear chains
2. Select any node in a linear path (≤2 total connections)
3. Click "Merge Linear Chain"
4. The chain should be automatically detected and merged
5. Check console for detailed debug logs showing the chain detection process

## Example Console Output (Success)

```
🔍 === AUTOMATIC LINEAR CHAIN DETECTION ===
Starting from node: utg000002l
Total nodes in graph: 156
Total links in graph: 185
Sample link structure: {source: {…}, target: {…}, srcOrientation: '+', tgtOrientation: '+', ...}

🔗 === FINDING LINEAR CHAIN FROM utg000002l ===
📋 Building SIMPLE connections from 185 links...

📊 === SIMPLE CONNECTION COUNTS ===
  Node utg000001l: 0 in, 1 out → endpoint
  Node utg000002l: 1 in, 1 out → linear
  Node utg000003l: 1 in, 1 out → linear
  ...

🔍 Start node utg000002l: 1 in, 1 out
  ⬅️ Added utg000001l to start of chain
  ➡️ Added utg000003l to end of chain
  ➡️ Added utg000004l to end of chain

📊 Final chain: utg000001l → utg000002l → utg000003l → utg000004l
✅ Chain validation successful!
✅ Successfully merged linear chain: utg000001l → utg000002l → utg000003l → utg000004l into MERGED_...
```

## Technical Notes

The `normalizeNodeId()` function (defined at the bottom of node-merger.js) simply converts any ID to a trimmed string:

```javascript
function normalizeNodeId(nodeId) {
  return String(nodeId).trim();
}
```

This ensures that:
- Numeric IDs (e.g., `1`) and string IDs (e.g., `"1"`) are treated as identical
- Leading/trailing whitespace doesn't cause mismatches
- Object lookups in Maps work consistently

## Related Issues

This fix resolves the interface mismatch described in:
- `MIGRATION_STATUS.md` - Section 2: Operations (BLOCKED)
- `CLEANUP_SUMMARY.md` - Interface incompatibility section

The legacy operations still work with plain objects (arrays of nodes/links), which is what the MVC model provides via its getter methods.
