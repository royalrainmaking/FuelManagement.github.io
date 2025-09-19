// ฟังก์ชันที่ใช้ร่วมกันในทุกหน้า

// Utility: format number to 2 decimals with thousand separators
function formatMoney(n) {
  if (isNaN(n)) return '';
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ดึง API URL จาก config หรือ localStorage
function getApiUrl() {
  // Priority: config.js (hidden) > localStorage (fallback)
  if (window.APP_CONFIG && window.APP_CONFIG.apiUrl) return window.APP_CONFIG.apiUrl;
  const fromStorage = localStorage.getItem('gas_api_url');
  if (fromStorage) return fromStorage;
  return '';
}

// บันทึก API URL ลง localStorage
function setApiUrl(url) {
  localStorage.setItem('gas_api_url', url);
}

// JSONP helper function with improved cleanup
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substr(2, 9);
    const callbackName = `jsonp_callback_${timestamp}_${randomId}`;
    
    console.log(`🔄 Creating JSONP request with callback: ${callbackName}`);
    
    // สร้าง script element
    const script = document.createElement('script');
    const cleanUrl = url + (url.includes('?') ? '&' : '?') + 'callback=' + callbackName;
    script.src = cleanUrl;
    script.id = `jsonp_script_${timestamp}_${randomId}`;
    
    // ตั้งค่า timeout (เพิ่มเป็น 45 วินาที)
    const timeout = setTimeout(() => {
      console.log(`⏰ JSONP timeout for callback: ${callbackName}`);
      cleanup();
      reject(new Error('JSONP request timeout'));
    }, 45000);
    
    // ฟังก์ชันทำความสะอาดที่แข็งแกร่งขึ้น
    function cleanup() {
      console.log(`🧹 Cleaning up JSONP callback: ${callbackName}`);
      
      // ลบ script element
      if (script && script.parentNode) {
        try {
          script.parentNode.removeChild(script);
        } catch (e) {
          console.warn('Error removing script element:', e);
        }
      }
      
      // ลบ callback function
      if (window[callbackName]) {
        try {
          delete window[callbackName];
        } catch (e) {
          window[callbackName] = undefined;
        }
      }
      
      // ล้าง timeout
      if (timeout) {
        clearTimeout(timeout);
      }
    }
    
    // สร้าง global callback function
    window[callbackName] = function(data) {
      console.log(`✅ JSONP callback executed: ${callbackName}`);
      cleanup();
      resolve(data);
    };
    
    // จัดการ error
    script.onerror = function(error) {
      console.error(`❌ JSONP script error for ${callbackName}:`, error);
      cleanup();
      reject(new Error('JSONP request failed'));
    };
    
    // จัดการ load event
    script.onload = function() {
      console.log(`📡 JSONP script loaded: ${callbackName}`);
      // Note: callback should have been executed by now if successful
      // If not, it will timeout
    };
    
    // เพิ่ม script ลงใน DOM
    try {
      document.head.appendChild(script);
      console.log(`📤 JSONP script added to DOM: ${callbackName}`);
    } catch (e) {
      console.error(`❌ Error adding JSONP script to DOM:`, e);
      cleanup();
      reject(new Error('Failed to add JSONP script to DOM'));
    }
  });
}

// ข้อมูลความจุของแต่ละแหล่งน้ำมัน
const FUEL_SOURCES = {
  // Purchase mode (special entry for external procurement)
  'จัดซื้อ': { type: 'purchase' },
  
  // Tank Farms (existing - capacity in liters)
  'สนามบินนครสวรรค์ แท๊ง 1': { capacity: 20000, type: 'tankfarm' },
  'สนามบินนครสวรรค์ แท๊ง 2': { capacity: 20000, type: 'tankfarm' },
  'สนามบินคลองหลวง แท๊ง 1': { capacity: 15000, type: 'tankfarm' },
  
  // Fuel Trucks (existing - capacity in liters)
  '96-0677 กทม.': { capacity: 7000, type: 'truck' },
  '97-9769 กทม.': { capacity: 12000, type: 'truck' },
  '50-9109 กทม.': { capacity: 16000, type: 'truck' },
  '52-4018 กทม.': { capacity: 16000, type: 'truck' },
  '53-1224 กทม.': { capacity: 16000, type: 'truck' },
  '53-1225 กทม.': { capacity: 16000, type: 'truck' },
  '54-3780 กทม.': { capacity: 16000, type: 'truck' },
  '54-3781 กทม.': { capacity: 16000, type: 'truck' },
  'สฝษ/บ. 2320-036-0001/001': { capacity: 8000, type: 'truck' },
  
  // 200L Drum Storage (NEW - unlimited capacity, drum-based)
  'สนามบินนครสวรรค์ - ถัง 200L': { 
    capacity: -1, // unlimited
    type: 'drum_storage', 
    unitSize: 200, // liters per drum
    location: 'Nakhon Sawan Airport',
    drumCapacity: 200 // liters per drum
  },
  'สนามบินคลองหลวง - ถัง 200L': { 
    capacity: -1, // unlimited
    type: 'drum_storage', 
    unitSize: 200, // liters per drum
    location: 'Khlong Luang Airport',
    drumCapacity: 200 // liters per drum
  }
};

// ฟังก์ชันตั้งค่า API
function initApiConfig() {
  // API URL is now hidden and configured automatically
  // No need for user input
}