# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VizTool is a **graph visualization tool** built with vanilla JavaScript that renders and manipulates assembly graphs in both **DOT** and **GFA** (Graphical Fragment Assembly) formats. The tool specializes in genome assembly visualization with Bandage-style rendering, featuring path management, node merging, and sequence reconstruction capabilities.

## Development Commands

### Running the Application
This is a **client-side only** application with no build step required:
- Open `index.html` directly in a web browser
- Alternatively, use a local server: `python3 -m http.server 8000` then visit `http://localhost:8000`

### No Build System
- **Pure vanilla JavaScript** with ES6 modules
- No package.json, npm, or build tools
- Dependencies loaded via CDN (D3.js, graphlib)

### Testing
- No automated test suite
- Manual testing via the browser interface
- Use the debug panel in UI (id="debug") for runtime logs

## Architecture

### Core Module Structure

**Entry Point: `main.js`**
- Orchestrates all functionality
- Manages global state (nodes, links, selected items, paths, history)
- Handles D3 force simulation and canvas zoom/pan
- Implements undo/redo via history stack
- Coordinates between different subsystems (rendering, vertex resolution, merging, paths)

**Data Flow:**
```
User Input → main.js → Parser → Simulation → Renderer
                    ↓              ↓
                Vertex Resolution  Path Management
                Node Merging       Sequence Export
```

### Key Subsystems

#### 1. File Parsing (`parser.js`)
- **DOT format**: Uses graphlib-dot library with regex fallback
- **GFA format**: Custom parser handling S (segments), L (links), E (edges), P (paths) lines
- **GFA metadata**: Extracts depth (DP), length (LN), k-mer count (KC), read count (RC) tags
- Both formats produce normalized `{nodes, links}` structure

#### 2. Rendering System

**DOT Rendering (`renderer.js`):**
- Simple circular nodes with standard edges
- Color coding via Graphlib attributes
- Dynamic path highlighting with configurable colors

**GFA Rendering (`gfa-renderer.js` + `gfa-layout.js`):**
- **Bandage-style visualization**: Rounded rectangular nodes with depth-based width
- **Subnodes**: Each segment has incoming (red) and outgoing (green) subnodes at ends
- **Node flipping**: Nodes can be rotated 180° to change orientation
- **Curved edges**: Bezier curves between subnodes based on GFA orientations (+/-)
- **Dynamic rotation**: Nodes automatically orient toward connected neighbors
- **Auto-scaling**: Node lengths scaled based on total graph size (megabases)

#### 3. Graph Layout (`simulation.js`)
- D3 force-directed layout with custom forces
- Charge, link, and center forces
- Pinning support (fix node positions via fx/fy)

#### 4. Vertex Resolution
**Two resolution modes implemented in `main.js`:**

**Logical Resolution** (`getVertexConnections`, `generatePathCombinations`):
- Resolves based on source→target connections
- Creates new vertices for each incoming×outgoing path combination
- Shows dialog allowing path selection

**Physical Resolution** (`getPhysicalConnections`, `generatePhysicalCombinations`):
- GFA-specific: resolves based on red/green subnode connections
- Respects orientation signs (+/-) in GFA links
- Creates vertices for each red×green subnode combination

**Key Functions:**
- `showResolveDialog()` / `showPhysicalResolveDialog()` - UI dialogs
- `performVertexResolution()` / `performPhysicalResolution()` - execute resolution
- `updatePathsAfterResolution()` in `path-updater.js` - updates saved paths when vertices split

#### 5. Linear Chain Merging (`node-merger.js`)

**Algorithm:**
1. Select any node in a potential linear chain
2. System automatically traces backwards and forwards
3. Stops at branch points (nodes with >2 total connections)
4. Merges all linear nodes (≤2 connections) into single merged node
5. Preserves external connections to/from the chain

**Key Features:**
- Connection counting: in + out ≤ 2 = linear, >2 = branching
- Stores original nodes and links inside merged node for sequence reconstruction
- Updates saved paths to replace merged nodes
- Export merged sequence functionality

**Important Functions:**
- `mergeLinearChainFromNode()` - main entry point
- `findLinearChain()` - bidirectional chain detection
- `buildNodeConnections()` - simple connection analysis
- `updatePathsAfterMerge()` - path updates after merging

#### 6. Path Management

**Multi-path System:**
- Save multiple named paths with unique colors (10-color palette)
- Navigate between saved paths (prev/next)
- Import paths from text files (format: `node1,node2,node3 /Path Name`)
- Export all paths or individual path sequences
- Paths automatically updated after vertex resolution or node merging

**Path State:**
- `savedPaths[]` - array of path objects with nodes, edges, color, name
- `currentPathIndex` - currently displayed path (-1 = none)
- `highlightedPath` - current highlight state (nodes, edges, color)

**Key Files:**
- `path-importer.js` - parse and import path files
- `path-exporter.js` - export paths to files
- `path-updater.js` - update paths after graph modifications
- `path-update-ui.js` - UI dialogs for path changes

#### 7. Sequence Reconstruction (`sequence-exporter.js`)

**Enhanced GFA Sequence Reconstruction:**
- **Intelligent Starting Orientation**: Analyzes GFA link between first two nodes to determine optimal starting orientations (not arbitrary +)
- **Bidirectional Link Support**: Handles both direct (A→B) and reverse (B→A) GFA links
- **Comprehensive Orientation Testing**: Tests all 4 orientation combinations (++, +-, -+, --) for each step
- **Overlap Quality Analysis**: Calculates similarity scores for overlaps, inserts diagnostic gaps for poor matches
- **Merged Node Support**: Recursively reconstructs sequences from merged linear chains

**Reconstruction Process:**
1. For first two nodes: find GFA link and determine both orientations
2. For each subsequent step: search for link, test all orientations if overlap exists
3. Best orientation chosen by sequence similarity at overlap regions
4. Merge sequences with overlap removal or gap insertion based on quality
5. Generate HTML report with color-coded segments and diagnostics

**Key Functions:**
- `reconstructSequenceFromPath()` - main reconstruction engine
- `findLinkForPathStepWithDiagnostics()` - enhanced link search with orientation testing
- `diagnoseAllOrientationCombinations()` - tests all 4 orientations
- `mergeSequencesWithOverlap()` - merge with quality-based overlap handling
- `getMergedNodeSequence()` - handles merged nodes recursively

**Output Format:**
- HTML file with color-coded sequence visualization
- Detailed diagnostics (success rates, link usage, orientation choices)
- Segment-by-segment breakdown with orientations shown (e.g., `nodeA+ → nodeB-`)

#### 8. UI Management (`ui.js`)
- Event handlers for all buttons and inputs
- File upload handling
- Keyboard shortcuts (Enter, Ctrl+Enter for paths, Ctrl+I for import, Ctrl+E for export)

### State Management

**Global State (in `main.js`):**
```javascript
let nodes = []              // Node objects with x, y, id, properties
let links = []              // Edge objects with source, target, properties
let selected = {            // Selection state
  nodes: Set,
  edges: Set
}
let pinnedNodes = Set       // IDs of pinned nodes
let highlightedPath = {     // Current highlight state
  nodes: Set,
  edges: Set,
  currentColor: string
}
let savedPaths = []         // Array of saved path objects
let currentPathIndex = -1   // Currently displayed path
let history = []            // Undo stack (max 20 entries)
let currentFormat = 'dot'   // 'dot' or 'gfa'
```

**Window Globals:**
- `window.nodes`, `window.links` - expose to other modules
- `window.updateUIForFormat()` - defined in index.html, called from main.js

### Data Structures

**Node Object:**
```javascript
{
  id: string|number,
  x: number,              // Position (from simulation)
  y: number,
  seq: string,            // GFA: sequence or '*'
  length: number,         // GFA: sequence length
  depth: number,          // GFA: coverage depth
  gfaType: 'segment',     // GFA: node type marker

  // Optional (after pinning)
  fx: number,
  fy: number,

  // Merged nodes only
  mergedFrom: [ids],
  pathName: string,
  originalNodes: [nodes],
  originalLinks: [links]
}
```

**Link Object:**
```javascript
{
  source: id|node,          // ID or object reference
  target: id|node,

  // GFA-specific
  srcOrientation: '+' | '-',
  tgtOrientation: '+' | '-',
  overlap: string,          // CIGAR format (e.g., "75M")
  gfaType: 'link' | 'path'
}
```

**Path Object:**
```javascript
{
  id: number,
  name: string,
  sequence: string,         // Comma-separated node IDs
  nodes: Set,
  edges: Set,
  color: string,           // From 10-color palette
  timestamp: Date,

  // After updates
  mergeUpdated: boolean,
  updateReason: string
}
```

**GfaNode Class (in gfa-renderer.js):**
- Represents a node with subnodes and segments
- Properties: `id`, `x`, `y`, `angle`, `width`, `drawnLength`, `segments[]`, `inSubnode`, `outSubnode`, `isFlipped`
- Methods: `flip()`, `draw()`, `contains()`, `updatePosition()`, `calculateOptimalRotation()`

## Important Implementation Details

### Node Merging Details
- **Linear chain detection**: Count total connections (in + out), linear if ≤2
- **Branch point detection**: Stop at any node with >2 connections
- **Original data storage**: Merged nodes store `originalNodes` and `originalLinks` arrays for sequence reconstruction
- **External connection preservation**: Connections from external nodes redirected to merged node
- **Path updates**: All saved paths automatically updated to replace merged nodes

### GFA Orientation Semantics
- **Positive (+)**: Standard orientation, connects via outgoing end
- **Negative (-)**: Reverse complement, connects via incoming end
- **Link format**: `L source srcOri target tgtOri overlap`
- **Bidirectional links**: A link `L A + B +` can be interpreted as `B + → A +` in reverse
- **Subnodes**: Red dot = incoming end, Green dot = outgoing end

### Sequence Reconstruction Intelligence
- **Never assume**: First node orientation determined by actual GFA link, not always positive
- **Orientation testing**: For overlaps, all 4 combinations tested and scored by similarity
- **Diagnostic gaps**: Poor overlaps (<50% similarity) preserved with detailed diagnostic markers
- **Reusable first link**: First link info reused when processing second node (optimization)

### History and Undo
- History saved before: node removal, vertex resolution, node merging
- Maximum 20 history entries (older entries shift out)
- Undo restores both nodes and links

### Path Highlighting
- Each saved path has unique color from 10-color palette
- Colors rotate: red, teal, blue, green, yellow, pink, light blue, purple, cyan, orange
- Current path's color used for highlights in both DOT and GFA rendering

## Common Tasks

### Adding a New Button/Feature
1. Add button to `index.html` in appropriate section
2. Add event handler in `ui.js` `setupUI()` function
3. Implement handler function in `main.js` or create new module
4. Update `main.js` to call the handler
5. If modifying graph, add history entry before changes

### Adding Graph Modification Operation
```javascript
// 1. Save history
history.push({
  nodes: JSON.parse(JSON.stringify(nodes)),
  links: JSON.parse(JSON.stringify(links))
});
if (history.length > 20) history.shift();

// 2. Modify nodes/links
// ... your modification logic ...

// 3. Update global references
window.nodes = nodes;
window.links = links;

// 4. Update paths if needed
savedPaths = updatePathsAfterX(savedPaths, modificationData);

// 5. Restart simulation
startSimulation();

// 6. Update UI
updatePathUI();
drawGraph(ctx, canvas, transform, nodes, links, pinnedNodes, selected, currentFormat, highlightedPath);
```

### Working with GFA Format
- Always handle both string IDs and object references: `link.source.id || link.source`
- Use `normalizeNodeId()` for consistent ID comparison
- Check `currentFormat === 'gfa'` before using GFA-specific features
- Update UI visibility: call `window.updateUIForFormat(format)` after parsing

### Testing Sequence Reconstruction
1. Load a GFA file with overlaps
2. Create or import a path
3. Select the path and click "Export Sequence"
4. Check browser console for detailed diagnostic output
5. Open exported HTML file to view color-coded reconstruction
6. Look for "Intelligent Start" indicator and orientation decisions

### Debugging Tips
- **Console logging**: All major operations log to console with emojis (🔍, ✅, ❌, etc.)
- **Debug panel**: Text logged via `logEvent()` appears in `#debug` div
- **Visual inspection**: GFA subnodes (red/green dots) visible at high zoom levels
- **Info panel**: Click nodes to see connection counts and resolution info in `#infoContent`

## File Organization

```
index.html           - Main HTML structure and UI
css/styles.css       - All styling

js/main.js           - Entry point and orchestration
js/parser.js         - DOT and GFA parsing
js/renderer.js       - DOT rendering + router
js/gfa-renderer.js   - GFA Bandage-style rendering
js/gfa-layout.js     - GFA node layout algorithms
js/simulation.js     - D3 force simulation
js/ui.js             - UI event handlers

js/node-merger.js         - Linear chain detection and merging
js/sequence-exporter.js   - Sequence reconstruction and export
js/path-exporter.js       - Export paths to files
js/path-importer.js       - Import paths from files
js/path-updater.js        - Update paths after graph changes
js/path-update-ui.js      - Path update dialogs
```

## Known Constraints

- **No TypeScript**: Pure JavaScript, no type checking
- **No module bundler**: ES6 modules loaded directly by browser
- **Canvas-based**: All rendering on single canvas element, no SVG
- **Client-side only**: No backend, all processing in browser
- **Large graphs**: Performance degrades with >1000 nodes (force simulation bottleneck)
- **Browser compatibility**: Requires modern browser with ES6 module support

## Recent Major Changes

1. **Linear Chain Merging**: Simplified to connection counting only (in+out ≤2 = linear)
2. **Intelligent Starting Orientation**: First two nodes analyzed to determine starting orientations in sequence reconstruction
3. **Enhanced Orientation Testing**: All 4 orientation combinations tested with similarity scoring
4. **Merged Node Sequence Export**: Full support for exporting sequences of merged linear chains
5. **Path Auto-Update**: Paths automatically updated after vertex resolution and node merging
