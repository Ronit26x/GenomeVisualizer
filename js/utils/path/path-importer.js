// path-importer.js - Bulk path import from text files

/**
 * Parse a line from the path file
 * Format: "node1, node2, node3 /PathName" or "node1, node2, node3 / Path Name"
 */
function parsePathLine(line) {
  const trimmedLine = line.trim();
  
  // Skip empty lines and comments
  if (!trimmedLine || trimmedLine.startsWith('#') || trimmedLine.startsWith('//')) {
    return null;
  }
  
  // Find the last occurrence of ' /' to split path and name
  const slashIndex = trimmedLine.lastIndexOf(' /');
  
  if (slashIndex === -1) {
    // No path name found, use the line as sequence only
    return {
      sequence: trimmedLine,
      name: null
    };
  }
  
  const sequence = trimmedLine.substring(0, slashIndex).trim();
  const name = trimmedLine.substring(slashIndex + 2).trim(); // +2 to skip ' /'
  
  return {
    sequence: sequence,
    name: name || null
  };
}

/**
 * Validate and clean node IDs in a sequence
 */
function validateAndCleanSequence(sequence, nodeMap) {
  if (!sequence || !sequence.trim()) {
    return { isValid: false, cleanSequence: '', validNodes: [], invalidNodes: [] };
  }
  
  // Split by comma and clean up
  const nodeIds = sequence.split(',').map(id => id.trim()).filter(id => id.length > 0);
  
  if (nodeIds.length === 0) {
    return { isValid: false, cleanSequence: '', validNodes: [], invalidNodes: [] };
  }
  
  const validNodes = [];
  const invalidNodes = [];
  
  nodeIds.forEach(nodeId => {
    // Normalize the node ID (convert to string, handle negative numbers)
    const normalizedId = String(nodeId);
    
    if (nodeMap.has(normalizedId)) {
      validNodes.push(normalizedId);
    } else {
      invalidNodes.push(nodeId);
    }
  });
  
  return {
    isValid: validNodes.length > 0,
    cleanSequence: validNodes.join(','),
    validNodes: validNodes,
    invalidNodes: invalidNodes
  };
}

/**
 * Generate a unique path name if one already exists
 */
function generateUniqueName(baseName, existingNames) {
  if (!existingNames.has(baseName)) {
    return baseName;
  }
  
  let counter = 1;
  let uniqueName = `${baseName} (${counter})`;
  
  while (existingNames.has(uniqueName)) {
    counter++;
    uniqueName = `${baseName} (${counter})`;
  }
  
  return uniqueName;
}

/**
 * Import paths from text content
 */
export function importPathsFromText(textContent, nodes, savedPaths, highlightPathsFunction) {
  const lines = textContent.split(/\r?\n/);
  const nodeMap = new Map(nodes.map(n => [String(n.id), n]));
  const existingNames = new Set(savedPaths.map(p => p.name));
  
  const results = {
    successful: [],
    failed: [],
    skipped: []
  };
  
  console.log('=== PATH IMPORT STARTED ===');
  console.log(`Processing ${lines.length} lines`);
  console.log(`Available nodes: ${nodeMap.size}`);
  console.log(`Existing paths: ${existingNames.size}`);
  
  lines.forEach((line, lineNumber) => {
    const parsed = parsePathLine(line);
    
    if (!parsed) {
      // Skip empty lines and comments silently
      return;
    }
    
    console.log(`\nLine ${lineNumber + 1}: "${line}"`);
    console.log(`Parsed sequence: "${parsed.sequence}"`);
    console.log(`Parsed name: "${parsed.name}"`);
    
    // Validate the sequence
    const validation = validateAndCleanSequence(parsed.sequence, nodeMap);
    
    if (!validation.isValid) {
      results.failed.push({
        line: lineNumber + 1,
        originalLine: line,
        reason: 'No valid nodes found',
        invalidNodes: validation.invalidNodes
      });
      console.log(`❌ Failed: No valid nodes`);
      return;
    }
    
    // Generate path name
    let pathName = parsed.name;
    if (!pathName) {
      pathName = `Imported Path ${results.successful.length + 1}`;
    }
    pathName = generateUniqueName(pathName, existingNames);
    existingNames.add(pathName);
    
    // Create the path using the existing highlight function
    try {
      highlightPathsFunction(validation.cleanSequence, pathName);
      
      results.successful.push({
        line: lineNumber + 1,
        name: pathName,
        sequence: validation.cleanSequence,
        originalLine: line,
        validNodeCount: validation.validNodes.length,
        invalidNodes: validation.invalidNodes
      });
      
      console.log(`✅ Success: "${pathName}" with ${validation.validNodes.length} nodes`);
      
      if (validation.invalidNodes.length > 0) {
        console.log(`⚠️  Skipped invalid nodes: ${validation.invalidNodes.join(', ')}`);
      }
      
    } catch (error) {
      results.failed.push({
        line: lineNumber + 1,
        originalLine: line,
        reason: `Error creating path: ${error.message}`,
        invalidNodes: validation.invalidNodes
      });
      console.log(`❌ Failed: ${error.message}`);
    }
  });
  
  console.log('\n=== IMPORT SUMMARY ===');
  console.log(`✅ Successful: ${results.successful.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⏭️  Skipped: ${results.skipped.length}`);
  
  return results;
}

/**
 * Show import results dialog
 */
export function showImportResultsDialog(results) {
  const dialogHTML = `
    <div id="importResultsDialog" style="display: block;">
      <h3>Path Import Results</h3>
      
      <div class="import-summary">
        <div class="summary-stats">
          <div class="stat-item success">
            <span class="stat-number">${results.successful.length}</span>
            <span class="stat-label">Successfully imported</span>
          </div>
          ${results.failed.length > 0 ? `
          <div class="stat-item error">
            <span class="stat-number">${results.failed.length}</span>
            <span class="stat-label">Failed to import</span>
          </div>
          ` : ''}
        </div>
        
        ${results.successful.length > 0 ? `
        <div class="successful-imports">
          <h4>✅ Successfully Imported:</h4>
          <div class="import-list">
            ${results.successful.map(item => `
              <div class="import-item success">
                <div class="import-header">
                  <span class="path-name">${item.name}</span>
                  <span class="node-count">${item.validNodeCount} nodes</span>
                </div>
                <div class="import-details">
                  <div class="sequence">${item.sequence}</div>
                  ${item.invalidNodes.length > 0 ? `
                    <div class="invalid-nodes">⚠️ Skipped invalid: ${item.invalidNodes.join(', ')}</div>
                  ` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}
        
        ${results.failed.length > 0 ? `
        <div class="failed-imports">
          <h4>❌ Failed to Import:</h4>
          <div class="import-list">
            ${results.failed.map(item => `
              <div class="import-item error">
                <div class="import-header">
                  <span class="line-number">Line ${item.line}</span>
                  <span class="error-reason">${item.reason}</span>
                </div>
                <div class="import-details">
                  <div class="original-line">"${item.originalLine}"</div>
                  ${item.invalidNodes && item.invalidNodes.length > 0 ? `
                    <div class="invalid-nodes">Invalid nodes: ${item.invalidNodes.join(', ')}</div>
                  ` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}
      </div>
      
      <div class="dialog-buttons">
        <button class="confirm-btn" id="closeImportResults">Continue</button>
      </div>
    </div>
  `;
  
  // Show dialog overlay
  const existingOverlay = document.getElementById('dialogOverlay');
  if (existingOverlay) {
    existingOverlay.style.display = 'block';
  }
  
  // Insert dialog into DOM
  const dialogContainer = document.createElement('div');
  dialogContainer.innerHTML = dialogHTML;
  document.body.appendChild(dialogContainer);
  
  // Add event listener to close dialog
  document.getElementById('closeImportResults').addEventListener('click', () => {
    document.body.removeChild(dialogContainer);
    if (existingOverlay) {
      existingOverlay.style.display = 'none';
    }
  });
  
  // Close dialog when clicking overlay
  if (existingOverlay) {
    const overlayClickHandler = () => {
      if (document.body.contains(dialogContainer)) {
        document.body.removeChild(dialogContainer);
        existingOverlay.style.display = 'none';
        existingOverlay.removeEventListener('click', overlayClickHandler);
      }
    };
    existingOverlay.addEventListener('click', overlayClickHandler);
  }
}

/**
 * Add import styles to the page
 */
export function addImportStyles() {
  const styleId = 'path-import-styles';
  if (document.getElementById(styleId)) return; // Already added
  
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    #importResultsDialog {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border: 2px solid #333;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 1001;
      max-width: 800px;
      max-height: 80vh;
      overflow-y: auto;
    }
    
    .import-summary {
      margin: 15px 0;
    }
    
    .summary-stats {
      display: flex;
      gap: 20px;
      margin-bottom: 20px;
      justify-content: center;
    }
    
    .stat-item {
      text-align: center;
      padding: 15px;
      border-radius: 8px;
      background: #f8f9fa;
      border: 2px solid #dee2e6;
      min-width: 120px;
    }
    
    .stat-item.success {
      background: #d4edda;
      border-color: #28a745;
    }
    
    .stat-item.error {
      background: #f8d7da;
      border-color: #dc3545;
    }
    
    .stat-number {
      display: block;
      font-size: 24px;
      font-weight: bold;
      color: #333;
    }
    
    .stat-label {
      display: block;
      font-size: 12px;
      color: #666;
      margin-top: 5px;
    }
    
    .successful-imports h4,
    .failed-imports h4 {
      margin: 0 0 15px 0;
      color: #333;
      border-bottom: 1px solid #ddd;
      padding-bottom: 5px;
    }
    
    .import-list {
      max-height: 300px;
      overflow-y: auto;
    }
    
    .import-item {
      margin-bottom: 12px;
      padding: 10px;
      border-radius: 6px;
      border: 1px solid #ddd;
    }
    
    .import-item.success {
      background: #d4edda;
      border-color: #28a745;
    }
    
    .import-item.error {
      background: #f8d7da;
      border-color: #dc3545;
    }
    
    .import-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      font-weight: bold;
    }
    
    .path-name {
      color: #333;
      font-size: 14px;
    }
    
    .node-count {
      color: #28a745;
      font-size: 12px;
    }
    
    .line-number {
      color: #666;
      font-size: 12px;
    }
    
    .error-reason {
      color: #dc3545;
      font-size: 12px;
    }
    
    .import-details {
      font-size: 12px;
    }
    
    .sequence {
      font-family: monospace;
      background: rgba(0,0,0,0.05);
      padding: 4px 8px;
      border-radius: 3px;
      margin-bottom: 4px;
      word-break: break-all;
    }
    
    .original-line {
      font-family: monospace;
      background: rgba(0,0,0,0.05);
      padding: 4px 8px;
      border-radius: 3px;
      margin-bottom: 4px;
      color: #666;
    }
    
    .invalid-nodes {
      color: #856404;
      font-style: italic;
      font-size: 11px;
    }
    
    .import-file-section {
      margin: 10px 0;
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: #f8f9fa;
    }
    
    .import-file-section label {
      font-weight: bold;
      font-size: 12px;
      margin-bottom: 5px;
      display: block;
    }
    
    .import-file-section input[type="file"] {
      font-size: 12px;
      margin-bottom: 8px;
    }
    
    .import-btn {
      background: #17a2b8;
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 3px;
      font-size: 12px;
      cursor: pointer;
      width: 100%;
    }
    
    .import-btn:hover {
      background: #138496;
    }
    
    .import-btn:disabled {
      background: #6c757d;
      cursor: not-allowed;
    }
  `;
  
  document.head.appendChild(style);
}