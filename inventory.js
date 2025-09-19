// FUEL_SOURCES ถูกประกาศใน common.js แล้ว

// ตัวแปรสำหรับเก็บข้อมูลยอดคงเหลือปัจจุบัน
let currentInventory = {};
window.currentInventory = currentInventory;

// Clean up any orphaned callback functions
function cleanupOrphanedCallbacks() {
  let callbacksCleaned = 0;
  let scriptsRemoved = 0;
  
  // Clean up callback functions in window object
  for (let prop in window) {
    if (prop.startsWith('jsonp_callback_') || prop.startsWith('cb_') || prop.startsWith('fuel_') || 
        prop.startsWith('inventory_callback') || prop.startsWith('budget_callback')) {
      console.log(`🧹 Cleaning up orphaned callback: ${prop}`);
      try {
        delete window[prop];
        callbacksCleaned++;
      } catch (e) {
        window[prop] = undefined;
        callbacksCleaned++;
      }
    }
  }
  
  // Clean up callbacks that match timestamp patterns
  const timestampPattern = /^(fuel_|cb_|jsonp_callback_)\d+_[a-z0-9]+$/;
  Object.keys(window).forEach(prop => {
    if (timestampPattern.test(prop)) {
      console.log(`🧹 Cleaning up timestamped callback: ${prop}`);
      try {
        delete window[prop];
        callbacksCleaned++;
      } catch (e) {
        window[prop] = undefined;
        callbacksCleaned++;
      }
    }
  });
  
  // Clean up orphaned script tags
  const knownPrefixes = ['jsonp_callback_', 'cb_', 'fuel_', 'inventory_callback', 'budget_callback'];
  const scripts = document.querySelectorAll('script[src*="callback="]');
  scripts.forEach(script => {
    const src = script.src;
    const hasKnownCallback = knownPrefixes.some(prefix => 
      src.includes(`callback=${prefix}`) || 
      src.includes('callback=inventory_callback') ||
      src.includes('callback=budget_callback')
    );
    
    if (hasKnownCallback) {
      console.log(`🧹 Removing orphaned script: ${src}`);
      script.remove();
      scriptsRemoved++;
    }
  });
  
  return { callbacksCleaned, scriptsRemoved };
}

// ฟังก์ชัน retry สำหรับ API calls - ใช้ jsonp จาก common.js
async function jsonpWithRetry(url, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 API Call attempt ${attempt}/${maxRetries}: ${url}`);
      const result = await jsonp(url); // ใช้ฟังก์ชัน jsonp จาก common.js
      console.log(`✅ API Call successful on attempt ${attempt}`);
      return result;
    } catch (error) {
      console.error(`❌ API Call attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries) {
        console.error(`💥 All ${maxRetries} attempts failed for: ${url}`);
        throw error;
      }
      
      // รอ 2 วินาทีก่อน retry
      console.log(`⏳ Waiting 2 seconds before retry...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

// โหลดข้อมูลยอดคงเหลือ
async function loadInventoryData() {
  const loadingIndicator = document.getElementById('loadingIndicator');
  const inventoryGrid = document.getElementById('inventoryGrid');
  
  loadingIndicator.style.display = 'block';
  inventoryGrid.style.display = 'none';
  
  try {
    const api = getApiUrl();
    if (!api) {
      alert('กรุณาตั้งค่า API URL ก่อน');
      return;
    }
    
    const url = api + '?action=inventory';
    const response = await jsonpWithRetry(url, 3);
    
    console.log('📊 Inventory API Response:', response);
    
    if (response && response.success && response.inventory) {
      currentInventory = response.inventory;
      window.currentInventory = currentInventory;
      console.log('📦 Current inventory data:', currentInventory);
      renderInventoryCards();
    } else {
      throw new Error('ไม่สามารถโหลดข้อมูลได้');
    }
  } catch (error) {
    console.error('Error loading inventory:', error);
    alert('เกิดข้อผิดพลาดในการโหลดข้อมูล: ' + error.message);
  } finally {
    loadingIndicator.style.display = 'none';
    inventoryGrid.style.display = 'grid';
  }
}

// แสดงการ์ดยอดคงเหลือ
function renderInventoryCards() {
  const grid = document.getElementById('inventoryGrid');
  grid.innerHTML = '';
  
  Object.keys(FUEL_SOURCES).forEach(sourceName => {
    const sourceInfo = FUEL_SOURCES[sourceName];
    const inventoryData = currentInventory[sourceName] || {
      currentStock: 0,
      lastUpdated: new Date()
    };
    
    const card = createInventoryCard(sourceName, sourceInfo, inventoryData);
    grid.appendChild(card);
  });
}

// สร้างการ์ดยอดคงเหลือ
function createInventoryCard(sourceName, sourceInfo, inventoryData) {
  const card = document.createElement('div');
  card.className = 'inventory-card';
  
  // ตรวจสอบและกำหนดค่าเริ่มต้น
  if (!sourceInfo) {
    console.warn(`Missing sourceInfo for ${sourceName}`);
    sourceInfo = { capacity: 0, type: 'unknown' };
  }
  
  const currentStock = Number(inventoryData?.currentStock) || 0;
  const currentDrums = Number(inventoryData?.currentDrums) || 0;
  const capacity = Number(sourceInfo.capacity) || 0;
  const isBarrel = sourceInfo.type === 'barrel' && sourceInfo.unitSize;
  const isDrumStorage = sourceInfo.type === 'drum_storage' && sourceInfo.unitSize;
  const isUnlimitedCapacity = capacity === -1;
  
  // สำหรับ drum_storage คำนวณจำนวนถังจาก currentStock
  const currentDrumsFromStock = isDrumStorage ? 
    Math.floor((currentStock || 0) / (sourceInfo.unitSize || 200)) : 0;
  
  let displayInfo, progressSection, inputPlaceholder;
  
  if (isDrumStorage && sourceInfo.unitSize) {
    // สำหรับคลังถัง 200L ใหม่
    const calculatedLiters = currentStock || 0; // ใช้ currentStock โดยตรง
    const location = sourceInfo.location || '';
    
    displayInfo = `
      <div class="info-row">
        <span class="info-label">สถานที่:</span>
        <span class="info-value">${location}</span>
      </div>
      <div class="info-row">
        <span class="info-label">จำนวนถัง:</span>
        <span class="info-value">${(currentDrumsFromStock || 0).toLocaleString()} ถัง</span>
      </div>
      <div class="info-row">
        <span class="info-label">ลิตรรวม:</span>
        <span class="info-value current-stock">${(calculatedLiters || 0).toLocaleString()} ลิตร</span>
      </div>
      <div class="info-row">
        <span class="info-label">ความจุ:</span>
        <span class="info-value">ไม่จำกัด</span>
      </div>
    `;
    
    progressSection = `
      <div class="progress-bar">
        <div class="progress-fill" style="width: 100%; background: linear-gradient(90deg, #2196f3, #42a5f5);"></div>
      </div>
    `;
    
    inputPlaceholder = "จำนวนถัง (เช่น 5 ถัง)";
  } else if (isBarrel && sourceInfo.unitSize) {
    // สำหรับถังน้ำมัน 200 ลิตร เดิม
    const unitSize = sourceInfo.unitSize || 1;
    const tankCount = Math.floor((currentStock || 0) / unitSize);
    const remainingLiters = (currentStock || 0) % unitSize;
    
    displayInfo = `
      <div class="info-row">
        <span class="info-label">จำนวนถัง:</span>
        <span class="info-value">${tankCount} ถัง</span>
      </div>
      <div class="info-row">
        <span class="info-label">เศษเหลือ:</span>
        <span class="info-value">${remainingLiters} ลิตร</span>
      </div>
      <div class="info-row">
        <span class="info-label">รวมทั้งหมด:</span>
        <span class="info-value current-stock">${(currentStock || 0).toLocaleString()} ลิตร</span>
      </div>
      <div class="info-row">
        <span class="info-label">ความจุ:</span>
        <span class="info-value">ไม่จำกัด</span>
      </div>
    `;
    
    progressSection = `
      <div class="progress-bar">
        <div class="progress-fill" style="width: 100%; background: linear-gradient(90deg, #4caf50, #66bb6a);"></div>
      </div>
    `;
    
    inputPlaceholder = "ลิตรใหม่ (หรือ จำนวนถัง x 200)";
  } else {
    // สำหรับแหล่งอื่นๆ
    const percentage = capacity > 0 ? Math.min((currentStock / capacity) * 100, 120) : 0;
    
    // กำหนดสีตามระดับ
    let progressClass = '';
    if (percentage > 100) {
      progressClass = 'overfill';
    } else if (percentage > 80) {
      progressClass = '';
    } else if (percentage > 20) {
      progressClass = 'warning';
    } else {
      progressClass = 'danger';
    }
    
    displayInfo = `
      <div class="info-row">
        <span class="info-label">ความจุ:</span>
        <span class="info-value">${(capacity || 0).toLocaleString()} ลิตร</span>
      </div>
      <div class="info-row">
        <span class="info-label">ยอดคงเหลือ:</span>
        <span class="info-value current-stock">${(currentStock || 0).toLocaleString()} ลิตร</span>
      </div>
      <div class="info-row">
        <span class="info-label">เปอร์เซ็นต์:</span>
        <span class="info-value">${(percentage || 0).toFixed(1)}%</span>
      </div>
    `;
    
    progressSection = `
      <div class="progress-bar">
        <div class="progress-fill ${progressClass}" style="width: ${Math.min(percentage, 100)}%"></div>
      </div>
    `;
    
    inputPlaceholder = "ยอดคงเหลือใหม่ (ลิตร)";
  }
  
  // แปลง lastUpdated จาก timestamp หรือ date string
  let lastUpdated = 'ไม่ทราบ';
  if (inventoryData.lastUpdated) {
    try {
      // ถ้าเป็นตัวเลข (timestamp) ให้คูณด้วย 1000 เพื่อแปลงเป็น milliseconds
      const timestamp = typeof inventoryData.lastUpdated === 'number' ? 
        inventoryData.lastUpdated * 1000 : 
        inventoryData.lastUpdated;
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        lastUpdated = date.toLocaleString('th-TH');
      }
    } catch (error) {
      console.warn('Error parsing lastUpdated:', error);
    }
  }
  
  card.innerHTML = `
    <div class="inventory-header">
      <div class="source-name">${sourceName}</div>
      <div class="source-type ${sourceInfo.type}">${getTypeLabel(sourceInfo.type)}</div>
    </div>
    
    <div class="inventory-info">
      ${displayInfo}
    </div>
    
    ${progressSection}
    
    <div class="edit-section">
      <div style="margin-bottom: 10px; font-size: 12px; color: #666;">
        ${isDrumStorage ? 
          `ยอดปัจจุบัน: <strong>${currentDrumsFromStock.toLocaleString()} ถัง (${currentStock.toLocaleString()} ลิตร)</strong>` :
          `ยอดปัจจุบัน: <strong>${currentStock.toLocaleString()} ลิตร</strong>`
        }
      </div>
      
      ${(isDrumStorage || isBarrel) && sourceInfo.unitSize === 200 ? `
        <div style="margin-bottom: 8px;">
          <div style="display: flex; gap: 4px; flex-wrap: wrap;">
            <button 
              onclick="quickAdjustInventory('${sourceName}', 'add')" 
              class="quick-btn add-btn" 
              title="เติมน้ำมันแบบเร็ว"
              style="font-size: 11px; padding: 4px 8px; background: #4caf50; color: white; border: none; border-radius: 3px; cursor: pointer;"
            >
              ➕ เติม
            </button>
            <button 
              onclick="quickAdjustInventory('${sourceName}', 'remove')" 
              class="quick-btn remove-btn" 
              title="จ่ายน้ำมันแบบเร็ว"
              style="font-size: 11px; padding: 4px 8px; background: #f44336; color: white; border: none; border-radius: 3px; cursor: pointer;"
            >
              ➖ จ่าย
            </button>
            ${isDrumStorage ? `
              <button 
                onclick="bulkTankOperation('${sourceName}')" 
                class="quick-btn bulk-btn" 
                title="จัดการถังจำนวนมาก"
                style="font-size: 11px; padding: 4px 8px; background: #2196f3; color: white; border: none; border-radius: 3px; cursor: pointer;"
              >
                📦 จัดการถัง
              </button>
            ` : ''}
          </div>
        </div>
      ` : ''}
      
      <div class="edit-form">
        <input 
          type="number" 
          class="edit-input" 
          placeholder="${inputPlaceholder}" 
          step="0.01"
          min="0"
          id="input-${sourceName}"
          oninput="showPreview('${sourceName}')"
        />
        <button 
          class="btn-primary" 
          onclick="updateInventory('${sourceName}')"
          title="อัปเดตยอดคงเหลือเป็นค่าใหม่ที่กรอก"
          style="font-size: 0.875rem; padding: var(--spacing-2) var(--spacing-4);"
        >
          🔄 ตั้งค่า
        </button>
      </div>
      <div id="preview-${sourceName}" style="margin-top: 8px; font-size: 12px; color: #1976d2; display: none;">
        <!-- Preview will show here -->
      </div>
      <div class="last-updated">
        อัปเดตล่าสุด: ${lastUpdated}
      </div>
    </div>
  `;
  
  return card;
}

// แปลงประเภทเป็นป้ายกำกับ
function getTypeLabel(type) {
  switch (type) {
    case 'tankfarm': return 'แท๊งฟาร์ม';
    case 'truck': return 'รถน้ำมัน';
    case 'barrel': return 'ถังน้ำมัน';
    case 'drum_storage': return 'คลังถัง 200L';
    default: return type;
  }
}

// อัปเดตยอดคงเหลือ
async function updateInventory(sourceName) {
  const input = document.getElementById(`input-${sourceName}`);
  const newValue = parseFloat(input.value);
  
  if (isNaN(newValue) || newValue < 0) {
    alert('กรุณากรอกจำนวนที่ถูกต้อง');
    return;
  }
  
  const sourceInfo = FUEL_SOURCES[sourceName];
  const isDrumStorage = sourceInfo?.type === 'drum_storage';
  const currentStock = currentInventory[sourceName]?.currentStock || 0;
  const currentDrums = currentInventory[sourceName]?.currentDrums || 0;
  
  let confirmText;
  if (isDrumStorage) {
    // สำหรับ drum storage - input เป็นจำนวนถัง
    const newLiters = newValue * sourceInfo.unitSize;
    confirmText = `ต้องการอัปเดตยอดคงเหลือของ "${sourceName}"\nจาก ${currentDrums.toLocaleString()} ถัง (${(currentDrums * sourceInfo.unitSize).toLocaleString()} ลิตร)\nเป็น ${newValue.toLocaleString()} ถัง (${newLiters.toLocaleString()} ลิตร)?`;
  } else {
    // สำหรับแหล่งอื่นๆ - input เป็นลิตร
    confirmText = `ต้องการอัปเดตยอดคงเหลือของ "${sourceName}"\nจาก ${currentStock.toLocaleString()} ลิตร\nเป็น ${newValue.toLocaleString()} ลิตร?`;
  }
  
  const confirmed = confirm(confirmText);
  if (!confirmed) return;
  
  try {
    const api = getApiUrl();
    if (!api) {
      alert('กรุณาตั้งค่า API URL ก่อน');
      return;
    }
    
    // ใช้การอัปเดตโดยตรงแทนการสร้างธุรกรรม
    let url;
    if (isDrumStorage) {
      // สำหรับ drum storage - ส่งจำนวนถัง
      const newLiters = newValue * sourceInfo.unitSize;
      url = api + '?action=direct_drum_inventory_update&source=' + 
            encodeURIComponent(sourceName) + '&drums=' + newValue + '&liters=' + newLiters;
    } else {
      // สำหรับแหล่งอื่นๆ - ส่งลิตร
      url = api + '?action=direct_inventory_update&source=' + 
            encodeURIComponent(sourceName) + '&stock=' + newValue;
    }
    const response = await jsonpWithRetry(url, 3);
    
    if (response && response.success) {
      alert('อัปเดตยอดคงเหลือเรียบร้อยแล้ว');
      input.value = '';
      
      // รีเฟรชข้อมูล
      await loadInventoryData();
    } else {
      throw new Error(response?.error || 'ไม่สามารถอัปเดตได้');
    }
  } catch (error) {
    console.error('Error updating inventory:', error);
    alert('เกิดข้อผิดพลาดในการอัปเดต: ' + error.message);
  }
}

// ปรับปรุงยอดคงเหลือแบบเติม/จ่าย (ปรับปรุงใหม่ 200L Logic)
async function quickAdjustInventory(sourceName, action) {
  const sourceInfo = FUEL_SOURCES[sourceName];
  const isBarrel = sourceInfo?.type === 'barrel' && sourceInfo?.unitSize;
  const isDrumStorage = sourceInfo?.type === 'drum_storage' && sourceInfo?.unitSize;
  const is200LTank = (isBarrel || isDrumStorage) && sourceInfo?.unitSize === 200;
  
  let amount, inputMethod, actionText;
  
  if (is200LTank) {
    // สำหรับถัง 200 ลิตร - ปรับปรุงใหม่
    const options = [
      'ถัง (200 ลิตร/ถัง)',
      'ลิตร (ระบุจำนวนลิตรโดยตรง)',
      'จำนวนถัง + เศษลิตรเพิ่มเติม'
    ];
    
    const choice = await showInputMethodDialog(action, options);
    if (choice === null) return;
    
    switch (choice) {
      case 0: // ถัง
        const tankCount = await showNumberInputDialog(
          action === 'add' ? 'จำนวนถังที่ต้องการเติม' : 'จำนวนถังที่ต้องการจ่าย',
          'ถัง',
          0.1
        );
        if (tankCount === null) return;
        
        amount = tankCount * 200;
        inputMethod = 'tank';
        actionText = `${action === 'add' ? 'เติม' : 'จ่าย'}น้ำมัน ${tankCount} ถัง (${amount.toLocaleString()} ลิตร)`;
        break;
        
      case 1: // ลิตร
        amount = await showNumberInputDialog(
          action === 'add' ? 'จำนวนลิตรที่ต้องการเติม' : 'จำนวนลิตรที่ต้องการจ่าย',
          'ลิตร',
          0.01
        );
        if (amount === null) return;
        
        inputMethod = 'liter';
        const tankEquivalent = (amount / 200).toFixed(2);
        actionText = `${action === 'add' ? 'เติม' : 'จ่าย'}น้ำมัน ${amount.toLocaleString()} ลิตร (≈ ${tankEquivalent} ถัง)`;
        break;
        
      case 2: // ถัง + เศษลิตร
        const tankInput = await showTankPlusLiterDialog(action);
        if (tankInput === null) return;
        
        amount = (tankInput.tanks * 200) + tankInput.extraLiters;
        inputMethod = 'mixed';
        actionText = `${action === 'add' ? 'เติม' : 'จ่าย'}น้ำมัน ${tankInput.tanks} ถัง + ${tankInput.extraLiters} ลิตร (รวม ${amount.toLocaleString()} ลิตร)`;
        break;
        
      default:
        return;
    }
  } else {
    // สำหรับแหล่งอื่นๆ - กรอกลิตรเท่านั้น
    amount = await showNumberInputDialog(
      action === 'add' ? 'จำนวนที่ต้องการเติม' : 'จำนวนที่ต้องการจ่าย',
      'ลิตร',
      0.01
    );
    if (amount === null) return;
    
    inputMethod = 'liter';
    actionText = `${action === 'add' ? 'เติม' : 'จ่าย'}น้ำมัน ${amount.toLocaleString()} ลิตร`;
  }
  
  if (isNaN(amount) || amount <= 0) {
    alert('กรุณากรอกจำนวนที่ถูกต้อง');
    return;
  }
  
  // คำนวณยอดใหม่
  const currentStock = currentInventory[sourceName]?.currentStock || 0;
  const currentDrums = currentInventory[sourceName]?.currentDrums || 0;
  let newStock, newDrums;
  
  if (isDrumStorage) {
    // สำหรับ drum_storage ใช้จำนวนถัง
    const currentLiters = currentDrums * 200;
    if (action === 'add') {
      newDrums = currentDrums + (amount / 200);
    } else {
      newDrums = currentDrums - (amount / 200);
      if (newDrums < 0) {
        const confirmed = confirm(`การจ่ายนี้จะทำให้จำนวนถังติดลบ (${newDrums.toFixed(2)} ถัง)\nต้องการดำเนินการต่อหรือไม่?`);
        if (!confirmed) return;
      }
    }
    newStock = newDrums * 200;
  } else {
    // สำหรับประเภทอื่น ใช้ลิตร
    if (action === 'add') {
      newStock = currentStock + amount;
    } else {
      newStock = currentStock - amount;
      if (newStock < 0) {
        const confirmed = confirm(`การจ่ายนี้จะทำให้ยอดคงเหลือติดลบ (${newStock.toLocaleString()} ลิตร)\nต้องการดำเนินการต่อหรือไม่?`);
        if (!confirmed) return;
      }
    }
  }
  
  // สร้างข้อความยืนยัน
  let confirmText = `${actionText}\n\n`;
  
  if (isDrumStorage) {
    confirmText += `จำนวนถัง: ${currentDrums.toFixed(2)} → ${newDrums.toFixed(2)} ถัง\n`;
    confirmText += `ลิตรรวม: ${(currentDrums * 200).toLocaleString()} → ${(newDrums * 200).toLocaleString()} ลิตร`;
  } else if (is200LTank) {
    const currentTanks = Math.floor(currentStock / 200);
    const currentRemainder = currentStock % 200;
    const newTanks = Math.floor(newStock / 200);
    const newRemainder = newStock % 200;
    
    confirmText += `ยอดคงเหลือ: ${currentStock.toLocaleString()} → ${newStock.toLocaleString()} ลิตร\n`;
    confirmText += `จำนวนถัง: ${currentTanks} ถัง`;
    if (currentRemainder > 0) confirmText += ` (+${currentRemainder.toFixed(1)} L)`;
    confirmText += ` → ${newTanks} ถัง`;
    if (newRemainder > 0) confirmText += ` (+${newRemainder.toFixed(1)} L)`;
  } else {
    confirmText += `ยอดคงเหลือ: ${currentStock.toLocaleString()} → ${newStock.toLocaleString()} ลิตร`;
    
    if (sourceInfo.capacity > 0) {
      const newPercentage = (newStock / sourceInfo.capacity * 100);
      confirmText += `\nเปอร์เซ็นต์: ${newPercentage.toFixed(1)}%`;
    }
  }
  
  confirmText += '\n\nยืนยันการดำเนินการ?';
  const confirmed = confirm(confirmText);
  if (!confirmed) return;
  
  try {
    const api = getApiUrl();
    if (!api) {
      alert('กรุณาตั้งค่า API URL ก่อน');
      return;
    }
    
    let url;
    if (isDrumStorage) {
      // สำหรับ drum storage
      url = api + '?action=direct_drum_inventory_update&source=' + 
            encodeURIComponent(sourceName) + '&drums=' + newDrums + '&liters=' + newStock;
    } else {
      // สำหรับแหล่งอื่นๆ
      url = api + '?action=direct_inventory_update&source=' + 
            encodeURIComponent(sourceName) + '&stock=' + newStock;
    }
    
    const response = await jsonpWithRetry(url, 3);
    
    if (response && response.success) {
      alert(`${actionText} เรียบร้อยแล้ว`);
      
      // บันทึกประวัติการทำธุรกรรม (ถ้าต้องการ)
      await logTransaction(sourceName, action, amount, inputMethod, actionText);
      
      // รีเฟรชข้อมูล
      await loadInventoryData();
    } else {
      throw new Error(response?.error || 'ไม่สามารถอัปเดตได้');
    }
  } catch (error) {
    console.error('Error quick adjusting inventory:', error);
    alert('เกิดข้อผิดพลาดในการ' + actionText + ': ' + error.message);
  }
}

// อัปเดตยอดคงเหลือโดยตรงใน Google Sheets (สำหรับกรณีฉุกเฉิน)
async function directUpdateInventory(sourceName, newStock) {
  try {
    const api = getApiUrl();
    if (!api) {
      alert('กรุณาตั้งค่า API URL ก่อน');
      return;
    }
    
    // เรียกใช้ฟังก์ชันพิเศษใน Google Apps Script
    const url = api + '?action=direct_inventory_update&source=' + 
                encodeURIComponent(sourceName) + '&stock=' + newStock;
    const response = await jsonpWithRetry(url, 3);
    
    if (response && response.success) {
      alert('อัปเดตยอดคงเหลือโดยตรงเรียบร้อยแล้ว');
      await loadInventoryData();
    } else {
      throw new Error(response?.error || 'ไม่สามารถอัปเดตได้');
    }
  } catch (error) {
    console.error('Error direct updating inventory:', error);
    alert('เกิดข้อผิดพลาดในการอัปเดตโดยตรง: ' + error.message);
  }
}

// แสดงตัวอย่างการเปลี่ยนแปลง (ปรับปรุงใหม่ 200L Logic)
function showPreview(sourceName) {
  const input = document.getElementById(`input-${sourceName}`);
  const preview = document.getElementById(`preview-${sourceName}`);
  const inputValue = parseFloat(input.value);
  
  if (isNaN(inputValue) || inputValue < 0) {
    preview.style.display = 'none';
    return;
  }
  
  const sourceInfo = FUEL_SOURCES[sourceName];
  const isDrumStorage = sourceInfo?.type === 'drum_storage' && sourceInfo?.unitSize;
  const isBarrel = sourceInfo?.type === 'barrel' && sourceInfo?.unitSize;
  const is200LTank = (isBarrel || isDrumStorage) && sourceInfo?.unitSize === 200;
  
  const currentStock = currentInventory[sourceName]?.currentStock || 0;
  const currentDrums = currentInventory[sourceName]?.currentDrums || 0;
  const capacity = sourceInfo?.capacity || 0;
  
  let newValue, currentValue, diffText, diffColor = '#1976d2', additionalInfo = '';
  
  if (isDrumStorage) {
    // สำหรับ drum storage - input เป็นจำนวนถัง
    newValue = inputValue * 200; // แปลงเป็นลิตร
    currentValue = currentDrums * 200;
    const diff = newValue - currentValue;
    const drumDiff = inputValue - currentDrums;
    
    if (diff > 0) {
      diffText = `(+${diff.toLocaleString()} ลิตร, +${drumDiff.toFixed(2)} ถัง)`;
      diffColor = '#4caf50';
    } else if (diff < 0) {
      diffText = `(${diff.toLocaleString()} ลิตร, ${drumDiff.toFixed(2)} ถัง)`;
      diffColor = '#f44336';
    } else {
      diffText = '(ไม่เปลี่ยนแปลง)';
    }
    
    additionalInfo = `<br>จำนวนถัง: ${currentDrums.toFixed(2)} → ${inputValue.toFixed(2)} ถัง`;
    
  } else if (is200LTank) {
    // สำหรับ 200L tank - input เป็นลิตร
    newValue = inputValue;
    currentValue = currentStock;
    const diff = newValue - currentValue;
    
    if (diff > 0) {
      diffText = `(+${diff.toLocaleString()} ลิตร)`;
      diffColor = '#4caf50';
    } else if (diff < 0) {
      diffText = `(${diff.toLocaleString()} ลิตร)`;
      diffColor = '#f44336';
    } else {
      diffText = '(ไม่เปลี่ยนแปลง)';
    }
    
    // ใช้ enhanced calculation
    const calculation = calculateOptimalTankDisplay(currentValue, newValue, 200);
    additionalInfo = `<br>จำนวนถัง: ${calculation.summary.current} → ${calculation.summary.target}`;
    if (Math.abs(diff) > 0) {
      additionalInfo += `<br>เปลี่ยนแปลง: ${calculation.summary.difference}`;
    }
    
  } else {
    // สำหรับแหล่งอื่นๆ
    newValue = inputValue;
    currentValue = currentStock;
    const diff = newValue - currentValue;
    
    if (diff > 0) {
      diffText = `(+${diff.toLocaleString()} ลิตร)`;
      diffColor = '#4caf50';
    } else if (diff < 0) {
      diffText = `(${diff.toLocaleString()} ลิตร)`;
      diffColor = '#f44336';
    } else {
      diffText = '(ไม่เปลี่ยนแปลง)';
    }
    
    if (capacity > 0) {
      const currentPercentage = (currentValue / capacity * 100);
      const newPercentage = (newValue / capacity * 100);
      additionalInfo = `<br>เปอร์เซ็นต์: ${currentPercentage.toFixed(1)}% → ${newPercentage.toFixed(1)}%`;
      
      // เตือนถ้าเกินความจุ
      if (newPercentage > 100) {
        additionalInfo += ' <span style="color: #f44336;">⚠️ เกินความจุ</span>';
      } else if (newPercentage > 90) {
        additionalInfo += ' <span style="color: #ff9800;">⚠️ ใกล้เต็ม</span>';
      }
    }
  }
  
  // สร้าง preview text
  let previewText = '';
  if (isDrumStorage) {
    previewText = `จะเป็น: ${inputValue.toFixed(2)} ถัง (${newValue.toLocaleString()} ลิตร) ${diffText}`;
  } else {
    previewText = `จะเป็น: ${newValue.toLocaleString()} ลิตร ${diffText}`;
  }
  
  preview.innerHTML = `
    <span style="color: ${diffColor};">
      ${previewText}
      ${additionalInfo}
    </span>
  `;
  preview.style.display = 'block';
}

// เริ่มต้นเมื่อโหลดหน้า
document.addEventListener('DOMContentLoaded', function() {
  loadInventoryData();
});

// นำเข้าข้อมูลยอดคงเหลือเริ่มต้น
async function initializeInventoryData() {
  const confirmed = confirm('ต้องการนำเข้าข้อมูลยอดคงเหลือเริ่มต้น?\n\n⚠️ การดำเนินการนี้จะลบข้อมูลยอดคงเหลือเดิมทั้งหมด');
  if (!confirmed) return;
  
  try {
    const api = getApiUrl();
    if (!api) {
      alert('กรุณาตั้งค่า API URL ก่อน');
      return;
    }
    
    const url = api + '?action=init_inventory_data';
    const response = await jsonpWithRetry(url, 3);
    
    if (response && response.success) {
      alert(`นำเข้าข้อมูลเริ่มต้นเรียบร้อยแล้ว\nจำนวน ${response.count} รายการ`);
      await loadInventoryData();
    } else {
      throw new Error(response?.error || 'ไม่สามารถนำเข้าข้อมูลได้');
    }
  } catch (error) {
    console.error('Error initializing inventory:', error);
    alert('เกิดข้อผิดพลาดในการนำเข้าข้อมูล: ' + error.message);
  }
}

// รีเฟรชข้อมูลทุก 5 นาที
setInterval(loadInventoryData, 5 * 60 * 1000);

// ================ IMPROVED 200L TANK LOGIC SUPPORT FUNCTIONS ================

// แสดง dialog เลือกวิธีการป้อนข้อมูล
function showInputMethodDialog(action, options) {
  return new Promise((resolve) => {
    const actionText = action === 'add' ? 'เติม' : 'จ่าย';
    let optionText = `เลือกวิธีการ${actionText}น้ำมัน:\n\n`;
    
    options.forEach((option, index) => {
      optionText += `${index + 1}. ${option}\n`;
    });
    
    optionText += `\nกรุณาเลือก (1-${options.length}) หรือกด Cancel เพื่อยกเลิก:`;
    
    const choice = prompt(optionText);
    if (choice === null) {
      resolve(null);
      return;
    }
    
    const choiceNum = parseInt(choice);
    if (isNaN(choiceNum) || choiceNum < 1 || choiceNum > options.length) {
      alert('กรุณาเลือกตัวเลข 1-' + options.length);
      resolve(null);
      return;
    }
    
    resolve(choiceNum - 1);
  });
}

// แสดง dialog สำหรับป้อนตัวเลข
function showNumberInputDialog(prompt, unit, step) {
  return new Promise((resolve) => {
    const input = prompt(`${prompt}:\n\n(หน่วย: ${unit}, ขั้นต่ำ ${step})`);
    if (input === null) {
      resolve(null);
      return;
    }
    
    const number = parseFloat(input);
    if (isNaN(number) || number <= 0) {
      alert(`กรุณากรอกจำนวน${unit}ที่ถูกต้อง (มากกว่า 0)`);
      resolve(null);
      return;
    }
    
    resolve(number);
  });
}

// แสดง dialog สำหรับป้อนถัง + เศษลิตร
function showTankPlusLiterDialog(action) {
  return new Promise((resolve) => {
    const actionText = action === 'add' ? 'เติม' : 'จ่าย';
    
    // ป้อนจำนวนถัง
    const tankInput = prompt(`จำนวนถังที่ต้องการ${actionText} (ถัง เต็ม):\n\nตอกำ: 5 (สำหรับ 5 ถัง)`);
    if (tankInput === null) {
      resolve(null);
      return;
    }
    
    const tanks = parseInt(tankInput);
    if (isNaN(tanks) || tanks < 0) {
      alert('กรุณากรอกจำนวนถังที่ถูกต้อง');
      resolve(null);
      return;
    }
    
    // ป้อนเศษลิตร
    const literInput = prompt(`ลิตรเพิ่มเติม (เศษ):\n\nตัวอย่าง: 50 (สำหรับเศษ 50 ลิตร)\nหรือกด OK เพื่อข้าม (0 ลิตร)`);
    
    let extraLiters = 0;
    if (literInput !== null && literInput.trim() !== '') {
      extraLiters = parseFloat(literInput);
      if (isNaN(extraLiters) || extraLiters < 0 || extraLiters >= 200) {
        alert('กรุณากรอกลิตรเพิ่มเติม 0-199.99 ลิตร');
        resolve(null);
        return;
      }
    }
    
    resolve({
      tanks: tanks,
      extraLiters: extraLiters
    });
  });
}

// บันทึกประวัติการทำธุรกรรม (Optional - for audit trail)
async function logTransaction(sourceName, action, amount, inputMethod, description) {
  try {
    const api = getApiUrl();
    if (!api) return; // Skip if no API
    
    const transactionData = {
      source: sourceName,
      action: action, // 'add' or 'remove'
      amount: amount,
      inputMethod: inputMethod, // 'tank', 'liter', 'mixed'
      description: description,
      timestamp: new Date().toISOString(),
      user: 'system' // You can enhance this to track actual users
    };
    
    const url = api + '?action=log_transaction&data=' + encodeURIComponent(JSON.stringify(transactionData));
    
    // Fire and forget - don't wait for response
    jsonp(url).catch(() => {
      // Ignore errors - logging is optional
      console.log('Transaction logging failed (non-critical)');
    });
  } catch (error) {
    // Ignore errors - logging is optional
    console.log('Transaction logging error (non-critical):', error.message);
  }
}

// ================ ENHANCED 200L CALCULATIONS ================

// คำนวณถังและเศษจากลิตร (ปรับปรุงใหม่)
function calculateTanksFromLiters(liters, unitSize = 200) {
  const fullTanks = Math.floor(liters / unitSize);
  const remainder = liters % unitSize;
  const fractionalTanks = liters / unitSize;
  
  return {
    fullTanks: fullTanks,
    remainder: remainder,
    fractionalTanks: fractionalTanks,
    totalLiters: liters,
    summary: `${fullTanks} ถัง` + (remainder > 0 ? ` (+${remainder.toFixed(2)} L)` : '')
  };
}

// คำนวณลิตรจากถังและเศษ
function calculateLitersFromTanks(tanks, extraLiters = 0, unitSize = 200) {
  const totalLiters = (tanks * unitSize) + extraLiters;
  return {
    tanks: tanks,
    extraLiters: extraLiters,
    totalLiters: totalLiters,
    summary: tanks > 0 ? `${tanks} ถัง` + (extraLiters > 0 ? ` + ${extraLiters} L` : '') : `${extraLiters} L`
  };
}

// ปรับปรุงการคำนวณความจุแบบชาญฉลาด
function calculateOptimalTankDisplay(currentLiters, targetLiters, unitSize = 200) {
  const current = calculateTanksFromLiters(currentLiters, unitSize);
  const target = calculateTanksFromLiters(targetLiters, unitSize);
  const difference = targetLiters - currentLiters;
  const diffCalc = calculateTanksFromLiters(Math.abs(difference), unitSize);
  
  return {
    current: current,
    target: target,
    difference: difference,
    differenceCalc: diffCalc,
    summary: {
      current: current.summary,
      target: target.summary,
      difference: (difference >= 0 ? '+' : '-') + diffCalc.summary
    }
  };
}

// จัดการถังจำนวนมาก (สำหรับ drum storage)
async function bulkTankOperation(sourceName) {
  const sourceInfo = FUEL_SOURCES[sourceName];
  const isDrumStorage = sourceInfo?.type === 'drum_storage';
  
  if (!isDrumStorage) {
    alert('ฟีเจอร์นี้ใช้ได้เฉพาะกับคลังถัง 200L เท่านั้น');
    return;
  }
  
  const currentDrums = currentInventory[sourceName]?.currentDrums || 0;
  const currentLiters = currentDrums * 200;
  
  const operations = [
    'เพิ่มถังใหม่ (รับเข้าจากการซื้อ)',
    'จ่ายถังออก (ส่งไปใช้งาน)',
    'ตั้งค่ายอดถังทั้งหมด',
    'โอนถังระหว่างที่เก็บ',
    'ตรวจนับถังจริง'
  ];
  
  const choice = await showInputMethodDialog('จัดการ', operations);
  if (choice === null) return;
  
  switch (choice) {
    case 0: // เพิ่มถังใหม่
      await bulkAddTanks(sourceName, 'รับเข้า');
      break;
      
    case 1: // จ่ายถังออก
      await bulkRemoveTanks(sourceName, 'จ่ายออก');
      break;
      
    case 2: // ตั้งค่ายอดถังทั้งหมด
      await setBulkTankInventory(sourceName);
      break;
      
    case 3: // โอนถัง
      await transferTanks(sourceName);
      break;
      
    case 4: // ตรวจนับถัง
      await physicalTankCount(sourceName);
      break;
  }
}

// เพิ่มถังจำนวนมาก
async function bulkAddTanks(sourceName, operation) {
  const tankCount = await showNumberInputDialog(
    `จำนวนถังที่ต้องการ${operation}`, 
    'ถัง', 
    1
  );
  if (tankCount === null) return;
  
  const liters = tankCount * 200;
  const confirmText = `ยืนยันการ${operation} ${tankCount} ถัง (${liters.toLocaleString()} ลิตร)?`;
  
  if (!confirm(confirmText)) return;
  
  try {
    const currentDrums = currentInventory[sourceName]?.currentDrums || 0;
    const newDrums = currentDrums + tankCount;
    const newLiters = newDrums * 200;
    
    const api = getApiUrl();
    if (!api) {
      alert('กรุณาตั้งค่า API URL ก่อน');
      return;
    }
    
    const url = api + '?action=direct_drum_inventory_update&source=' + 
                encodeURIComponent(sourceName) + '&drums=' + newDrums + '&liters=' + newLiters;
    const response = await jsonpWithRetry(url, 3);
    
    if (response && response.success) {
      alert(`${operation} ${tankCount} ถัง เรียบร้อยแล้ว\nยอดรวม: ${newDrums} ถัง (${newLiters.toLocaleString()} ลิตร)`);
      await loadInventoryData();
    } else {
      throw new Error(response?.error || 'ไม่สามารถอัปเดตได้');
    }
  } catch (error) {
    console.error('Error in bulk add tanks:', error);
    alert('เกิดข้อผิดพลาด: ' + error.message);
  }
}

// จ่ายถังจำนวนมาก
async function bulkRemoveTanks(sourceName, operation) {
  const currentDrums = currentInventory[sourceName]?.currentDrums || 0;
  
  if (currentDrums <= 0) {
    alert('ไม่มีถังสำหรับจ่าย');
    return;
  }
  
  const tankCount = await showNumberInputDialog(
    `จำนวนถังที่ต้องการ${operation} (มีอยู่ ${currentDrums} ถัง)`, 
    'ถัง', 
    1
  );
  if (tankCount === null) return;
  
  const newDrums = currentDrums - tankCount;
  if (newDrums < 0) {
    const confirmed = confirm(`การ${operation}นี้จะทำให้จำนวนถังติดลบ (${newDrums} ถัง)\nต้องการดำเนินการต่อหรือไม่?`);
    if (!confirmed) return;
  }
  
  const liters = tankCount * 200;
  const confirmText = `ยืนยันการ${operation} ${tankCount} ถัง (${liters.toLocaleString()} ลิตร)?\nจะเหลือ ${newDrums} ถัง`;
  
  if (!confirm(confirmText)) return;
  
  try {
    const newLiters = newDrums * 200;
    
    const api = getApiUrl();
    if (!api) {
      alert('กรุณาตั้งค่า API URL ก่อน');
      return;
    }
    
    const url = api + '?action=direct_drum_inventory_update&source=' + 
                encodeURIComponent(sourceName) + '&drums=' + newDrums + '&liters=' + newLiters;
    const response = await jsonpWithRetry(url, 3);
    
    if (response && response.success) {
      alert(`${operation} ${tankCount} ถัง เรียบร้อยแล้ว\nยอดคงเหลือ: ${newDrums} ถัง (${newLiters.toLocaleString()} ลิตร)`);
      await loadInventoryData();
    } else {
      throw new Error(response?.error || 'ไม่สามารถอัปเดตได้');
    }
  } catch (error) {
    console.error('Error in bulk remove tanks:', error);
    alert('เกิดข้อผิดพลาด: ' + error.message);
  }
}

// ตั้งค่ายอดถังทั้งหมด
async function setBulkTankInventory(sourceName) {
  const currentDrums = currentInventory[sourceName]?.currentDrums || 0;
  
  const tankCount = await showNumberInputDialog(
    `ตั้งค่ายอดถังทั้งหมด (ปัจจุบัน: ${currentDrums} ถัง)`, 
    'ถัง', 
    0.01
  );
  if (tankCount === null) return;
  
  const newLiters = tankCount * 200;
  const confirmText = `ตั้งค่ายอดคงเหลือเป็น ${tankCount} ถัง (${newLiters.toLocaleString()} ลิตร)?`;
  
  if (!confirm(confirmText)) return;
  
  try {
    const api = getApiUrl();
    if (!api) {
      alert('กรุณาตั้งค่า API URL ก่อน');
      return;
    }
    
    const url = api + '?action=direct_drum_inventory_update&source=' + 
                encodeURIComponent(sourceName) + '&drums=' + tankCount + '&liters=' + newLiters;
    const response = await jsonpWithRetry(url, 3);
    
    if (response && response.success) {
      alert(`ตั้งค่ายอดคงเหลือเรียบร้อยแล้ว\nยอดใหม่: ${tankCount} ถัง (${newLiters.toLocaleString()} ลิตร)`);
      await loadInventoryData();
    } else {
      throw new Error(response?.error || 'ไม่สามารถอัปเดตได้');
    }
  } catch (error) {
    console.error('Error in set bulk tank inventory:', error);
    alert('เกิดข้อผิดพลาด: ' + error.message);
  }
}

// โอนถังระหว่างที่เก็บ (ยังไม่ implement - placeholder)
async function transferTanks(sourceName) {
  alert('ฟีเจอร์การโอนถังระหว่างที่เก็บยังไม่พร้อมใช้งาน\nจะเพิ่มในเวอร์ชันถัดไป');
}

// ตรวจนับถังจริง
async function physicalTankCount(sourceName) {
  const currentDrums = currentInventory[sourceName]?.currentDrums || 0;
  
  const actualCount = await showNumberInputDialog(
    `ตรวจนับถังจริง (ระบบแสดง: ${currentDrums} ถัง)\nกรอกจำนวนถังจริงที่นับได้`, 
    'ถัง', 
    0
  );
  if (actualCount === null) return;
  
  const difference = actualCount - currentDrums;
  let confirmText = `ผลการตรวจนับ:\n`;
  confirmText += `ระบบแสดง: ${currentDrums} ถัง\n`;
  confirmText += `นับจริง: ${actualCount} ถัง\n`;
  confirmText += `ผลต่าง: ${difference >= 0 ? '+' : ''}${difference} ถัง`;
  
  if (Math.abs(difference) > 0) {
    confirmText += `\n\nต้องการปรับยอดในระบบให้ตรงกับการนับจริงหรือไม่?`;
    
    if (!confirm(confirmText)) return;
    
    try {
      const newLiters = actualCount * 200;
      
      const api = getApiUrl();
      if (!api) {
        alert('กรุณาตั้งค่า API URL ก่อน');
        return;
      }
      
      const url = api + '?action=direct_drum_inventory_update&source=' + 
                  encodeURIComponent(sourceName) + '&drums=' + actualCount + '&liters=' + newLiters +
                  '&note=' + encodeURIComponent('Physical count adjustment');
      const response = await jsonpWithRetry(url, 3);
      
      if (response && response.success) {
        alert(`ปรับยอดตามการตรวจนับเรียบร้อยแล้ว\nยอดใหม่: ${actualCount} ถัง (${newLiters.toLocaleString()} ลิตร)`);
        await loadInventoryData();
      } else {
        throw new Error(response?.error || 'ไม่สามารถอัปเดตได้');
      }
    } catch (error) {
      console.error('Error in physical count adjustment:', error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    }
  } else {
    alert('ยอดถังตรงกับระบบ ไม่จำเป็นต้องปรับ');
  }
}