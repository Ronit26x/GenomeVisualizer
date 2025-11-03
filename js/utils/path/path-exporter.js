// path-exporter.js - Export saved paths to text file

/**
 * Export all saved paths to a text file in the import format
 */
export function exportAllPathsToFile(savedPaths, filename = null) {
  if (!savedPaths || savedPaths.length === 0) {
    alert('No paths to export');
    return;
  }

  console.log('=== PATH EXPORT STARTED ===');
  console.log(`Exporting ${savedPaths.length} paths`);

  // Generate the text content
  const textContent = generatePathsText(savedPaths);
  
  // Create filename if not provided
  const exportFilename = filename || generateExportFilename(savedPaths.length);
  
  // Create and download the file
  downloadTextFile(textContent, exportFilename);
  
  console.log(`=== EXPORT COMPLETED ===`);
  console.log(`File: ${exportFilename}`);
  console.log(`Content length: ${textContent.length} characters`);
  
  return {
    filename: exportFilename,
    pathCount: savedPaths.length,
    contentLength: textContent.length
  };
}

/**
 * Generate text content from saved paths
 */
function generatePathsText(savedPaths) {
  const lines = [];
  
  // Add header comment with export info
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  lines.push(`# Exported paths from Graph Visualization Tool`);
  lines.push(`# Export date: ${timestamp}`);
  lines.push(`# Total paths: ${savedPaths.length}`);
  lines.push('');
  
  // Process each path
  savedPaths.forEach((path, index) => {
    console.log(`Processing path ${index + 1}: "${path.name}"`);
    
    // Add a comment with path details if it has extra info
    if (path.timestamp || path.nodes.size !== path.sequence.split(',').length) {
      lines.push(`# Path ${index + 1}: ${path.nodes.size} nodes, ${path.edges.size} edges`);
      if (path.timestamp) {
        lines.push(`# Created: ${new Date(path.timestamp).toLocaleString()}`);
      }
    }
    
    // Generate the main path line in import format
    const pathLine = formatPathForExport(path);
    lines.push(pathLine);
    
    // Add spacing between paths for readability
    if (index < savedPaths.length - 1) {
      lines.push('');
    }
  });
  
  return lines.join('\n');
}

/**
 * Format a single path in the import format
 */
function formatPathForExport(path) {
  // Clean the sequence (remove any extra whitespace)
  const cleanSequence = path.sequence.trim();
  
  // Clean the path name (handle special characters)
  const cleanName = cleanPathName(path.name);
  
  // Format: "sequence /name"
  return `${cleanSequence} /${cleanName}`;
}

/**
 * Clean path name for export (handle special characters)
 */
function cleanPathName(name) {
  if (!name) return 'Untitled Path';
  
  // Replace problematic characters but keep it readable
  return name
    .trim()
    .replace(/\n/g, ' ') // Replace newlines with spaces
    .replace(/\r/g, '')  // Remove carriage returns
    .replace(/\t/g, ' ') // Replace tabs with spaces
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
}

/**
 * Generate export filename with timestamp
 */
function generateExportFilename(pathCount) {
  const timestamp = new Date().toISOString().substring(0, 19).replace(/[:.]/g, '-');
  return `exported_paths_${pathCount}_${timestamp}.txt`;
}

/**
 * Download text content as file
 */
function downloadTextFile(content, filename) {
  try {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Clean up the URL object
    setTimeout(() => URL.revokeObjectURL(url), 100);
    
    console.log(`✅ File download initiated: ${filename}`);
    
  } catch (error) {
    console.error('Error downloading file:', error);
    alert(`Error downloading file: ${error.message}`);
    throw error;
  }
}

/**
 * Export selected paths only
 */
export function exportSelectedPaths(savedPaths, selectedIndices, filename = null) {
  if (!selectedIndices || selectedIndices.length === 0) {
    alert('No paths selected for export');
    return;
  }
  
  const selectedPaths = selectedIndices.map(index => savedPaths[index]).filter(Boolean);
  
  if (selectedPaths.length === 0) {
    alert('Selected paths not found');
    return;
  }
  
  console.log(`Exporting ${selectedPaths.length} selected paths`);
  return exportAllPathsToFile(selectedPaths, filename);
}

/**
 * Validate export format by attempting to parse it back
 */
export function validateExportFormat(textContent) {
  const lines = textContent.split(/\r?\n/);
  const validationResults = {
    valid: true,
    pathCount: 0,
    errors: [],
    warnings: []
  };
  
  lines.forEach((line, lineNumber) => {
    const trimmedLine = line.trim();
    
    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith('#') || trimmedLine.startsWith('//')) {
      return;
    }
    
    validationResults.pathCount++;
    
    // Check format
    const slashIndex = trimmedLine.lastIndexOf(' /');
    if (slashIndex === -1) {
      validationResults.warnings.push(`Line ${lineNumber + 1}: No path name found`);
    }
    
    // Basic sequence validation
    const sequence = slashIndex !== -1 ? trimmedLine.substring(0, slashIndex).trim() : trimmedLine;
    if (!sequence) {
      validationResults.valid = false;
      validationResults.errors.push(`Line ${lineNumber + 1}: Empty sequence`);
    }
  });
  
  return validationResults;
}

/**
 * Preview export content before download
 */
export function previewExportContent(savedPaths) {
  if (!savedPaths || savedPaths.length === 0) {
    return "# No paths to export";
  }
  
  const content = generatePathsText(savedPaths);
  const preview = content.split('\n').slice(0, 20).join('\n'); // First 20 lines
  
  if (content.split('\n').length > 20) {
    return preview + '\n\n# ... (content truncated for preview)';
  }
  
  return content;
}

/**
 * Show export preview dialog
 */
export function showExportPreviewDialog(savedPaths, onConfirm) {
  const previewContent = previewExportContent(savedPaths);
  const filename = generateExportFilename(savedPaths.length);
  
  const dialogHTML = `
    <div id="exportPreviewDialog" style="display: block;">
      <h3>Export Paths Preview</h3>
      
      <div class="export-info">
        <div class="export-stats">
          <div class="stat-item">
            <span class="stat-number">${savedPaths.length}</span>
            <span class="stat-label">Paths to export</span>
          </div>
          <div class="stat-item">
            <span class="stat-filename">${filename}</span>
            <span class="stat-label">Filename</span>
          </div>
        </div>
        
        <div class="preview-section">
          <h4>File Preview:</h4>
          <div class="preview-content">
            <pre>${escapeHtml(previewContent)}</pre>
          </div>
        </div>
        
        <div class="export-note">
          <strong>Note:</strong> This file can be imported back using the "Import Paths from File" feature.
        </div>
      </div>
      
      <div class="dialog-buttons">
        <button class="cancel-btn" id="cancelExport">Cancel</button>
        <button class="confirm-btn" id="confirmExport">Download File</button>
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
  
  // Add event listeners
  document.getElementById('cancelExport').addEventListener('click', () => {
    document.body.removeChild(dialogContainer);
    if (existingOverlay) {
      existingOverlay.style.display = 'none';
    }
  });
  
  document.getElementById('confirmExport').addEventListener('click', () => {
    document.body.removeChild(dialogContainer);
    if (existingOverlay) {
      existingOverlay.style.display = 'none';
    }
    if (onConfirm) {
      onConfirm();
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
 * Escape HTML for preview display
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Add export styles to the page
 */
export function addExportStyles() {
  const styleId = 'path-export-styles';
  if (document.getElementById(styleId)) return; // Already added
  
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    #exportPreviewDialog {
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
      max-width: 700px;
      max-height: 80vh;
      overflow-y: auto;
    }
    
    .export-info {
      margin: 15px 0;
    }
    
    .export-stats {
      display: flex;
      gap: 20px;
      margin-bottom: 20px;
      justify-content: center;
    }
    
    .export-stats .stat-item {
      text-align: center;
      padding: 15px;
      border-radius: 8px;
      background: #e3f2fd;
      border: 2px solid #2196f3;
      min-width: 120px;
    }
    
    .stat-filename {
      display: block;
      font-size: 12px;
      font-weight: bold;
      color: #333;
      font-family: monospace;
      word-break: break-all;
    }
    
    .preview-section h4 {
      margin: 0 0 10px 0;
      color: #333;
      border-bottom: 1px solid #ddd;
      padding-bottom: 5px;
    }
    
    .preview-content {
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 4px;
      padding: 10px;
      max-height: 300px;
      overflow-y: auto;
      font-family: monospace;
      font-size: 12px;
      line-height: 1.4;
    }
    
    .preview-content pre {
      margin: 0;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    
    .export-note {
      background: #fff3cd;
      border: 1px solid #ffeaa7;
      border-radius: 4px;
      padding: 10px;
      margin-top: 15px;
      font-size: 12px;
    }
    
    .export-paths-btn {
      background: #6f42c1;
      color: white;
      border: none;
      padding: 4px 8px;
      border-radius: 3px;
      font-size: 10px;
      cursor: pointer;
      margin-bottom: 0;
      width: auto;
      margin-left: 5px;
    }
    
    .export-paths-btn:hover:not(:disabled) {
      background: #5a32a3;
    }
    
    .export-paths-btn:disabled {
      background: #6c757d;
      cursor: not-allowed;
    }
  `;
  
  document.head.appendChild(style);
}