# GFA Rendering System Explained

**Files**: `gfa-renderer.js` (757 lines) + `gfa-layout.js` (135 lines)

## Overview

The GFA rendering system implements **Bandage-style visualization** for genome assembly graphs. It renders nodes as rounded, arrow-headed rectangles with proper orientation and curved edges connecting specific subnodes based on GFA orientation semantics.

---

## Two-File Architecture

### 1. **gfa-renderer.js** - Visual Rendering
**Purpose**: Handles all visual aspects - drawing nodes, edges, calculating dimensions, managing colors

**Key Responsibilities**:
- Creating and rendering GFA node objects
- Drawing curved edges between subnodes
- Managing node appearance (colors, labels, arrows)
- Handling visual interactions (selection, highlighting)
- Implementing node flipping functionality

### 2. **gfa-layout.js** - Node Orientation
**Purpose**: Calculates optimal rotation angles for nodes based on their connections

**Key Responsibilities**:
- Analyzing node connections (incoming/outgoing)
- Calculating optimal orientation angles
- Smoothing angles for linear paths
- Ensuring nodes point in the direction of flow

---

## Core Concepts

### 1. Bandage-Style Nodes

**What are they?**
Nodes are rendered as **rounded rectangles with arrow heads** at the outgoing end, similar to the Bandage genome visualizer.

**Visual Structure**:
```
    ┌─────────────────────►
    │
    │    NODE_ID
    │
    └─────────────────────►
    ↑                      ↑
  RED DOT              GREEN DOT
  (incoming)           (outgoing)
```

**Key Properties**:
- **Width**: Based on coverage depth (higher depth = wider node)
- **Length**: Based on sequence length, auto-scaled to fit graph
- **Angle**: Rotation to point toward connected nodes
- **Rounded ends**: Smooth caps at both ends
- **Arrow head**: Points in outgoing direction

### 2. Subnodes (Connection Points)

**Critical Concept**: Each GFA node has TWO connection points called **subnodes**:

1. **Incoming Subnode (Red)**:
   - Located at the START of the node
   - Represents the node's incoming end
   - Corresponds to `-` orientation in GFA

2. **Outgoing Subnode (Green)**:
   - Located at the END of the node (arrow tip)
   - Represents the node's outgoing end
   - Corresponds to `+` orientation in GFA

**Why Subnodes Matter**:
GFA edges don't just connect nodes - they connect **specific ends** of nodes based on orientation:
- `A+ → B+` means: A's green end connects to B's red end
- `A- → B+` means: A's red end connects to B's red end
- `A+ → B-` means: A's green end connects to B's green end
- `A- → B-` means: A's red end connects to B's green end

**Visual at High Zoom**:
```
When zoomed in (transform.k > 1.5):
  ● (red dot) at incoming end
  ● (green dot) at outgoing end
```

---

## gfa-renderer.js Deep Dive

### Main Components

#### 1. **GFA_SETTINGS Object** (Lines 6-19)

Configuration constants matching Bandage defaults:

```javascript
const GFA_SETTINGS = {
  averageNodeWidth: 12.0,           // Base width
  depthPower: 0.5,                  // How depth affects width
  depthEffectOnWidth: 0.8,          // Depth width multiplier
  nodeSegmentLength: 25,            // Smoothness of curves
  minimumNodeLength: 10,            // Minimum drawn length
  edgeLength: 40,                   // Space between nodes
  minDepth: 0.1,                    // Depth bounds
  maxDepth: 50,
  meanNodeLength: 50.0,             // Target average length
  minTotalGraphLength: 2000.0,      // Minimum graph size
  autoNodeLengthPerMegabase: 5000.0 // Scaling factor (calculated)
};
```

#### 2. **Auto-Scaling System** (Lines 22-45)

**Function**: `calculateAutoNodeLength(nodes)`

**Purpose**: Dynamically scale node lengths to fit the graph nicely on screen

**Algorithm**:
1. Sum total sequence length of all nodes (in base pairs)
2. Calculate total megabases: `megabases = totalLength / 1,000,000`
3. Determine target drawn graph length (minimum 2000 pixels)
4. Calculate scaling factor: `autoNodeLengthPerMegabase = targetDrawnGraphLength / megabases`

**Example**:
- Graph with 10 Mb total → scale factor ≈ 200 (pixels per Mb)
- Graph with 100 kb total → scale factor ≈ 20,000 (pixels per Mb)
- Result: Small graphs scaled up, large graphs scaled down

#### 3. **GfaNode Class** (Lines 166-556)

**The Heart of the System**: Each node is an instance of this class

##### Constructor Properties:
```javascript
{
  id: "nodeA",              // Node identifier
  depth: 15.2,              // Coverage depth
  length: 5000,             // Sequence length (bp)
  seq: "ACGT...",           // Sequence (or '*')
  x: 100, y: 200,           // Center position
  angle: 0.5,               // Rotation angle (radians)
  isFlipped: false,         // User flipped?
  width: 18.5,              // Calculated width
  drawnLength: 125,         // Calculated length
  segments: [{x, y}, ...],  // Points along node
  inSubnode: {...},         // Red connection point
  outSubnode: {...}         // Green connection point
}
```

##### Key Methods:

**`calculateWidth()`** (Lines 356-361):
- Uses depth to determine width
- Formula: `width = averageWidth × (depth^0.5 - 1) × 0.8 + 1`
- Higher depth = wider node
- Minimum width: 4 pixels

**`calculateDrawnLength()`** (Lines 363-367):
- Converts bp length to pixels
- Formula: `drawnLength = autoScale × length / 1,000,000 × scaleFactor`
- Minimum length: 10 pixels

**`createSegments()`** (Lines 375-386):
- Divides node into multiple segments for smooth curves
- Number of segments based on drawn length / 25
- Creates array of {x, y} points along node centerline

**`createSubnodes()`** (Lines 229-249):
- Creates incoming (red) and outgoing (green) subnodes
- Each subnode has: id, parentId, type, x, y, radius
- Initially positioned at node center

**`updateSubnodePositions()`** (Lines 252-263):
- Positions subnodes at exact node ends
- Uses node angle and half-length:
  ```javascript
  inSubnode.x = centerX - cos(angle) × halfLength
  inSubnode.y = centerY - sin(angle) × halfLength
  outSubnode.x = centerX + cos(angle) × halfLength
  outSubnode.y = centerY + sin(angle) × halfLength
  ```

**`flip()`** (Lines 188-210):
- Rotates node 180°
- Swaps incoming/outgoing subnodes
- Updates positions
- Used for manual node orientation

**`draw()`** (Lines 453-546):
- **Main rendering method**
- Steps:
  1. Transform segments to screen coordinates
  2. Create smooth rounded path with arrow
  3. Fill with color (hue based on node ID)
  4. Stroke with border (red if selected, orange if pinned)
  5. Draw label if zoomed in enough
  6. Draw red/green subnode dots if zoomed in (k > 1.5)

**`contains(x, y)`** (Lines 427-438):
- Hit detection for mouse clicks
- Checks distance to each segment
- Returns true if within width/2 + 3 pixels

#### 4. **Path Creation** (Lines 48-163)

**Function**: `createNodePath(segments, width)`

**Purpose**: Generate smooth Path2D object for rounded node shape with arrow

**Algorithm**:
1. Calculate perpendicular offsets for top/bottom edges
2. Create rounded start cap (semicircle)
3. Draw top edge using quadratic curves (smooth)
4. Create arrow head at end
5. Draw bottom edge using quadratic curves (reverse)
6. Close path

**Result**: Smooth, rounded node with arrow pointing in flow direction

#### 5. **Edge Direction Logic** (Lines 558-591)

**Function**: `determineEdgeDirection(sourceNode, targetNode, linkData)`

**Purpose**: Determine which subnodes to connect based on GFA orientations

**GFA Orientation Semantics**:
```javascript
if (srcOri === '+' && tgtOri === '+'):
  sourceNode.outSubnode → targetNode.inSubnode  // Green → Red

if (srcOri === '-' && tgtOri === '+'):
  sourceNode.inSubnode → targetNode.inSubnode   // Red → Red

if (srcOri === '+' && tgtOri === '-'):
  sourceNode.outSubnode → targetNode.outSubnode // Green → Green

if (srcOri === '-' && tgtOri === '-'):
  sourceNode.inSubnode → targetNode.outSubnode  // Red → Green
```

**Visual Example**:
```
Link: A + → B +
     ──────►    ◄──────
     │  A  │    │  B  │
     ──────►    ◄──────
           ╰─────╯
     Green connects to Red
```

#### 6. **Curved Edge Rendering** (Lines 593-625, 727-758)

**Function**: `createCurvedEdgePath(startX, startY, endX, endY, curvature)`

**Purpose**: Create smooth curved edges using quadratic Bezier curves

**Algorithm**:
1. Calculate midpoint between start and end
2. Calculate perpendicular vector
3. Offset control point perpendicular to edge
4. Create quadratic curve: `moveTo(start) → quadraticCurveTo(control, end)`

**Curvature**: 0.1 (10% of edge length offset)

**Visual**:
```
Start ●─────┐
            │  ← Control point offset
            └─────● End
```

#### 7. **Main Rendering Function** (Lines 671-725)

**Function**: `drawGfaGraph(ctx, canvas, transform, nodes, links, ...)`

**Entry Point**: Called by main renderer every frame

**Steps**:
1. **Create/Update GfaNode objects** (if first render or scale changed):
   - Calculate auto-scaling
   - Create GfaNode instances
   - Run layout algorithm
   - Cache in `nodes._gfaNodes`

2. **Update positions from D3 simulation**:
   - Copy x, y from D3 force simulation
   - Apply dynamic rotation (nodes auto-orient toward connections)

3. **Clear canvas**

4. **Draw all edges** (translucent, behind nodes):
   - Find source/target GfaNodes
   - Determine connection points (subnodes)
   - Draw curved edge
   - Highlight if in path

5. **Draw all nodes** (on top):
   - Selected state (red border)
   - Pinned state (orange border)
   - Highlighted state (bright red)

---

## gfa-layout.js Deep Dive

### Purpose

**Calculate optimal rotation angles** for GFA nodes so they point in the direction of flow.

### Main Function: `layoutGfaNodes(gfaNodes, links)` (Lines 4-134)

#### Phase 1: Build Connection Map (Lines 6-29)

Create adjacency lists for each node:
```javascript
connections = Map {
  "nodeA" => {
    incoming: [{ nodeId: "nodeX", orientation: "+" }, ...],
    outgoing: [{ nodeId: "nodeY", orientation: "+" }, ...]
  },
  ...
}
```

#### Phase 2: Calculate Base Angles (Lines 32-95)

For each node, determine optimal angle:

**Priority 1: Point toward outgoing edges**
```javascript
if (node has outgoing edges):
  Calculate average direction to all outgoing neighbors
  Set angle = atan2(avgY, avgX)
```

**Priority 2: Point away from incoming edges**
```javascript
else if (node has incoming edges):
  Calculate average direction away from incoming neighbors
  Set angle = atan2(avgY, avgX)
```

**Fallback: Default orientation**
```javascript
else:
  Set angle = 0 (horizontal, pointing right)
```

#### Phase 3: Smooth Linear Paths (Lines 101-132)

**Special handling for linear nodes** (1 incoming + 1 outgoing):

1. Get source node (incoming)
2. Get target node (outgoing)
3. Calculate flow direction through this node:
   - Direction from source to this node
   - Direction from this node to target
4. Average the two directions
5. Set angle to averaged direction

**Result**: Smooth curves through linear chains instead of sharp angles

**Visual Example**:
```
Before smoothing:
  A → B → C
      ↓
      (B points down)

After smoothing:
  A → B → C
      →
      (B points right, smooth flow)
```

---

## Complete Data Flow

### 1. Initial Render (First Frame)

```
main.js calls drawGraph()
  ↓
renderer.js routes to drawGfaGraph()
  ↓
gfa-renderer.js:
  ├─ calculateAutoNodeLength(nodes)  [Calculate scaling]
  ├─ Create GfaNode instances        [One per node]
  ├─ layoutGfaNodes(gfaNodes, links) [Calculate angles]
  ├─ Cache in nodes._gfaNodes        [Reuse next frame]
  └─ Draw edges + nodes
```

### 2. Animation Frame (D3 Simulation Running)

```
D3 force simulation updates node positions
  ↓
main.js calls drawGraph()
  ↓
gfa-renderer.js:
  ├─ Use cached nodes._gfaNodes      [No recreation]
  ├─ Update positions from D3        [Copy x, y]
  ├─ applyDynamicRotation()          [Smooth angle adjustment]
  └─ Draw edges + nodes
```

### 3. User Clicks Node

```
GraphView._onPointerDown()
  ↓
Hit detection: gfaNode.contains(x, y)
  ↓
If hit:
  └─ Emit nodeClick event
     ↓
     GraphController handles selection
```

### 4. User Flips Node (Shift+Click)

```
main.js detects Shift+Click
  ↓
flipSelectedNode(nodes, selected)
  ↓
gfaNode.flip():
  ├─ Rotate 180°
  ├─ Swap subnodes
  └─ Disable auto-rotation temporarily
```

### 5. Node Merging (Cache Invalidation)

```
NodeMerger.execute()
  ↓
GraphModel.mergeNodes()
  ↓
Emit 'nodesMerged' event
  ↓
GraphController listener
  ↓
GraphView.invalidateGfaNodes():
  └─ Delete nodes._gfaNodes
     └─ Delete nodes._lastScale
        ↓
Next frame: Full recreation with merged node
```

---

## Key Algorithms

### 1. Width Calculation (Depth-Based)

**Formula**:
```javascript
depthRelative = max(0.1, depth / 10)
widthMultiplier = (depthRelative^0.5 - 1) × 0.8 + 1
width = max(4, 12 × widthMultiplier)
```

**Example**:
- Depth 1 → Width ≈ 12px
- Depth 10 → Width ≈ 12px (reference)
- Depth 100 → Width ≈ 26px

### 2. Length Calculation (Auto-Scaled)

**Formula**:
```javascript
drawnLength = autoScale × (length / 1,000,000)
autoScale = targetGraphLength / totalMegabases
```

**Example**:
- 10 Mb graph, 1000 bp node → ~0.5px → clamped to 10px minimum
- 10 Mb graph, 100,000 bp node → ~50px
- 100 kb graph, 1000 bp node → ~20px (scaled up)

### 3. Subnode Positioning

**Formula**:
```javascript
halfLength = drawnLength / 2
cos_angle = cos(angle)
sin_angle = sin(angle)

inSubnode.x = centerX - cos_angle × halfLength
inSubnode.y = centerY - sin_angle × halfLength

outSubnode.x = centerX + cos_angle × halfLength
outSubnode.y = centerY + sin_angle × halfLength
```

**Visual**:
```
     angle = 30°
         ┌────────►
    ● ──┘          ●
   Red            Green
   (in)           (out)
```

### 4. Angle Calculation (Direction to Neighbors)

**Formula**:
```javascript
For each outgoing neighbor:
  dx = neighbor.x - node.x
  dy = neighbor.y - node.y
  normalize: dx/dist, dy/dist

Average normalized directions:
  avgX = sum(dx_normalized) / count
  avgY = sum(dy_normalized) / count

angle = atan2(avgY, avgX)
```

**Result**: Node points toward "center of mass" of outgoing neighbors

---

## Performance Optimizations

### 1. **Caching System**

**Where**: `nodes._gfaNodes` and `nodes._lastScale`

**Purpose**: Avoid recreating GfaNode objects every frame (expensive)

**When Recreated**:
- First render
- Scale factor changes
- Graph structure changes (via `invalidateGfaNodes()`)

**When Reused**:
- Every animation frame (D3 simulation)
- Only positions updated, not entire objects

### 2. **Path2D Objects**

**Where**: `createNodePath()`, `createCurvedEdgePath()`

**Purpose**: Native browser rendering primitives (fast)

**Benefit**: Browser optimizes path rendering internally

### 3. **Segment-Based Hit Detection**

**Where**: `GfaNode.contains()`

**Purpose**: Fast click detection without complex polygon math

**Algorithm**: Check distance to each line segment, return early if hit

### 4. **Conditional Rendering**

**Where**: `draw()` method

**Labels**: Only drawn when `transform.k > 0.3` (zoomed in)
**Subnodes**: Only drawn when `transform.k > 1.5` (very zoomed in)

**Benefit**: Reduce rendering cost when zoomed out

---

## Visual Examples

### Example 1: Simple Linear Chain

```
GFA Input:
  S A 1000 ACGT... DP:f:10.0
  S B 2000 TCGA... DP:f:15.0
  S C 1500 GGAT... DP:f:12.0
  L A + B + 50M
  L B + C + 75M

Visual Output:
  ──────► width=12  ──────────► width=15  ─────────► width=13
  │  A  │           │    B    │           │   C    │
  ──────► len=50    ──────────► len=100   ─────────► len=75
  Red●  Green●     Red●   Green●        Red●   Green●
        └────────────╯          └──────────╯
```

### Example 2: Branching Structure

```
GFA Input:
  S A 1000 ...
  S B 1000 ...
  S C 1000 ...
  L A + B + *
  L A + C + *

Visual Output:
              ╭─────► B
  A ──────►──┤
              ╰─────► C
```

### Example 3: Complex Orientations

```
GFA Input:
  L A + B - 50M   (A's green → B's green)

Visual Output:
  A ──────►       ◄────── B
            ╲    ╱
             ╲  ╱
              ╳    (Curve connects greens)
             ╱  ╲
            ╱    ╲
```

---

## Comparison to DOT Rendering

| Aspect | DOT Renderer | GFA Renderer |
|--------|-------------|--------------|
| **Node Shape** | Simple circles | Rounded rectangles with arrows |
| **Node Size** | Fixed radius | Width by depth, length by bp |
| **Edges** | Straight lines | Curved Bezier paths |
| **Connection Points** | Node centers | Specific subnodes (red/green) |
| **Orientation** | None | Nodes rotate toward flow |
| **Complexity** | ~50 lines | ~757 lines |
| **Features** | Basic | Flipping, subnodes, auto-scaling |

---

## Common Issues and Fixes

### Issue 1: Edges Not Showing After Merge
**Cause**: `nodes._gfaNodes` cache not invalidated
**Fix**: Call `view.invalidateGfaNodes()` when structure changes
**Location**: GraphController.js line 65

### Issue 2: Nodes Not Pointing Right Direction
**Cause**: Layout algorithm not running
**Fix**: Ensure `layoutGfaNodes()` called after creating GfaNodes
**Location**: gfa-renderer.js line 679

### Issue 3: Node Labels Unreadable
**Cause**: Zoom level too low
**Threshold**: Labels only show when `transform.k > 0.3`
**Solution**: User needs to zoom in more

### Issue 4: Subnodes Not Visible
**Cause**: Zoom level too low
**Threshold**: Subnodes only show when `transform.k > 1.5`
**Solution**: Zoom in significantly to see red/green dots

---

## Extension Points

### Adding New Node Types

**Where**: GfaNode constructor
**How**: Check `nodeData.gfaType` and customize rendering

### Custom Coloring

**Where**: `getColor()` method (line 420)
**Current**: HSL based on node ID hash
**Possible**: Color by depth, length, path membership, etc.

### Different Edge Styles

**Where**: `drawCurvedGfaEdge()` function (line 728)
**Current**: Quadratic Bezier curves
**Possible**: Straight lines, cubic curves, stepped edges

### Interactive Features

**Where**: Add event handlers in main.js
**Current**: Click selection, Shift+Click flipping
**Possible**: Double-click to inspect, drag subnodes to reconnect

---

## Summary

**gfa-renderer.js**: The visual engine
- Creates GfaNode objects with width/length/segments
- Renders rounded nodes with arrows
- Draws curved edges between subnodes
- Handles caching and performance
- Implements node flipping

**gfa-layout.js**: The orientation calculator
- Analyzes node connections
- Calculates optimal rotation angles
- Smooths angles for linear paths
- Ensures nodes point toward flow

**Together**: They create Bandage-style GFA visualization with proper orientation semantics, smooth curves, and efficient rendering.

---

**Last Updated**: 2025-10-28
**Total Lines**: 892 (757 + 135)
**Complexity**: High (genome assembly visualization)
**Status**: Production-ready, feature-complete
