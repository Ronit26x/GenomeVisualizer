// Enhanced ui.js for multi-path management with merge functionality

export function setupUI({
  canvas,
  onFileLoad,
  onGenerate,
  onPin,
  onFlip,
  onResolve,
  onResolvePhysical,
  onMergeNodes,
  onExportMergedSequence,
  onRedraw,
  onHighlightPath,
  onClearPaths,
  onNavigatePath, // NEW: path navigation handler
  onRemoveNodes,
  onUndo,
  onSelectNode,
  onScaleChange
}) {
  document.getElementById('fileInput')
    .addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => onFileLoad(r.result, f.name);
      r.readAsText(f);
    });

  document.getElementById('genRandom').onclick = onGenerate;
  document.getElementById('pinNode').onclick = onPin;
  
  // Flip button
  if (document.getElementById('flipNode') && onFlip) {
    document.getElementById('flipNode').onclick = onFlip;
  }
  
  // Logical resolve button
  if (document.getElementById('resolveVertex') && onResolve) {
    document.getElementById('resolveVertex').onclick = onResolve;
  }
  
  // Physical resolve button
  if (document.getElementById('resolvePhysical') && onResolvePhysical) {
    document.getElementById('resolvePhysical').onclick = onResolvePhysical;
  }
  
  // NEW: Merge nodes button
  if (document.getElementById('mergeNodes') && onMergeNodes) {
    document.getElementById('mergeNodes').onclick = onMergeNodes;
  }
  
  // NEW: Export merged sequence button
  if (document.getElementById('exportMergedSequence') && onExportMergedSequence) {
    document.getElementById('exportMergedSequence').onclick = onExportMergedSequence;
  }
  
  document.getElementById('redraw').onclick = onRedraw;
  
  // Enhanced path highlighting with save functionality
  const pathInput = document.getElementById('pathSequence');
  const pathNameInput = document.getElementById('pathName');
  const savePathBtn = document.getElementById('savePath');
  const highlightBtn = document.getElementById('highlightPath');
  
  // Save path with optional custom name
  savePathBtn.onclick = () => {
    const sequence = pathInput.value.trim();
    const pathName = pathNameInput.value.trim();
    if (sequence) {
      onHighlightPath(sequence, pathName || null);
      pathInput.value = ''; // Clear after saving
      pathNameInput.value = '';
    }
  };
  
  // Quick highlight without saving (original behavior)
  highlightBtn.onclick = () => {
    const sequence = pathInput.value.trim();
    if (sequence) {
      // Show temporary highlight by creating a temporary path object
      const nodeIds = sequence.split(',').map(id => id.trim());
      const nodeMap = new Map(window.nodes.map(n => [String(n.id), n]));
      const validNodes = nodeIds.filter(id => nodeMap.has(id));
      
      if (validNodes.length > 0) {
        const tempNodes = new Set(validNodes);
        const tempEdges = new Set();
        
        // Find edges between consecutive nodes
        for (let i = 0; i < validNodes.length - 1; i++) {
          const sourceId = validNodes[i];
          const targetId = validNodes[i + 1];
          
          window.links.forEach((link, index) => {
            const linkSourceId = String(link.source.id || link.source);
            const linkTargetId = String(link.target.id || link.target);
            
            if ((linkSourceId === sourceId && linkTargetId === targetId) ||
                (linkSourceId === targetId && linkTargetId === sourceId)) {
              tempEdges.add(index);
            }
          });
        }
        
        // Temporarily show without saving
        window.highlightedPath.nodes = tempNodes;
        window.highlightedPath.edges = tempEdges;
        window.highlightedPath.currentColor = '#ff6b6b'; // Default color
        window.drawGraph(window.ctx, window.canvas, window.transform, window.nodes, window.links, 
                        window.pinnedNodes, window.selected, window.currentFormat, window.highlightedPath);
      }
    }
  };
  
  // Enter key support for both inputs
  pathInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') {
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Enter or Cmd+Enter to save
        savePathBtn.click();
      } else {
        // Enter to quick highlight
        highlightBtn.click();
      }
    }
  });
  
  pathNameInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') {
      savePathBtn.click();
    }
  });
  
  // Path navigation controls
  document.getElementById('prevPath').onclick = () => onNavigatePath('prev');
  document.getElementById('nextPath').onclick = () => onNavigatePath('next');
  document.getElementById('clearAllPaths').onclick = onClearPaths;
  
  document.getElementById('removeNodes').onclick = onRemoveNodes;
  document.getElementById('undo').onclick = onUndo;
  document.getElementById('resetView').onclick = () =>
    d3.select(canvas).call(d3.zoom().transform, d3.zoomIdentity);

  canvas.addEventListener('click', onSelectNode);
  
  // GFA scale control
  const scaleSlider = document.getElementById('nodeScale');
  const scaleValue = document.getElementById('scaleValue');
  if (scaleSlider && onScaleChange) {
    scaleSlider.addEventListener('input', e => {
      const scale = parseFloat(e.target.value);
      scaleValue.textContent = scale.toFixed(1);
      onScaleChange(scale);
    });
  }
  
  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    // Only handle shortcuts when not typing in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    switch(e.key) {
      case 'ArrowLeft':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          onNavigatePath('prev');
        }
        break;
      case 'ArrowRight':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          onNavigatePath('next');
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClearPaths();
        break;
      case 'm':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (onMergeNodes) {
            const mergeBtn = document.getElementById('mergeNodes');
            if (mergeBtn && !mergeBtn.disabled) {
              onMergeNodes();
            }
          }
        }
        break;
      case 'x':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (onExportMergedSequence) {
            const exportBtn = document.getElementById('exportMergedSequence');
            if (exportBtn && !exportBtn.disabled) {
              onExportMergedSequence();
            }
          }
        }
        break;
    }
  });
}

export function showGfaControls(show) {
  const gfaControls = document.getElementById('gfaControls');
  if (gfaControls) {
    gfaControls.style.display = show ? 'block' : 'none';
  }
  
  // Show/hide flip button based on format
  const flipButton = document.getElementById('flipNode');
  if (flipButton) {
    flipButton.style.display = show ? 'block' : 'none';
  }
}