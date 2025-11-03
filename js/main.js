// main.js - Refactored with MVC Architecture
// All functionality preserved, now using Model-View-Controller pattern

import { exportAllPathsToFile, showExportPreviewDialog, addExportStyles } from './utils/path/path-exporter.js';
import { importPathsFromText, showImportResultsDialog, addImportStyles } from './utils/path/path-importer.js';
import { DotParser } from './utils/parsers/DotParser.js';
import { GfaParser } from './utils/parsers/GfaParser.js';
import { updatePathsAfterResolution, showPathUpdateSummary } from './utils/path/path-updater.js';
import { showPathUpdateDialog, markUpdatedPathsInUI, addPathUpdateStyles } from './utils/path/path-update-ui.js';
import { exportPathSequence } from './operations/SequenceExporter.js';
import { GraphAdapter } from './core/GraphAdapter.js';
import { NodeMerger } from './operations/NodeMerger.js';
import { VertexResolution } from './operations/VertexResolution.js';
import { PhysicalVertexResolution } from './operations/PhysicalVertexResolution.js';
import { exportMergedNodeSequence, isMergedNode, getMergedNodeInfo, updatePathsAfterMerge } from './operations/node-merger-utils.js';

// ===== MVC SYSTEM INITIALIZATION =====

// Wait for MVC to be initialized from index.html
let mvc = null;
let model = null;
let view = null;
let controller = null;

function waitForMVC() {
  return new Promise((resolve) => {
    const check = () => {
      if (window.graphApp && window.graphApp.controller) {
        mvc = window.graphApp;
        model = mvc.model;
        view = mvc.view;
        controller = mvc.controller;
        resolve();
      } else {
        requestAnimationFrame(check);
      }
    };
    check();
  });
}

// Initialize after MVC is ready
waitForMVC().then(() => {
  console.log('[Main] MVC system ready, initializing application');
  initializeApplication();
});

// ===== LEGACY STATE (for complex operations that aren't migrated yet) =====
const legacy = {
  transform: null,
  currentFormat: 'dot'
};

// ===== APPLICATION INITIALIZATION =====

function initializeApplication() {
  // Initialize path update styles
  addPathUpdateStyles();
  addImportStyles();
  addExportStyles();

  // Setup UI event handlers
  setupUIHandlers();

  // Setup MVC event listeners for UI updates
  setupMVCListeners();

  // Setup legacy operations (vertex resolution, merging, etc.)
  setupLegacyOperations();

  // Store transform from view
  legacy.transform = view.transform;

  console.log('[Main] Application initialized');
}

// ===== UI EVENT HANDLERS =====

function setupUIHandlers() {
  // File loading
  document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      parseAndLoadGraph(reader.result, file.name);
    };
    reader.readAsText(file);
  });

  // Generate random graph
  document.getElementById('genRandom').onclick = () => {
    controller.generateRandomGraph(50);
    legacy.currentFormat = 'dot';
    if (window.updateUIForFormat) {
      window.updateUIForFormat('dot');
    }
  };

  // Reset view
  document.getElementById('resetView').onclick = () => {
    controller.resetView();
  };

  // Pin selected nodes
  document.getElementById('pinNode').onclick = () => {
    controller.pinSelectedNodes();
  };

  // Redraw layout
  document.getElementById('redraw').onclick = () => {
    controller.redraw();
  };

  // Remove selected nodes
  document.getElementById('removeNodes').onclick = () => {
    controller.removeSelectedNodes();
  };

  // Undo
  document.getElementById('undo').onclick = () => {
    controller.undo();
  };

  // Node click for selection and info display
  view.on('nodeClick', ({ nodeId }) => {
    handleNodeClick(nodeId);
  });

  // Canvas click to deselect
  view.on('canvasClick', () => {
    model.deselectNodes();
    document.getElementById('infoContent').innerHTML = 'Select a node or edge to see details here.';
  });

  // Path management
  setupPathManagement();

  // Path import/export
  setupPathImportExport();

  console.log('[Main] UI handlers setup complete');
}

// ===== MVC EVENT LISTENERS =====

function setupMVCListeners() {
  // Update UI when selection changes
  model.on('nodeSelected', ({ nodeIds }) => {
    updateButtonStates();
  });

  // Update UI when graph loads
  model.on('graphLoaded', ({ format }) => {
    legacy.currentFormat = format;
    if (window.updateUIForFormat) {
      window.updateUIForFormat(format);
    }
    logEvent(`Graph loaded: ${model.nodes.length} nodes, ${model.links.length} links`);
  });

  // Update path UI when paths change
  model.on('pathSaved', () => {
    updatePathUI();
  });

  model.on('pathRemoved', () => {
    updatePathUI();
  });

  model.on('pathSelected', () => {
    updatePathUI();
  });

  model.on('pathsCleared', () => {
    updatePathUI();
  });

  // History updates
  model.on('historyChanged', ({ canUndo }) => {
    document.getElementById('undo').disabled = !canUndo;
  });

  console.log('[Main] MVC listeners setup complete');
}

// ===== GRAPH PARSING AND LOADING =====

function parseAndLoadGraph(text, filename) {
  let format = filename.toLowerCase().endsWith('.gfa') ? 'gfa' : 'dot';

  // Auto-detect GFA content
  if (format === 'dot' && (/^H\t|^S\t/m).test(text)) {
    logEvent('→ Detected GFA content despite .dot extension; switching to GFA');
    format = 'gfa';
  }

  logEvent(`Parsing ${format} graph from ${filename}`);

  // Use new parsers
  let parsed;
  if (format === 'dot') {
    const dotParser = new DotParser();
    parsed = dotParser.parse(text, logEvent);
  } else {
    const gfaParser = new GfaParser();
    parsed = gfaParser.parse(text, logEvent);
  }

  // Filter out invalid links
  const nodeSet = new Set(parsed.nodes.map(n => n.id));
  const validLinks = parsed.links.filter(l =>
    nodeSet.has(l.source) && nodeSet.has(l.target)
  );

  // Load into MVC system
  controller.loadGraph(parsed.nodes, validLinks, format);

  logEvent(`✓ Loaded ${parsed.nodes.length} nodes, ${validLinks.length} links`);
}

// ===== NODE CLICK HANDLER =====

function handleNodeClick(nodeId) {
  const node = model.getNode(nodeId);
  if (!node) return;

  // Show node information
  let infoHTML = `<strong>Node ${node.id}</strong>`;

  // Check if merged node
  if (isMergedNode(node)) {
    const mergedInfo = getMergedNodeInfo(node);
    infoHTML += `<br><em>Type: ${mergedInfo.type}</em>`;
    infoHTML += `<br><em>Merged from: ${mergedInfo.originalNodes.join(', ')}</em>`;
    infoHTML += `<br><em>Original nodes: ${mergedInfo.nodeCount}</em>`;
    infoHTML += `<br><em>Total length: ${mergedInfo.totalLength}bp</em>`;
    infoHTML += `<br><em>Average depth: ${mergedInfo.averageDepth.toFixed(2)}</em>`;
    infoHTML += `<br><em>Path: ${mergedInfo.pathName}</em>`;
    infoHTML += `<br><br><em>Note: Click "Export Merged Sequence" to view the combined sequence</em>`;
  } else {
    // Regular node info
    // Connection info (for resolution)
    const connections = getVertexConnections(node.id);
    const physicalConnections = getPhysicalConnections(node.id);
    infoHTML += `<br><em>Logical: ${connections.incoming.length} in, ${connections.outgoing.length} out</em>`;
    infoHTML += `<br><em>Physical: ${physicalConnections.red.length} red, ${physicalConnections.green.length} green</em>`;
    infoHTML += `<pre>${JSON.stringify(node, null, 2)}</pre>`;
  }

  document.getElementById('infoContent').innerHTML = infoHTML;
  updateButtonStates();
}

// ===== BUTTON STATE UPDATES =====

function updateButtonStates() {
  const selectedNodes = model.selectedNodes;

  // Resolve buttons
  updateResolveButton();
  updatePhysicalResolveButton();

  // Merge buttons
  updateMergeButtons();
}

function updateResolveButton() {
  const resolveBtn = document.getElementById('resolveVertex');
  const selectedNodes = model.selectedNodes;
  const hasSelection = selectedNodes.size === 1;

  resolveBtn.disabled = !hasSelection;

  if (hasSelection) {
    const vertexId = Array.from(selectedNodes)[0];
    const connections = getVertexConnections(vertexId);
    const totalConnections = connections.incoming.length + connections.outgoing.length;

    if (totalConnections > 1) {
      resolveBtn.textContent = `Resolve Vertex (${totalConnections} edges)`;
      resolveBtn.disabled = false;
    } else {
      resolveBtn.textContent = 'Resolve Vertex';
      resolveBtn.disabled = true;
    }
  } else {
    resolveBtn.textContent = 'Resolve Vertex';
  }
}

function updatePhysicalResolveButton() {
  const resolveBtn = document.getElementById('resolvePhysical');
  const selectedNodes = model.selectedNodes;
  const hasSelection = selectedNodes.size === 1;

  resolveBtn.disabled = !hasSelection;

  if (hasSelection) {
    const vertexId = Array.from(selectedNodes)[0];
    const connections = getPhysicalConnections(vertexId);
    const totalConnections = connections.red.length + connections.green.length;

    if (totalConnections > 1) {
      resolveBtn.textContent = `Resolve Physical (${connections.red.length}R+${connections.green.length}G)`;
      resolveBtn.disabled = false;
    } else {
      resolveBtn.textContent = 'Resolve Physical';
      resolveBtn.disabled = true;
    }
  } else {
    resolveBtn.textContent = 'Resolve Physical';
  }
}

function updateMergeButtons() {
  const mergeBtn = document.getElementById('mergeNodes');
  const exportMergedBtn = document.getElementById('exportMergedSequence');
  const selectedNodes = model.selectedNodes;

  // Merge button: enabled when exactly one node is selected
  if (mergeBtn) {
    const hasValidSelection = selectedNodes.size === 1;
    mergeBtn.disabled = !hasValidSelection;

    if (hasValidSelection) {
      const selectedNodeId = Array.from(selectedNodes)[0];
      mergeBtn.textContent = `Merge Linear Chain from ${selectedNodeId}`;
    } else {
      mergeBtn.textContent = 'Merge Linear Chain';
    }
  }

  // Export merged sequence button - enabled when there's a selected path OR a selected merged node
  if (exportMergedBtn) {
    const currentPathIndex = model.currentPathIndex;
    const hasSelectedPath = currentPathIndex >= 0 && currentPathIndex < model.savedPaths.length;
    const hasSelectedMergedNode = selectedNodes.size === 1 &&
      model.nodes.find(n => n.id === Array.from(selectedNodes)[0] && isMergedNode(n));

    const shouldEnable = hasSelectedPath || hasSelectedMergedNode;
    exportMergedBtn.disabled = !shouldEnable;

    // Update button text based on what's selected
    if (hasSelectedMergedNode) {
      exportMergedBtn.textContent = 'Export Merged Node Sequence';
    } else if (hasSelectedPath) {
      exportMergedBtn.textContent = 'Export Path Sequence';
    } else {
      exportMergedBtn.textContent = 'Export Sequence';
    }

    // Force enable pointer events and cursor - use setProperty with important flag
    if (shouldEnable) {
      exportMergedBtn.style.setProperty('pointer-events', 'auto', 'important');
      exportMergedBtn.style.setProperty('cursor', 'pointer', 'important');
    } else {
      exportMergedBtn.style.setProperty('pointer-events', 'none', 'important');
      exportMergedBtn.style.setProperty('cursor', 'not-allowed', 'important');
    }
  }
}

// ===== PATH MANAGEMENT - USING EXACT OLD LOGIC =====

// Path management state (matching old main.js exactly)
let nextPathId = 1;
const PATH_COLORS = [
  '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57',
  '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3', '#ff9f43'
];

function getNextPathColor() {
  return PATH_COLORS[(model.savedPaths.length) % PATH_COLORS.length];
}

// COPIED FROM OLD MAIN.JS (lines 1071-1132)
function highlightPaths(sequence, pathName = null) {
  if (!sequence || !sequence.trim()) {
    logEvent('No sequence provided');
    return;
  }

  // Parse the sequence
  const nodeIds = sequence.split(',').map(id => id.trim());

  // Validate nodes exist
  const nodeMap = new Map(model.nodes.map(n => [String(n.id), n]));
  const validNodes = nodeIds.filter(id => nodeMap.has(id));

  if (validNodes.length === 0) {
    logEvent('No valid nodes in sequence');
    return;
  }

  // Create new path object
  const pathNodes = new Set(validNodes);
  const pathEdges = new Set();

  // Find edges between consecutive nodes
  for (let i = 0; i < validNodes.length - 1; i++) {
    const sourceId = validNodes[i];
    const targetId = validNodes[i + 1];

    model.links.forEach((link, index) => {
      const linkSourceId = String(link.source.id || link.source);
      const linkTargetId = String(link.target.id || link.target);

      if ((linkSourceId === sourceId && linkTargetId === targetId) ||
          (linkSourceId === targetId && linkTargetId === sourceId)) {
        pathEdges.add(index);
      }
    });
  }

  const newPath = {
    id: nextPathId++,
    name: pathName || `Path ${model.savedPaths.length + 1}`,
    sequence: sequence.trim(),
    nodes: pathNodes,
    edges: pathEdges,
    color: getNextPathColor(),
    timestamp: new Date()
  };

  // Add to saved paths in model
  model._savedPaths.push(newPath);
  model._currentPathIndex = model.savedPaths.length - 1;

  // Update highlighted path in model
  model._highlightedPath = {
    nodes: new Set(pathNodes),
    edges: new Set(pathEdges),
    currentColor: newPath.color
  };

  // Trigger model events
  model.emit('pathSaved', { path: newPath });
  model.emit('pathSelected', { path: newPath });

  logEvent(`Saved path "${newPath.name}": ${validNodes.join(' → ')}`);
}

function setupPathManagement() {
  // Save path button - uses highlightPaths
  document.getElementById('savePath').onclick = () => {
    const sequence = document.getElementById('pathSequence').value.trim();
    const pathName = document.getElementById('pathName').value.trim() || null;

    if (!sequence) {
      alert('Please enter a node sequence');
      return;
    }

    highlightPaths(sequence, pathName);

    // Clear inputs
    document.getElementById('pathSequence').value = '';
    document.getElementById('pathName').value = '';
  };

  // Quick view button - temporarily highlight without saving
  document.getElementById('highlightPath').onclick = () => {
    const sequence = document.getElementById('pathSequence').value.trim();

    if (!sequence) {
      alert('Please enter a node sequence');
      return;
    }

    // Parse and validate
    const nodeIds = sequence.split(',').map(id => id.trim());
    const nodeMap = new Map(model.nodes.map(n => [String(n.id), n]));
    const validNodes = nodeIds.filter(id => nodeMap.has(id));

    if (validNodes.length === 0) {
      alert('No valid nodes in sequence');
      return;
    }

    // Temporarily highlight (don't save)
    const pathNodes = new Set(validNodes);
    const pathEdges = new Set();

    for (let i = 0; i < validNodes.length - 1; i++) {
      const sourceId = validNodes[i];
      const targetId = validNodes[i + 1];

      model.links.forEach((link, index) => {
        const linkSourceId = String(link.source.id || link.source);
        const linkTargetId = String(link.target.id || link.target);

        if ((linkSourceId === sourceId && linkTargetId === targetId) ||
            (linkSourceId === targetId && linkTargetId === sourceId)) {
          pathEdges.add(index);
        }
      });
    }

    // Update highlighted path temporarily
    model._highlightedPath = {
      nodes: new Set(pathNodes),
      edges: new Set(pathEdges),
      currentColor: getNextPathColor()
    };

    model.emit('pathSelected', { path: { nodes: pathNodes, edges: pathEdges, color: model._highlightedPath.currentColor } });
    logEvent(`Quick view: ${validNodes.join(' → ')}`);
  };

  // Path navigation
  document.getElementById('prevPath').onclick = () => navigatePath('prev');
  document.getElementById('nextPath').onclick = () => navigatePath('next');

  // Clear all paths
  document.getElementById('clearAllPaths').onclick = () => {
    if (confirm('Clear all saved paths?')) {
      controller.clearAllPaths();
      logEvent('Cleared all paths');
    }
  };

  // Export path sequence
  document.getElementById('exportPathSequence').onclick = () => {
    console.log('=== EXPORT SEQUENCE BUTTON CLICKED ===');
    console.log('currentPathIndex:', model.currentPathIndex);
    console.log('savedPaths.length:', model.savedPaths.length);

    const currentPath = model.currentPath;
    console.log('currentPath:', currentPath);

    if (!currentPath) {
      alert('No path selected');
      return;
    }

    try {
      exportPathSequence(currentPath, model.nodes, model.links);
      logEvent(`Exported sequence for path "${currentPath.name}"`);
    } catch (error) {
      console.error('Export error:', error);
      alert(`Export failed: ${error.message}`);
    }
  };

  // Keyboard shortcuts
  document.getElementById('pathSequence').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (e.ctrlKey || e.metaKey) {
        document.getElementById('savePath').click();
      } else {
        document.getElementById('highlightPath').click();
      }
    }
  });
}

function navigatePath(direction) {
  const savedPaths = model.savedPaths;
  if (savedPaths.length === 0) return;

  let currentIndex = model.currentPathIndex;
  let newIndex;

  if (direction === 'prev') {
    newIndex = currentIndex <= 0 ? savedPaths.length - 1 : currentIndex - 1;
  } else {
    newIndex = currentIndex >= savedPaths.length - 1 ? 0 : currentIndex + 1;
  }

  controller.selectPath(newIndex);
}

function updatePathUI() {
  const pathList = document.getElementById('savedPathsList');
  const pathNav = document.getElementById('pathNavigation');
  const pathCounter = document.getElementById('pathCounter');
  const savedPaths = model.savedPaths;
  const currentPathIndex = model.currentPathIndex;

  // Update path list
  pathList.innerHTML = '';

  if (savedPaths.length === 0) {
    pathList.innerHTML = '<div class="no-paths">No saved paths</div>';
    pathNav.style.display = 'none';
    pathCounter.textContent = '0 paths saved';
  } else {
    pathNav.style.display = 'flex';
    pathCounter.textContent = `${savedPaths.length} path${savedPaths.length === 1 ? '' : 's'} saved`;

    savedPaths.forEach((path, index) => {
      const pathDiv = document.createElement('div');
      pathDiv.className = `saved-path ${index === currentPathIndex ? 'active' : ''}`;

      pathDiv.innerHTML = `
        <div class="path-header">
          <span class="path-color" style="background-color: ${path.color}"></span>
          <span class="path-name">${path.name}</span>
          <button class="delete-path" title="Delete path">×</button>
        </div>
        <div class="path-sequence">${path.sequence}</div>
        <div class="path-stats">${path.nodes.size} nodes, ${path.edges.size} edges</div>
      `;

      // Delete button
      pathDiv.querySelector('.delete-path').onclick = (e) => {
        e.stopPropagation();
        controller.removePath(index);
        logEvent(`Deleted path "${path.name}"`);
      };

      // Click to toggle selection
      pathDiv.onclick = () => {
        controller.selectPath(index === currentPathIndex ? -1 : index);
      };

      pathList.appendChild(pathDiv);
    });
  }

  // Update navigation buttons
  const prevBtn = document.getElementById('prevPath');
  const nextBtn = document.getElementById('nextPath');
  const clearBtn = document.getElementById('clearAllPaths');
  const exportAllBtn = document.getElementById('exportAllPaths');
  const exportBtn = document.getElementById('exportPathSequence');

  if (prevBtn) prevBtn.disabled = savedPaths.length === 0;
  if (nextBtn) nextBtn.disabled = savedPaths.length === 0;
  if (clearBtn) clearBtn.disabled = savedPaths.length === 0;
  if (exportAllBtn) exportAllBtn.disabled = savedPaths.length === 0;

  if (exportBtn) {
    const hasValidSelection = currentPathIndex >= 0 &&
      currentPathIndex < savedPaths.length &&
      savedPaths.length > 0;

    console.log('[updatePathUI] Export button state:', {
      currentPathIndex,
      savedPathsLength: savedPaths.length,
      hasValidSelection,
      willBeDisabled: !hasValidSelection,
      buttonElement: exportBtn,
      buttonCurrentlyDisabled: exportBtn.disabled
    });

    exportBtn.disabled = !hasValidSelection;

    // Force enable pointer events and cursor - use setProperty with important flag
    if (hasValidSelection) {
      exportBtn.style.setProperty('pointer-events', 'auto', 'important');
      exportBtn.style.setProperty('cursor', 'pointer', 'important');
    } else {
      exportBtn.style.setProperty('pointer-events', 'none', 'important');
      exportBtn.style.setProperty('cursor', 'not-allowed', 'important');
    }

    // Check for blocking elements
    const dialogOverlay = document.getElementById('dialogOverlay');
    const resolveDialog = document.getElementById('resolveDialog');
    console.log('[updatePathUI] After update - button.disabled:', exportBtn.disabled, 'pointerEvents:', exportBtn.style.pointerEvents);
    console.log('[updatePathUI] Dialog overlay display:', dialogOverlay?.style.display, 'visible:', dialogOverlay?.style.display !== 'none');
    console.log('[updatePathUI] Resolve dialog display:', resolveDialog?.style.display, 'visible:', resolveDialog?.style.display !== 'none');
    console.log('[updatePathUI] Button z-index:', window.getComputedStyle(exportBtn).zIndex);
    console.log('[updatePathUI] Button position:', exportBtn.getBoundingClientRect());

    // Check what element is at the button's center point
    if (hasValidSelection) {
      const rect = exportBtn.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const elementAtPoint = document.elementFromPoint(centerX, centerY);
      console.log('[updatePathUI] Element at button center:', elementAtPoint, 'is button?', elementAtPoint === exportBtn);
    }
  }

  const currentPathDisplay = document.getElementById('currentPathDisplay');
  if (currentPathDisplay) {
    if (currentPathIndex >= 0 && currentPathIndex < savedPaths.length) {
      const currentPath = savedPaths[currentPathIndex];
      currentPathDisplay.textContent = `${currentPath.name} (${currentPathIndex + 1}/${savedPaths.length})`;
    } else {
      currentPathDisplay.textContent = savedPaths.length > 0 ? `None selected (0/${savedPaths.length})` : 'No paths';
    }
  }

  markUpdatedPathsInUI(savedPaths);

  // Update export merged sequence button state when path selection changes
  updateMergeButtons();
}

// ===== PATH IMPORT/EXPORT =====

function setupPathImportExport() {
  let selectedPathFile = null;

  const pathFileInput = document.getElementById('pathFileInput');
  const importPathsBtn = document.getElementById('importPaths');

  if (pathFileInput && importPathsBtn) {
    pathFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        selectedPathFile = file;
        importPathsBtn.disabled = false;
        importPathsBtn.textContent = `Import ${file.name}`;
        logEvent(`Path file selected: ${file.name} (${file.size} bytes)`);
      } else {
        selectedPathFile = null;
        importPathsBtn.disabled = true;
        importPathsBtn.textContent = 'Import Paths';
      }
    });

    importPathsBtn.addEventListener('click', () => {
      if (!selectedPathFile) {
        alert('Please select a path file first');
        return;
      }

      if (model.nodes.length === 0) {
        alert('Please load a graph first before importing paths');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const textContent = e.target.result;
          logEvent(`Importing paths from ${selectedPathFile.name}...`);

          const results = importPathsFromText(
            textContent,
            model.nodes,
            model.savedPaths,
            (sequence, pathName) => controller.savePath(sequence, pathName)
          );

          showImportResultsDialog(results);
          updatePathUI();

          logEvent(`Import completed: ${results.successful.length} successful, ${results.failed.length} failed`);

          // Clear file input
          pathFileInput.value = '';
          selectedPathFile = null;
          importPathsBtn.disabled = true;
          importPathsBtn.textContent = 'Import Paths';
        } catch (error) {
          console.error('Error importing paths:', error);
          alert(`Error importing paths: ${error.message}`);
          logEvent(`Import error: ${error.message}`);
        }
      };

      reader.onerror = () => {
        alert('Error reading file');
        logEvent('Error reading path file');
      };

      reader.readAsText(selectedPathFile);
    });
  }

  // Export all paths
  const exportAllPathsBtn = document.getElementById('exportAllPaths');
  if (exportAllPathsBtn) {
    exportAllPathsBtn.addEventListener('click', () => {
      const savedPaths = model.savedPaths;
      if (!savedPaths || savedPaths.length === 0) {
        alert('No paths to export');
        return;
      }

      showExportPreviewDialog(savedPaths, () => {
        try {
          const result = exportAllPathsToFile(savedPaths);
          logEvent(`Exported ${result.pathCount} paths to ${result.filename}`);
          setTimeout(() => {
            alert(`Successfully exported ${result.pathCount} paths to ${result.filename}`);
          }, 100);
        } catch (error) {
          console.error('Error exporting paths:', error);
          alert(`Error exporting paths: ${error.message}`);
          logEvent(`Export error: ${error.message}`);
        }
      });
    });
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault();
      if (pathFileInput) pathFileInput.click();
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
      e.preventDefault();
      if (exportAllPathsBtn && !exportAllPathsBtn.disabled) {
        exportAllPathsBtn.click();
      }
    }
  });
}

// ===== LEGACY OPERATIONS (Complex features not yet fully migrated) =====

function setupLegacyOperations() {
  // These operations use the existing complex logic and sync with the model

  // GFA Node flipping
  document.getElementById('flipNode').onclick = () => {
    if (legacy.currentFormat !== 'gfa') {
      logEvent('Node flipping is only available for GFA graphs');
      return;
    }

    const selectedNodes = model.selectedNodes;
    if (selectedNodes.size === 0) {
      logEvent('No nodes selected for flipping');
      return;
    }

    // Use the view's flipSelectedNodes method (MVC GfaRenderer)
    const flipped = view.flipSelectedNodes(selectedNodes);
    if (flipped) {
      logEvent(`Flipped ${selectedNodes.size} node(s)`);
      mvc.layout.simulation.alpha(0.1).restart();
    }
  };

  // Vertex resolution (logical)
  document.getElementById('resolveVertex').onclick = () => {
    const selectedNodes = model.selectedNodes;
    if (selectedNodes.size === 1) {
      const vertexId = Array.from(selectedNodes)[0];
      showResolveDialog(vertexId);
    }
  };

  // Vertex resolution (physical)
  document.getElementById('resolvePhysical').onclick = () => {
    const selectedNodes = model.selectedNodes;
    if (selectedNodes.size === 1) {
      const vertexId = Array.from(selectedNodes)[0];
      showPhysicalResolveDialog(vertexId);
    }
  };

  // Dialog handlers
  document.getElementById('cancelResolve').addEventListener('click', hideResolveDialog);
  document.getElementById('confirmResolve').addEventListener('click', () => {
    if (window.currentPhysicalResolution) {
      performPhysicalResolution();
    } else {
      performVertexResolution();
    }
  });
  document.getElementById('dialogOverlay').addEventListener('click', hideResolveDialog);

  // Node merging - USING NEW OPERATION-BASED ARCHITECTURE
  document.getElementById('mergeNodes').onclick = () => {
    const selectedNodes = model.selectedNodes;
    if (selectedNodes.size !== 1) {
      alert('Please select exactly one node to start linear chain detection');
      logEvent('Linear chain merge requires exactly one selected node');
      return;
    }

    const selectedNodeId = Array.from(selectedNodes)[0];

    try {
      logEvent(`Starting linear chain detection from node: ${selectedNodeId}`);

      // Create adapter and operation
      const graphAdapter = new GraphAdapter(model);
      const merger = new NodeMerger(graphAdapter, selectedNodeId);

      // Execute merge
      const result = merger.execute();

      // Update saved paths to reflect the merge
      const updatedPaths = updatePathsAfterMerge(model.savedPaths, {
        mergedNodeId: result.mergedNodeId,
        originalNodeIds: result.originalNodeIds,
        mergedNode: result.mergedNode
      });
      model._savedPaths = updatedPaths;

      // Clear selections
      model.deselectNodes();

      // Update UI
      updatePathUI();
      updateMergeButtons();

      // Restart layout
      controller.redraw();

      logEvent(`✅ Successfully merged linear chain: ${result.originalNodeIds.join(' → ')} into ${result.mergedNodeId}`);
      logEvent(`   Chain length: ${result.removedNodes} nodes`);
      logEvent(`   Preserved ${result.externalConnections} external connections`);
    } catch (error) {
      console.error('Error during linear chain merge:', error);
      alert(`Error merging linear chain: ${error.message}`);
      logEvent(`❌ Linear chain merge failed: ${error.message}`);
    }
  };

  // Export merged sequence - works for both selected paths and merged nodes
  document.getElementById('exportMergedSequence').onclick = () => {
    const selectedNodes = model.selectedNodes;
    const currentPathIndex = model.currentPathIndex;

    // Check if we have a selected merged node
    if (selectedNodes.size === 1) {
      const selectedNodeId = Array.from(selectedNodes)[0];
      const selectedNode = model.getNode(selectedNodeId);

      if (selectedNode && isMergedNode(selectedNode)) {
        // Export merged node sequence
        try {
          logEvent(`Exporting sequence for merged node: ${selectedNode.id}`);

          const originalNodes = selectedNode.originalNodes || [];
          const originalLinks = selectedNode.originalLinks || [];

          if (originalNodes.length === 0) {
            throw new Error('No original nodes stored in merged node');
          }

          exportMergedNodeSequence(selectedNode, originalNodes, originalLinks);
          logEvent(`Exported sequence for merged node "${selectedNode.pathName || selectedNode.id}"`);
          return;
        } catch (error) {
          console.error('Error exporting merged sequence:', error);
          alert(`Error exporting sequence: ${error.message}`);
          logEvent(`Export failed: ${error.message}`);
          return;
        }
      }
    }

    // Otherwise, try to export the currently selected path
    if (currentPathIndex >= 0 && currentPathIndex < model.savedPaths.length) {
      const currentPath = model.savedPaths[currentPathIndex];

      try {
        logEvent(`Exporting sequence for path: ${currentPath.name}`);
        exportPathSequence(currentPath, model.nodes, model.links);
        logEvent(`Exported sequence for path "${currentPath.name}"`);
      } catch (error) {
        console.error('Error exporting path sequence:', error);
        alert(`Error exporting path sequence: ${error.message}`);
        logEvent(`Export failed: ${error.message}`);
      }
    } else {
      alert('Please select a path or a merged node to export its sequence');
    }
  };

  console.log('[Main] Legacy operations setup complete');
}

// ===== VERTEX RESOLUTION FUNCTIONS (Legacy - kept as-is) =====

function getVertexConnections(vertexId) {
  const incoming = [];
  const outgoing = [];
  const links = model.links;
  const nodes = model.nodes;

  links.forEach((link, index) => {
    const sourceId = (typeof link.source === 'object') ? link.source.id : link.source;
    const targetId = (typeof link.target === 'object') ? link.target.id : link.target;

    if (targetId === vertexId) {
      incoming.push({
        linkIndex: index,
        link: link,
        sourceId: sourceId,
        sourceNode: (typeof link.source === 'object') ? link.source : nodes.find(n => n.id === sourceId),
        orientation: link.tgtOrientation || '+'
      });
    }
    if (sourceId === vertexId) {
      outgoing.push({
        linkIndex: index,
        link: link,
        targetId: targetId,
        targetNode: (typeof link.target === 'object') ? link.target : nodes.find(n => n.id === targetId),
        orientation: link.srcOrientation || '+'
      });
    }
  });

  console.log(`Vertex ${vertexId}: ${incoming.length} incoming, ${outgoing.length} outgoing edges`);
  return { incoming, outgoing };
}

function getPhysicalConnections(vertexId) {
  const redConnections = [];
  const greenConnections = [];
  const links = model.links;
  const nodes = model.nodes;

  links.forEach((link, index) => {
    const sourceId = (typeof link.source === 'object') ? link.source.id : link.source;
    const targetId = (typeof link.target === 'object') ? link.target.id : link.target;

    if (sourceId === vertexId) {
      const srcOrientation = link.srcOrientation || '+';
      if (srcOrientation === '+') {
        greenConnections.push({
          linkIndex: index,
          link: link,
          targetId: targetId,
          targetNode: (typeof link.target === 'object') ? link.target : nodes.find(n => n.id === targetId),
          orientation: srcOrientation,
          direction: 'outgoing'
        });
      } else {
        redConnections.push({
          linkIndex: index,
          link: link,
          targetId: targetId,
          targetNode: (typeof link.target === 'object') ? link.target : nodes.find(n => n.id === targetId),
          orientation: srcOrientation,
          direction: 'outgoing'
        });
      }
    }

    if (targetId === vertexId) {
      const tgtOrientation = link.tgtOrientation || '+';
      if (tgtOrientation === '+') {
        redConnections.push({
          linkIndex: index,
          link: link,
          sourceId: sourceId,
          sourceNode: (typeof link.source === 'object') ? link.source : nodes.find(n => n.id === sourceId),
          orientation: tgtOrientation,
          direction: 'incoming'
        });
      } else {
        greenConnections.push({
          linkIndex: index,
          link: link,
          sourceId: sourceId,
          sourceNode: (typeof link.source === 'object') ? link.source : nodes.find(n => n.id === sourceId),
          orientation: tgtOrientation,
          direction: 'incoming'
        });
      }
    }
  });

  console.log(`Physical connections for ${vertexId}: ${redConnections.length} red subnode, ${greenConnections.length} green subnode`);
  return { red: redConnections, green: greenConnections };
}

// Combination generation now handled by operation classes
// VertexResolution.generatePathCombinations() and PhysicalVertexResolution.generatePhysicalCombinations()

function showResolveDialog(vertexId) {
  const vertex = model.getNode(vertexId);
  if (!vertex) return;

  const connections = getVertexConnections(vertexId);
  const combinations = VertexResolution.generatePathCombinations(connections.incoming, connections.outgoing);

  document.getElementById('vertexInfo').innerHTML = `
    <strong>Logical Resolution for Vertex:</strong> ${vertexId}<br>
    <strong>Incoming edges:</strong> ${connections.incoming.length}<br>
    <strong>Outgoing edges:</strong> ${connections.outgoing.length}<br>
    <strong>Possible paths:</strong> ${combinations.length}<br>
    <em>Note: Based on logical graph connections (source → target)</em>
  `;

  const pathContainer = document.getElementById('pathCombinations');
  pathContainer.innerHTML = '';

  combinations.forEach((combo, index) => {
    const div = document.createElement('div');
    div.className = 'path-combination';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `path_${index}`;
    checkbox.checked = true;
    checkbox.dataset.comboIndex = index;

    const label = document.createElement('label');
    label.setAttribute('for', `path_${index}`);

    let labelHTML = `<span class="incoming-edge">${combo.incoming ? combo.incoming.sourceId : 'START'}</span>`;
    labelHTML += ` → <strong>${vertexId}</strong> → `;
    labelHTML += `<span class="outgoing-edge">${combo.outgoing ? combo.outgoing.targetId : 'END'}</span>`;

    if (combo.incoming || combo.outgoing) {
      labelHTML += `<span class="edge-info">(${combo.description})</span>`;
    }

    label.innerHTML = labelHTML;

    div.appendChild(checkbox);
    div.appendChild(label);
    pathContainer.appendChild(div);
  });

  updateResolutionStats(combinations.length, combinations.length);

  pathContainer.addEventListener('change', () => {
    const checked = pathContainer.querySelectorAll('input[type="checkbox"]:checked').length;
    updateResolutionStats(combinations.length, checked);
  });

  window.currentResolution = {
    vertex: vertex,
    combinations: combinations,
    connections: connections
  };

  document.getElementById('dialogOverlay').style.display = 'block';
  document.getElementById('resolveDialog').style.display = 'block';
}

function showPhysicalResolveDialog(vertexId) {
  const vertex = model.getNode(vertexId);
  if (!vertex) return;

  const connections = getPhysicalConnections(vertexId);
  const combinations = PhysicalVertexResolution.generatePhysicalCombinations(connections.red, connections.green);

  document.getElementById('vertexInfo').innerHTML = `
    <strong>Physical Resolution for Vertex:</strong> ${vertexId}<br>
    <strong>Red subnode connections:</strong> ${connections.red.length}<br>
    <strong>Green subnode connections:</strong> ${connections.green.length}<br>
    <strong>Physical path combinations:</strong> ${combinations.length}<br>
    <em>Note: Based on physical red/green subnode connections</em>
  `;

  const pathContainer = document.getElementById('pathCombinations');
  pathContainer.innerHTML = '';

  combinations.forEach((combo, index) => {
    const div = document.createElement('div');
    div.className = 'path-combination physical-combination';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `physical_path_${index}`;
    checkbox.checked = true;
    checkbox.dataset.comboIndex = index;

    const label = document.createElement('label');
    label.setAttribute('for', `physical_path_${index}`);

    let labelHTML = `<span class="red-connection">${combo.red ? (combo.red.sourceId || combo.red.targetId) : 'NONE'}</span>`;
    labelHTML += ` → <strong>${vertexId}</strong> → `;
    labelHTML += `<span class="green-connection">${combo.green ? (combo.green.targetId || combo.green.sourceId) : 'NONE'}</span>`;
    labelHTML += `<span class="edge-info">(${combo.description})</span>`;

    label.innerHTML = labelHTML;

    div.appendChild(checkbox);
    div.appendChild(label);
    pathContainer.appendChild(div);
  });

  updateResolutionStats(combinations.length, combinations.length);

  pathContainer.addEventListener('change', () => {
    const checked = pathContainer.querySelectorAll('input[type="checkbox"]:checked').length;
    updateResolutionStats(combinations.length, checked);
  });

  window.currentPhysicalResolution = {
    vertex: vertex,
    combinations: combinations,
    connections: connections
  };

  document.getElementById('physicalModeIndicator').style.display = 'block';
  document.getElementById('dialogOverlay').style.display = 'block';
  document.getElementById('resolveDialog').style.display = 'block';
}

function updateResolutionStats(total, selected) {
  document.getElementById('resolutionStats').textContent =
    `${selected} of ${total} paths selected. ${total - selected} paths will be removed.`;
}

function hideResolveDialog() {
  document.getElementById('physicalModeIndicator').style.display = 'none';
  document.getElementById('dialogOverlay').style.display = 'none';
  document.getElementById('resolveDialog').style.display = 'none';
  window.currentResolution = null;
  window.currentPhysicalResolution = null;
}

function performVertexResolution() {
  if (!window.currentResolution) return;

  const { vertex, combinations } = window.currentResolution;
  const selectedCombos = [];

  document.querySelectorAll('#pathCombinations input[type="checkbox"]:checked').forEach(checkbox => {
    const index = parseInt(checkbox.dataset.comboIndex);
    selectedCombos.push(combinations[index]);
  });

  if (selectedCombos.length === 0) {
    alert('Please select at least one path to keep.');
    return;
  }

  console.log('=== LOGICAL VERTEX RESOLUTION (Operation-based) ===');
  const originalPaths = [...model.savedPaths];

  logEvent(`Resolving vertex ${vertex.id} into ${selectedCombos.length} copies`);

  try {
    // Create adapter and operation
    const graphAdapter = new GraphAdapter(model);
    const resolution = new VertexResolution(graphAdapter, vertex.id, selectedCombos);

    // Execute resolution
    const result = resolution.execute();

    // Update paths
    const resolutionData = {
      originalVertex: vertex,
      newVertices: result.newVertices,
      resolutionType: 'logical'
    };

    const updatedPaths = updatePathsAfterResolution(originalPaths, resolutionData, model.nodes, model.links);
    model._savedPaths = updatedPaths;

    // Show summary
    const summary = showPathUpdateSummary(originalPaths, updatedPaths, vertex.id);
    logEvent(summary);

    const affectedPaths = originalPaths.filter(path =>
      Array.from(path.nodes).includes(vertex.id)
    );
    if (affectedPaths.length > 0) {
      showPathUpdateDialog(originalPaths, updatedPaths, vertex.id);
    }

    // Clear selection and update UI
    model.deselectNodes();
    updateButtonStates();
    updatePathUI();
    hideResolveDialog();

    // Restart simulation
    controller.redraw();

    logEvent(`Logical vertex resolution complete: created ${result.newVertexCount} new vertices with ${result.newEdgeCount} edges`);
  } catch (error) {
    console.error('Error during vertex resolution:', error);
    alert(`Error during vertex resolution: ${error.message}`);
    logEvent(`❌ Vertex resolution failed: ${error.message}`);
  }
}

function performPhysicalResolution() {
  if (!window.currentPhysicalResolution) return;

  const { vertex, combinations } = window.currentPhysicalResolution;
  const selectedCombos = [];

  document.querySelectorAll('#pathCombinations input[type="checkbox"]:checked').forEach(checkbox => {
    const index = parseInt(checkbox.dataset.comboIndex);
    selectedCombos.push(combinations[index]);
  });

  if (selectedCombos.length === 0) {
    alert('Please select at least one physical path to keep.');
    return;
  }

  console.log('=== PHYSICAL VERTEX RESOLUTION (Operation-based) ===');
  const originalPaths = [...model.savedPaths];

  logEvent(`Physical resolving vertex ${vertex.id} into ${selectedCombos.length} copies`);

  try {
    // Create adapter and operation
    const graphAdapter = new GraphAdapter(model);
    const resolution = new PhysicalVertexResolution(graphAdapter, vertex.id, selectedCombos);

    // Execute resolution
    const result = resolution.execute();

    // Update paths
    const resolutionData = {
      originalVertex: vertex,
      newVertices: result.newVertices,
      resolutionType: 'physical'
    };

    const updatedPaths = updatePathsAfterResolution(originalPaths, resolutionData, model.nodes, model.links);
    model._savedPaths = updatedPaths;

    // Show summary
    const summary = showPathUpdateSummary(originalPaths, updatedPaths, vertex.id);
    logEvent(summary);

    const affectedPaths = originalPaths.filter(path =>
      Array.from(path.nodes).includes(vertex.id)
    );
    if (affectedPaths.length > 0) {
      showPathUpdateDialog(originalPaths, updatedPaths, vertex.id);
    }

    // Clear selection and update UI
    model.deselectNodes();
    updateButtonStates();
    updatePathUI();
    hideResolveDialog();

    // Restart simulation
    controller.redraw();

    logEvent(`Physical vertex resolution complete: created ${result.newVertexCount} new vertices with ${result.newEdgeCount} edges`);
  } catch (error) {
    console.error('Error during physical resolution:', error);
    alert(`Error during physical resolution: ${error.message}`);
    logEvent(`❌ Physical resolution failed: ${error.message}`);
  }
}

// ===== UTILITY FUNCTIONS =====

function logEvent(msg) {
  const debug = document.getElementById('debug');
  if (debug) {
    debug.innerText += msg + '\n';
    debug.scrollTop = debug.scrollHeight;
  }
  console.log(`[Main] ${msg}`);
}

// ===== GLOBAL EXPORTS (for compatibility) =====

window.deletePath = (index) => controller.removePath(index);
window.showPath = (index) => controller.selectPath(index);
window.navigatePath = navigatePath;

console.log('[Main] Module loaded, waiting for MVC initialization...');
