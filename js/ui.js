// ui.js - ENHANCED: Added resolve button handler

export function setupUI({
  canvas,
  onFileLoad,
  onGenerate,
  onPin,
  onFlip,        // Existing flip handler
  onResolve,     // NEW: resolve handler
  onRedraw,
  onHighlightPath,
  onClearPaths,
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

  document.getElementById('genRandom').onclick       = onGenerate;
  document.getElementById('pinNode').onclick         = onPin;
  
  // Flip button
  if (document.getElementById('flipNode') && onFlip) {
    document.getElementById('flipNode').onclick = onFlip;
  }
  
  // NEW: Resolve button
  if (document.getElementById('resolveVertex') && onResolve) {
    document.getElementById('resolveVertex').onclick = onResolve;
  }
  
  document.getElementById('redraw').onclick          = onRedraw;
  
  // Path highlighting
  const pathInput = document.getElementById('pathSequence');
  const highlightBtn = document.getElementById('highlightPath');
  
  highlightBtn.onclick = () => {
    const sequence = pathInput.value;
    onHighlightPath(sequence);
  };
  
  pathInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') {
      onHighlightPath(pathInput.value);
    }
  });
  
  document.getElementById('clearPaths').onclick      = onClearPaths;
  document.getElementById('removeNodes').onclick     = onRemoveNodes;
  document.getElementById('undo').onclick            = onUndo;
  document.getElementById('resetView').onclick       = () =>
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