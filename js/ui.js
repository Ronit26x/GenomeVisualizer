// ui.js

export function setupUI({
  canvas,
  onFileLoad,
  onGenerate,
  onPin,
  onRedraw,
  onHighlightPaths,
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
  document.getElementById('redraw').onclick          = onRedraw;
  document.getElementById('highlightPaths').onclick  = onHighlightPaths;
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
}