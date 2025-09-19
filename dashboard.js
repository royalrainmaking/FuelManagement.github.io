function formatMoney(n) {
  if (isNaN(n)) return '-';
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ฟังก์ชันแปลงรูปแบบวันที่จาก ISO string เป็น DD-MM-YYYY
function formatDateDisplay(dateString) {
  if (!dateString) return '';
  
  try {
    let date;
    
    // ถ้าเป็น ISO timestamp (มี T และ Z)
    if (dateString.includes('T') && dateString.includes('Z')) {
      date = new Date(dateString);
    } 
    // ถ้าเป็นรูปแบบ YYYY-MM-DD
    else if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      date = new Date(dateString + 'T00:00:00.000Z');
    }
    // รูปแบบอื่นๆ
    else {
      date = new Date(dateString);
    }
    
    if (isNaN(date)) return dateString; // ถ้าแปลงไม่ได้ให้คืนค่าเดิม
    
    // แปลงเป็น DD-MM-YYYY
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}-${month}-${year}`;
  } catch (e) {
    console.warn('Error formatting date:', dateString, e);
    return dateString; // ถ้าเกิดข้อผิดพลาดให้คืนค่าเดิม
  }
}

// ฟังก์ชันแสดงปริมาณลิตรสำหรับถังน้ำมัน 200L
function formatLitersDisplay(record) {
  if (!record) return '0';
  
  const liters = Number(record.liters) || 0;
  const tankCount = Number(record.tankCount) || 0;
  const fuelSource = record.fuelSource || '';
  
  // ตรวจสอบว่าเป็น drum storage หรือ barrel
  const sourceInfo = FUEL_SOURCES[fuelSource];
  const isDrumBased = sourceInfo && (sourceInfo.type === 'drum_storage' || sourceInfo.type === 'barrel');
  
  if (isDrumBased && tankCount > 0) {
    return `${tankCount} ถัง (${liters.toLocaleString('th-TH', { maximumFractionDigits: 2 })} L)`;
  }
  
  // กรณีอื่นๆ แสดงเป็นลิตรปกติ
  return liters.toLocaleString('th-TH', { maximumFractionDigits: 2 });
}

// ฟังก์ชันแสดงราคาสำหรับถังน้ำมัน 200L
function formatPriceDisplay(record) {
  if (!record) return formatMoney(0);
  
  const fuelSource = record.fuelSource || '';
  const pricePerTank = Number(record.pricePerTank) || 0;
  const basePricePerLiter = Number(record.basePricePerLiter) || 0;
  
  // ตรวจสอบว่าเป็น drum storage หรือ barrel
  const sourceInfo = FUEL_SOURCES[fuelSource];
  const isDrumBased = sourceInfo && (sourceInfo.type === 'drum_storage' || sourceInfo.type === 'barrel');
  
  if (isDrumBased && pricePerTank > 0) {
    return `${formatMoney(pricePerTank)}/ถัง`;
  }
  
  // กรณีอื่นๆ แสดงราคาต่อลิตร
  return `${formatMoney(basePricePerLiter)}/L`;
}

function getApiUrl() {
  // Priority: config.js (hidden) > localStorage (fallback)
  if (window.APP_CONFIG && window.APP_CONFIG.apiUrl) return window.APP_CONFIG.apiUrl;
  const fromStorage = localStorage.getItem('gas_api_url');
  if (fromStorage) return fromStorage;
  return '';
}

function setApiUrl(url) {
  localStorage.setItem('gas_api_url', url);
}

function initApiConfig() {
  // API URL is now hidden and configured automatically
  document.getElementById('reloadBtn').addEventListener('click', () => loadData());
  
  // Clean up any orphaned callbacks from previous page loads
  console.log('🧹 Performing initial cleanup of orphaned callbacks...');
  const cleanup = cleanupOrphanedCallbacks();
  if (cleanup.callbacksCleaned > 0 || cleanup.scriptsRemoved > 0) {
    console.log('🔧 Found and cleaned up orphaned elements from previous sessions');
  }
  
  // ตั้งค่าการทำความสะอาดอัตโนมัติทุก 30 วินาที
  setInterval(() => {
    const periodicCleanup = cleanupOrphanedCallbacks();
    if (periodicCleanup.callbacksCleaned > 0 || periodicCleanup.scriptsRemoved > 0) {
      console.log('🔧 Periodic cleanup completed');
    }
  }, 30000);
  
  // Add version info for debugging
  console.log('🚀 Dashboard.js loaded - Version: 2024011804 - Export Fix Applied');
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

let chartByDate, chartByAircraft, chartByMission;

let ALL_ROWS = [];

// Pagination variables
let currentPage = 1;
const itemsPerPage = 30;

// ข้อมูลความจุของแต่ละแหล่งน้ำมัน - ใช้จาก common.js

// Current filter state
const FILTERS = {
  startDate: '',
  endDate: '',
  aircraft: '',
  station: '',
  mission: ''
};

function uniqueSorted(arr) {
  return Array.from(new Set(arr.filter(v => {
    if (v == null) return false;
    const str = String(v);
    return str && str.trim() !== '';
  }))).sort((a, b) => String(a).localeCompare(String(b), 'th-TH'));
}

function aircraftKey(r) {
  // Build a consistent key to match the dropdown values when present in data
  if (!r) return 'ไม่ระบุ';
  
  const model = (r.aircraftModel != null && String(r.aircraftModel).trim()) || '';
  const type = (r.aircraftType != null && String(r.aircraftType).trim()) || '';
  const number = (r.agriNo != null && String(r.agriNo).trim()) || '';
  
  if (type && number) return `${type} : ${number}`;
  if (model && number) return `${model} : ${number}`;
  // fallback readable
  return model || type || number || 'ไม่ระบุ';
}

function populateFilters(rows) {
  const aircrafts = uniqueSorted(rows.map(aircraftKey));
  const missions = uniqueSorted(rows.map(r => r.mission));
  const stations = uniqueSorted(rows.map(r => r.station));

  const acSel = document.getElementById('aircraftSelect');
  const miSel = document.getElementById('missionSelect');
  const stSel = document.getElementById('stationSelect');

  if (acSel) {
    const current = acSel.value;
    acSel.innerHTML = '<option value="">ทั้งหมด</option>' + aircrafts.map(v => `<option value="${String(v)}">${String(v)}</option>`).join('');
    if (current) acSel.value = current;
  }
  if (miSel) {
    const current = miSel.value;
    miSel.innerHTML = '<option value="">ทั้งหมด</option>' + missions.map(v => `<option value="${String(v)}">${String(v)}</option>`).join('');
    if (current) miSel.value = current;
  }
  if (stSel) {
    const current = stSel.value;
    stSel.innerHTML = '<option value="">ทั้งหมด</option>' + stations.map(v => `<option value="${String(v)}">${String(v)}</option>`).join('');
    if (current) stSel.value = current;
  }

  buildAircraftGallery(aircrafts);
}

function buildAircraftGallery(aircrafts) {
  const wrap = document.getElementById('aircraftGallery');
  if (!wrap) return;
  wrap.innerHTML = '';
  aircrafts.forEach(name => {
    const div = document.createElement('div');
    div.className = 'aircraft-card';
    div.innerHTML = `
      <div class="plane-icon" aria-hidden="true">
        <svg viewBox="0 0 64 64" width="48" height="48">
          <path d="M4 36l18-6 14 0 18-10 4 4-18 10 0 6 6 4 0 4-10-2-8-6-8 4-4-2 6-6-14 0z" fill="#0b6bd3" opacity="0.9"></path>
        </svg>
      </div>
      <div class="aircraft-name">${String(name)}</div>
    `;
    div.title = `กรองตามเครื่องบิน: ${String(name)}`;
    div.addEventListener('click', () => {
      const acSel = document.getElementById('aircraftSelect');
      if (acSel) acSel.value = String(name);
      FILTERS.aircraft = String(name);
      refreshView();
    });
    wrap.appendChild(div);
  });
}

function getFilteredRows() {
  const s = FILTERS;
  let rows = ALL_ROWS.slice();
  if (s.startDate) rows = rows.filter(r => {
    const key = r.date || '';
    return key >= s.startDate;
  });
  if (s.endDate) rows = rows.filter(r => {
    const key = r.date || '';
    return key <= s.endDate;
  });
  if (s.aircraft) rows = rows.filter(r => r && aircraftKey(r) === s.aircraft);
  if (s.station) rows = rows.filter(r => r && String(r.station || '') === s.station);
  if (s.mission) rows = rows.filter(r => r && String(r.mission || '') === s.mission);

  // Apply text search if any
  const q = (document.getElementById('searchBox')?.value || '').trim().toLowerCase();
  if (q) {
    rows = rows.filter(row => Object.values(row).some(v => (v != null && String(v).toLowerCase().includes(q))));
  }
  
  // Sort by date descending (latest first)
  rows.sort((a, b) => {
    const dateA = new Date(a.date || '1900-01-01');
    const dateB = new Date(b.date || '1900-01-01');
    return dateB - dateA; // เรียงจากใหม่ไปเก่า (descending)
  });
  
  return rows;
}

function refreshView() {
  const rows = getFilteredRows();
  updateCards(rows);
  buildCharts(rows);
  currentPage = 1; // Reset to first page when filters change
  renderTable(rows);
  loadInventoryDashboard(); // Enable inventory display
}

function bindFilterEvents() {
  const sDate = document.getElementById('startDate');
  const eDate = document.getElementById('endDate');
  const acSel = document.getElementById('aircraftSelect');
  const stSel = document.getElementById('stationSelect');
  const miSel = document.getElementById('missionSelect');
  const clearBtn = document.getElementById('clearFilters');

  sDate?.addEventListener('change', () => { FILTERS.startDate = sDate.value; refreshView(); });
  eDate?.addEventListener('change', () => { FILTERS.endDate = eDate.value; refreshView(); });
  acSel?.addEventListener('change', () => { FILTERS.aircraft = acSel.value; refreshView(); });
  stSel?.addEventListener('change', () => { FILTERS.station = stSel.value; refreshView(); });
  miSel?.addEventListener('change', () => { FILTERS.mission = miSel.value; refreshView(); });
  clearBtn?.addEventListener('click', () => {
    FILTERS.startDate = FILTERS.endDate = FILTERS.aircraft = FILTERS.station = FILTERS.mission = '';
    if (sDate) sDate.value = '';
    if (eDate) eDate.value = '';
    if (acSel) acSel.value = '';
    if (stSel) stSel.value = '';
    if (miSel) miSel.value = '';
    refreshView();
  });
}

function buildCharts(rows) {
  const byDate = new Map();
  const byAircraft = new Map();
  const byMission = new Map();

  rows.forEach(r => {
    if (!r) return; // ป้องกัน null/undefined row
    
    const dateKey = (r.date != null ? String(r.date) : '') || '';
    const liters = Number(r.liters) || 0; // ใช้ข้อมูลลิตรที่บันทึกไว้แล้ว (ไม่ต้องคูณเพิ่ม)
    
    const aircraft = aircraftKey(r);
    const mission = (r.mission != null ? String(r.mission) : '') || 'ไม่ระบุ';

    if (dateKey) { // Only include records with valid date
      byDate.set(dateKey, (byDate.get(dateKey) || 0) + liters);
    }
    byAircraft.set(aircraft, (byAircraft.get(aircraft) || 0) + liters);
    byMission.set(mission, (byMission.get(mission) || 0) + liters);
  });

  // Chart by Date - filter out empty dates and sort
  const validDateEntries = Array.from(byDate.entries()).filter(([date, _]) => date && String(date).trim());
  
  // Sort by actual date value for better chronological order
  const sortedDateEntries = validDateEntries.sort(([a], [b]) => {
    const dateA = new Date(a);
    const dateB = new Date(b);
    return dateA - dateB;
  });
  
  const dateLabels = sortedDateEntries.map(([date, _]) => date);
  const dateValues = sortedDateEntries.map(([_, value]) => value);
  
  // Format date labels for better display (convert YYYY-MM-DD to DD/MM format or DD/MM/YY for shorter display)
  const formattedDateLabels = dateLabels.map(dateStr => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date)) return dateStr;
      
      // Format as DD/MM or DD/MM/YY depending on how much space we have
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear().toString().slice(-2); // Last 2 digits of year
      
      return `${day}/${month}/${year}`;
    } catch (e) {
      // Fallback for invalid dates
      return dateStr;
    }
  });
  
  // Chart by Aircraft
  const aircraftLabels = Array.from(byAircraft.keys()).slice(0, 10); // Top 10
  const aircraftValues = aircraftLabels.map(a => byAircraft.get(a));
  
  // Chart by Mission
  const missionLabels = Array.from(byMission.keys());
  const missionValues = missionLabels.map(m => byMission.get(m));

  const ctx1 = document.getElementById('chartByDate')?.getContext('2d');
  const ctx3 = document.getElementById('chartByAircraft')?.getContext('2d');
  const ctx4 = document.getElementById('chartByMission')?.getContext('2d');
  


  // Destroy existing charts
  if (chartByDate) chartByDate.destroy();
  if (chartByAircraft) chartByAircraft.destroy();
  if (chartByMission) chartByMission.destroy();

  // Create new charts
  if (ctx1) {
    chartByDate = new Chart(ctx1, {
      type: 'line',
      data: { 
        labels: formattedDateLabels, 
        datasets: [{ 
          label: 'ปริมาณ (ลิตร)', 
          data: dateValues, 
          borderColor: '#4FAF7B', 
          backgroundColor: 'rgba(79,175,123,0.2)', 
          tension: 0.2,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: { 
        responsive: true, 
        maintainAspectRatio: false,
        onClick: (event, elements) => {
          if (elements.length > 0) {
            const index = elements[0].index;
            const selectedDate = dateLabels[index];
            showDailyUsageDetails(selectedDate, rows);
          }
        },
        scales: { 
          y: { 
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return value.toLocaleString('th-TH') + ' L';
              }
            }
          },
          x: {
            maxTicksLimit: 10, // Limit number of date labels to avoid crowding
            ticks: {
              maxRotation: 45,
              minRotation: 0
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: function(context) {
                const index = context[0].dataIndex;
                const originalDate = dateLabels[index];
                try {
                  const date = new Date(originalDate);
                  if (!isNaN(date)) {
                    return date.toLocaleDateString('th-TH', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    });
                  }
                } catch (e) {
                  // Fallback
                }
                return formattedDateLabels[index];
              },
              label: function(context) {
                return [
                  `ปริมาณน้ำมัน: ${context.parsed.y.toLocaleString('th-TH')} ลิตร`,
                  '💡 คลิกเพื่อดูรายละเอียด'
                ];
              }
            }
          }
        }
      }
    });
  }

  if (ctx3) {
    chartByAircraft = new Chart(ctx3, {
      type: 'bar',
      data: { 
        labels: aircraftLabels, 
        datasets: [{ 
          label: 'ลิตร', 
          data: aircraftValues, 
          backgroundColor: '#A9DCC1' /* pastel green */
        }]
      },
      options: { 
        responsive: true, 
        maintainAspectRatio: false,
        onClick: (event, elements) => {
          if (elements.length > 0) {
            const index = elements[0].index;
            const selectedAircraft = aircraftLabels[index];
            showAircraftUsageDetails(selectedAircraft, rows);
          }
        },
        scales: { 
          y: { beginAtZero: true },
          x: { 
            ticks: { 
              maxRotation: 45,
              minRotation: 45
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                return [
                  `${context.label}: ${context.parsed.y.toLocaleString('th-TH')} ลิตร`,
                  '💡 คลิกเพื่อดูรายละเอียด'
                ];
              }
            }
          }
        }
      }
    });
  }

  if (ctx4) {
    chartByMission = new Chart(ctx4, {
      type: 'bar',
      data: { 
        labels: missionLabels, 
        datasets: [{ 
          label: 'ลิตร', 
          data: missionValues, 
          backgroundColor: '#CFE7DA' /* light pastel green */
        }]
      },
      options: { 
        responsive: true, 
        maintainAspectRatio: false,
        onClick: (event, elements) => {
          if (elements.length > 0) {
            const index = elements[0].index;
            const selectedMission = missionLabels[index];
            showMissionUsageDetails(selectedMission, rows);
          }
        },
        scales: { 
          y: { beginAtZero: true },
          x: { 
            ticks: { 
              maxRotation: 45,
              minRotation: 45
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                return [
                  `${context.label}: ${context.parsed.y.toLocaleString('th-TH')} ลิตร`,
                  '💡 คลิกเพื่อดูรายละเอียด'
                ];
              }
            }
          }
        }
      }
    });
  }
}

function renderTable(rows) {
  const table = document.getElementById('dataTable');
  table.classList.add('compact-table'); // เพิ่ม class สำหรับตารางขนาดเล็ก
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = '';

  // Calculate pagination
  const totalItems = rows.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentRows = rows.slice(startIndex, endIndex);

  // Render current page rows
  currentRows.forEach((r, idx) => {
    if (!r) return; // ป้องกัน null/undefined row
    
    const tr = document.createElement('tr');
    
    // สร้างข้อมูลแต่ละคอลัมน์ตามลำดับที่กำหนดใน HTML
    const cells = [
      startIndex + idx + 1, // ลำดับ (แสดงลำดับจริงจากทั้งหมด)
      formatDateDisplay(r.date), // วันที่ (แปลงรูปแบบเป็น DD-MM-YYYY)
      (r.mission != null ? String(r.mission) : '') || '', // ภารกิจ
      (r.docType != null ? String(r.docType) : '') || '', // ประเภทเอกสาร
      (r.docBookVolume != null ? String(r.docBookVolume) : '') || '', // เล่มที่
      (r.docBookNo != null ? String(r.docBookNo) : '') || '', // เลขที่
      (r.payBookVolume != null ? String(r.payBookVolume) : '') || '', // ใบสั่งจ่าย เล่มที่
      (r.payBookNo != null ? String(r.payBookNo) : '') || '', // ใบสั่งจ่าย เลขที่
      aircraftKey(r), // เครื่องบิน
      (r.station != null ? String(r.station) : '') || '', // สถานี
      (r.buyer != null ? String(r.buyer) : '') || '', // ผู้จัดซื้อ
      (r.fuelType != null ? String(r.fuelType) : '') || '', // ประเภทน้ำมัน
      (r.fuelSource != null ? String(r.fuelSource) : '') || '', // แหล่งที่มา
      formatLitersDisplay(r), // ลิตร (แสดงทั้งลิตรและจำนวนถังสำหรับถังน้ำมัน 200L)
      formatPriceDisplay(r), // ราคา (แสดงราคาต่อถังสำหรับถังน้ำมัน 200L หรือราคาต่อลิตรสำหรับอื่นๆ)
      formatMoney(Number(r.amountExVat) || 0), // มูลค่าไม่รวม VAT
      formatMoney(Number(r.vatAmount) || 0), // VAT
      formatMoney(Number(r.amountIncVat) || 0), // รวม VAT
      r.recorder || '', // ผู้บันทึก
      r.note || '' // หมายเหตุ
    ];

    cells.forEach(cellValue => {
      const td = document.createElement('td');
      td.textContent = String(cellValue);
      tr.appendChild(td);
    });

    // เพิ่มคอลัมน์การจัดการ
    const actionTd = document.createElement('td');
    const recId = String(r.sequenceNumber || r.id || '');
    actionTd.innerHTML = `
      <div class="action-buttons">
        <button class="edit-btn" data-id="${recId}">
          แก้ไข
        </button>
        <button class="delete-btn" data-id="${recId}">
          ลบ
        </button>
      </div>
    `;

    // bind events safely (avoid inline handlers)
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = actionTd.innerHTML;
    const editBtn = tempDiv.querySelector('.edit-btn');
    const deleteBtn = tempDiv.querySelector('.delete-btn');
    editBtn?.addEventListener('click', () => editRecord(recId));
    deleteBtn?.addEventListener('click', () => deleteRecord(recId));
    actionTd.innerHTML = '';
    actionTd.appendChild(tempDiv.firstElementChild);

    tr.appendChild(actionTd);
    
    tbody.appendChild(tr);
  });

  // Update pagination controls
  updatePaginationControls(totalItems, totalPages);
}

function updatePaginationControls(totalItems, totalPages) {
  const paginationContainer = document.getElementById('paginationContainer');
  if (!paginationContainer) return;

  if (totalPages <= 1) {
    paginationContainer.style.display = 'none';
    return;
  }

  paginationContainer.style.display = 'flex';
  
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);
  
  paginationContainer.innerHTML = `
    <div class="pagination-info">
      แสดง ${startItem.toLocaleString('th-TH')}-${endItem.toLocaleString('th-TH')} จาก ${totalItems.toLocaleString('th-TH')} รายการ
    </div>
    <div class="pagination-buttons">
      <button class="pagination-btn" onclick="goToPage(1)" ${currentPage === 1 ? 'disabled' : ''}>
        หน้าแรก
      </button>
      <button class="pagination-btn" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
        ก่อนหน้า
      </button>
      <span class="page-info">หน้า ${currentPage} จาก ${totalPages}</span>
      <button class="pagination-btn" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
        ถัดไป
      </button>
      <button class="pagination-btn" onclick="goToPage(${totalPages})" ${currentPage === totalPages ? 'disabled' : ''}>
        หน้าสุดท้าย
      </button>
    </div>
  `;
}

function goToPage(page) {
  const filteredRows = getFilteredRows();
  const totalPages = Math.ceil(filteredRows.length / itemsPerPage);
  
  if (page < 1 || page > totalPages) return;
  
  currentPage = page;
  renderTable(filteredRows);
}

function updateCards(rows) {
  const count = rows.length;
  
  // คำนวณปริมาณลิตรจริง - ใช้ข้อมูลลิตรที่บันทึกไว้แล้ว (ไม่ต้องคูณเพิ่ม)
  const liters = rows.reduce((s, r) => {
    const actualLiters = Number(r.liters) || 0;
    return s + actualLiters;
  }, 0);
  
  const amount = rows.reduce((s, r) => s + (Number(r.amountIncVat) || 0), 0);
  const aircraftCount = new Set(rows.map(aircraftKey)).size;
  

  
  document.getElementById('cardCount').textContent = count.toLocaleString('th-TH');
  document.getElementById('cardLiters').textContent = liters.toLocaleString('th-TH', { maximumFractionDigits: 2 });
  document.getElementById('cardAmount').textContent = formatMoney(amount);
  document.getElementById('cardAircraft').textContent = aircraftCount.toLocaleString('th-TH');
}

async function calculateFuelInventory() {
  try {
    const api = getApiUrl();
    if (!api) return {};
    
    const url = api + '?action=inventory';
    const response = await jsonpWithRetry(url, 2);
    
    if (response && response.success && response.inventory) {
      const inventory = {};
      Object.keys(FUEL_SOURCES).forEach(source => {
        const sourceData = response.inventory[source];
        inventory[source] = sourceData ? sourceData.currentStock : 0;
      });
      return inventory;
    }
  } catch (error) {
    console.error('Error fetching inventory:', error);
  }
  
  // Fallback: คำนวณจากข้อมูลธุรกรรม
  const inventory = {};
  Object.keys(FUEL_SOURCES).forEach(source => {
    inventory[source] = 0;
  });
  
  const sortedRows = ALL_ROWS.slice().sort((a, b) => {
    const dateA = new Date(a.date || '1900-01-01');
    const dateB = new Date(b.date || '1900-01-01');
    return dateA - dateB;
  });
  
  sortedRows.forEach(row => {
    const source = row.fuelSource;
    const liters = Number(row.liters) || 0;
    const refillTarget = row.refillTarget;
    
    if (FUEL_SOURCES[source]) {
      if (source === 'จัดซื้อ') {
        if (refillTarget && FUEL_SOURCES[refillTarget]) {
          inventory[refillTarget] += liters;
        }
      } else if (source === 'สนามบินนครสวรรค์ - ถัง 200L' || source === 'สนามบินคลองหลวง - ถัง 200L') {
        // สำหรับถังน้ำมัน liters คือจำนวนถัง ไม่ใช่ลิตร
        inventory[source] += liters;
      } else {
        inventory[source] -= liters;
      }
    }
  });
  
  return inventory;
}

async function updateFuelInventoryDisplay() {
  const inventory = await calculateFuelInventory();
  
  Object.keys(FUEL_SOURCES).forEach(source => {
    const item = document.querySelector(`[data-source="${source}"]`);
    if (item) {
      const currentAmount = item.querySelector('.current-amount');
      const inventoryFill = item.querySelector('.inventory-fill');
      
      const current = inventory[source] || 0;
      const sourceInfo = FUEL_SOURCES[source];
      
      if (source === 'สนามบินนครสวรรค์ - ถัง 200L' || source === 'สนามบินคลองหลวง - ถัง 200L') {
        // สำหรับถังน้ำมัน 200L current คือจำนวนถัง
        const tanks = Math.max(0, current);
        const totalLiters = tanks * 200;
        
        currentAmount.textContent = tanks.toLocaleString('th-TH');
        
        const totalLitersSpan = item.querySelector('.total-liters');
        if (totalLitersSpan) {
          totalLitersSpan.textContent = totalLiters.toLocaleString('th-TH');
        }
        
        // ไม่มี progress bar สำหรับถังน้ำมัน
      } else {
        // สำหรับ Tankfarm และรถน้ำมัน
        const capacity = sourceInfo.capacity;
        const percentage = Math.max(0, Math.min(100, (current / capacity) * 100));
        
        // อัปเดตข้อความ
        currentAmount.textContent = current.toLocaleString('th-TH', { maximumFractionDigits: 0 });
        
        // อัปเดต progress bar
        if (inventoryFill) {
          inventoryFill.style.width = `${percentage}%`;
          
          // เปลี่ยนสีตามระดับ
          inventoryFill.className = 'inventory-fill';
          if (current <= 0) {
            inventoryFill.classList.add('empty');
          } else if (percentage < 20) {
            inventoryFill.classList.add('danger');
          } else if (percentage < 50) {
            inventoryFill.classList.add('warning');
          }
        }
        
        // เปลี่ยนสีข้อความถ้าติดลบ
        if (current < 0) {
          currentAmount.style.color = '#e53e3e';
          currentAmount.textContent = `${current.toLocaleString('th-TH', { maximumFractionDigits: 0 })} (ติดลบ)`;
        } else {
          currentAmount.style.color = '#2b6cb0';
        }
      }
    }
  });
}

function applySearch() {
  // Just refresh via the unified filter pipeline
  refreshView();
}

function exportData() {
  const rows = getFilteredRows();
  if (rows.length === 0) {
    alert('ไม่มีข้อมูลให้ส่งออก');
    return;
  }

  // สร้าง CSV
  const headers = [
    'ลำดับ', 'วันที่', 'ภารกิจ', 'ประเภทเอกสาร', 'เล่มที่', 'เลขที่', 
    'ใบสั่งจ่าย เล่มที่', 'ใบสั่งจ่าย เลขที่', 'เครื่องบิน', 'สถานี', 
    'ผู้จัดซื้อ', 'ประเภทน้ำมัน', 'ลิตร', 'ราคา/ลิตร (ฐาน)', 
    'มูลค่าไม่รวม VAT', 'VAT', 'รวม VAT', 'ผู้บันทึก', 'หมายเหตุ'
  ];
  
  let csv = headers.join(',') + '\n';
  
  rows.forEach((r, idx) => {
    const row = [
      idx + 1,
      r.date || '',
      r.mission || '',
      r.docType || '',
      r.docBookVolume || '',
      r.docBookNo || '',
      r.payBookVolume || '',
      r.payBookNo || '',
      aircraftKey(r),
      r.station || '',
      r.buyer || '',
      r.fuelType || '',
      Number(r.liters) || 0,
      Number(r.basePricePerLiter) || 0,
      Number(r.amountExVat) || 0,
      Number(r.vatAmount) || 0,
      Number(r.amountIncVat) || 0,
      r.recorder || '',
      r.note || ''
    ];
    csv += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n';
  });

  // ดาวน์โหลดไฟล์
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `fuel_data_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function loadData() {
  const api = getApiUrl();
  const loadStatus = document.getElementById('loadStatus');
  loadStatus.textContent = 'กำลังโหลดข้อมูล... (อาจใช้เวลา 1-2 นาที)';
  loadStatus.className = 'loading';
  
  if (!api) {
    console.warn('⚠️ ไม่พบ API URL - แสดงข้อมูลตัวอย่าง');
    loadStatus.textContent = '⚠️ ไม่พบการเชื่อมต่อ Google Sheets - แสดงข้อมูลตัวอย่าง';
    loadStatus.className = 'warning';
    loadSampleData();
    return;
  }
  
  const url = api + '?action=list';
  
  try {
    const res = await jsonpWithRetry(url, 3);
    
    if (res && res.success && Array.isArray(res.rows)) {
      ALL_ROWS = res.rows;
      
      // เรียงลำดับข้อมูลตามลำดับการบันทึก (timestamp) - ใหม่ไปเก่า (descending)
      ALL_ROWS.sort((a, b) => {
        const timestampA = new Date(a.timestamp || '1900-01-01T00:00:00.000Z');
        const timestampB = new Date(b.timestamp || '1900-01-01T00:00:00.000Z');
        return timestampB - timestampA; // เรียงจากใหม่ไปเก่า ตามลำดับการบันทึก
      });
      
      console.log(`✅ โหลดข้อมูลสำเร็จ: ${ALL_ROWS.length} รายการ (เรียงลำดับแล้ว)`);
      loadStatus.textContent = `✅ โหลดข้อมูลสำเร็จ: ${ALL_ROWS.length} รายการ`;
      loadStatus.className = 'success';
    } else {
      console.warn('⚠️ ไม่พบข้อมูลหรือรูปแบบไม่ถูกต้อง:', res);
      loadStatus.textContent = '⚠️ ไม่พบข้อมูลในระบบ - แสดงข้อมูลตัวอย่าง';
      loadStatus.className = 'warning';
      loadSampleData();
      return;
    }

    populateFilters(ALL_ROWS);
    refreshView();
    
    // โหลดข้อมูลงบประมาณ
    loadBudgetDashboard();
    
  } catch (err) {
    console.error('❌ ข้อผิดพลาดในการโหลดข้อมูล:', err);
    
    // แสดงข้อผิดพลาดที่เป็นมิตรต่อผู้ใช้
    const errorMsg = err.message.includes('Timeout') 
      ? 'เชื่อมต่อ Google Sheets ล่าช้า - กรุณาลองใหม่อีกครั้ง'
      : 'ไม่สามารถเชื่อมต่อ Google Sheets ได้ - ตรวจสอบการตั้งค่า';
    
    loadStatus.textContent = `❌ ${errorMsg} - แสดงข้อมูลตัวอย่าง`;
    loadStatus.className = 'error';
    
    // แสดงข้อมูลตัวอย่างแทน
    loadSampleData();
    
  } finally {
    // Clear loading status after 5 seconds (only if not showing data info)
    setTimeout(() => {
      if (loadStatus && !loadStatus.textContent.includes('รายการ')) {
        loadStatus.textContent = '';
        loadStatus.className = '';
      }
    }, 5000);
  }
}

// โหลดข้อมูลตัวอย่างเมื่อไม่สามารถเชื่อมต่อ Google Sheets ได้
function loadSampleData() {
  console.log('📋 กำลังสร้างข้อมูลตัวอย่าง...');
  
  const sampleData = [
    {
      id: 'DEMO001',
      date: '2024-12-01',
      mission: 'บินสำรวจ',
      docType: 'ใบสั่งซื้อ',
      docBookVolume: '1',
      docBookNo: '001',
      payBookVolume: '1',
      payBookNo: '001',
      aircraftType: 'CARAVAN C208',
      aircraftModel: 'CARAVAN C208',
      agriNo: '1912',
      station: 'สนามบินนครสวรรค์',
      buyer: 'สำนักงานปฏิบัติการฝนหลวง',
      fuelType: 'JET A-1',
      fuelSource: 'สนามบินนครสวรรค์ แท๊ง 1',
      liters: 1500,
      basePricePerLiter: 35.50,
      amountExVat: 53250.00,
      vatAmount: 3727.50,
      amountIncVat: 56977.50,
      recorder: 'ระบบตัวอย่าง',
      note: 'ข้อมูลตัวอย่าง - ไม่ได้เชื่อมต่อ Google Sheets'
    },
    {
      id: 'DEMO002',
      date: '2024-12-02',
      mission: 'ปฏิบัติการฝนหลวง',
      docType: 'ใบเสร็จรับเงิน',
      docBookVolume: '1',
      docBookNo: '002',
      payBookVolume: '1',
      payBookNo: '002',
      aircraftType: 'CASA - 300',
      aircraftModel: 'CASA - 300',
      agriNo: '1531',
      station: 'สนามบินคลองหลวง',
      buyer: 'สำนักงานปฏิบัติการฝนหลวง',
      fuelType: 'JET A-1',
      fuelSource: 'รถน้ำมัน 96-0677 กทม.',
      liters: 2000,
      basePricePerLiter: 36.00,
      amountExVat: 72000.00,
      vatAmount: 5040.00,
      amountIncVat: 77040.00,
      recorder: 'ระบบตัวอย่าง',
      note: 'ข้อมูลตัวอย่าง - การบินเพาะเมฆ'
    },
    {
      id: 'DEMO003',
      date: '2024-12-03',
      mission: 'บินสนับสนุน',
      docType: 'ใบกำกับภาษี',
      docBookVolume: '1',
      docBookNo: '003',
      payBookVolume: '1',
      payBookNo: '003',
      aircraftType: 'BELL 407',
      aircraftModel: 'BELL 407',
      agriNo: '2311',
      station: 'สนามบินอุดรธานี',
      buyer: 'กองบิน 23',
      fuelType: 'JET A-1',
      fuelSource: 'สนามบินนครสวรรค์ - ถัง 200L',
      liters: 10, // 10 ถัง = 2000 ลิตร
      basePricePerLiter: 200, // ราคาต่อถัง
      amountExVat: 2000.00,
      vatAmount: 140.00,
      amountIncVat: 2140.00,
      recorder: 'ระบบตัวอย่าง',
      note: 'ข้อมูลตัวอย่าง - 10 ถัง x 200 ลิตร'
    }
  ];
  
  ALL_ROWS = sampleData;
  console.log(`📋 สร้างข้อมูลตัวอย่างสำเร็จ: ${ALL_ROWS.length} รายการ`);
  
  populateFilters(ALL_ROWS);
  refreshView();
}

// ตัวแปรสำหรับเก็บข้อมูลที่กำลังแก้ไข
let currentEditingRecord = null;

// ฟังก์ชันเปิด Modal แก้ไข
function editRecord(identifier) {
  // ค้นหาด้วย sequenceNumber ก่อน ถ้าไม่พบค่อยใช้ id
  const record = ALL_ROWS.find(r => r.sequenceNumber === identifier || r.id == identifier);
  if (!record) {
    alert('ไม่พบข้อมูลที่ต้องการแก้ไข');
    return;
  }

  currentEditingRecord = record;
  
  // เติมข้อมูลลงในฟอร์ม
  document.getElementById('editDate').value = record.date || '';
  document.getElementById('editMission').value = record.mission || '';
  document.getElementById('editDocType').value = record.docType || '';
  document.getElementById('editDocBookVolume').value = record.docBookVolume || '';
  document.getElementById('editDocBookNo').value = record.docBookNo || '';
  document.getElementById('editPayBookVolume').value = record.payBookVolume || '';
  document.getElementById('editPayBookNo').value = record.payBookNo || '';
  // ตั้งค่าเครื่องบิน
  const aircraftValue = record.aircraftType && record.aircraftNumber ? 
    `${record.aircraftType} : ${record.aircraftNumber}` : '';
  document.getElementById('editAircraft').value = aircraftValue;
  document.getElementById('editStation').value = record.station || '';
  document.getElementById('editBuyer').value = record.buyer || '';
  document.getElementById('editFuelType').value = record.fuelType || '';
  document.getElementById('editLiters').value = record.liters || '';
  document.getElementById('editPricePerLiter').value = record.basePricePerLiter || '';
  document.getElementById('editValueExVat').value = record.amountExVat || '';
  document.getElementById('editVat').value = record.vatAmount || '';
  document.getElementById('editTotalWithVat').value = record.amountIncVat || '';
  document.getElementById('editRecorder').value = record.recorder || '';
  document.getElementById('editNotes').value = record.note || '';

  // เพิ่ม event listeners สำหรับการคำนวณอัตโนมัติ
  setupEditCalculation();
  
  // แสดง Modal
  document.getElementById('editModal').style.display = 'block';
}

// ฟังก์ชันปิด Modal
function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
  currentEditingRecord = null;
}

// ฟังก์ชันตั้งค่าการคำนวณอัตโนมัติในฟอร์มแก้ไข
function setupEditCalculation() {
  const litersInput = document.getElementById('editLiters');
  const priceInput = document.getElementById('editPricePerLiter');
  
  function calculateEdit() {
    const liters = parseFloat(litersInput.value) || 0;
    const price = parseFloat(priceInput.value) || 0;
    
    const valueExVat = liters * price;
    const vat = valueExVat * 0.07;
    const totalWithVat = valueExVat + vat;
    
    document.getElementById('editValueExVat').value = valueExVat.toFixed(2);
    document.getElementById('editVat').value = vat.toFixed(2);
    document.getElementById('editTotalWithVat').value = totalWithVat.toFixed(2);
  }
  
  litersInput.addEventListener('input', calculateEdit);
  priceInput.addEventListener('input', calculateEdit);
}

// ฟังก์ชันบันทึกการแก้ไข
async function saveEditedData() {
  if (!currentEditingRecord) {
    alert('ไม่พบข้อมูลที่ต้องการแก้ไข');
    return;
  }

  // รวบรวมข้อมูลจากฟอร์ม
  const aircraftValue = document.getElementById('editAircraft').value;
  const [aircraftType, aircraftNumber] = aircraftValue.includes(' : ') ? 
    aircraftValue.split(' : ') : ['', ''];

  const newData = {
    date: document.getElementById('editDate').value,
    mission: document.getElementById('editMission').value,
    docType: document.getElementById('editDocType').value,
    docBookVolume: document.getElementById('editDocBookVolume').value,
    docBookNo: document.getElementById('editDocBookNo').value,
    payBookVolume: document.getElementById('editPayBookVolume').value,
    payBookNo: document.getElementById('editPayBookNo').value,
    aircraftType: aircraftType,
    aircraftNumber: aircraftNumber,
    station: document.getElementById('editStation').value,
    buyer: document.getElementById('editBuyer').value,
    fuelType: document.getElementById('editFuelType').value,
    liters: document.getElementById('editLiters').value,
    basePricePerLiter: document.getElementById('editPricePerLiter').value,
    amountExVat: document.getElementById('editValueExVat').value,
    vatAmount: document.getElementById('editVat').value,
    amountIncVat: document.getElementById('editTotalWithVat').value,
    recorder: document.getElementById('editRecorder').value,
    note: document.getElementById('editNotes').value
  };

  // ตรวจสอบข้อมูลที่จำเป็น
  if (!newData.date || !newData.mission || !newData.aircraftType || !newData.aircraftNumber || 
      !newData.station || !newData.buyer || !newData.fuelType || !newData.liters || 
      !newData.basePricePerLiter || !newData.recorder) {
    alert('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน');
    return;
  }

  // เปรียบเทียบข้อมูลเดิมกับข้อมูลใหม่ เพื่อหาเฉพาะส่วนที่เปลี่ยนแปลง
  const changedFields = {};
  const originalData = currentEditingRecord;
  
  Object.keys(newData).forEach(key => {
    const oldValue = String(originalData[key] || '').trim();
    const newValue = String(newData[key] || '').trim();
    
    if (oldValue !== newValue) {
      changedFields[key] = newData[key];
      console.log(`🔄 Field changed: ${key} = "${oldValue}" → "${newValue}"`);
    }
  });

  // ถ้าไม่มีการเปลี่ยนแปลง
  if (Object.keys(changedFields).length === 0) {
    alert('ไม่มีการเปลี่ยนแปลงข้อมูล');
    closeEditModal();
    return;
  }

  console.log('📝 Changed fields:', changedFields);

  try {
    const api = getApiUrl();
    if (!api) {
      alert('กรุณาตั้งค่า API URL ก่อน');
      return;
    }

    // สร้าง URL สำหรับการอัปเดต - ส่งเฉพาะข้อมูลที่เปลี่ยนแปลง
    const params = new URLSearchParams();
    params.append('action', 'update');
    params.append('id', currentEditingRecord.sequenceNumber || currentEditingRecord.id);
    
    // ส่งเฉพาะฟิลด์ที่เปลี่ยนแปลง
    Object.keys(changedFields).forEach(key => {
      params.append(key, changedFields[key]);
    });

    const url = `${api}?${params.toString()}`;
    
    console.log('🚀 Sending update request:', url);
    
    // ส่งข้อมูล
    const response = await jsonpWithRetry(url, 2);
    
    if (response && response.success) {
      // อัปเดตข้อมูลใน cache (ALL_ROWS) โดยไม่ต้องโหลดใหม่
      updateCacheData(currentEditingRecord.sequenceNumber || currentEditingRecord.id, changedFields);
      
      alert('บันทึกการแก้ไขเรียบร้อยแล้ว');
      closeEditModal();
      
      // รีเฟรชการแสดงผลโดยไม่ต้องโหลดข้อมูลใหม่
      refreshView();
    } else {
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + (response.error || 'ไม่ทราบสาเหตุ'));
    }
  } catch (error) {
    console.error('Error updating data:', error);
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
  }
}

// ฟังก์ชันอัปเดตข้อมูลใน cache
function updateCacheData(identifier, changedFields) {
  const index = ALL_ROWS.findIndex(row => 
    (row.sequenceNumber && row.sequenceNumber === identifier) || 
    (row.id && row.id === identifier)
  );
  
  if (index !== -1) {
    // อัปเดตเฉพาะฟิลด์ที่เปลี่ยนแปลง
    Object.keys(changedFields).forEach(key => {
      ALL_ROWS[index][key] = changedFields[key];
    });
    
    // ถ้ามีการเปลี่ยนวันที่ ให้เรียงลำดับใหม่
    if (changedFields.date) {
      ALL_ROWS.sort((a, b) => {
        const dateA = new Date(a.date || '1900-01-01');
        const dateB = new Date(b.date || '1900-01-01');
        return dateB - dateA; // เรียงจากใหม่ไปเก่า
      });
      console.log('🔄 Data re-sorted after date change');
    }
    
    console.log('✅ Cache updated for record:', identifier);
    console.log('📊 Updated fields:', changedFields);
  } else {
    console.warn('⚠️ Record not found in cache for update:', identifier);
  }
}

// ฟังก์ชันลบข้อมูลจาก cache
function removeCacheData(identifier) {
  const index = ALL_ROWS.findIndex(row => 
    (row.sequenceNumber && row.sequenceNumber === identifier) || 
    (row.id && row.id === identifier)
  );
  
  if (index !== -1) {
    const removedRecord = ALL_ROWS.splice(index, 1)[0];
    console.log('✅ Record removed from cache:', identifier);
    console.log('🗑️ Removed record:', removedRecord);
  } else {
    console.warn('⚠️ Record not found in cache for removal:', identifier);
  }
}

// ฟังก์ชันลบข้อมูล
async function deleteRecord(identifier) {
  // ค้นหาด้วย sequenceNumber ก่อน ถ้าไม่พบค่อยใช้ id
  const record = ALL_ROWS.find(r => r.sequenceNumber === identifier || r.id == identifier);
  if (!record) {
    alert('ไม่พบข้อมูลที่ต้องการลบ');
    return;
  }

  const confirmDelete = confirm(`คุณต้องการลบข้อมูลนี้หรือไม่?\n\nวันที่: ${record.date}\nภารกิจ: ${record.mission}\nเครื่องบิน: ${aircraftKey(record)}\nลิตร: ${record.liters}`);
  
  if (!confirmDelete) return;

  try {
    const api = getApiUrl();
    if (!api) {
      alert('กรุณาตั้งค่า API URL ก่อน');
      return;
    }

    // ใช้ sequenceNumber ถ้ามี ไม่งั้นใช้ id
    const deleteId = record.sequenceNumber || record.id;
    const url = `${api}?action=delete&id=${deleteId}`;
    const response = await jsonpWithRetry(url, 2);
    
    if (response && response.success) {
      // ลบข้อมูลจาก cache โดยไม่ต้องโหลดใหม่
      removeCacheData(deleteId);
      
      alert('ลบข้อมูลเรียบร้อยแล้ว');
      
      // รีเฟรชการแสดงผลโดยไม่ต้องโหลดข้อมูลใหม่
      refreshView();
    } else {
      alert('เกิดข้อผิดพลาดในการลบข้อมูล: ' + (response.error || 'ไม่ทราบสาเหตุ'));
    }
  } catch (error) {
    console.error('Error deleting data:', error);
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
  }
}

// สร้างข้อมูลตัวอย่าง
async function createSampleData() {
  const confirmed = confirm('ต้องการสร้างข้อมูลตัวอย่าง?\n\n⚠️ การดำเนินการนี้จะลบข้อมูลเดิมทั้งหมด');
  if (!confirmed) return;
  
  try {
    const api = getApiUrl();
    if (!api) {
      alert('กรุณาตั้งค่า API URL ก่อน');
      return;
    }
    
    const url = api + '?action=create_sample_data';
    const response = await jsonpWithRetry(url, 2);
    
    if (response && response.success) {
      alert(`สร้างข้อมูลตัวอย่างเรียบร้อยแล้ว\nจำนวน ${response.count} รายการ`);
      await loadData();
    } else {
      throw new Error(response?.error || 'ไม่สามารถสร้างข้อมูลตัวอย่างได้');
    }
  } catch (error) {
    console.error('Error creating sample data:', error);
    alert('เกิดข้อผิดพลาดในการสร้างข้อมูลตัวอย่าง: ' + error.message);
  }
}

// ปิด Modal เมื่อคลิกนอก Modal
window.addEventListener('click', function(event) {
  const modal = document.getElementById('editModal');
  if (event.target === modal) {
    closeEditModal();
  }
});

// Export data to CSV (removed duplicate function)

// Add new record
function addNewRecord() {
  window.location.href = 'index.html';
}

// Clean up any orphaned callback functions
function cleanupOrphanedCallbacks() {
  let cleaned = 0;
  
  // Clean up callback functions in window object
  for (let prop in window) {
    if (prop.startsWith('jsonp_callback_') || prop.startsWith('cb_') || prop.startsWith('fuel_') || 
        prop.startsWith('inventory_callback') || prop.startsWith('budget_callback')) {
      console.log(`🧹 Cleaning up orphaned callback: ${prop}`);
      try {
        delete window[prop];
        cleaned++;
      } catch (e) {
        window[prop] = undefined;
        cleaned++;
      }
    }
  }
  
  // Clean up callbacks that match timestamp patterns (like fuel_1757492355363_9es33u1iq)
  const timestampPattern = /^(fuel_|cb_|jsonp_callback_)\d+_[a-z0-9]+$/;
  Object.keys(window).forEach(prop => {
    if (timestampPattern.test(prop)) {
      console.log(`🧹 Cleaning up timestamped callback: ${prop}`);
      try {
        delete window[prop];
        cleaned++;
      } catch (e) {
        window[prop] = undefined;
        cleaned++;
      }
    }
  });
  
  // Also check for any orphaned callbacks that might be in global scope but not enumerable
  const knownPrefixes = ['jsonp_callback_', 'cb_', 'fuel_', 'inventory_callback', 'budget_callback'];
  knownPrefixes.forEach(prefix => {
    // Look for properties that might exist but not be enumerable
    const props = Object.getOwnPropertyNames(window).filter(p => p.startsWith(prefix));
    props.forEach(prop => {
      if (typeof window[prop] === 'function') {
        console.log(`🧹 Cleaning up non-enumerable callback: ${prop}`);
        try {
          delete window[prop];
          cleaned++;
        } catch (e) {
          window[prop] = undefined;
          cleaned++;
        }
      }
    });
  });
  
  if (cleaned > 0) {
    console.log(`✅ Cleaned up ${cleaned} orphaned callback functions`);
  }
  
  // Also clean up any script tags that might be left behind
  const scripts = document.querySelectorAll('script[src*="callback="]');
  let scriptsRemoved = 0;
  scripts.forEach((script) => {
    if (script.src.includes('callback=fuel_') || 
        script.src.includes('callback=cb_') || 
        script.src.includes('callback=jsonp_callback_') ||
        script.src.includes('callback=inventory_callback') ||
        script.src.includes('callback=budget_callback')) {
      console.log(`🧹 Removing orphaned script tag: ${script.src}`);
      if (script.parentNode) {
        script.parentNode.removeChild(script);
        scriptsRemoved++;
      }
    }
  });
  
  if (scriptsRemoved > 0) {
    console.log(`✅ Removed ${scriptsRemoved} orphaned script tags`);
  }
  
  return { callbacksCleaned: cleaned, scriptsRemoved };
}

// Global error handler for undefined callback functions
window.addEventListener('error', (event) => {
  if (event.error && event.error.message && event.error.message.includes('is not defined')) {
    const match = event.error.message.match(/(\w+) is not defined/);
    if (match && (match[1].startsWith('fuel_') || match[1].startsWith('cb_') || match[1].startsWith('jsonp_callback_'))) {
      console.error('❌ Undefined JSONP callback detected:', match[1]);
      console.log('🔧 This indicates an orphaned script tag or stale callback reference');
      console.log('🧹 Cleaning up and attempting to handle gracefully...');
      
      // Clean up orphaned callbacks and script tags
      cleanupOrphanedCallbacks();
      
      // Create a dummy function to prevent the error from propagating
      try {
        window[match[1]] = function(data) {
          console.log('🔄 Dummy callback executed for:', match[1]);
          console.log('📊 Data received:', data);
          
          // Try to handle the data gracefully if it looks like valid API response
          if (data && typeof data === 'object' && data.success !== undefined) {
            console.log('✅ Valid API response detected, processing...');
            
            // If this is data from loadData() calls, handle it
            if (data.success && Array.isArray(data.rows)) {
              ALL_ROWS = data.rows;
              console.log(`✅ Recovered data through dummy callback: ${ALL_ROWS.length} รายการ`);
              
              const loadStatus = document.getElementById('loadStatus');
              if (loadStatus) {
                loadStatus.textContent = `✅ โหลดข้อมูลสำเร็จ (ผ่าน recovery): ${ALL_ROWS.length} รายการ`;
                loadStatus.className = 'success';
              }
              
              populateFilters(ALL_ROWS);
              refreshView();
            }
          } else {
            console.log('⚠️ Unknown data format received in dummy callback');
          }
          
          // Clean up the dummy callback after use
          setTimeout(() => {
            try {
              delete window[match[1]];
              console.log('🧹 Cleaned up dummy callback:', match[1]);
            } catch (e) {
              window[match[1]] = undefined;
            }
          }, 1000);
        };
        console.log('✅ Created protective dummy callback for:', match[1]);
      } catch (e) {
        console.error('❌ Failed to create dummy callback:', e);
      }
      
      event.preventDefault();
      return false;
    }
  }
});

// Fallback JSONP response handler
window.handleJsonpResponse = function(data) {
  console.log('🔄 Fallback JSONP handler received data:', data);
  // This can be used by dummy callbacks when the original callback is missing
};

// ===============================
// Inventory Dashboard Functions
// ===============================

// โหลดและแสดงข้อมูล inventory ใน dashboard
async function loadInventoryDashboard() {
  const inventoryGrid = document.getElementById('inventoryDashboard');
  const loadingStatus = document.getElementById('inventoryLoadingStatus');
  
  if (!inventoryGrid) return;
  
  loadingStatus.style.display = 'block';
  
  try {
    const api = getApiUrl();
    if (!api) {
      console.warn('API URL not configured for inventory');
      loadingStatus.style.display = 'none';
      return;
    }
    
    const url = api + '?action=inventory';
    const response = await jsonpWithRetry(url, 3);
    
    if (response && response.success && response.inventory) {
      renderInventoryDashboard(response.inventory);
      updateInventorySummary(response.inventory);
    } else {
      throw new Error('ไม่สามารถโหลดข้อมูล inventory ได้');
    }
  } catch (error) {
    console.error('Error loading inventory dashboard:', error);
    inventoryGrid.innerHTML = '<div style="text-align:center; padding:20px; color:#ef4444;">⚠️ ไม่สามารถโหลดข้อมูลยอดคงเหลือได้</div>';
  } finally {
    loadingStatus.style.display = 'none';
  }
}

// แสดงข้อมูล inventory ในรูปแบบ dashboard
function renderInventoryDashboard(inventoryData) {
  const inventoryGrid = document.getElementById('inventoryDashboard');
  if (!inventoryGrid) return;
  
  inventoryGrid.innerHTML = '';
  
  Object.keys(FUEL_SOURCES).forEach(sourceName => {
    const sourceInfo = FUEL_SOURCES[sourceName];
    const stockData = inventoryData[sourceName] || { currentStock: 0, lastUpdated: null };
    
    const card = createInventoryCardCompact(sourceName, sourceInfo, stockData);
    inventoryGrid.appendChild(card);
  });
}

// สร้างการ์ด inventory แบบกะทัดรัดสำหรับ dashboard
function createInventoryCardCompact(sourceName, sourceInfo, stockData) {
  const card = document.createElement('div');
  card.className = 'inventory-card-compact';
  
  const currentStock = Number(stockData.currentStock) || 0;
  const capacity = Number(sourceInfo?.capacity) || 0; // normalize to number, avoid undefined
  const isBarrel = (sourceInfo.type === 'barrel' || sourceInfo.type === 'drum_storage') && sourceInfo.unitSize;
  
  let displayStock, displayCapacity, percentage, levelClass, statusClass, tooltipText;
  
  if (isBarrel) {
    // สำหรับถังน้ำมัน 200L - แสดงเป็นจำนวนถัง
    const tankCount = Math.floor(currentStock / sourceInfo.unitSize);
    const remainingLiters = currentStock % sourceInfo.unitSize;
    
    displayStock = `${tankCount} ถัง`;
    displayCapacity = remainingLiters > 0 ? `(+${remainingLiters} L)` : '';
    
    // สำหรับถังไม่มี percentage แต่ใช้สีเขียวตลอด
    percentage = 100;
    levelClass = 'level-high';
    statusClass = 'status-good';
    
    tooltipText = `${sourceName}\nจำนวนถัง: ${tankCount} ถัง\nเศษเหลือ: ${remainingLiters} ลิตร\nรวมทั้งหมด: ${currentStock.toLocaleString()} ลิตร\nอัปเดตล่าสุด: ${new Date(stockData.lastUpdated || Date.now()).toLocaleString('th-TH')}`;
  } else {
    // สำหรับแหล่งอื่นๆ - แสดงตามปกติ
    displayStock = currentStock.toLocaleString();
    displayCapacity = `/${capacity.toLocaleString()} L`;
    percentage = capacity > 0 ? (currentStock / capacity) * 100 : 0;
    
    // กำหนดระดับและสี
    if (percentage > 100) {
      levelClass = 'level-overfill';
      statusClass = 'status-overfill';
    } else if (percentage > 80) {
      levelClass = 'level-high';
      statusClass = 'status-good';
    } else if (percentage > 20) {
      levelClass = 'level-medium';
      statusClass = 'status-warning';
    } else {
      levelClass = 'level-low';
      statusClass = 'status-critical';
    }
    
    tooltipText = `${sourceName}\nยอดคงเหลือ: ${currentStock.toLocaleString()} ลิตร\nความจุ: ${capacity.toLocaleString()} ลิตร\nระดับ: ${percentage.toFixed(1)}%\nอัปเดตล่าสุด: ${new Date(stockData.lastUpdated || Date.now()).toLocaleString('th-TH')}`;
  }
  
  const lastUpdated = stockData.lastUpdated ? 
    new Date(stockData.lastUpdated).toLocaleString('th-TH', { 
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
    }) : 'ไม่ทราบ';
  
  // ตัดชื่อให้สั้น
  const displayName = sourceName.length > 20 ? sourceName.substring(0, 18) + '...' : sourceName;
  
  card.innerHTML = `
    <div class="inventory-status-indicator ${statusClass}"></div>
    
    <div class="inventory-header-compact">
      <div class="inventory-source-name" title="${sourceName}">${displayName}</div>
      <div class="inventory-type-badge ${sourceInfo.type}">${getTypeLabel(sourceInfo.type)}</div>
    </div>
    
    <div class="inventory-stats">
      <div class="inventory-stock">${displayStock}</div>
      <div class="inventory-capacity">${displayCapacity}</div>
    </div>
    
    ${!isBarrel ? `<div class="inventory-progress">
      <div class="inventory-progress-fill ${levelClass}" style="width: ${Math.min(percentage, 100)}%"></div>
    </div>` : '<div style="height: 6px;"></div>'}
    
    <div class="inventory-percentage">
      <div class="inventory-percentage-text ${levelClass}">${isBarrel ? 'ไม่จำกัด' : percentage.toFixed(1) + '%'}</div>
      <div class="inventory-last-updated">${lastUpdated}</div>
    </div>
  `;
  
  // เพิ่ม tooltip เมื่อ hover
  card.title = tooltipText;
  
  // คลิกเพื่อไปหน้าจัดการ inventory
  card.style.cursor = 'pointer';
  card.addEventListener('click', () => {
    window.open('inventory.html', '_blank');
  });
  
  return card;
}

// อัปเดตสรุปข้อมูล inventory
function updateInventorySummary(inventoryData) {
  let totalCapacity = 0;
  let totalStock = 0;
  let fixedCapacitySources = 0;
  let barrelTanks = 0;
  let barrelStock = 0;
  
  Object.keys(FUEL_SOURCES).forEach(sourceName => {
    const sourceInfo = FUEL_SOURCES[sourceName];
    const stockData = inventoryData[sourceName] || { currentStock: 0 };
    const currentStock = Number(stockData.currentStock) || 0;
    
    if ((sourceInfo.type === 'barrel' || sourceInfo.type === 'drum_storage') && sourceInfo.unitSize) {
      // ถังน้ำมัน 200L - นับเป็นถังแยก
      barrelTanks += Math.floor(currentStock / sourceInfo.unitSize);
      barrelStock += currentStock;
    } else if (sourceInfo.type !== 'purchase') {
      // แหล่งที่มีความจุคงที่ (ไม่รวม purchase)
      const capacity = Number(sourceInfo.capacity) || 0;
      if (capacity > 0) {
        totalCapacity += capacity;
        totalStock += currentStock;
        fixedCapacitySources++;
      }
    }
  });
  
  // คำนวณระดับเฉลี่ยสำหรับแหล่งที่มีความจุคงที่
  const averageLevel = totalCapacity > 0 ? (totalStock / totalCapacity) * 100 : 0;
  
  // อัปเดต UI
  const totalCapacityEl = document.getElementById('totalCapacity');
  const totalStockEl = document.getElementById('totalStock');
  const averageLevelEl = document.getElementById('averageLevel');
  
  if (totalCapacityEl) {
    // แสดงความจุรวม + จำนวนถัง
    const displayCapacity = barrelTanks > 0 ? 
      `${totalCapacity.toLocaleString()} + ${barrelTanks} ถัง` : 
      totalCapacity.toLocaleString();
    totalCapacityEl.textContent = displayCapacity;
  }
  
  if (totalStockEl) {
    // แสดงยอดคงเหลือรวมทั้งหมด
    const totalAllStock = totalStock + barrelStock;
    totalStockEl.textContent = totalAllStock.toLocaleString();
  }
  
  if (averageLevelEl) {
    // แสดงระดับเฉลี่ยเฉพาะแหล่งที่มีความจุคงที่
    averageLevelEl.textContent = averageLevel.toFixed(1) + '%';
  }
}

// แปลงประเภทเป็นป้ายกำกับ
function getTypeLabel(type) {
  switch (type) {
    case 'tankfarm': return 'แท๊งฟาร์ม';
    case 'truck': return 'รถน้ำมัน';
    case 'barrel': return 'ถังน้ำมัน';
    case 'drum_storage': return 'คลังถัง';
    case 'purchase': return 'จัดซื้อ';
    default: return type;
  }
}

// โหลดข้อมูลงบประมาณสำหรับ dashboard
async function loadBudgetDashboard() {
  const budgetGrid = document.getElementById('budgetDashboard');
  const loadingStatus = document.getElementById('budgetLoadingStatus');
  
  if (!budgetGrid) return;
  
  try {
    loadingStatus.style.display = 'block';
    budgetGrid.innerHTML = '';
    
    const api = getApiUrl();
    if (!api) {
      loadDemoBudgetData();
      return;
    }
    
    const url = api + '?action=budget';
    const response = await jsonpWithRetry(url, 2);
    
    if (response && response.success && response.budgets) {
      renderBudgetDashboard(response.budgets);
      updateBudgetSummary(response.budgets);
    } else {
      throw new Error('ไม่สามารถโหลดข้อมูลงบประมาณได้');
    }
  } catch (error) {
    console.error('Error loading budget dashboard:', error);
    // แสดง demo data เมื่อ API ไม่ทำงาน
    loadDemoBudgetData();
  } finally {
    loadingStatus.style.display = 'none';
  }
}

// โหลดข้อมูลงบประมาณแบบ Demo
function loadDemoBudgetData() {
  const demoBudgets = [
    {
      mission: 'บินสำรวจ',
      fiscalYear: '2567',
      allocatedBudget: 6000000,
      usedBudget: 2850000,
      remainingBudget: 3150000,
      lastUpdated: new Date(),
      status: 'Active',
      utilization: 47.5
    },
    {
      mission: 'บินสนับสนุน',
      fiscalYear: '2567',
      allocatedBudget: 4500000,
      usedBudget: 1950000,
      remainingBudget: 2550000,
      lastUpdated: new Date(),
      status: 'Active',
      utilization: 43.3
    },
    {
      mission: 'ปฏิบัติการฝนหลวง',
      fiscalYear: '2567',
      allocatedBudget: 8000000,
      usedBudget: 6200000,
      remainingBudget: 1800000,
      lastUpdated: new Date(),
      status: 'Warning',
      utilization: 77.5
    },
    {
      mission: 'บินบริการ',
      fiscalYear: '2567',
      allocatedBudget: 3500000,
      usedBudget: 3650000,
      remainingBudget: -150000,
      lastUpdated: new Date(),
      status: 'Over Budget',
      utilization: 104.3
    }
  ];
  
  renderBudgetDashboard(demoBudgets);
  updateBudgetSummary(demoBudgets);
}

// แสดงข้อมูลงบประมาณในรูปแบบ dashboard
function renderBudgetDashboard(budgetData) {
  const budgetGrid = document.getElementById('budgetDashboard');
  if (!budgetGrid) return;
  
  budgetGrid.innerHTML = '';
  
  budgetData.forEach(budget => {
    const card = createBudgetCardCompact(budget);
    budgetGrid.appendChild(card);
  });
}

// สร้างการ์ดงบประมาณแบบกะทัดรัดสำหรับ dashboard
function createBudgetCardCompact(budget) {
  const card = document.createElement('div');
  card.className = 'budget-card-compact';
  
  const allocatedBudget = Number(budget.allocatedBudget) || 0;
  const usedBudget = Number(budget.usedBudget) || 0;
  const remainingBudget = Number(budget.remainingBudget) || 0;
  const utilization = Number(budget.utilization) || 0;
  
  // กำหนดสีและสถานะ
  const statusClass = budget.status === 'Over Budget' ? 'over-budget' : 
                     budget.status === 'Warning' ? 'warning' : 'active';
  const statusText = budget.status === 'Over Budget' ? 'เกินงบ' : 
                    budget.status === 'Warning' ? 'เตือน' : 'ปกติ';
  
  // Progress bar
  const progressColor = utilization > 100 ? 'over' : utilization >= 80 ? 'warning' : 'normal';
  const progressWidth = Math.min(utilization, 100); // จำกัดไม่เกิน 100% สำหรับ UI
  
  card.innerHTML = `
    <div class="budget-card-header">
      <div class="budget-mission-name">${budget.mission}</div>
      <div class="budget-status-badge ${statusClass}">${statusText}</div>
    </div>
    
    <div class="budget-amounts">
      <div class="budget-amount-item">
        <div class="budget-amount-label">งบประมาณ</div>
        <div class="budget-amount-value">${formatMoney(allocatedBudget)}</div>
      </div>
      <div class="budget-amount-item">
        <div class="budget-amount-label">ใช้ไป</div>
        <div class="budget-amount-value">${formatMoney(usedBudget)}</div>
      </div>
      <div class="budget-amount-item">
        <div class="budget-amount-label">คงเหลือ</div>
        <div class="budget-amount-value ${remainingBudget < 0 ? 'negative' : 'positive'}">
          ${formatMoney(remainingBudget)}
        </div>
      </div>
    </div>
    
    <div class="budget-progress-bar">
      <div class="budget-progress-fill ${progressColor}" 
           style="width: ${progressWidth}%;"></div>
    </div>
    
    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
      <span style="font-size: 12px; color: #6b7280;">การใช้งาน: ${utilization.toFixed(1)}%</span>
      <span style="font-size: 11px; color: #9ca3af;">ปีงบ ${budget.fiscalYear}</span>
    </div>
  `;
  
  return card;
}

// อัปเดตสรุปงบประมาณ
function updateBudgetSummary(budgetData) {
  const totalAllocated = budgetData.reduce((sum, budget) => sum + (Number(budget.allocatedBudget) || 0), 0);
  const totalUsed = budgetData.reduce((sum, budget) => sum + (Number(budget.usedBudget) || 0), 0);
  const totalRemaining = totalAllocated - totalUsed;
  const overBudgetCount = budgetData.filter(budget => budget.status === 'Over Budget').length;
  
  const totalAllocatedEl = document.getElementById('totalBudgetAllocated');
  const totalUsedEl = document.getElementById('totalBudgetUsed');
  const totalRemainingEl = document.getElementById('totalBudgetRemaining');
  const overBudgetCountEl = document.getElementById('overBudgetCount');
  
  if (totalAllocatedEl) {
    totalAllocatedEl.textContent = formatMoney(totalAllocated);
  }
  
  if (totalUsedEl) {
    totalUsedEl.textContent = formatMoney(totalUsed);
  }
  
  if (totalRemainingEl) {
    totalRemainingEl.textContent = formatMoney(totalRemaining);
    // เปลี่ยนสีตามสถานะ
    if (totalRemaining < 0) {
      totalRemainingEl.style.color = '#dc2626'; // สีแดง
    } else if ((totalUsed / totalAllocated) >= 0.8) {
      totalRemainingEl.style.color = '#d97706'; // สีส้ม
    } else {
      totalRemainingEl.style.color = '#17a2b8'; // สีเขียวน้ำเงิน
    }
  }
  
  if (overBudgetCountEl) {
    overBudgetCountEl.textContent = overBudgetCount;
    overBudgetCountEl.style.color = overBudgetCount > 0 ? '#dc2626' : '#28a745';
  }
}

// ====== Edit/Delete/Export bindings ======
window.addEventListener('DOMContentLoaded', () => {
  // Clean up any orphaned callbacks first
  cleanupOrphanedCallbacks();
  
  // Prevent browser from caching JSONP callbacks
  console.log('🚀 Dashboard initializing...');
  
  initApiConfig();
  bindFilterEvents();
  document.getElementById('searchBox')?.addEventListener('input', applySearch);
  document.getElementById('clearSearch')?.addEventListener('click', () => {
    const sb = document.getElementById('searchBox');
    if (sb) sb.value = '';
    applySearch();
  });
  
  // Updated event listeners
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', (e) => {
      console.log('🔄 Export button clicked:', e.target);
      openExportModal();
    });
  } else {
    console.warn('⚠️ Export button not found');
  }
  
  document.getElementById('addRecordBtn')?.addEventListener('click', addNewRecord);
  
  // เพิ่ม event listener สำหรับปุ่มรีเฟรช inventory
  document.getElementById('refreshInventoryBtn')?.addEventListener('click', loadInventoryDashboard);
  
  loadData();
});

// ====== Edit/Delete Logic ======
let CURRENT_EDIT_ID = null;

function editRecord(id) {
  try {
    if (!id) return;
    
    // Find record by sequenceNumber or id
    const rec = ALL_ROWS.find(r => String(r.sequenceNumber || r.id) === String(id));
    if (!rec) {
      alert('ไม่พบรายการที่ต้องการแก้ไข');
      return;
    }
    
    // Always use the actual ID field for API operations, not sequenceNumber
    CURRENT_EDIT_ID = rec.id;
    console.log('🔍 Edit record - Search ID:', id, 'Found record ID:', rec.id, 'Sequence:', rec.sequenceNumber);

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };

    setVal('editDate', rec.date || '');
    setVal('editDocType', rec.docType || '');
    setVal('editDocBookVolume', rec.docBookVolume || '');
    setVal('editDocBookNo', rec.docBookNo || '');
    setVal('editPayBookVolume', rec.payBookVolume || '');
    setVal('editPayBookNo', rec.payBookNo || '');

    setVal('editMission', rec.mission || '');
    setVal('editAircraft', aircraftKey(rec));
    setVal('editStation', rec.station || '');
    setVal('editBuyer', rec.buyer || '');

    setVal('editFuelType', rec.fuelType || '');
    setVal('editLiters', rec.liters || '');
    setVal('editPricePerLiter', rec.basePricePerLiter || rec.pricePerLiter || '');

    setVal('editValueExVat', rec.amountExVat || '');
    setVal('editVat', rec.vatAmount || '');
    setVal('editTotalWithVat', rec.amountIncVat || '');

    setVal('editRecorder', rec.recorder || '');
    setVal('editNotes', rec.note || '');

    const modal = document.getElementById('editModal');
    if (modal) modal.style.display = 'block';
  } catch (e) {
    console.error('editRecord error:', e);
    alert('เกิดข้อผิดพลาดในการเปิดหน้าต่างแก้ไข');
  }
}

function closeEditModal() {
  const modal = document.getElementById('editModal');
  if (modal) modal.style.display = 'none';
  CURRENT_EDIT_ID = null;
}

async function saveEditedData() {
  try {
    if (!CURRENT_EDIT_ID) {
      alert('ไม่พบรายการที่จะบันทึก');
      return;
    }
    const api = getApiUrl();
    if (!api) {
      alert('ยังไม่ได้ตั้งค่า API');
      return;
    }

    const getVal = id => document.getElementById(id)?.value || '';

    const payload = {
      id: CURRENT_EDIT_ID,
      date: getVal('editDate'),
      docType: getVal('editDocType'),
      docBookVolume: getVal('editDocBookVolume'),
      docBookNo: getVal('editDocBookNo'),
      payBookVolume: getVal('editPayBookVolume'),
      payBookNo: getVal('editPayBookNo'),
      mission: getVal('editMission'),
      aircraft: getVal('editAircraft'),
      station: getVal('editStation'),
      buyer: getVal('editBuyer'),
      fuelType: getVal('editFuelType'),
      liters: getVal('editLiters'),
      pricePerLiter: getVal('editPricePerLiter'),
      recorder: getVal('editRecorder'),
      note: getVal('editNotes')
    };

    // Send data as JSON string in 'data' parameter, as expected by Google Apps Script
    const qs = new URLSearchParams({ 
      action: 'update', 
      id: CURRENT_EDIT_ID,
      data: JSON.stringify(payload),
      _t: Date.now() // Cache busting parameter
    });
    const url = `${api}?${qs.toString()}`;

    console.log('🔄 Update request URL:', url);
    console.log('📊 Update payload:', payload);

    const res = await jsonpWithRetry(url, 3);
    if (res && res.success) {
      alert('บันทึกการแก้ไขสำเร็จ');
      closeEditModal();
      await loadData();
    } else {
      console.error('Update failed:', res);
      const errorMsg = res && res.error ? res.error : 'ไม่ทราบสาเหตุ';
      alert(`ไม่สามารถบันทึกการแก้ไขได้: ${errorMsg}`);
    }
  } catch (e) {
    console.error('saveEditedData error:', e);
    alert('เกิดข้อผิดพลาดระหว่างบันทึกการแก้ไข');
  }
}

async function deleteRecord(id) {
  try {
    if (!id) return;
    if (!confirm('ยืนยันการลบรายการนี้?')) return;

    // Find record by sequenceNumber or id to get the actual ID
    const rec = ALL_ROWS.find(r => String(r.sequenceNumber || r.id) === String(id));
    if (!rec) {
      alert('ไม่พบรายการที่ต้องการลบ');
      return;
    }
    
    // Always use the actual ID field for API operations, not sequenceNumber
    const actualId = rec.id;
    console.log('🔍 Delete record - Search ID:', id, 'Found record ID:', actualId, 'Sequence:', rec.sequenceNumber);

    const api = getApiUrl();
    if (!api) {
      alert('ยังไม่ได้ตั้งค่า API');
      return;
    }

    const qs = new URLSearchParams({ 
      action: 'delete', 
      id: actualId,
      _t: Date.now() // Cache busting parameter
    });
    const url = `${api}?${qs.toString()}`;
    
    console.log('🗑️ Delete request URL:', url);
    console.log('🆔 Delete ID:', actualId);
    
    const res = await jsonpWithRetry(url, 3);

    if (res && res.success) {
      alert('ลบข้อมูลสำเร็จ');
      await loadData();
    } else {
      console.error('Delete failed:', res);
      const errorMsg = res && res.error ? res.error : 'ไม่ทราบสาเหตุ';
      alert(`ไม่สามารถลบข้อมูลได้: ${errorMsg}`);
    }
  } catch (e) {
    console.error('deleteRecord error:', e);
    alert('เกิดข้อผิดพลาดระหว่างลบข้อมูล');
  }
}

// ปิด modal เมื่อคลิกนอกกล่อง
window.addEventListener('click', (e) => {
  const modal = document.getElementById('editModal');
  if (modal && e.target === modal) closeEditModal();
});

// ====== Export CSV ======
function exportToCSV() {
  try {
    console.log('📤 Starting CSV export...');
    
    const rows = getFilteredRows();
    console.log('📊 Filtered rows count:', rows.length);
    
    if (!rows.length) {
      alert('ไม่มีข้อมูลให้ส่งออก');
      return;
    }

    const headers = [
      'ลำดับ','วันที่','ภารกิจ','ประเภทเอกสาร','เล่มที่','เลขที่',
      'ใบสั่งจ่าย เล่มที่','ใบสั่งจ่าย เลขที่','เครื่องบิน','สถานี','ผู้จัดซื้อ',
      'ประเภทน้ำมัน','แหล่งที่มา','ลิตร','ราคา/หน่วย','มูลค่าไม่รวม VAT','VAT','รวม VAT','ผู้บันทึก','หมายเหตุ'
    ];

    const data = rows.map((r, idx) => ([
      idx + 1,
      r.date || '',
      r.mission || '',
      r.docType || '',
      r.docBookVolume || '',
      r.docBookNo || '',
      r.payBookVolume || '',
      r.payBookNo || '',
      aircraftKey(r),
      r.station || '',
      r.buyer || '',
      r.fuelType || '',
      r.fuelSource || '',
      Number(r.liters || 0),
      (r.pricePerTank ? `${Number(r.pricePerTank)}` : `${Number(r.basePricePerLiter || r.pricePerLiter || 0)}`),
      Number(r.amountExVat || 0),
      Number(r.vatAmount || 0),
      Number(r.amountIncVat || 0),
      r.recorder || '',
      r.note || ''
    ]));

    console.log('📋 Data prepared, creating CSV...');

    const escape = v => {
      const s = String(v ?? '');
      if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    // Add BOM for proper UTF-8 encoding in Excel
    const BOM = '\uFEFF';
    const csv = BOM + [headers.map(escape).join(','), ...data.map(row => row.map(escape).join(','))].join('\r\n');

    console.log('💾 Creating blob and download link...');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0,10);
    const filename = `fuel_records_${dateStr}.csv`;
    
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    
    console.log('⬇️ Triggering download:', filename);
    a.click();
    
    // Cleanup
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log('✅ CSV export completed successfully');
    }, 100);
    
  } catch (e) {
    console.error('❌ exportToCSV error:', e);
    alert(`เกิดข้อผิดพลาดในการส่งออกข้อมูล: ${e.message}`);
  }
}

// ====== Export Modal Functions ======

function openExportModal() {
  console.log('📊 Opening export modal...');
  
  // Set default date range (current filters if exist, or last 30 days)
  const fromDate = document.getElementById('fromDate')?.value || '';
  const toDate = document.getElementById('toDate')?.value || '';
  
  // If no current filters, set last 30 days as default
  if (!fromDate && !toDate) {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    document.getElementById('exportFromDate').value = thirtyDaysAgo.toISOString().split('T')[0];
    document.getElementById('exportToDate').value = today.toISOString().split('T')[0];
  } else {
    document.getElementById('exportFromDate').value = fromDate;
    document.getElementById('exportToDate').value = toDate;
  }
  
  // Copy current filter values
  const aircraftFilter = document.getElementById('aircraftFilter')?.value || '';
  const stationFilter = document.getElementById('stationFilter')?.value || '';
  const missionFilter = document.getElementById('missionFilter')?.value || '';
  
  document.getElementById('exportAircraft').value = aircraftFilter;
  document.getElementById('exportStation').value = stationFilter;
  document.getElementById('exportMission').value = missionFilter;
  
  // Show modal
  document.getElementById('exportModal').classList.add('show');
}

function closeExportModal() {
  console.log('❌ Closing export modal...');
  document.getElementById('exportModal').classList.remove('show');
}

function downloadExport() {
  try {
    console.log('⬇️ Starting export download...');
    
    const form = document.getElementById('exportForm');
    const formData = new FormData(form);
    
    const filters = {
      fromDate: formData.get('fromDate') || '',
      toDate: formData.get('toDate') || '',
      aircraft: formData.get('aircraft') || '',
      station: formData.get('station') || '',
      mission: formData.get('mission') || '',
      format: formData.get('format') || 'excel'
    };
    
    console.log('📋 Export filters:', filters);
    
    // Apply filters to data
    let filteredData = [...ALL_ROWS];
    
    // Date filter
    if (filters.fromDate) {
      filteredData = filteredData.filter(r => r.date >= filters.fromDate);
    }
    if (filters.toDate) {
      filteredData = filteredData.filter(r => r.date <= filters.toDate);
    }
    
    // Aircraft filter
    if (filters.aircraft) {
      filteredData = filteredData.filter(r => aircraftKey(r) === filters.aircraft);
    }
    
    // Station filter  
    if (filters.station) {
      filteredData = filteredData.filter(r => (r.station || '').toLowerCase().includes(filters.station.toLowerCase()));
    }
    
    // Mission filter
    if (filters.mission) {
      filteredData = filteredData.filter(r => (r.mission || '').toLowerCase().includes(filters.mission.toLowerCase()));
    }
    
    console.log(`📊 Filtered data: ${filteredData.length} records`);
    
    if (filteredData.length === 0) {
      alert('ไม่พบข้อมูลตามเงื่อนไขที่กำหนด');
      return;
    }
    
    // Export based on format
    switch (filters.format) {
      case 'csv':
        exportToCSVWithData(filteredData);
        break;
      case 'excel':
        exportToExcel(filteredData);
        break;
      case 'pdf':
        exportToPDF(filteredData);
        break;
      default:
        alert('รูปแบบไฟล์ไม่ถูกต้อง');
        return;
    }
    
    // Close modal
    closeExportModal();
    
  } catch (e) {
    console.error('❌ downloadExport error:', e);
    alert(`เกิดข้อผิดพลาดในการส่งออกข้อมูล: ${e.message}`);
  }
}

function exportToCSVWithData(data) {
  console.log('📄 Exporting to CSV format...');
  
  const headers = [
    'ลำดับ', 'วันที่', 'ภารกิจ', 'ประเภทเอกสาร', 'เล่มที่', 'เลขที่',
    'ใบสั่งจ่าย เล่มที่', 'ใบสั่งจ่าย เลขที่', 'เครื่องบิน', 'สถานี',
    'ผู้จัดซื้อ', 'ประเภทน้ำมัน', 'แหล่งที่มา', 'ปริมาณ', 'ราคา',
    'มูลค่าไม่รวม VAT', 'VAT', 'รวม VAT', 'ผู้บันทึก', 'หมายเหตุ'
  ];

  const csvData = data.map((r, idx) => [
    idx + 1,
    formatDateDisplay(r.date),
    r.mission || '',
    r.docType || '',
    r.docBookVolume || '',
    r.docBookNo || '',
    r.payBookVolume || '',
    r.payBookNo || '',
    aircraftKey(r),
    r.station || '',
    r.purchaser || '',
    r.fuelType || '',
    r.fuelSource || '',
    formatLitersDisplay(r),
    formatPriceDisplay(r),
    formatMoney(r.priceExVat || 0),
    formatMoney(r.vat || 0),
    formatMoney(r.totalPrice || 0),
    r.recorder || '',
    r.notes || ''
  ]);

  const escape = v => {
    const s = String(v ?? '');
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const BOM = '\uFEFF';
  const csv = BOM + [headers.map(escape).join(','), ...csvData.map(row => row.map(escape).join(','))].join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0,10);
  const filename = `fuel_records_${dateStr}.csv`;
  
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

function exportToExcel(data) {
  console.log('📊 Excel export not yet implemented - falling back to CSV');
  exportToCSVWithData(data);
}

function exportToPDF(data) {
  console.log('📄 PDF export not yet implemented - falling back to CSV');
  exportToCSVWithData(data);
}

// ============================================
// 📊 CHART DETAIL FUNCTIONS 
// ============================================

// แสดงรายละเอียดการใช้น้ำมันรายวัน
function showDailyUsageDetails(selectedDate, allRows) {
  const dayData = allRows.filter(r => r.date === selectedDate);
  
  if (dayData.length === 0) {
    showDetailModal('ไม่มีข้อมูล', `ไม่พบข้อมูลการใช้น้ำมันในวันที่ ${formatDateDisplay(selectedDate)}`);
    return;
  }

  // สรุปข้อมูลรายวัน
  const totalLiters = dayData.reduce((sum, r) => sum + (Number(r.liters) || 0), 0);
  const totalPrice = dayData.reduce((sum, r) => sum + (Number(r.totalPrice) || 0), 0);
  const aircraftsUsed = [...new Set(dayData.map(r => aircraftKey(r)))].length;
  const missionsCount = [...new Set(dayData.map(r => r.mission))].length;

  // แยกข้อมูลตามภารกิจ
  const byMission = new Map();
  dayData.forEach(r => {
    const mission = r.mission || 'ไม่ระบุ';
    if (!byMission.has(mission)) {
      byMission.set(mission, {
        liters: 0,
        price: 0,
        records: []
      });
    }
    const missionData = byMission.get(mission);
    missionData.liters += Number(r.liters) || 0;
    missionData.price += Number(r.totalPrice) || 0;
    missionData.records.push(r);
  });

  // สร้าง HTML สำหรับแสดงรายละเอียด
  const formattedDate = formatDateDisplay(selectedDate);
  let modalContent = `
    <div class="detail-header">
      <h3>📅 รายละเอียดการใช้น้ำมัน - ${formattedDate}</h3>
    </div>
    
    <div class="summary-section">
      <h4>📊 สรุปภาพรวม</h4>
      <div class="summary-grid">
        <div class="summary-item">
          <span class="label">ปริมาณรวม:</span>
          <span class="value">${totalLiters.toLocaleString('th-TH')} ลิตร</span>
        </div>
        <div class="summary-item">
          <span class="label">มูลค่ารวม:</span>
          <span class="value">${formatMoney(totalPrice)} บาท</span>
        </div>
        <div class="summary-item">
          <span class="label">เครื่องบินที่ใช้:</span>
          <span class="value">${aircraftsUsed} เครื่อง</span>
        </div>
        <div class="summary-item">
          <span class="label">จำนวนภารกิจ:</span>
          <span class="value">${missionsCount} ภารกิจ</span>
        </div>
      </div>
    </div>

    <div class="details-section">
      <h4>📋 รายละเอียดตามภารกิจ</h4>
  `;

  // แสดงข้อมูลแยกตามภารกิจ
  Array.from(byMission.entries()).forEach(([mission, data]) => {
    modalContent += `
      <div class="mission-detail">
        <div class="mission-header">
          <h5>🎯 ${mission}</h5>
          <div class="mission-summary">
            <span>${data.liters.toLocaleString('th-TH')} L</span> • 
            <span>${formatMoney(data.price)} บาท</span> • 
            <span>${data.records.length} รายการ</span>
          </div>
        </div>
        <div class="records-list">
    `;

    data.records.forEach(record => {
      modalContent += `
        <div class="record-item">
          <div class="record-info">
            <span class="aircraft">✈️ ${aircraftKey(record)}</span>
            <span class="station">📍 ${record.station || 'ไม่ระบุ'}</span>
            <span class="fuel-type">⛽ ${record.fuelType || 'ไม่ระบุ'}</span>
          </div>
          <div class="record-amount">
            <span class="liters">${Number(record.liters || 0).toLocaleString('th-TH')} L</span>
            <span class="price">${formatMoney(record.totalPrice || 0)} ฿</span>
          </div>
        </div>
      `;
    });

    modalContent += `
        </div>
      </div>
    `;
  });

  modalContent += `</div>`;

  showDetailModal(`รายละเอียดการใช้น้ำมัน - ${formattedDate}`, modalContent);
}

// แสดงรายละเอียดการใช้น้ำมันตามเครื่องบิน
function showAircraftUsageDetails(selectedAircraft, allRows) {
  const aircraftData = allRows.filter(r => aircraftKey(r) === selectedAircraft);
  
  if (aircraftData.length === 0) {
    showDetailModal('ไม่มีข้อมูล', `ไม่พบข้อมูลการใช้น้ำมันของเครื่องบิน ${selectedAircraft}`);
    return;
  }

  // สรุปข้อมูล
  const totalLiters = aircraftData.reduce((sum, r) => sum + (Number(r.liters) || 0), 0);
  const totalPrice = aircraftData.reduce((sum, r) => sum + (Number(r.totalPrice) || 0), 0);
  const datesUsed = [...new Set(aircraftData.map(r => r.date))].length;
  const missionsCount = [...new Set(aircraftData.map(r => r.mission))].length;

  // แยกข้อมูลตามวันที่ (เรียงจากใหม่ไปเก่า)
  const byDate = new Map();
  aircraftData.forEach(r => {
    const date = r.date;
    if (!byDate.has(date)) {
      byDate.set(date, {
        liters: 0,
        price: 0,
        records: []
      });
    }
    const dateData = byDate.get(date);
    dateData.liters += Number(r.liters) || 0;
    dateData.price += Number(r.totalPrice) || 0;
    dateData.records.push(r);
  });

  // เรียงตามวันที่
  const sortedDates = Array.from(byDate.entries()).sort(([a], [b]) => new Date(b) - new Date(a));

  let modalContent = `
    <div class="detail-header">
      <h3>✈️ รายละเอียดการใช้น้ำมัน - ${selectedAircraft}</h3>
    </div>
    
    <div class="summary-section">
      <h4>📊 สรุปภาพรวม</h4>
      <div class="summary-grid">
        <div class="summary-item">
          <span class="label">ปริมาณรวม:</span>
          <span class="value">${totalLiters.toLocaleString('th-TH')} ลิตร</span>
        </div>
        <div class="summary-item">
          <span class="label">มูลค่ารวม:</span>
          <span class="value">${formatMoney(totalPrice)} บาท</span>
        </div>
        <div class="summary-item">
          <span class="label">วันที่ใช้งาน:</span>
          <span class="value">${datesUsed} วัน</span>
        </div>
        <div class="summary-item">
          <span class="label">จำนวนภารกิจ:</span>
          <span class="value">${missionsCount} ภารกิจ</span>
        </div>
      </div>
    </div>

    <div class="details-section">
      <h4>📋 ประวัติการใช้งาน (เรียงตามวันที่)</h4>
  `;

  // แสดงข้อมูลแยกตามวันที่
  sortedDates.forEach(([date, data]) => {
    modalContent += `
      <div class="date-detail">
        <div class="date-header">
          <h5>📅 ${formatDateDisplay(date)}</h5>
          <div class="date-summary">
            <span>${data.liters.toLocaleString('th-TH')} L</span> • 
            <span>${formatMoney(data.price)} บาท</span> • 
            <span>${data.records.length} รายการ</span>
          </div>
        </div>
        <div class="records-list">
    `;

    data.records.forEach(record => {
      modalContent += `
        <div class="record-item">
          <div class="record-info">
            <span class="mission">🎯 ${record.mission || 'ไม่ระบุ'}</span>
            <span class="station">📍 ${record.station || 'ไม่ระบุ'}</span>
            <span class="fuel-type">⛽ ${record.fuelType || 'ไม่ระบุ'}</span>
          </div>
          <div class="record-amount">
            <span class="liters">${Number(record.liters || 0).toLocaleString('th-TH')} L</span>
            <span class="price">${formatMoney(record.totalPrice || 0)} ฿</span>
          </div>
        </div>
      `;
    });

    modalContent += `
        </div>
      </div>
    `;
  });

  modalContent += `</div>`;

  showDetailModal(`รายละเอียดการใช้น้ำมัน - ${selectedAircraft}`, modalContent);
}

// แสดงรายละเอียดการใช้น้ำมันตามภารกิจ
function showMissionUsageDetails(selectedMission, allRows) {
  const missionData = allRows.filter(r => (r.mission || 'ไม่ระบุ') === selectedMission);
  
  if (missionData.length === 0) {
    showDetailModal('ไม่มีข้อมูล', `ไม่พบข้อมูลการใช้น้ำมันของภารกิจ ${selectedMission}`);
    return;
  }

  // สรุปข้อมูล
  const totalLiters = missionData.reduce((sum, r) => sum + (Number(r.liters) || 0), 0);
  const totalPrice = missionData.reduce((sum, r) => sum + (Number(r.totalPrice) || 0), 0);
  const aircraftsUsed = [...new Set(missionData.map(r => aircraftKey(r)))].length;
  const datesUsed = [...new Set(missionData.map(r => r.date))].length;

  // แยกข้อมูลตามเครื่องบิน
  const byAircraft = new Map();
  missionData.forEach(r => {
    const aircraft = aircraftKey(r);
    if (!byAircraft.has(aircraft)) {
      byAircraft.set(aircraft, {
        liters: 0,
        price: 0,
        records: []
      });
    }
    const aircraftData = byAircraft.get(aircraft);
    aircraftData.liters += Number(r.liters) || 0;
    aircraftData.price += Number(r.totalPrice) || 0;
    aircraftData.records.push(r);
  });

  // เรียงตามปริมาณการใช้
  const sortedAircraft = Array.from(byAircraft.entries()).sort(([,a], [,b]) => b.liters - a.liters);

  let modalContent = `
    <div class="detail-header">
      <h3>🎯 รายละเอียดการใช้น้ำมัน - ${selectedMission}</h3>
    </div>
    
    <div class="summary-section">
      <h4>📊 สรุปภาพรวม</h4>
      <div class="summary-grid">
        <div class="summary-item">
          <span class="label">ปริมาณรวม:</span>
          <span class="value">${totalLiters.toLocaleString('th-TH')} ลิตร</span>
        </div>
        <div class="summary-item">
          <span class="label">มูลค่ารวม:</span>
          <span class="value">${formatMoney(totalPrice)} บาท</span>
        </div>
        <div class="summary-item">
          <span class="label">เครื่องบินที่ใช้:</span>
          <span class="value">${aircraftsUsed} เครื่อง</span>
        </div>
        <div class="summary-item">
          <span class="label">วันที่ปฏิบัติ:</span>
          <span class="value">${datesUsed} วัน</span>
        </div>
      </div>
    </div>

    <div class="details-section">
      <h4>📋 รายละเอียดตามเครื่องบิน</h4>
  `;

  // แสดงข้อมูลแยกตามเครื่องบิน
  sortedAircraft.forEach(([aircraft, data]) => {
    modalContent += `
      <div class="aircraft-detail">
        <div class="aircraft-header">
          <h5>✈️ ${aircraft}</h5>
          <div class="aircraft-summary">
            <span>${data.liters.toLocaleString('th-TH')} L</span> • 
            <span>${formatMoney(data.price)} บาท</span> • 
            <span>${data.records.length} รายการ</span>
          </div>
        </div>
        <div class="records-list">
    `;

    // เรียง records ตามวันที่
    const sortedRecords = data.records.sort((a, b) => new Date(b.date) - new Date(a.date));

    sortedRecords.forEach(record => {
      modalContent += `
        <div class="record-item">
          <div class="record-info">
            <span class="date">📅 ${formatDateDisplay(record.date)}</span>
            <span class="station">📍 ${record.station || 'ไม่ระบุ'}</span>
            <span class="fuel-type">⛽ ${record.fuelType || 'ไม่ระบุ'}</span>
          </div>
          <div class="record-amount">
            <span class="liters">${Number(record.liters || 0).toLocaleString('th-TH')} L</span>
            <span class="price">${formatMoney(record.totalPrice || 0)} ฿</span>
          </div>
        </div>
      `;
    });

    modalContent += `
        </div>
      </div>
    `;
  });

  modalContent += `</div>`;

  showDetailModal(`รายละเอียดการใช้น้ำมัน - ${selectedMission}`, modalContent);
}

// แสดง Modal รายละเอียด
function showDetailModal(title, content) {
  // ลบ modal เก่าถ้ามี
  const existingModal = document.getElementById('chartDetailModal');
  if (existingModal) {
    existingModal.remove();
  }

  // สร้าง modal ใหม่
  const modal = document.createElement('div');
  modal.id = 'chartDetailModal';
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <h2>${title}</h2>
          <button class="modal-close" onclick="closeDetailModal()">✕</button>
        </div>
        <div class="modal-body">
          ${content}
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeDetailModal()">ปิด</button>
        </div>
      </div>
    </div>
  `;

  // เพิ่ม styles สำหรับ modal
  if (!document.getElementById('modalStyles')) {
    const styles = document.createElement('style');
    styles.id = 'modalStyles';
    styles.textContent = `
      #chartDetailModal .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 20px;
      }
      
      #chartDetailModal .modal-content {
        background: white;
        border-radius: 12px;
        max-width: 90vw;
        max-height: 90vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 40px rgba(0,0,0,0.3);
      }
      
      #chartDetailModal .modal-header {
        padding: 20px 24px 16px;
        border-bottom: 1px solid #e5e7eb;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-shrink: 0;
      }
      
      #chartDetailModal .modal-header h2 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
        color: #1f2937;
      }
      
      #chartDetailModal .modal-close {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #6b7280;
        padding: 4px;
        border-radius: 4px;
      }
      
      #chartDetailModal .modal-close:hover {
        background: #f3f4f6;
        color: #374151;
      }
      
      #chartDetailModal .modal-body {
        flex: 1;
        overflow-y: auto;
        padding: 20px 24px;
      }
      
      #chartDetailModal .modal-footer {
        padding: 16px 24px;
        border-top: 1px solid #e5e7eb;
        display: flex;
        justify-content: flex-end;
        flex-shrink: 0;
      }
      
      #chartDetailModal .detail-header h3 {
        margin: 0 0 20px 0;
        color: #1f2937;
        font-size: 1.125rem;
      }
      
      #chartDetailModal .summary-section {
        margin-bottom: 24px;
        padding: 16px;
        background: #f9fafb;
        border-radius: 8px;
      }
      
      #chartDetailModal .summary-section h4 {
        margin: 0 0 16px 0;
        color: #374151;
        font-size: 1rem;
      }
      
      #chartDetailModal .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 12px;
      }
      
      #chartDetailModal .summary-item {
        display: flex;
        justify-content: space-between;
        padding: 8px 12px;
        background: white;
        border-radius: 6px;
        border: 1px solid #e5e7eb;
      }
      
      #chartDetailModal .summary-item .label {
        color: #6b7280;
        font-size: 0.875rem;
      }
      
      #chartDetailModal .summary-item .value {
        font-weight: 600;
        color: #1f2937;
      }
      
      #chartDetailModal .details-section h4 {
        margin: 0 0 16px 0;
        color: #374151;
        font-size: 1rem;
      }
      
      #chartDetailModal .mission-detail,
      #chartDetailModal .date-detail,
      #chartDetailModal .aircraft-detail {
        margin-bottom: 20px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        overflow: hidden;
      }
      
      #chartDetailModal .mission-header,
      #chartDetailModal .date-header,
      #chartDetailModal .aircraft-header {
        background: #f8fafc;
        padding: 12px 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #e5e7eb;
      }
      
      #chartDetailModal .mission-header h5,
      #chartDetailModal .date-header h5,
      #chartDetailModal .aircraft-header h5 {
        margin: 0;
        font-size: 0.9375rem;
        font-weight: 600;
        color: #374151;
      }
      
      #chartDetailModal .mission-summary,
      #chartDetailModal .date-summary,
      #chartDetailModal .aircraft-summary {
        font-size: 0.8125rem;
        color: #6b7280;
      }
      
      #chartDetailModal .records-list {
        padding: 0;
      }
      
      #chartDetailModal .record-item {
        padding: 12px 16px;
        border-bottom: 1px solid #f3f4f6;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      #chartDetailModal .record-item:last-child {
        border-bottom: none;
      }
      
      #chartDetailModal .record-info {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        flex: 1;
      }
      
      #chartDetailModal .record-info span {
        font-size: 0.8125rem;
        color: #6b7280;
        background: #f3f4f6;
        padding: 4px 8px;
        border-radius: 4px;
      }
      
      #chartDetailModal .record-amount {
        display: flex;
        gap: 12px;
        align-items: center;
      }
      
      #chartDetailModal .record-amount .liters {
        font-weight: 600;
        color: #059669;
      }
      
      #chartDetailModal .record-amount .price {
        font-weight: 600;
        color: #dc2626;
      }
      
      @media (max-width: 768px) {
        #chartDetailModal .modal-content {
          max-width: 95vw;
          max-height: 95vh;
        }
        
        #chartDetailModal .summary-grid {
          grid-template-columns: 1fr;
        }
        
        #chartDetailModal .record-item {
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
        }
        
        #chartDetailModal .record-amount {
          align-self: flex-end;
        }
      }
    `;
    document.head.appendChild(styles);
  }

  document.body.appendChild(modal);
  
  // เพิ่ม event listener สำหรับปิด modal เมื่อคลิกข้างนอก
  modal.querySelector('.modal-overlay').addEventListener('click', (e) => {
    if (e.target === modal.querySelector('.modal-overlay')) {
      closeDetailModal();
    }
  });
}

// ปิด Modal รายละเอียด
function closeDetailModal() {
  const modal = document.getElementById('chartDetailModal');
  if (modal) {
    modal.remove();
  }
}