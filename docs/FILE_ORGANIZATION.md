# VizTool File Organization

## Current Directory Structure

```
VizTool/
├── index.html                      # Main HTML file, initializes MVC
├── CLAUDE.md                       # Project documentation for AI
├── ARCHITECTURE.md                 # Architecture documentation
├── FILE_ORGANIZATION.md            # This file
│
├── css/
│   └── styles.css                  # All styling
│
├── js/
│   ├── main.js                     # Entry point (hybrid: uses new parsers + legacy operations)
│   │
│   ├── core/                       # MVC Core Components ✅ NEW (in use)
│   │   ├── EventEmitter.js         # Event system base class
│   │   ├── GraphModel.js           # MVC Model
│   │   ├── GraphView.js            # MVC View
│   │   ├── GraphController.js      # MVC Controller
│   │   ├── LayoutManager.js        # Layout coordination
│   │   └── LegacyBridge.js         # Bridge to old code
│   │
│   ├── model/                      # Data Model ✅ NEW
│   │   ├── entities/               # Entity classes
│   │   │   ├── Node.js             # Base node
│   │   │   ├── GfaNode.js          # GFA node with orientation
│   │   │   ├── MergedNode.js       # Merged linear chain
│   │   │   ├── Edge.js             # Base edge
│   │   │   └── GfaEdge.js          # GFA edge with orientations
│   │   ├── Graph.js                # Core graph data structure
│   │   ├── GfaGraph.js             # GFA-specific operations
│   │   ├── Selection.js            # Selection state
│   │   ├── Transform.js            # Zoom/pan state
│   │   ├── History.js              # Undo/redo
│   │   └── PathCollection.js       # Path management
│   │
│   ├── view/                       # View Layer ✅ NEW
│   │   ├── renderers/              # Rendering engines
│   │   │   ├── Renderer.js         # Base renderer
│   │   │   ├── DotRenderer.js      # DOT format
│   │   │   └── GfaRenderer.js      # GFA Bandage-style
│   │   └── canvas/                 # Canvas management
│   │       ├── CanvasManager.js    # Canvas wrapper
│   │       └── CanvasInteraction.js # Mouse/touch events
│   │
│   ├── operations/                 # Operations ✅ NEW
│   │   ├── Operation.js            # Base operation (reversible)
│   │   ├── NodeMerger.js           # Linear chain merging
│   │   ├── PathManager.js          # Path updates
│   │   └── SequenceExporter.js     # Sequence reconstruction
│   │
│   ├── layout/                     # Layout Engines ✅ NEW
│   │   ├── LayoutEngine.js         # Base layout
│   │   └── ForceLayout.js          # D3 force-directed
│   │
│   ├── utils/
│   │   └── parsers/                # File Parsers ✅ NEW (in use by main.js)
│   │       ├── Parser.js           # Base parser
│   │       ├── DotParser.js        # DOT format
│   │       └── GfaParser.js        # GFA format
│   │
│   ├── renderer.js                 # 🔄 LEGACY (still used by GraphView)
│   ├── gfa-renderer.js             # 🔄 LEGACY (Bandage rendering)
│   ├── gfa-layout.js               # 🔄 LEGACY (GFA node layout)
│   ├── node-merger.js              # 🔄 LEGACY (linear chain logic)
│   ├── sequence-exporter.js        # 🔄 LEGACY (sequence reconstruction)
│   ├── path-updater.js             # 🔄 LEGACY (path updates)
│   ├── path-exporter.js            # 🔄 LEGACY (export to file)
│   ├── path-importer.js            # 🔄 LEGACY (import from file)
│   └── path-update-ui.js           # 🔄 LEGACY (update dialogs)
│
└── archive/                        # Archived Files
    ├── old_docs/                   # Progress documentation
    │   ├── INTEGRATION_FIXES.md
    │   ├── MVC_INTEGRATION_COMPLETE.md
    │   ├── PERFORMANCE_FIXES.md
    │   ├── REFACTORING_COMPLETE.md
    │   └── REFACTORING_PROGRESS.md
    └── old_implementation/         # Deprecated code
        ├── main.old.js             # Old main backup
        ├── simulation.js           # Replaced by ForceLayout
        ├── ui.js                   # Moved to MVC View
        └── parser.js               # ✅ Archived 2025-10-19 (replaced by DotParser/GfaParser)
```

## Status Legend

- ✅ **NEW**: Refactored MVC architecture (fully implemented and in use)
- ⚠️ **NEW (NOT USED)**: Refactored but blocked by interface mismatch
- 🔄 **LEGACY**: Old implementation (still in use)
- 📦 **ARCHIVED**: No longer in use, moved to archive

## Migration Progress

### Phase 1: New Architecture (✅ COMPLETE)
- [x] Base classes and patterns
- [x] Entity models
- [x] Model layer
- [x] View layer
- [x] Operations
- [x] Layout engines
- [x] Parsers
- [x] MVC core

### Phase 2: Integration (🔄 IN PROGRESS)
- [x] MVC system initialized in index.html
- [x] GraphController coordinates components
- [x] main.js uses new Parsers (DotParser, GfaParser) ✅ **COMPLETED 2025-10-19**
- [ ] main.js uses new Operations classes (BLOCKED - interface mismatch)
- [ ] Legacy files removed (partial - parser.js archived)

### Phase 3: Enhancement (📋 TODO)
- [ ] UI Component classes
- [ ] Dialog classes
- [ ] Unit tests
- [ ] API documentation

## File Count Summary

- **Active Files**: 53 JavaScript files
  - New MVC: 27 files
  - Legacy (active): 10 files
  - MVC Core: 6 files
  
- **Archived Files**: 8 files
  - Documentation: 5 files
  - Deprecated code: 3 files

## Import Relationships

### What uses what:

**New Architecture:**
- `GraphController` → `GraphModel`, `GraphView`, `LayoutManager`
- `GraphModel` → All model classes
- `GraphView` → Renderers, CanvasManager, CanvasInteraction
- `LayoutManager` → `ForceLayout`
- All Operations extend `Operation.js`
- All Parsers extend `Parser.js`
- All Renderers extend `Renderer.js`

**Legacy (still active):**
- `main.js` → `parser.js`, `gfa-renderer.js`, `node-merger.js`, etc.
- `GraphView.js` → `renderer.js`
- `renderer.js` → `gfa-renderer.js`
- `gfa-renderer.js` → `gfa-layout.js`

## Cleanup Guidelines

### ✅ Safe to Archive
Files moved to `archive/old_implementation/`:
- `main.old.js` - Old backup
- `simulation.js` - Replaced by ForceLayout.js
- `ui.js` - Functionality in MVC View

### ⚠️ Cannot Remove Yet
These files are still actively imported:
- `renderer.js` - Used by GraphView.js
- `gfa-renderer.js` - Used by renderer.js and main.js
- `gfa-layout.js` - Used by gfa-renderer.js
- `node-merger.js` - Used by main.js (new NodeMerger blocked by interface mismatch)
- `sequence-exporter.js` - Used by main.js (new SequenceExporter blocked)
- `path-updater.js` - Used by main.js (new PathManager blocked)
- `path-exporter.js`, `path-importer.js`, `path-update-ui.js` - Used by main.js

### 📝 Migration Path
To complete the migration:
1. ✅ ~~Update main.js to use new `DotParser` and `GfaParser`~~ **COMPLETED 2025-10-19**
2. ⏸️ Update new Operations classes to accept plain objects (interface blocker)
3. ⏸️ Then update main.js to use new `NodeMerger`, `PathManager`, `SequenceExporter`
4. ⏸️ Add missing features to new `GfaRenderer` (node flipping, dynamic rotation)
5. ⏸️ Then update GraphView.js to use new renderers
6. Remove legacy imports
7. Move legacy files to archive
8. Test all functionality
9. Update documentation

**See MIGRATION_STATUS.md for detailed blocker analysis and recommendations**

## Getting Started

### For Development
1. Open `index.html` in browser (or use local server)
2. MVC system initializes automatically
3. `main.js` sets up UI and event handlers
4. Both new MVC and legacy code work together

### For Understanding the Code
1. Start with `ARCHITECTURE.md` for overview
2. Read `index.html` to see MVC initialization
3. Look at `js/core/GraphController.js` to see coordination
4. Explore `js/model/` for data structures
5. Check `js/view/` for rendering
6. Review `js/operations/` for graph operations

### For Adding Features
1. Use new MVC architecture
2. Extend base classes (Operation, Renderer, etc.)
3. Use EventEmitter for communication
4. Add to appropriate layer (Model/View/Operations)
5. Update this documentation
