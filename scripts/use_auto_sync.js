/**
 * Auto Sync UI for Amazon BKTeam Extension
 * 
 * Thêm giao diện vào popup để bật/tắt tính năng tự động đồng bộ lúc 15:00 chiều.
 */

// Thêm UI vào popup khi DOM đã load
document.addEventListener('DOMContentLoaded', function() {
  // Tạo section cho Auto Sync
  const container = document.querySelector('.app-container') || document.body;
  
  // Tạo phần tử HTML cho Auto Sync UI
  const autoSyncSection = document.createElement('div');
  autoSyncSection.className = 'auto-sync-section';
  autoSyncSection.innerHTML = `
    <div class="section-divider"></div>
    <div class="auto-sync-container">
      <h3>Tự động đồng bộ lúc 15:00 chiều</h3>
      <div class="auto-sync-controls">
        <label class="switch">
          <input type="checkbox" id="auto-sync-toggle">
          <span class="slider round"></span>
        </label>
        <div class="auto-sync-status">
          <span id="auto-sync-text">Đang tải...</span>
        </div>
      </div>
      <div class="auto-sync-buttons">
        <button id="run-sync-now-btn" class="btn btn-primary">Đồng bộ ngay</button>
      </div>
    </div>
  `;
  
  // Thêm style CSS cho Auto Sync UI
  const style = document.createElement('style');
  style.textContent = `
    .auto-sync-section {
      padding: 10px;
      margin-top: 10px;
    }
    
    .section-divider {
      height: 1px;
      background-color: #e0e0e0;
      margin: 15px 0;
    }
    
    .auto-sync-container {
      padding: 10px;
      border-radius: 5px;
      background-color: #f5f5f5;
    }
    
    .auto-sync-container h3 {
      margin-top: 0;
      font-size: 16px;
      color: #333;
    }
    
    .auto-sync-controls {
      display: flex;
      align-items: center;
      margin-bottom: 15px;
    }
    
    .auto-sync-status {
      margin-left: 15px;
      font-size: 14px;
    }
    
    /* Toggle Switch */
    .switch {
      position: relative;
      display: inline-block;
      width: 48px;
      height: 24px;
    }
    
    .switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    
    .slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #ccc;
      transition: .4s;
    }
    
    .slider:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: .4s;
    }
    
    input:checked + .slider {
      background-color: #2196F3;
    }
    
    input:checked + .slider:before {
      transform: translateX(24px);
    }
    
    .slider.round {
      border-radius: 24px;
    }
    
    .slider.round:before {
      border-radius: 50%;
    }
    
    .auto-sync-buttons {
      display: flex;
      justify-content: flex-end;
    }
    
    #run-sync-now-btn {
      background-color: #4CAF50;
      color: white;
      border: none;
      padding: 8px 15px;
      text-align: center;
      text-decoration: none;
      display: inline-block;
      font-size: 14px;
      margin: 4px 2px;
      cursor: pointer;
      border-radius: 4px;
    }
    
    #run-sync-now-btn:hover {
      background-color: #45a049;
    }
  `;
  
  // Thêm style và UI vào document
  document.head.appendChild(style);
  container.appendChild(autoSyncSection);
  
  // Các elements
  const autoSyncToggle = document.getElementById('auto-sync-toggle');
  const autoSyncText = document.getElementById('auto-sync-text');
  const runSyncNowBtn = document.getElementById('run-sync-now-btn');
  
  // Kiểm tra trạng thái hiện tại
  checkAutoSyncStatus();
  
  // Thêm event listeners
  autoSyncToggle.addEventListener('change', function() {
    toggleAutoSync(this.checked);
  });
  
  runSyncNowBtn.addEventListener('click', function() {
    runSyncNow();
  });
  
  // Hàm kiểm tra trạng thái
  function checkAutoSyncStatus() {
    chrome.runtime.sendMessage({ message: "checkAutoSyncStatus" }, function(response) {
      if (response) {
        autoSyncToggle.checked = response.enabled;
        autoSyncText.textContent = response.enabled 
          ? `Đồng bộ tiếp theo: ${response.nextSync}`
          : 'Tự động đồng bộ đang tắt';
      } else {
        autoSyncText.textContent = 'Không thể kết nối với extension';
      }
    });
  }
  
  // Hàm bật/tắt tự động đồng bộ
  function toggleAutoSync(enabled) {
    chrome.runtime.sendMessage({ 
      message: "toggleAutoSync", 
      enabled: enabled 
    }, function(response) {
      if (response && response.success) {
        autoSyncText.textContent = enabled 
          ? 'Đã bật tự động đồng bộ. Đang cập nhật...'
          : 'Đã tắt tự động đồng bộ';
          
        // Cập nhật lại trạng thái sau 1 giây
        setTimeout(checkAutoSyncStatus, 1000);
      } else {
        autoSyncText.textContent = 'Không thể cập nhật trạng thái';
        autoSyncToggle.checked = !enabled; // Revert
      }
    });
  }
  
  // Hàm chạy đồng bộ ngay lập tức
  function runSyncNow() {
    runSyncNowBtn.disabled = true;
    runSyncNowBtn.textContent = 'Đang đồng bộ...';
    
    chrome.runtime.sendMessage({ message: "runSyncNow" }, function(response) {
      if (response && response.success) {
        runSyncNowBtn.textContent = 'Đã bắt đầu đồng bộ!';
        setTimeout(() => {
          runSyncNowBtn.disabled = false;
          runSyncNowBtn.textContent = 'Đồng bộ ngay';
        }, 3000);
      } else {
        runSyncNowBtn.textContent = 'Lỗi: Không thể đồng bộ';
        setTimeout(() => {
          runSyncNowBtn.disabled = false;
          runSyncNowBtn.textContent = 'Đồng bộ ngay';
        }, 3000);
      }
    });
  }
}); 