// path-update-ui.js - UI components for showing path update results

/**
 * Show a modal dialog with path update results
 */
export function showPathUpdateDialog(originalPaths, updatedPaths, resolvedVertexId) {
  const affectedPaths = originalPaths.filter(path => 
    Array.from(path.nodes).includes(resolvedVertexId)
  );
  
  const updatedCount = updatedPaths.filter(path => 
    path.originalCoreVertex === resolvedVertexId
  ).length;
  
  const removedCount = affectedPaths.length - updatedCount;
  
  // Create dialog HTML
  const dialogHTML = `
    <div id="pathUpdateDialog" style="display: block;">
      <h3>Path Update Results</h3>
      <div class="update-summary">
        <div class="summary-stats">
          <div class="stat-item">
            <span class="stat-number">${affectedPaths.length}</span>
            <span class="stat-label">Paths affected</span>
          </div>
          <div class="stat-item success">
            <span class="stat-number">${updatedCount}</span>
            <span class="stat-label">Successfully updated</span>
          </div>
          ${removedCount > 0 ? `
          <div class="stat-item warning">
            <span class="stat-number">${removedCount}</span>
            <span class="stat-label">Removed (no valid path)</span>
          </div>
          ` : ''}
        </div>
        
        ${affectedPaths.length > 0 ? `
        <div class="affected-paths">
          <h4>Affected Paths:</h4>
          <div class="path-updates-list">
            ${affectedPaths.map(originalPath => {
              const updated = updatedPaths.find(p => p.id === originalPath.id);
              if (updated) {
                return `
                  <div class="path-update-item updated">
                    <div class="path-update-header">
                      <span class="path-color" style="background-color: ${updated.color}"></span>
                      <span class="path-name">${updated.name}</span>
                      <span class="update-status success">✓ Updated</span>
                    </div>
                    <div class="path-change">
                      <div class="path-before">Before: ${originalPath.sequence}</div>
                      <div class="path-after">After: ${updated.sequence}</div>
                      <div class="path-reason">${updated.updateReason}</div>
                    </div>
                  </div>
                `;
              } else {
                return `
                  <div class="path-update-item removed">
                    <div class="path-update-header">
                      <span class="path-color" style="background-color: ${originalPath.color}"></span>
                      <span class="path-name">${originalPath.name}</span>
                      <span class="update-status removed">✗ Removed</span>
                    </div>
                    <div class="path-change">
                      <div class="path-before">Original: ${originalPath.sequence}</div>
                      <div class="path-reason">No valid replacement path found</div>
                    </div>
                  </div>
                `;
              }
            }).join('')}
          </div>
        </div>
        ` : ''}
      </div>
      
      <div class="dialog-buttons">
        <button class="confirm-btn" id="closePathUpdate">Continue</button>
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
  document.getElementById('closePathUpdate').addEventListener('click', () => {
    document.body.removeChild(dialogContainer);
    if (existingOverlay) {
      existingOverlay.style.display = 'none';
    }
  });
  
  // Close dialog when clicking overlay
  if (existingOverlay) {
    existingOverlay.addEventListener('click', () => {
      document.body.removeChild(dialogContainer);
      existingOverlay.style.display = 'none';
    });
  }
}

/**
 * Add visual indicators to paths in the UI that have been updated
 */
export function markUpdatedPathsInUI(savedPaths) {
  // Add a small delay to ensure UI has been updated
  setTimeout(() => {
    const pathElements = document.querySelectorAll('.saved-path');
    
    pathElements.forEach((pathElement, index) => {
      const path = savedPaths[index];
      if (path && path.lastUpdated && path.updateReason) {
        // Add visual indicator for recently updated paths
        if (!pathElement.querySelector('.update-indicator')) {
          const indicator = document.createElement('div');
          indicator.className = 'update-indicator';
          indicator.title = path.updateReason;
          indicator.innerHTML = '🔄';
          
          const pathHeader = pathElement.querySelector('.path-header');
          if (pathHeader) {
            pathHeader.appendChild(indicator);
          }
          
          // Remove indicator after 10 seconds
          setTimeout(() => {
            if (indicator.parentNode) {
              indicator.parentNode.removeChild(indicator);
            }
          }, 10000);
        }
      }
    });
  }, 100);
}

/**
 * Add CSS styles for path update dialogs
 */
export function addPathUpdateStyles() {
  const styleId = 'path-update-styles';
  if (document.getElementById(styleId)) return; // Already added
  
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    #pathUpdateDialog {
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
    
    .update-summary {
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
      min-width: 80px;
    }
    
    .stat-item.success {
      background: #d4edda;
      border-color: #28a745;
    }
    
    .stat-item.warning {
      background: #fff3cd;
      border-color: #ffc107;
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
    
    .affected-paths h4 {
      margin: 0 0 15px 0;
      color: #333;
      border-bottom: 1px solid #ddd;
      padding-bottom: 5px;
    }
    
    .path-updates-list {
      max-height: 300px;
      overflow-y: auto;
    }
    
    .path-update-item {
      margin-bottom: 15px;
      padding: 12px;
      border-radius: 6px;
      border: 1px solid #ddd;
    }
    
    .path-update-item.updated {
      background: #d4edda;
      border-color: #28a745;
    }
    
    .path-update-item.removed {
      background: #f8d7da;
      border-color: #dc3545;
    }
    
    .path-update-header {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
    }
    
    .path-update-header .path-color {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 8px;
      border: 1px solid rgba(0,0,0,0.2);
    }
    
    .path-update-header .path-name {
      flex: 1;
      font-weight: bold;
      font-size: 14px;
    }
    
    .update-status {
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 12px;
      font-weight: bold;
    }
    
    .update-status.success {
      background: #28a745;
      color: white;
    }
    
    .update-status.removed {
      background: #dc3545;
      color: white;
    }
    
    .path-change {
      font-size: 12px;
      font-family: monospace;
    }
    
    .path-before {
      color: #666;
      margin-bottom: 3px;
    }
    
    .path-after {
      color: #28a745;
      font-weight: bold;
      margin-bottom: 3px;
    }
    
    .path-reason {
      color: #666;
      font-style: italic;
      font-size: 11px;
    }
    
    .update-indicator {
      margin-left: 8px;
      font-size: 12px;
      animation: pulse 2s infinite;
      cursor: help;
    }
    
    @keyframes pulse {
      0% { opacity: 1; }
      50% { opacity: 0.5; }
      100% { opacity: 1; }
    }
  `;
  
  document.head.appendChild(style);
}