// Utility: format number to 2 decimals with thousand separators
function formatMoney(n) {
  if (isNaN(n)) return '';
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

// API Call function
async function makeAPICall(action, data = {}) {
  return new Promise((resolve) => {
    const params = new URLSearchParams({ action, ...data });
    const script = document.createElement('script');
    const callbackName = `jsonp_callback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    window[callbackName] = function(response) {
      document.head.removeChild(script);
      delete window[callbackName];
      resolve(response);
    };
    
    script.src = `${window.APP_CONFIG.apiUrl}?${params}&callback=${callbackName}`;
    document.head.appendChild(script);
    
    // Timeout fallback
    setTimeout(() => {
      if (window[callbackName]) {
        document.head.removeChild(script);
        delete window[callbackName];
        resolve({ success: false, error: 'Request timeout' });
      }
    }, 10000);
  });
}

function initApiConfig() {
  // API URL is now hidden and configured automatically
  // No need for user input
  
  // Get next sequence number when page loads
  generateNextSequence();
}

async function generateNextSequence() {
  try {
    const response = await makeAPICall('get_next_sequence');
    if (response.success) {
      // แสดงลำดับในหัวข้อหรือที่อื่นถ้าต้องการ
      console.log('Next sequence number:', response.sequence);
      // เก็บลำดับไว้ใน global variable
      window.nextSequenceNumber = response.sequence;
      
      // อัปเดตฟิลด์ลำดับ
      const sequenceField = document.getElementById('sequenceNumber');
      if (sequenceField) {
        sequenceField.value = response.sequence;
      }
      
      // อัปเดตหัวข้อให้แสดงลำดับถัดไป
      const header = document.querySelector('header h1');
      if (header && header.textContent.indexOf('(') === -1) {
        header.textContent = `${header.textContent} (ลำดับถัดไป: ${response.sequence})`;
      }
    }
  } catch (error) {
    console.error('Error getting sequence number:', error);
    window.nextSequenceNumber = 'AUTO';
    const sequenceField = document.getElementById('sequenceNumber');
    if (sequenceField) {
      sequenceField.value = 'AUTO';
    }
  }
}

// FUEL_SOURCES ถูกประกาศใน common.js แล้ว

function handleFuelSourceChange() {
  const fuelSource = document.getElementById('fuelSource').value;
  const litersInput = document.getElementById('liters');
  const litersLabel = litersInput.parentElement.querySelector('.label-with-icon');
  const pricePerLiterInput = document.getElementById('pricePerLiter');
  const pricePerLiterLabel = pricePerLiterInput.parentElement.querySelector('.label-with-icon');

  // เอกสารและฟิลด์ที่เกี่ยวข้อง
  const docBookVolumeInput = document.getElementById('docBookVolume');
  const docBookNoInput = document.getElementById('docBookNo');
  const payBookVolumeInput = document.getElementById('payBookVolume');
  const payBookNoInput = document.getElementById('payBookNo');
  const stationInput = document.getElementById('station');
  const buyerInput = document.getElementById('buyer');
  const docTypeInput = document.getElementById('docType');

  // ฟิลด์สำหรับกรณีถังและการเติมลงระบบ
  const tankCountInput = document.getElementById('tankCount');
  const pricePerTankInput = document.getElementById('pricePerTank');
  const refillTargetSelect = document.getElementById('refillTarget');
  
  // ฟิลด์ label สำหรับการแสดง/ซ่อน
  const tankCountLabel = document.getElementById('tankCountLabel');
  const pricePerTankLabel = document.getElementById('pricePerTankLabel');
  const refillTargetLabel = document.getElementById('refillTargetLabel');

  // รีเซ็ตค่าบางส่วนที่เป็นผลจากโลจิกก่อนหน้า
  const isDrumStorage = fuelSource === 'สนามบินนครสวรรค์ - ถัง 200L' || fuelSource === 'สนามบินคลองหลวง - ถัง 200L';
  if (!isDrumStorage) {
    // ยกเลิกค่าวิธีคำนวณอัตโนมัติเมื่อออกจากโหมดถัง
    litersInput.readOnly = false;
  }

  // รีเซ็ตค่าเฉพาะที่ควรเริ่มต้นใหม่
  if (!tankCountInput.value) tankCountInput.value = '';
  if (!pricePerTankInput.value) pricePerTankInput.value = '';

  // ซ่อนฟิลด์ถังก่อน และจัดการการแสดง refillTarget ตามแหล่งที่มา
  if (tankCountLabel) tankCountLabel.style.display = 'none';
  if (pricePerTankLabel) pricePerTankLabel.style.display = 'none';
  
  // แสดง refillTarget เฉพาะเมื่อเลือก "จัดซื้อ"
  if (refillTargetLabel) {
    if (fuelSource === 'จัดซื้อ') {
      refillTargetLabel.style.display = 'block';
    } else {
      refillTargetLabel.style.display = 'none';
      // รีเซ็ต refillTarget เมื่อซ่อน
      if (refillTargetSelect) {
        refillTargetSelect.value = '';
        handleRefillTargetChange(); // เรียกใช้เพื่อซ่อนฟิลด์ที่เกี่ยวข้อง
      }
    }
  }

  // ปรับพฤติกรรมตามแหล่งที่มา
  const sourceInfo = FUEL_SOURCES[fuelSource];
  
  // 1) โหมดจัดซื้อ (ซื้อจากนอกระบบ แล้วเติมลงที่ใดที่หนึ่งผ่าน refillTarget)
  if (fuelSource === 'จัดซื้อ') {
    litersLabel.textContent = 'ลิตร';
    litersInput.readOnly = false;
    pricePerLiterInput.readOnly = false;
    pricePerLiterInput.required = true;

    if (!docTypeInput.value) docTypeInput.value = 'ใบสั่งซื้อ';
    if (!stationInput.value) stationInput.value = 'หน่วยจัดซื้อ';

  // 2) เลือกแหล่งในระบบ
  } else if (sourceInfo) {
    const isDrumBased = (sourceInfo.type === 'drum_storage');

    if (isDrumBased) {
      // ออกของจากคลังถัง/ถัง 200L (จ่ายให้เครื่องบิน/หน่วยอื่น)
      if (tankCountLabel) tankCountLabel.style.display = 'block';
      if (pricePerTankLabel) pricePerTankLabel.style.display = 'block';

      litersLabel.textContent = 'ลิตร (คำนวณอัตโนมัติ)';
      litersInput.readOnly = true;
      pricePerLiterInput.readOnly = true;

      // เอกสารค่าเริ่มต้นสำหรับการจ่ายออก
      docTypeInput.value = 'ใบเสร็จรับเงิน';
      stationInput.value = '';
      buyerInput.value = '';

      // ฟังการเปลี่ยนแปลงสำหรับคำนวณ
      tankCountInput.removeEventListener('input', calculateTankLiters);
      pricePerTankInput.removeEventListener('input', calculateTankPrice);
      tankCountInput.addEventListener('input', calculateTankLiters);
      pricePerTankInput.addEventListener('input', calculateTankPrice);

      // แสดงยอดคงเหลือเพื่อช่วยตัดสินใจจ่าย
      checkFuelAvailability(fuelSource);
    } else {
      // แท๊งฟาร์ม/รถน้ำมัน
      litersLabel.textContent = 'ลิตร';
      litersInput.readOnly = false;
      pricePerLiterInput.readOnly = false; // อนุญาตให้แก้ไขราคาได้
      pricePerLiterInput.required = true; // ต้องกรอกราคา
      pricePerLiterInput.value = ''; // ไม่บังคับเป็น 0

      // เอกสารค่าเริ่มต้นสำหรับการจ่าย
      docTypeInput.value = 'ใบเสร็จรับเงิน';
      stationInput.value = '';
      buyerInput.value = '';
      docBookVolumeInput.value = '';
      docBookNoInput.value = '';

      // รีเซ็ต placeholder และ label
      litersInput.placeholder = 'ปริมาณน้ำมัน (ลิตร)';
      pricePerLiterLabel.textContent = 'ราคาต่อลิตร';

      // แสดงข้อมูลยอดคงเหลือ
      checkFuelAvailability(fuelSource);
    }

  } else {
    // ยังไม่เลือกแหล่งที่มา: เปิดแก้ไขทุกอย่าง
    litersLabel.textContent = 'ลิตร';
    litersInput.readOnly = false;
    pricePerLiterInput.readOnly = false;
    pricePerLiterInput.required = true;

    // ไม่ซ่อนเอกสารใดๆ และไม่รีเซ็ตข้อมูลผู้ใช้
  }

  // ล้างข้อความแจ้งเตือนเดิมๆ
  const warningDiv = document.getElementById('capacityWarning');
  const availabilityDiv = document.getElementById('availabilityInfo');
  if (warningDiv) warningDiv.style.display = 'none';
  if (availabilityDiv) availabilityDiv.style.display = 'none';

  compute();
}

function calculateTankLiters() {
  const tankCount = parseInt(document.getElementById('tankCount').value) || 0;
  const liters = tankCount * 200;
  document.getElementById('liters').value = liters;
  calculateTankPrice(); // เรียกใช้การคำนวณราคาด้วย
}

function calculateTankPrice() {
  const tankCount = parseInt(document.getElementById('tankCount').value) || 0;
  const pricePerTank = parseFloat(document.getElementById('pricePerTank').value) || 0;
  const liters = tankCount * 200;
  
  if (tankCount > 0 && pricePerTank > 0) {
    // คำนวณราคาต่อลิตรจากราคาต่อถัง
    const pricePerLiter = pricePerTank / 200;
    document.getElementById('pricePerLiter').value = pricePerLiter.toFixed(4);
    
    // คำนวณผลลัพธ์ตามปกติ
    compute();
  } else {
    // ถ้าไม่มีข้อมูล ให้ตั้งค่าเป็น 0
    document.getElementById('pricePerLiter').value = '0';
    compute();
  }
}

// ฟังก์ชันกำหนดประเภทเอกสารสำหรับการเติม
function getRefillDocType(refillTarget) {
  const targetInfo = FUEL_SOURCES[refillTarget];
  if (targetInfo) {
    if (targetInfo.type === 'drum_storage') {
      return 'เติมน้ำมัน'; // เติมเข้าคลังถัง
    } else {
      return 'เติมน้ำมัน'; // เติมเข้า tankfarm/truck
    }
  }
  return 'เติมน้ำมัน';
}

// ฟังก์ชันกำหนดหมายเหตุสำหรับการเติม
function getRefillNote(refillTarget, originalNote) {
  const targetInfo = FUEL_SOURCES[refillTarget];
  if (targetInfo) {
    if (targetInfo.type === 'drum_storage') {
      return `เติมเข้าคลังถัง ${targetInfo.location || refillTarget}: ${originalNote}`.trim();
    } else {
      return `เติมจากการจัดซื้อ: ${originalNote}`.trim();
    }
  }
  return `เติมจากการจัดซื้อ: ${originalNote}`.trim();
}

// ฟังก์ชันตรวจสอบความจุเมื่อเติมน้ำมัน
async function checkRefillCapacity() {
  const refillTarget = document.getElementById('refillTarget').value;
  const liters = parseFloat(document.getElementById('liters').value) || 0;
  
  if (!refillTarget || !FUEL_SOURCES[refillTarget]) return;
  
  // คำนวณยอดคงเหลือปัจจุบัน
  const currentInventory = await calculateCurrentInventory(refillTarget);
  const capacity = FUEL_SOURCES[refillTarget].capacity;
  const availableSpace = capacity - currentInventory;
  
  const warningDiv = document.getElementById('capacityWarning') || createCapacityWarning();
  
  if (liters > availableSpace) {
    warningDiv.style.display = 'block';
    warningDiv.innerHTML = `
      <div class="warning-content">
        <span class="warning-icon">⚠️</span>
        <div>
          <strong>เกินความจุ!</strong><br>
          ความจุ: ${capacity.toLocaleString()} ลิตร<br>
          คงเหลือ: ${currentInventory.toLocaleString()} ลิตร<br>
          พื้นที่ว่าง: ${availableSpace.toLocaleString()} ลิตร<br>
          ต้องการเติม: ${liters.toLocaleString()} ลิตร
        </div>
      </div>
    `;
  } else {
    warningDiv.style.display = 'none';
  }
}

// ฟังก์ชันตรวจสอบยอดคงเหลือเมื่อจ่ายน้ำมัน
async function checkFuelAvailability(source) {
  const currentInventory = await calculateCurrentInventory(source);
  const litersInput = document.getElementById('liters');
  
  const availabilityDiv = document.getElementById('availabilityInfo') || createAvailabilityInfo();
  availabilityDiv.style.display = 'block';
  availabilityDiv.innerHTML = `
    <div class="info-content">
      <span class="info-icon">ℹ️</span>
      <div>
        <strong>ยอดคงเหลือ: ${currentInventory.toLocaleString()} ลิตร</strong><br>
        ความจุ: ${FUEL_SOURCES[source].capacity.toLocaleString()} ลิตร
      </div>
    </div>
  `;
  
  // ตั้งค่า max สำหรับ input
  litersInput.max = currentInventory;
  
  // เพิ่ม event listener เพื่อตรวจสอบเมื่อกรอกปริมาณ
  litersInput.addEventListener('input', function() {
    const requestedLiters = parseFloat(this.value) || 0;
    if (requestedLiters > currentInventory) {
      availabilityDiv.innerHTML = `
        <div class="warning-content">
          <span class="warning-icon">⚠️</span>
          <div>
            <strong>ไม่เพียงพอ!</strong><br>
            ยอดคงเหลือ: ${currentInventory.toLocaleString()} ลิตร<br>
            ต้องการ: ${requestedLiters.toLocaleString()} ลิตร
          </div>
        </div>
      `;
    } else {
      availabilityDiv.innerHTML = `
        <div class="info-content">
          <span class="info-icon">ℹ️</span>
          <div>
            <strong>ยอดคงเหลือ: ${currentInventory.toLocaleString()} ลิตร</strong><br>
            หลังจ่าย: ${(currentInventory - requestedLiters).toLocaleString()} ลิตร
          </div>
        </div>
      `;
    }
  });
}

// ฟังก์ชันคำนวณยอดคงเหลือปัจจุบันจาก API
async function calculateCurrentInventory(source) {
  try {
    const api = getApiUrl();
    if (!api) return 0;
    
    const url = api + '?action=inventory';
    const response = await jsonp(url);
    
    if (response && response.success && response.inventory) {
      const sourceData = response.inventory[source];
      return sourceData ? sourceData.currentStock : 0;
    }
  } catch (error) {
    console.error('Error fetching inventory:', error);
  }
  return 0;
}

// ฟังก์ชันสร้าง div สำหรับแสดงคำเตือนความจุ
function createCapacityWarning() {
  const div = document.createElement('div');
  div.id = 'capacityWarning';
  div.className = 'capacity-warning';
  div.style.display = 'none';
  
  const refillTargetLabel = document.querySelector('label[for="refillTarget"]');
  if (refillTargetLabel && refillTargetLabel.parentNode) {
    refillTargetLabel.parentNode.insertBefore(div, refillTargetLabel.nextSibling);
  }
  
  return div;
}

// ฟังก์ชันสร้าง div สำหรับแสดงข้อมูลยอดคงเหลือ
function createAvailabilityInfo() {
  const div = document.createElement('div');
  div.id = 'availabilityInfo';
  div.className = 'availability-info';
  div.style.display = 'none';
  
  const fuelSourceLabel = document.querySelector('label[for="fuelSource"]');
  if (fuelSourceLabel && fuelSourceLabel.parentNode) {
    fuelSourceLabel.parentNode.insertBefore(div, fuelSourceLabel.nextSibling);
  }
  
  return div;
}

function compute() {
  const litersEl = document.getElementById('liters');
  const pricePerLiterEl = document.getElementById('pricePerLiter');
  const vatRateEl = document.getElementById('vatRate');
  const priceIncludesVatEl = document.getElementById('priceIncludesVat');
  
  const liters = litersEl ? parseFloat(litersEl.value) || 0 : 0;
  const pricePerLiter = pricePerLiterEl ? parseFloat(pricePerLiterEl.value) || 0 : 0;
  const vatRatePct = vatRateEl ? parseFloat(vatRateEl.value) || 0 : 0;
  const priceIncludesVat = priceIncludesVatEl ? priceIncludesVatEl.checked : false;
  const vat = vatRatePct / 100;

  let basePerLiter = pricePerLiter;
  if (priceIncludesVat) {
    // Convert VAT-included price to base price
    basePerLiter = pricePerLiter / (1 + vat);
  }

  const amountExVat = liters * basePerLiter;
  const vatAmount = amountExVat * vat;
  const amountIncVat = amountExVat + vatAmount;

  const amountExVatEl = document.getElementById('amountExVat');
  const vatAmountEl = document.getElementById('vatAmount');
  const amountIncVatEl = document.getElementById('amountIncVat');
  
  if (amountExVatEl) amountExVatEl.value = formatMoney(amountExVat);
  if (vatAmountEl) vatAmountEl.value = formatMoney(vatAmount);
  if (amountIncVatEl) amountIncVatEl.value = formatMoney(amountIncVat);

  return { amountExVat, vatAmount, amountIncVat, basePerLiter };
}

// ฟังก์ชันคำนวณจากราคารวม (สำหรับกรณีถัง)
function computeFromTotalPrice(totalPrice) {
  const vatRateEl = document.getElementById('vatRate');
  const priceIncludesVatEl = document.getElementById('priceIncludesVat');
  
  const vatRatePct = vatRateEl ? parseFloat(vatRateEl.value) || 0 : 0;
  const priceIncludesVat = priceIncludesVatEl ? priceIncludesVatEl.checked : false;
  const vat = vatRatePct / 100;

  let amountExVat = totalPrice;
  if (priceIncludesVat) {
    // Convert VAT-included price to base price
    amountExVat = totalPrice / (1 + vat);
  }

  const vatAmount = amountExVat * vat;
  const amountIncVat = amountExVat + vatAmount;

  const amountExVatEl = document.getElementById('amountExVat');
  const vatAmountEl = document.getElementById('vatAmount');
  const amountIncVatEl = document.getElementById('amountIncVat');
  
  if (amountExVatEl) amountExVatEl.value = formatMoney(amountExVat);
  if (vatAmountEl) vatAmountEl.value = formatMoney(vatAmount);
  if (amountIncVatEl) amountIncVatEl.value = formatMoney(amountIncVat);

  return { amountExVat, vatAmount, amountIncVat };
}

function resetForm() {
  const form = document.getElementById('fuelForm');
  if (form) {
    form.reset();
  }
  
  // รีเซ็ตฟิลด์พิเศษ - ซ่อนฟิลด์ที่ไม่จำเป็น
  const tankCountLabel = document.getElementById('tankCountLabel');
  const pricePerTankLabel = document.getElementById('pricePerTankLabel');
  const refillTargetLabel = document.getElementById('refillTargetLabel');
  
  // ซ่อนฟิลด์พิเศษเมื่อรีเซ็ต
  if (tankCountLabel) tankCountLabel.style.display = 'none';
  if (pricePerTankLabel) pricePerTankLabel.style.display = 'none';
  if (refillTargetLabel) refillTargetLabel.style.display = 'none';
  
  // รีเซ็ตฟิลด์เอกสาร - แสดงทั้งหมด
  const docBookVolumeLabel = document.getElementById('docBookVolume').parentElement;
  const docBookNoLabel = document.getElementById('docBookNo').parentElement;
  const payBookVolumeLabel = document.getElementById('payBookVolume').parentElement;
  const payBookNoLabel = document.getElementById('payBookNo').parentElement;
  const stationLabel = document.getElementById('station').parentElement;
  const buyerLabel = document.getElementById('buyer').parentElement;
  const docTypeLabel = document.getElementById('docType').parentElement;
  
  if (docTypeLabel) docTypeLabel.style.display = 'block';
  if (stationLabel) stationLabel.style.display = 'block';
  if (buyerLabel) buyerLabel.style.display = 'block';
  if (docBookVolumeLabel) docBookVolumeLabel.style.display = 'block';
  if (docBookNoLabel) docBookNoLabel.style.display = 'block';
  if (payBookVolumeLabel) payBookVolumeLabel.style.display = 'block';
  if (payBookNoLabel) payBookNoLabel.style.display = 'block';
  
  const litersInput = document.getElementById('liters');
  const pricePerLiterInput = document.getElementById('pricePerLiter');
  const litersLabel = document.querySelector('label[for="liters"] .label-with-icon');
  
  if (litersInput) {
    litersInput.readOnly = false;
    litersInput.placeholder = 'ปริมาณน้ำมัน (ลิตร)';
  }
  if (pricePerLiterInput) {
    pricePerLiterInput.readOnly = false;
    pricePerLiterInput.required = true;
  }
  if (litersLabel) litersLabel.textContent = 'ลิตร';
  
  // ล้างข้อมูลข้อความแจ้งเตือนเก่า
  const warningDiv = document.getElementById('capacityWarning');
  const availabilityDiv = document.getElementById('availabilityInfo');
  if (warningDiv) warningDiv.style.display = 'none';
  if (availabilityDiv) availabilityDiv.style.display = 'none';
  
  // สร้างลำดับใหม่
  generateNextSequence();
  
  compute();
}

function jsonp(url, callbackName) {
  return new Promise((resolve, reject) => {
    const cb = callbackName || ('cb_' + Math.random().toString(36).slice(2));
    // Attach handler
    window[cb] = (data) => {
      resolve(data);
      // Cleanup
      try { delete window[cb]; } catch (e) { window[cb] = undefined; }
      script.remove();
    };
    const script = document.createElement('script');
    const sep = url.includes('?') ? '&' : '?';
    script.src = url + sep + 'callback=' + cb + '&ts=' + Date.now();
    script.onerror = () => {
      reject(new Error('โหลดข้อมูลไม่สำเร็จ'));
      try { delete window[cb]; } catch (e) { window[cb] = undefined; }
      script.remove();
    };
    document.body.appendChild(script);
  });
}

// ฟังก์ชันจัดการการเลือกเครื่องบิน vs เติมลงใน (เลือกได้อย่างใดอย่างหนึ่ง)
function handleAircraftRefillMutualExclusion(source) {
  const aircraftSelect = document.getElementById('aircraftSelectForm');
  const refillTargetSelect = document.getElementById('refillTarget');
  const aircraftLabel = aircraftSelect.parentElement;
  
  if (source === 'aircraft') {
    // ถ้าเลือกเครื่องบิน ให้รีเซ็ต refillTarget และแสดงเครื่องบิน
    if (aircraftSelect.value && refillTargetSelect.value) {
      refillTargetSelect.value = '';
      handleRefillTargetChange(); // เรียกใช้เพื่อซ่อนฟิลด์ที่เกี่ยวข้อง
    }
    // แสดงเครื่องบินเมื่อเลือก
    if (aircraftLabel && aircraftSelect.value) {
      aircraftLabel.style.display = 'block';
    }
  } else if (source === 'refill') {
    // ถ้าเลือกเติมลงใน ให้รีเซ็ต aircraft
    if (refillTargetSelect.value && aircraftSelect.value) {
      aircraftSelect.value = '';
      // รีเซ็ต hidden fields
      document.getElementById('aircraftType').value = '';
      document.getElementById('aircraftModel').value = '';
      document.getElementById('agriNo').value = '';
    }
  }
}

// ฟังก์ชันจัดการการเปลี่ยนแปลงใน refillTarget dropdown
function handleRefillTargetChange() {
  const refillTarget = document.getElementById('refillTarget').value;
  const tankCountLabel = document.getElementById('tankCountLabel');
  const pricePerTankLabel = document.getElementById('pricePerTankLabel');
  const tankCountInput = document.getElementById('tankCount');
  const pricePerTankInput = document.getElementById('pricePerTank');
  const litersInput = document.getElementById('liters');
  const pricePerLiterInput = document.getElementById('pricePerLiter');
  const litersLabel = litersInput.parentElement.querySelector('.label-with-icon');
  const aircraftLabel = document.getElementById('aircraftSelectForm').parentElement;

  // จัดการการแสดง/ซ่อนเครื่องบิน
  if (refillTarget && refillTarget !== '') {
    // ถ้าเลือก "เติมลงใน" ให้ซ่อนเครื่องบิน
    if (aircraftLabel) aircraftLabel.style.display = 'none';
    // รีเซ็ตค่าเครื่องบิน
    const aircraftSelect = document.getElementById('aircraftSelectForm');
    if (aircraftSelect) {
      aircraftSelect.value = '';
      document.getElementById('aircraftType').value = '';
      document.getElementById('aircraftModel').value = '';
      document.getElementById('agriNo').value = '';
    }
  } else {
    // ถ้าไม่เลือก "เติมลงใน" ให้แสดงเครื่องบิน
    if (aircraftLabel) aircraftLabel.style.display = 'block';
  }

  // จัดการการเลือกเครื่องบิน vs เติมลงใน (เก็บไว้เพื่อความเข้ากันได้)
  handleAircraftRefillMutualExclusion('refill');

  // ซ่อนฟิลด์ถังก่อน
  if (tankCountLabel) tankCountLabel.style.display = 'none';
  if (pricePerTankLabel) pricePerTankLabel.style.display = 'none';

  // ตรวจสอบว่า refillTarget เป็น drum storage
  const targetInfo = FUEL_SOURCES[refillTarget];
  const isTargetDrumBased = targetInfo && (targetInfo.type === 'drum_storage');
  
  if (isTargetDrumBased) {
    // แสดงฟิลด์สำหรับคลังถัง
    if (tankCountLabel) tankCountLabel.style.display = 'block';
    if (pricePerTankLabel) pricePerTankLabel.style.display = 'block';
    
    litersLabel.textContent = 'ลิตร (คำนวณอัตโนมัติ)';
    litersInput.readOnly = true;
    pricePerLiterInput.readOnly = true;

    // ฟังการเปลี่ยนแปลงสำหรับคำนวณ
    tankCountInput.removeEventListener('input', calculateTankLiters);
    pricePerTankInput.removeEventListener('input', calculateTankPrice);
    tankCountInput.addEventListener('input', calculateTankLiters);
    pricePerTankInput.addEventListener('input', calculateTankPrice);
  } else {
    // ฟิลด์ปกติ
    litersLabel.textContent = 'ลิตร';
    litersInput.readOnly = false;
    pricePerLiterInput.readOnly = false;
    
    // ลบ event listeners สำหรับถัง
    tankCountInput.removeEventListener('input', calculateTankLiters);
    pricePerTankInput.removeEventListener('input', calculateTankPrice);
  }
}

function initForm() {
  const fieldsToWatch = ['liters', 'pricePerLiter', 'vatRate'];
  fieldsToWatch.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('input', compute);
    }
  });

  // เพิ่ม event listener สำหรับ refillTarget
  const refillTargetSelect = document.getElementById('refillTarget');
  if (refillTargetSelect) {
    refillTargetSelect.addEventListener('change', handleRefillTargetChange);
  }

  // Map selection from dropdown to hidden fields
  const aircraftSelect = document.getElementById('aircraftSelectForm');
  if (aircraftSelect) {
    aircraftSelect.addEventListener('change', () => {
      const val = aircraftSelect.value; // e.g., "CARAVAN C208 : 1912"
      const [typeOrModel, number] = val.split(' : ').map(v => (v || '').trim());
      // Prefer to store in aircraftType and agriNo
      document.getElementById('aircraftType').value = typeOrModel || '';
      document.getElementById('aircraftModel').value = typeOrModel || '';
      document.getElementById('agriNo').value = number || '';
      
      // จัดการการเลือกเครื่องบิน vs เติมลงใน
      handleAircraftRefillMutualExclusion('aircraft');
    });
  }

  compute();

  const form = document.getElementById('fuelForm');
  const submitBtn = document.getElementById('submitBtn');
  const saveStatus = document.getElementById('saveStatus');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const api = getApiUrl();
    if (!api) return alert('กรุณาตั้งค่า API URL ก่อน');

    const date = document.getElementById('date').value; // yyyy-mm-dd
    const docType = document.getElementById('docType').value;
    // Get document fields directly
    const docBookVolume = document.getElementById('docBookVolume').value.trim();
    const docBookNo = document.getElementById('docBookNo').value.trim();
    const payBookVolume = document.getElementById('payBookVolume').value.trim();
    const payBookNo = document.getElementById('payBookNo').value.trim();
    const aircraftType = document.getElementById('aircraftType').value.trim();
    const aircraftModel = document.getElementById('aircraftModel').value.trim();
    const agriNo = document.getElementById('agriNo').value.trim();
    const station = document.getElementById('station').value.trim();
    const buyer = document.getElementById('buyer').value.trim();
    const fuelType = document.getElementById('fuelType').value;
    const fuelSource = document.getElementById('fuelSource').value.trim();
    const liters = parseFloat(document.getElementById('liters').value) || 0;
    const pricePerLiter = parseFloat(document.getElementById('pricePerLiter').value) || 0;
    const vatRatePct = parseFloat(document.getElementById('vatRate').value) || 0;
    const priceIncludesVat = document.getElementById('priceIncludesVat')?.checked || false;
    const tankCount = parseInt(document.getElementById('tankCount').value) || 0;
    const pricePerTank = parseFloat(document.getElementById('pricePerTank').value) || 0;
    const refillTarget = document.getElementById('refillTarget').value.trim();
    const recorder = document.getElementById('recorder').value.trim();
    const mission = (document.getElementById('mission')?.value || '').trim();
    const note = document.getElementById('note').value.trim();

    const { amountExVat, vatAmount, amountIncVat, basePerLiter } = compute();

    // Add sequence number to payload
    const sequenceNumber = document.getElementById('sequenceNumber').value || window.nextSequenceNumber || 'AUTO';

    const payload = {
      timestamp: new Date().toISOString(),
      sequenceNumber,
      date,
      docType,
      docBookVolume,
      docBookNo,
      payBookVolume,
      payBookNo,
      aircraftType,
      aircraftModel,
      agriNo,
      station,
      buyer,
      fuelType,
      fuelSource,
      liters,
      pricePerLiter,
      priceIncludesVat,
      basePricePerLiter: basePerLiter,
      vatRatePct,
      amountExVat,
      vatAmount,
      amountIncVat,
      tankCount,
      pricePerTank,
      refillTarget,
      recorder,
      mission,
      note
    };

    submitBtn.disabled = true;
    saveStatus.textContent = 'กำลังบันทึก...';

    try {
      // ส่งข้อมูลรายการเดียวเสมอ
      // หมายเหตุ: ฝั่ง Code.gs จะดูว่าเป็น 'จัดซื้อ' และมี refillTarget หรือไม่
      // เพื่ออัปเดตสต็อกไปยังปลายทางที่เลือก ป้องกันการนับสต็อกซ้ำ
      const url = api + '?action=append&data=' + encodeURIComponent(JSON.stringify(payload));
      const res = await jsonp(url);
      
      if (res && res.success) {
        saveStatus.textContent = 'บันทึกสำเร็จ';
        resetForm();
      } else {
        saveStatus.textContent = 'บันทึกล้มเหลว';
      }
    } catch (err) {
      console.error(err);
      saveStatus.textContent = 'เกิดข้อผิดพลาดในการบันทึก';
    } finally {
      submitBtn.disabled = false;
      setTimeout(() => (saveStatus.textContent = ''), 2500);
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  initApiConfig();
  initForm();
  
  // เรียกฟังก์ชันจัดการฟิลด์เมื่อโหลดหน้าเสร็จ
  setTimeout(() => {
    handleFuelSourceChange();
    handleRefillTargetChange();
  }, 100);
});