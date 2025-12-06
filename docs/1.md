# VizTool Architecture

## Current File Organization

### Active Implementation

The project currently uses a **hybrid architecture** with both new MVC classes and legacy implementation files working together.

#### New MVC Architecture (Refactored)

**Model Layer** (`js/model/`):
- `entities/` - Data model classes
  - `Node.js` - Base node class
  - `GfaNode.js` - GFA-specific node
  - `MergedNode.js` - Merged linear chain node
  - `Edge.js` - Base edge class
  - `GfaEdge.js` - GFA-specific edge with orientations
- `Graph.js` - Core graph data structure
- `GfaGraph.js` - GFA-specific graph operations
- `Selection.js` - Selection state management
- `Transform.js` - Zoom/pan transform state
- `History.js` - Undo/redo history
- `PathCollection.js` - Path collection management

**View Layer** (`js/view/`):
- `renderers/` - Rendering engines
  - `Renderer.js` - Base renderer class
  - `DotRenderer.js` - DOT format renderer
  - `GfaRenderer.js` - GFA Bandage-style renderer
- `canvas/` - Canvas management
  - `CanvasManager.js` - Canvas wrapper with HiDPI support
  - `CanvasInteraction.js` - Mouse/touch interaction handler

**Operations** (`js/operations/`):
- `Operation.js` - Base reversible operation
- `NodeMerger.js` - Linear chain merging operation
- `PathManager.js` - Path update operation
- `SequenceExporter.js` - DNA sequence reconstruction

**Layout Engines** (`js/layout/`):
- `LayoutEngine.js` - Base layout class
- `ForceLayout.js` - D3 force-directed layout wrapper

**Parsers** (`js/utils/parsers/`):
- `Parser.js` - Base parser class
- `DotParser.js` - DOT format parser
- `GfaParser.js` - GFA format parser

**Core** (`js/core/`):
- `EventEmitter.js` - Event system
- `GraphModel.js` - MVC Model
- `GraphView.js` - MVC View
- `GraphController.js` - MVC Controller
- `LayoutManager.js` - Layout coordination
- `LegacyBridge.js` - Bridge between old and new code

#### Legacy Implementation (Still Active)

These files are **still in use** by `main.js` and cannot be removed yet:

- ~~`parser.js`~~ - **✅ ARCHIVED 2025-10-19** (replaced by DotParser/GfaParser)
- `renderer.js` - Rendering router (imported by GraphView.js)
- `gfa-renderer.js` - GFA Bandage rendering (imported by renderer.js, main.js)
- `gfa-layout.js` - GFA node layout (imported by gfa-renderer.js)
- `node-merger.js` - Linear chain merging (imported by main.js) **⚠️ New version blocked**
- `sequence-exporter.js` - Sequence reconstruction (imported by main.js) **⚠️ New version blocked**
- `path-updater.js` - Path updates (imported by main.js) **⚠️ New version blocked**
- `path-exporter.js` - Path file export (imported by main.js)
- `path-importer.js` - Path file import (imported by main.js)
- `path-update-ui.js` - Path update dialogs (imported by main.js)

#### Entry Points

- `index.html` - Main HTML file, initializes MVC system
- `js/main.js` - Application entry point, uses both MVC and legacy code

### Archived Files

**`archive/old_docs/`** - Historical progress documentation:
- `INTEGRATION_FIXES.md`
- `MVC_INTEGRATION_COMPLETE.md`
- `PERFORMANCE_FIXES.md`
- `REFACTORING_COMPLETE.md`
- `REFACTORING_PROGRESS.md`

**`archive/old_implementation/`** - Deprecated implementation files:
- `main.old.js` - Old main.js backup
- `simulation.js` - Replaced by `layout/ForceLayout.js`
- `ui.js` - Functionality moved to MVC View
- `parser.js` - ✅ **Archived 2025-10-19** (replaced by DotParser/GfaParser)

## Migration Status

### ✅ Completed
- [x] Base class architecture (EventEmitter, Operation, LayoutEngine, Parser, Renderer)
- [x] Entity classes (Node, GfaNode, MergedNode, Edge, GfaEdge)
- [x] Model layer (Graph, GfaGraph, Selection, Transform, History, PathCollection)
- [x] View layer renderers (DotRenderer, GfaRenderer)
- [x] Canvas management (CanvasManager, CanvasInteraction)
- [x] Operations (NodeMerger, PathManager, SequenceExporter)
- [x] Layout engines (ForceLayout)
- [x] Parsers (DotParser, GfaParser)
- [x] MVC core (GraphModel, GraphView, GraphController)

### 🔄 In Progress
- [x] ~~Migrate main.js to use new Parsers~~ **✅ COMPLETED 2025-10-19**
- [ ] Update new Operations classes to accept plain objects (interface blocker)
- [ ] Migrate main.js to use new Operations classes
- [ ] Create UI Component classes (InfoPanel, MenuPanel, etc.)
- [ ] Create Dialog classes (ResolutionDialog, PathUpdateDialog, etc.)

### 📋 TODO
- [ ] Remove legacy implementation files once migration is complete
- [ ] Add unit tests for new architecture
- [ ] Create API documentation
- [ ] Performance optimization for large graphs

## Design Patterns Used

### EventEmitter Pattern
All major classes extend EventEmitter for loose coupling:
```javascript
model.on('nodeSelected', ({ nodeIds }) => {
  updateButtonStates();
});
```

### Operation Pattern
Reversible operations with undo/redo support:
```javascript
const operation = new NodeMerger(graph, startNodeId);
const result = operation.execute();
// Later...
operation.reverse(); // Undo
```

### Template Method Pattern
Base classes define structure, subclasses implement details:
```javascript
class DotRenderer extends Renderer {
  render(renderData) {
    this.clear();
    this.applyTransform(renderData.transform);
    // ... rendering logic ...
    this.restoreTransform();
  }
}
```

### MVC Pattern
Clear separation of concerns:
- **Model**: Data and business logic
- **View**: Rendering and user interaction
- **Controller**: Coordinates between Model and View

## Key Features

### GFA Support
- Bandage-style visualization with rounded rectangular nodes
- Curved edges between subnodes
- Node flipping and dynamic rotation
- Orientation handling (+/- semantics)

### Path Management
- Save multiple named paths with unique colors
- Import/export paths from/to files
- Automatic path updates after graph modifications
- DNA sequence reconstruction with overlap handling

### Graph Operations
- Linear chain detection and merging
- Vertex resolution (logical and physical modes)
- Undo/redo support
- Node pinning for layout

### Rendering
- High-DPI canvas support
- Zoom and pan with D3 integration
- Dynamic path highlighting
- Selection visualization

## File Dependencies

```
index.html
  └─ js/main.js
      ├─ js/parser.js (legacy)
      ├─ js/gfa-renderer.js (legacy)
      │   └─ js/gfa-layout.js
      ├─ js/node-merger.js (legacy)
      ├─ js/sequence-exporter.js (legacy)
      ├─ js/path-updater.js (legacy)
      ├─ js/path-exporter.js (legacy)
      ├─ js/path-importer.js (legacy)
      └─ js/path-update-ui.js (legacy)

index.html (MVC initialization)
  └─ js/core/GraphController.js
      ├─ js/core/GraphModel.js
      │   ├─ js/model/Graph.js
      │   ├─ js/model/GfaGraph.js
      │   ├─ js/model/Selection.js
      │   ├─ js/model/Transform.js
      │   ├─ js/model/History.js
      │   └─ js/model/PathCollection.js
      ├─ js/core/GraphView.js
      │   ├─ js/renderer.js (legacy)
      │   ├─ js/view/canvas/CanvasManager.js
      │   └─ js/view/canvas/CanvasInteraction.js
      └─ js/core/LayoutManager.js
          └─ js/layout/ForceLayout.js
```

## Migration Status

**Current Status**: Partial Migration Complete (Parsers ✅, Operations ⏸️, Renderers ⏸️)

### ✅ Completed
- Parser migration (DotParser, GfaParser replacing parser.js)
- Archived parser.js to archive/old_implementation/

### ⏸️ Blocked
- **Operations Migration**: Interface mismatch between new Operations (expect Graph objects) and legacy (use plain arrays)
- **Renderer Migration**: New renderers missing features (node flipping, dynamic rotation in GFA)

**See `MIGRATION_STATUS.md` for detailed analysis and recommendations**

## Next Steps

1. **Fix Operations Interface**: Update new Operations to accept plain objects OR refactor main.js to use Graph class
2. **Complete Migration**: Once interface is fixed, update main.js to use new Operations
3. **Add Renderer Features**: Implement missing GFA features in new renderers
4. **Remove Legacy Files**: Once migration is complete, move legacy files to archive
5. **Add Tests**: Create unit tests for core functionality
6. **Documentation**: Generate API docs from JSDoc comments
7. **Optimization**: Profile and optimize rendering for large graphs (>1000 nodes)

## Contributing

When adding new features:
1. Use the existing MVC architecture
2. Extend base classes where appropriate
3. Use EventEmitter for component communication
4. Follow the Operation pattern for reversible actions
5. Add JSDoc comments for all public methods
