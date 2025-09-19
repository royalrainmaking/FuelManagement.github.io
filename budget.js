// ฟังก์ชันจัดการงบประมาณ

// เมื่อโหลดหน้า
document.addEventListener('DOMContentLoaded', function() {
  loadBudgetData();
});

// โหลดข้อมูลงบประมาณ
async function loadBudgetData() {
  try {
    showLoadingIndicator(true);
    
    const api = getApiUrl();
    if (!api) {
      // ถ้าไม่มี API ให้แสดง demo data
      displayDemoData();
      showLoadingIndicator(false);
      return;
    }
    
    const url = api + '?action=budget';
    const response = await jsonp(url);
    
    if (response && response.success) {
      displayBudgetData(response.budgets || []);
      generateSummaryCards(response.budgets || []);
    } else {
      console.error('Error loading budget data:', response?.error);
      // แสดง demo data แทนการ alert error
      displayDemoData();
    }
  } catch (error) {
    console.error('Error loading budget data:', error);
    // แสดง demo data แทนการ alert error
    displayDemoData();
  } finally {
    showLoadingIndicator(false);
  }
}

// แสดงข้อมูล Demo
function displayDemoData() {
  const demoBudgets = [
    {
      mission: 'การบิน VIP',
      fiscalYear: '2567',
      allocatedBudget: 5000000,
      usedBudget: 3250000,
      remainingBudget: 1750000,
      lastUpdated: new Date(),
      status: 'Active',
      utilization: 65.0
    },
    {
      mission: 'การบิน Medical',
      fiscalYear: '2567',
      allocatedBudget: 3000000,
      usedBudget: 2700000,
      remainingBudget: 300000,
      lastUpdated: new Date(),
      status: 'Warning',
      utilization: 90.0
    },
    {
      mission: 'การบิน Training',
      fiscalYear: '2567',
      allocatedBudget: 2000000,
      usedBudget: 2150000,
      remainingBudget: -150000,
      lastUpdated: new Date(),
      status: 'Over Budget',
      utilization: 107.5
    },
    {
      mission: 'การบิน Cargo',
      fiscalYear: '2567',
      allocatedBudget: 4000000,
      usedBudget: 1200000,
      remainingBudget: 2800000,
      lastUpdated: new Date(),
      status: 'Active',
      utilization: 30.0
    },
    {
      mission: 'การบิน Search & Rescue',
      fiscalYear: '2567',
      allocatedBudget: 1500000,
      usedBudget: 450000,
      remainingBudget: 1050000,
      lastUpdated: new Date(),
      status: 'Active',
      utilization: 30.0
    },
    {
      mission: 'บินสำรวจ',
      fiscalYear: '2567',
      allocatedBudget: 2500000,
      usedBudget: 980000,
      remainingBudget: 1520000,
      lastUpdated: new Date(),
      status: 'Active',
      utilization: 39.2
    }
  ];
  
  displayBudgetData(demoBudgets);
  generateSummaryCards(demoBudgets);
  
  // แสดงข้อความแจ้งว่าเป็น demo data
  const demoNotice = document.createElement('div');
  demoNotice.id = 'demo-notice';
  demoNotice.style.cssText = `
    background: #fff3cd;
    color: #856404;
    padding: 10px 15px;
    border-radius: 6px;
    margin-bottom: 20px;
    border: 1px solid #ffeaa7;
    text-align: center;
    font-size: 14px;
  `;
  demoNotice.innerHTML = `
    <strong>📊 Demo Mode:</strong> แสดงข้อมูลตัวอย่าง เนื่องจากไม่สามารถเชื่อมต่อ Google Sheets API ได้
    <br><small>กรุณาตรวจสอบการตั้งค่า API ใน config.js และ deploy Google Apps Script</small>
  `;
  
  const container = document.querySelector('.budget-container .action-buttons');
  if (container && !document.getElementById('demo-notice')) {
    container.parentNode.insertBefore(demoNotice, container.nextSibling);
  }
}

// แสดง/ซ่อน Loading Indicator
function showLoadingIndicator(show) {
  const loadingDiv = document.getElementById('loadingIndicator');
  const budgetGrid = document.getElementById('budgetGrid');
  const summaryCards = document.getElementById('summaryCards');
  
  if (loadingDiv) loadingDiv.style.display = show ? 'block' : 'none';
  if (budgetGrid) budgetGrid.style.display = show ? 'none' : 'grid';
  if (summaryCards) summaryCards.style.display = show ? 'none' : 'grid';
}

// แสดงข้อมูลงบประมาณ
function displayBudgetData(budgets) {
  const budgetGrid = document.getElementById('budgetGrid');
  if (!budgetGrid) return;
  
  budgetGrid.innerHTML = '';
  
  if (budgets.length === 0) {
    budgetGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #666;">
        <h3>ไม่มีข้อมูลงบประมาณ</h3>
        <p>กดปุ่ม "สร้างตารางงบประมาณ" เพื่อเริ่มต้น</p>
      </div>
    `;
    return;
  }
  
  budgets.forEach(budget => {
    const budgetCard = createBudgetCard(budget);
    budgetGrid.appendChild(budgetCard);
  });
}

// สร้าง Budget Card
function createBudgetCard(budget) {
  const card = document.createElement('div');
  card.className = `budget-card ${getCardClass(budget.status)}`;
  
  const utilization = parseFloat(budget.utilization);
  const remainingAmount = budget.remainingBudget;
  const isOverBudget = remainingAmount < 0;
  
  card.innerHTML = `
    <div class="budget-header">
      <div>
        <div class="mission-name">${budget.mission}</div>
        <div class="fiscal-year">ปีงบประมาณ ${budget.fiscalYear}</div>
      </div>
      <div class="status-badge ${getStatusClass(budget.status)}">${getStatusText(budget.status)}</div>
    </div>
    
    <div class="budget-info">
      <div class="info-row">
        <span class="info-label">งบประมาณที่จัดสรร:</span>
        <span class="info-value">${formatMoney(budget.allocatedBudget)} บาท</span>
      </div>
      <div class="info-row">
        <span class="info-label">ใช้ไปแล้ว:</span>
        <span class="info-value">${formatMoney(budget.usedBudget)} บาท</span>
      </div>
      <div class="info-row">
        <span class="info-label">คงเหลือ:</span>
        <span class="info-value ${remainingAmount >= 0 ? 'positive' : 'negative'}">${formatMoney(remainingAmount)} บาท</span>
      </div>
      
      <div class="utilization-bar">
        <div class="utilization-fill ${getUtilizationClass(utilization, isOverBudget)}" 
             style="width: ${Math.min(utilization, 100)}%"></div>
        <div class="utilization-text">${utilization}%</div>
      </div>
    </div>
    
    <div class="edit-section">
      <div class="edit-form">
        <input type="number" 
               class="edit-input" 
               placeholder="งบประมาณใหม่" 
               min="0" 
               step="0.01"
               id="budget-${budget.mission.replace(/\s+/g, '-')}"
               value="${budget.allocatedBudget}">
        <button class="btn-primary" onclick="updateBudget('${budget.mission}', '${budget.mission.replace(/\s+/g, '-')}')" style="font-size: 0.875rem; padding: var(--spacing-2) var(--spacing-4);">
          💰 อัปเดต
        </button>
      </div>
      <div class="last-updated">
        อัปเดตล่าสุด: ${formatDateTime(budget.lastUpdated)}
      </div>
    </div>
  `;
  
  return card;
}

// สร้าง Summary Cards
function generateSummaryCards(budgets) {
  const summaryDiv = document.getElementById('summaryCards');
  if (!summaryDiv) return;
  
  let totalAllocated = 0;
  let totalUsed = 0;
  let totalRemaining = 0;
  let activeMissions = 0;
  let overBudgetMissions = 0;
  
  budgets.forEach(budget => {
    totalAllocated += budget.allocatedBudget;
    totalUsed += budget.usedBudget;
    totalRemaining += budget.remainingBudget;
    if (budget.status === 'Active') activeMissions++;
    if (budget.status === 'Over Budget') overBudgetMissions++;
  });
  
  const overallUtilization = totalAllocated > 0 ? ((totalUsed / totalAllocated) * 100).toFixed(1) : 0;
  
  summaryDiv.innerHTML = `
    <div class="summary-card">
      <h3>งบประมาณรวม</h3>
      <p class="value" style="color: #1C1C1E">${formatMoney(totalAllocated)}</p>
    </div>
    <div class="summary-card">
      <h3>ใช้ไปแล้ว</h3>
      <p class="value" style="color: #1C1C1E">${formatMoney(totalUsed)}</p>
    </div>
    <div class="summary-card">
      <h3>คงเหลือ</h3>
      <p class="value" style="color: ${totalRemaining >= 0 ? '#4caf50' : '#f44336'}">${formatMoney(totalRemaining)}</p>
    </div>
    <div class="summary-card">
      <h3>การใช้งาน</h3>
      <p class="value" style="color: #1C1C1E">${overallUtilization}%</p>
    </div>
    <div class="summary-card">
      <h3>ภารกิจทั้งหมด</h3>
      <p class="value" style="color: #1C1C1E">${budgets.length}</p>
    </div>
    <div class="summary-card">
      <h3>เกินงบ</h3>
      <p class="value" style="color: ${overBudgetMissions > 0 ? '#f44336' : '#4caf50'}">${overBudgetMissions}</p>
    </div>
  `;
}

// Helper functions
function getCardClass(status) {
  switch (status) {
    case 'Warning': return 'warning';
    case 'Over Budget': return 'danger';
    default: return 'active';
  }
}

function getStatusClass(status) {
  switch (status) {
    case 'Warning': return 'warning';
    case 'Over Budget': return 'over-budget';
    default: return 'active';
  }
}

function getStatusText(status) {
  switch (status) {
    case 'Active': return 'ปกติ';
    case 'Warning': return 'เตือน';
    case 'Over Budget': return 'เกินงบ';
    default: return status;
  }
}

function getUtilizationClass(utilization, isOverBudget) {
  if (isOverBudget) return 'over';
  if (utilization >= 90) return 'danger';
  if (utilization >= 80) return 'warning';
  return '';
}

// อัปเดตงบประมาณ
async function updateBudget(mission, inputId) {
  const input = document.getElementById(`budget-${inputId}`);
  if (!input) return;
  
  const newBudget = parseFloat(input.value);
  if (isNaN(newBudget) || newBudget < 0) {
    alert('กรุณากรอกตัวเลขที่ถูกต้อง');
    return;
  }
  
  try {
    const api = getApiUrl();
    if (!api) {
      alert('ไม่สามารถเชื่อมต่อ API ได้');
      return;
    }
    
    const url = api + '?action=update_budget&mission=' + encodeURIComponent(mission) + '&allocatedBudget=' + newBudget;
    const response = await jsonp(url);
    
    if (response && response.success) {
      alert('อัปเดตงบประมาณสำเร็จ');
      loadBudgetData(); // โหลดข้อมูลใหม่
    } else {
      alert('เกิดข้อผิดพลาดในการอัปเดตงบประมาณ: ' + (response?.error || 'ไม่ทราบสาเหตุ'));
    }
  } catch (error) {
    console.error('Error updating budget:', error);
    alert('เกิดข้อผิดพลาดในการอัปเดตงบประมาณ');
  }
}

// เพิ่มภารกิจใหม่
async function addNewBudget() {
  const mission = document.getElementById('newMission').value.trim();
  const fiscalYear = document.getElementById('newFiscalYear').value;
  const allocatedBudget = parseFloat(document.getElementById('newAllocatedBudget').value);
  
  if (!mission) {
    alert('กรุณากรอกชื่อภารกิจ');
    return;
  }
  
  if (isNaN(allocatedBudget) || allocatedBudget < 0) {
    alert('กรุณากรอกงบประมาณที่ถูกต้อง');
    return;
  }
  
  try {
    const api = getApiUrl();
    if (!api) {
      alert('ไม่สามารถเชื่อมต่อ API ได้');
      return;
    }
    
    const url = api + '?action=add_budget&mission=' + encodeURIComponent(mission) + 
                '&fiscalYear=' + fiscalYear + '&allocatedBudget=' + allocatedBudget;
    const response = await jsonp(url);
    
    if (response && response.success) {
      alert('เพิ่มภารกิจใหม่สำเร็จ');
      // เคลียร์ฟอร์ม
      document.getElementById('newMission').value = '';
      document.getElementById('newAllocatedBudget').value = '';
      loadBudgetData(); // โหลดข้อมูลใหม่
    } else {
      alert('เกิดข้อผิดพลาดในการเพิ่มภารกิจ: ' + (response?.error || 'ไม่ทราบสาเหตุ'));
    }
  } catch (error) {
    console.error('Error adding budget:', error);
    alert('เกิดข้อผิดพลาดในการเพิ่มภารกิจ');
  }
}

// สร้างตารางงบประมาณ
async function initializeBudget() {
  if (!confirm('สร้างตารางงบประมาณใหม่? (จะสร้างข้อมูลตัวอย่างหากยังไม่มี)')) {
    return;
  }
  
  try {
    const api = getApiUrl();
    if (!api) {
      alert('ไม่สามารถเชื่อมต่อ API ได้');
      return;
    }
    
    const url = api + '?action=init_budget';
    const response = await jsonp(url);
    
    if (response && response.success) {
      alert('สร้างตารางงบประมาณสำเร็จ');
      loadBudgetData(); // โหลดข้อมูลใหม่
    } else {
      alert('เกิดข้อผิดพลาดในการสร้างตารางงบประมาณ: ' + (response?.error || 'ไม่ทราบสาเหตุ'));
    }
  } catch (error) {
    console.error('Error initializing budget:', error);
    alert('เกิดข้อผิดพลาดในการสร้างตารางงบประมาณ');
  }
}

// จัดรูปแบบวันที่เวลา
function formatDateTime(dateTime) {
  if (!dateTime) return 'ไม่ทราบ';
  
  try {
    const date = new Date(dateTime);
    return date.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return 'ไม่ทราบ';
  }
}