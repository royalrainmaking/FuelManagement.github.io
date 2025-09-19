/**
 * Google Apps Script สำหรับเชื่อมต่อ Google Sheet เป็น API แบบ JSONP (เลี่ยง CORS)
 * วิธีใช้: วางโค้ดนี้ใน Apps Script ของชีต แล้ว Deploy เป็น Web app (สิทธิ์ Anyone)
 */

const SHEET_NAME = 'Data'; // เปลี่ยนเป็นชื่อชีตที่ต้องการ
const INVENTORY_SHEET_NAME = 'Inventory'; // ชีตสำหรับเก็บยอดคงเหลือ
const BUDGET_SHEET_NAME = 'Budget'; // ชีตสำหรับเก็บข้อมูลงบประมาณแต่ละภารกิจ
const DRUM_MANAGEMENT_SHEET_NAME = 'Drum_Management'; // ชีตสำหรับจัดการถังน้ำมัน 200L
const HEADERS = [
  'id','timestamp','sequenceNumber','date','docType','docBookVolume','docBookNo','payBookVolume','payBookNo','aircraftType','aircraftModel','agriNo','station','buyer','fuelType','fuelSource','liters',
  'pricePerLiter','priceIncludesVat','basePricePerLiter','vatRatePct','amountExVat','vatAmount','amountIncVat','tankCount','pricePerTank','refillTarget',
  'recorder','mission','note','rawJson'
];

// ข้อมูลแหล่งน้ำมันและความจุ
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

function _getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.getSheets()[0];
  return sh;
}

function _getInventorySheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(INVENTORY_SHEET_NAME);
  if (!sh) {
    // สร้างชีต Inventory ใหม่
    sh = ss.insertSheet(INVENTORY_SHEET_NAME);
    _initializeInventorySheet(sh);
  }
  return sh;
}

function _initializeInventorySheet(sh) {
  // ตั้งค่าหัวตาราง - เพิ่มคอลัมน์สำหรับ drum storage
  const headers = ['Source', 'Type', 'Capacity', 'Current_Stock', 'Current_Drums', 'Unit_Size', 'Location', 'Last_Updated'];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  // เพิ่มข้อมูลแหล่งน้ำมันทั้งหมด
  const sources = Object.keys(FUEL_SOURCES);
  const data = sources.map(source => {
    const sourceInfo = FUEL_SOURCES[source];
    return [
      source,                                    // Source
      sourceInfo.type,                          // Type
      sourceInfo.capacity,                      // Capacity
      0,                                        // Current_Stock (liters)
      sourceInfo.type === 'drum_storage' ? 0 : '', // Current_Drums (only for drum storage)
      sourceInfo.unitSize || '',                // Unit_Size (200 for drums)
      sourceInfo.location || '',                // Location
      new Date()                               // Last_Updated
    ];
  });
  
  if (data.length > 0) {
    sh.getRange(2, 1, data.length, headers.length).setValues(data);
  }
  
  // จัดรูปแบบ
  sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sh.autoResizeColumns(1, headers.length);
}

function _getBudgetSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(BUDGET_SHEET_NAME);
  if (!sh) {
    // สร้างชีต Budget ใหม่
    sh = ss.insertSheet(BUDGET_SHEET_NAME);
    _initializeBudgetSheet(sh);
  }
  return sh;
}

function _initializeBudgetSheet(sh) {
  // ตั้งค่าหัวตาราง
  const headers = ['Mission', 'Fiscal_Year', 'Allocated_Budget', 'Used_Budget', 'Remaining_Budget', 'Last_Updated', 'Status'];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  // เพิ่มข้อมูลตัวอย่างภารกิจ
  const defaultMissions = [
    ['การบิน VIP', '2567', 5000000, 0, 5000000, new Date(), 'Active'],
    ['การบิน Medical', '2567', 3000000, 0, 3000000, new Date(), 'Active'],
    ['การบิน Training', '2567', 2000000, 0, 2000000, new Date(), 'Active'],
    ['การบิน Cargo', '2567', 4000000, 0, 4000000, new Date(), 'Active'],
    ['การบิน Search & Rescue', '2567', 1500000, 0, 1500000, new Date(), 'Active']
  ];
  
  if (defaultMissions.length > 0) {
    sh.getRange(2, 1, defaultMissions.length, headers.length).setValues(defaultMissions);
  }
  
  // จัดรูปแบบ
  sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sh.autoResizeColumns(1, headers.length);
  
  // จัดรูปแบบตัวเลข
  sh.getRange(2, 3, defaultMissions.length, 3).setNumberFormat('#,##0.00');
}

function _ensureHeader(sh) {
  const firstRow = sh.getRange(1,1,1,HEADERS.length).getValues()[0];
  const needSet = HEADERS.some((h, i) => firstRow[i] !== h);
  if (needSet) {
    sh.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
  }
}

function _generateId() {
  return 'fuel_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function _appendRow(obj) {
  const sh = _getSheet();
  _ensureHeader(sh);
  
  // เพิ่ม ID ถ้ายังไม่มี
  if (!obj.id) {
    obj.id = _generateId();
  }
  
  const row = HEADERS.map(h => h === 'rawJson' ? JSON.stringify(obj) : (obj[h] ?? ''));
  sh.appendRow(row);
  
  // อัปเดตยอดคงเหลือ
  _updateInventory(obj);
  
  // อัปเดตงบประมาณ (เฉพาะเมื่อมีการใช้จ่าย)
  _updateBudget(obj);
  
  return obj.id;
}

function _updateInventory(transactionData) {
  const invSheet = _getInventorySheet();
  const source = transactionData.fuelSource;
  const liters = Number(transactionData.liters) || 0;
  const refillTarget = transactionData.refillTarget;
  const docType = transactionData.docType;
  const tankCount = Number(transactionData.tankCount) || 0;
  
  console.log('_updateInventory called with:', {
    source: source,
    liters: liters,
    refillTarget: refillTarget,
    docType: docType,
    tankCount: tankCount
  });
  
  if (!FUEL_SOURCES[source]) {
    console.log('Source not found in FUEL_SOURCES:', source);
    return;
  }
  
  // ตรวจสอบและสร้างแถว inventory ถ้าจำเป็น
  _ensureInventoryRows(invSheet);
  
  // หาแถวของแหล่งน้ำมันใน Inventory Sheet (อ่านใหม่หลังจาก _ensureInventoryRows)
  const lastRowAfter = invSheet.getLastRow();
  if (lastRowAfter < 2) {
    console.log('No data rows in inventory sheet');
    return;
  }
  
  const sourceDataAfter = invSheet.getRange(2, 1, lastRowAfter - 1, 8).getValues(); // Updated to 8 columns
  console.log('Inventory sources found:', sourceDataAfter.map(row => row[0]));
  
  if (source === 'จัดซื้อ') {
    // การจัดซื้อ - เติมลงใน refillTarget
    if (refillTarget && FUEL_SOURCES[refillTarget]) {
      const targetInfo = FUEL_SOURCES[refillTarget];
      
      // สำหรับ drum storage ใหม่ - ใช้จำนวนถัง
      if (targetInfo.type === 'drum_storage' && tankCount > 0) {
        console.log('Updating drum storage inventory:', refillTarget, 'with', tankCount, 'drums');
        _updateDrumStorageInventory(invSheet, sourceDataAfter, refillTarget, tankCount, liters);
      }
      // สำหรับถังน้ำมัน 200L เดิม - ใช้ลิตรในการอัปเดต
      else if (targetInfo.type === 'barrel' && tankCount > 0) {
        console.log('Updating barrel inventory:', refillTarget, 'with', tankCount, 'tanks (', liters, 'liters)');
        _updateSourceInventory(invSheet, sourceDataAfter, refillTarget, liters);
      } else {
        console.log('Updating refillTarget inventory:', refillTarget, 'with', liters, 'liters');
        _updateSourceInventory(invSheet, sourceDataAfter, refillTarget, liters);
      }
    } else {
      console.log('RefillTarget not valid:', refillTarget);
    }
  } else if (docType === 'เติมน้ำมัน') {
    // การเติมน้ำมัน - เพิ่มยอดคงเหลือ
    const sourceInfo = FUEL_SOURCES[source];
    
    // สำหรับ drum storage ใหม่
    if (sourceInfo.type === 'drum_storage' && tankCount > 0) {
      console.log('Adding to drum storage inventory:', source, 'with', tankCount, 'drums');
      _updateDrumStorageInventory(invSheet, sourceDataAfter, source, tankCount, liters);
    }
    // สำหรับถังน้ำมัน 200L เดิม
    else if (sourceInfo.type === 'barrel' && tankCount > 0) {
      console.log('Adding to barrel inventory:', source, 'with', tankCount, 'tanks (', liters, 'liters)');
      _updateSourceInventory(invSheet, sourceDataAfter, source, liters);
    } else {
      console.log('Adding to inventory:', source, 'with', liters, 'liters');
      _updateSourceInventory(invSheet, sourceDataAfter, source, liters);
    }
  } else {
    // การจ่ายน้ำมัน - ลดยอดคงเหลือ
    const sourceInfo = FUEL_SOURCES[source];
    
    // สำหรับ drum storage ใหม่
    if (sourceInfo.type === 'drum_storage' && tankCount > 0) {
      console.log('Subtracting from drum storage inventory:', source, 'with', tankCount, 'drums');
      _updateDrumStorageInventory(invSheet, sourceDataAfter, source, -tankCount, -liters);
    }
    // สำหรับถังน้ำมัน 200L เดิม
    else if (sourceInfo.type === 'barrel' && tankCount > 0) {
      console.log('Subtracting from barrel inventory:', source, 'with', tankCount, 'tanks (', liters, 'liters)');
      _updateSourceInventory(invSheet, sourceDataAfter, source, -liters);
    } else {
      console.log('Subtracting from inventory:', source, 'with', liters, 'liters');
      _updateSourceInventory(invSheet, sourceDataAfter, source, -liters);
    }
  }
}

function _ensureInventoryRows(invSheet) {
  // ตรวจสอบว่ามีแถวสำหรับแหล่งน้ำมันทั้งหมดหรือไม่
  const lastRow = invSheet.getLastRow();
  let sourceData = [];
  
  if (lastRow >= 2) {
    sourceData = invSheet.getRange(2, 1, lastRow - 1, 8).getValues(); // Updated to 8 columns
  }
  
  const existingSources = sourceData.map(row => row[0]);
  console.log('Existing inventory sources:', existingSources);
  
  // ตรวจสอบแหล่งน้ำมันที่ขาดหายไป
  Object.keys(FUEL_SOURCES).forEach(sourceName => {
    if (!existingSources.includes(sourceName)) {
      console.log('Adding missing inventory row for:', sourceName);
      const sourceInfo = FUEL_SOURCES[sourceName];
      
      // เพิ่มแถวใหม่
      invSheet.appendRow([
        sourceName,                                    // Source
        sourceInfo.type,                              // Type
        sourceInfo.capacity,                          // Capacity
        0,                                           // Current_Stock (liters)
        sourceInfo.type === 'drum_storage' ? 0 : '', // Current_Drums (only for drum storage)
        sourceInfo.unitSize || '',                   // Unit_Size (200 for drums)
        sourceInfo.location || '',                   // Location
        new Date()                                   // Last_Updated
      ]);
    }
  });
}

// ฟังก์ชันอัปเดต inventory สำหรับ drum storage ใหม่
function _updateDrumStorageInventory(invSheet, sourceData, sourceName, drumChange, literChange) {
  console.log('_updateDrumStorageInventory called:', {
    sourceName: sourceName,
    drumChange: drumChange,
    literChange: literChange,
    availableSources: sourceData.map(row => row[0])
  });
  
  let found = false;
  for (let i = 0; i < sourceData.length; i++) {
    if (sourceData[i][0] === sourceName) {
      const currentStock = Number(sourceData[i][3]) || 0; // Current liters
      const currentDrums = Number(sourceData[i][4]) || 0; // Current drums
      
      const newDrums = currentDrums + drumChange;
      const newStock = currentStock + literChange;
      
      console.log('Updating drum storage inventory for', sourceName, ':', {
        currentStock: currentStock,
        currentDrums: currentDrums,
        drumChange: drumChange,
        literChange: literChange,
        newDrums: newDrums,
        newStock: newStock,
        rowIndex: i + 2
      });
      
      // อัปเดตยอดคงเหลือ (ลิตร), จำนวนถัง, และเวลา
      invSheet.getRange(i + 2, 4).setValue(newStock);    // Current_Stock (liters)
      invSheet.getRange(i + 2, 5).setValue(newDrums);    // Current_Drums
      invSheet.getRange(i + 2, 8).setValue(new Date());  // Last_Updated
      
      console.log('Successfully updated drum storage inventory for', sourceName);
      found = true;
      break;
    }
  }
  
  if (!found) {
    console.log('WARNING: Drum storage source not found in inventory:', sourceName);
    console.log('Available sources:', sourceData.map(row => row[0]));
  }
}

// ฟังก์ชันอัปเดต inventory สำหรับแหล่งอื่นๆ (เดิม)
function _updateSourceInventory(invSheet, sourceData, sourceName, changeAmount) {
  console.log('_updateSourceInventory called:', {
    sourceName: sourceName,
    changeAmount: changeAmount,
    availableSources: sourceData.map(row => row[0])
  });
  
  let found = false;
  for (let i = 0; i < sourceData.length; i++) {
    if (sourceData[i][0] === sourceName) {
      const currentStock = Number(sourceData[i][3]) || 0;
      const newStock = currentStock + changeAmount;
      
      console.log('Updating inventory for', sourceName, ':', {
        currentStock: currentStock,
        changeAmount: changeAmount,
        newStock: newStock,
        rowIndex: i + 2
      });
      
      // อัปเดตยอดคงเหลือและเวลา
      invSheet.getRange(i + 2, 4).setValue(newStock);    // Current_Stock
      invSheet.getRange(i + 2, 8).setValue(new Date());  // Last_Updated (column 8)
      
      console.log('Successfully updated inventory for', sourceName);
      found = true;
      break;
    }
  }
  
  if (!found) {
    console.log('WARNING: Source not found in inventory:', sourceName);
    console.log('Available sources:', sourceData.map(row => row[0]));
  }
}

// ฟังก์ชันทดสอบการอัปเดต inventory สำหรับถังน้ำมัน 200L
function testTankInventoryUpdate() {
  console.log('=== Testing Tank Inventory Update ===');
  
  // สร้างข้อมูลทดสอบสำหรับการซื้อถังน้ำมัน 200L
  const testData = {
    fuelSource: 'จัดซื้อ',
    refillTarget: 'สนามบินนครสวรรค์ - ถัง 200L',
    docType: 'เติมน้ำมัน',
    liters: 2000,  // 10 ถัง x 200 ลิตร
    tankCount: 10,
    pricePerTank: 500,
    basePricePerLiter: 2.5,
    amountIncVat: 5000
  };
  
  console.log('Test data:', testData);
  
  // ทดสอบการอัปเดต inventory
  _updateInventory(testData);
  
  // ตรวจสอบผลลัพธ์
  const invSheet = _getInventorySheet();
  const lastRow = invSheet.getLastRow();
  if (lastRow >= 2) {
    const sourceData = invSheet.getRange(2, 1, lastRow - 1, 5).getValues();
    const tankRow = sourceData.find(row => row[0] === 'สนามบินนครสวรรค์ - ถัง 200L');
    
    if (tankRow) {
      console.log('Tank inventory after update:', {
        source: tankRow[0],
        type: tankRow[1],
        capacity: tankRow[2],
        currentStock: tankRow[3],
        lastUpdated: tankRow[4]
      });
    } else {
      console.log('Tank row not found in inventory');
    }
  }
  
  return 'Test completed - check console logs';
}

// ฟังก์ชันทดสอบการเพิ่มข้อมูลผ่าน API
function testAddTankPurchase() {
  console.log('=== Testing Add Tank Purchase via API ===');
  
  const testData = {
    id: 'test_' + Date.now(),
    timestamp: new Date().toISOString(),
    date: new Date().toISOString().split('T')[0],
    docType: 'เติมน้ำมัน',
    fuelSource: 'จัดซื้อ',
    refillTarget: 'สนามบินนครสวรรค์ - ถัง 200L',
    liters: 2000,  // 10 ถัง x 200 ลิตร
    tankCount: 10, // จำนวนถังที่ซื้อ
    pricePerTank: 500,
    basePricePerLiter: 2.5,
    amountIncVat: 5000,
    recorder: 'Test User'
  };
  
  console.log('Adding test data:', testData);
  console.log('Expected: inventory should increase by', testData.tankCount, 'tanks');
  
  // เพิ่มข้อมูลผ่าน _appendRow
  const id = _appendRow(testData);
  console.log('Added with ID:', id);
  
  // ตรวจสอบ inventory หลังเพิ่มข้อมูล
  const inventory = _getInventoryData();
  console.log('Inventory after adding:', inventory['สนามบินนครสวรรค์ - ถัง 200L']);
  
  return 'Test completed - check console logs';
}

// ฟังก์ชันตรวจสอบสถานะ inventory ปัจจุบัน
function checkInventoryStatus() {
  console.log('=== Current Inventory Status ===');
  
  const invSheet = _getInventorySheet();
  const lastRow = invSheet.getLastRow();
  
  if (lastRow < 2) {
    console.log('No inventory data found');
    return 'No data';
  }
  
  const sourceData = invSheet.getRange(2, 1, lastRow - 1, 5).getValues();
  
  sourceData.forEach((row, index) => {
    console.log(`Row ${index + 2}:`, {
      source: row[0],
      type: row[1],
      capacity: row[2],
      currentStock: row[3],
      lastUpdated: row[4]
    });
  });
  
  return 'Check completed - see console logs';
}

// ฟังก์ชันบังคับอัปเดต inventory สำหรับถังน้ำมัน 200L
function forceUpdateTankInventory(tanksToAdd) {
  console.log('=== Force Update Tank Inventory ===');
  console.log('Adding tanks:', tanksToAdd);
  
  const invSheet = _getInventorySheet();
  const lastRow = invSheet.getLastRow();
  
  if (lastRow < 2) {
    console.log('No inventory data found, initializing...');
    _ensureInventoryRows(invSheet);
  }
  
  // อ่านข้อมูลใหม่
  const newLastRow = invSheet.getLastRow();
  const sourceData = invSheet.getRange(2, 1, newLastRow - 1, 5).getValues();
  
  console.log('Available sources:', sourceData.map(row => row[0]));
  
  let found = false;
  for (let i = 0; i < sourceData.length; i++) {
    if (sourceData[i][0] === 'สนามบินนครสวรรค์ - ถัง 200L') {
      const currentStock = Number(sourceData[i][3]) || 0;
      const newStock = currentStock + tanksToAdd;
      
      console.log('Found tank row at index:', i + 2);
      console.log('Current stock:', currentStock);
      console.log('New stock:', newStock);
      
      // อัปเดตยอดคงเหลือและเวลา
      invSheet.getRange(i + 2, 4).setValue(newStock);
      invSheet.getRange(i + 2, 5).setValue(new Date());
      
      console.log('Successfully updated tank inventory');
      found = true;
      break;
    }
  }
  
  if (!found) {
    console.log('Tank row not found, creating new row...');
    invSheet.appendRow([
      'สนามบินนครสวรรค์ - ถัง 200L',
      'drum_storage',
      -1,
      tanksToAdd,
      new Date()
    ]);
    console.log('Created new tank inventory row');
  }
  
  // ตรวจสอบผลลัพธ์
  const finalData = invSheet.getRange(2, 1, invSheet.getLastRow() - 1, 5).getValues();
  const tankRow = finalData.find(row => row[0] === 'สนามบินนครสวรรค์ - ถัง 200L');
  
  if (tankRow) {
    console.log('Final tank inventory:', {
      source: tankRow[0],
      type: tankRow[1],
      capacity: tankRow[2],
      currentStock: tankRow[3],
      lastUpdated: tankRow[4]
    });
  }
  
  return 'Force update completed - check console logs';
}

function _updateBudget(transactionData) {
  const budgetSheet = _getBudgetSheet();
  const mission = transactionData.mission;
  const cost = Number(transactionData.amountIncVat) || 0;
  
  if (!mission || cost === 0) return;
  
  // หาแถวของภารกิจใน Budget Sheet
  const lastRow = budgetSheet.getLastRow();
  if (lastRow < 2) return;
  
  const budgetData = budgetSheet.getRange(2, 1, lastRow - 1, 7).getValues();
  
  for (let i = 0; i < budgetData.length; i++) {
    if (budgetData[i][0] === mission && budgetData[i][6] === 'Active') {
      const usedBudget = Number(budgetData[i][3]) || 0;
      const allocatedBudget = Number(budgetData[i][2]) || 0;
      const newUsedBudget = usedBudget + cost;
      const newRemainingBudget = allocatedBudget - newUsedBudget;
      
      // อัปเดตงบประมาณ
      budgetSheet.getRange(i + 2, 4).setValue(newUsedBudget); // Used_Budget
      budgetSheet.getRange(i + 2, 5).setValue(newRemainingBudget); // Remaining_Budget  
      budgetSheet.getRange(i + 2, 6).setValue(new Date()); // Last_Updated
      
      // ตรวจสอบสถานะงบประมาณ
      if (newRemainingBudget <= 0) {
        budgetSheet.getRange(i + 2, 7).setValue('Over Budget');
      } else if (newRemainingBudget / allocatedBudget < 0.1) {
        budgetSheet.getRange(i + 2, 7).setValue('Warning');
      }
      
      break;
    }
  }
}

function _listRows() {
  const sh = _getSheet();
  _ensureHeader(sh);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const rng = sh.getRange(2,1,lastRow-1,HEADERS.length).getValues();
  const rows = rng.map(r => {
    const o = {};
    HEADERS.forEach((h,i)=>{
      // แปลงค่า null/undefined เป็น string ว่าง
      const value = r[i];
      if (value === null || value === undefined) {
        o[h] = '';
      } else {
        o[h] = value;
      }
    });
    // Convert number-like fields
    ['liters','pricePerLiter','basePricePerLiter','vatRatePct','amountExVat','vatAmount','amountIncVat','tankCount','pricePerTank'].forEach(k=>{
      if (o[k] !== '' && o[k] !== null && o[k] !== undefined) {
        o[k] = Number(o[k]);
      } else {
        o[k] = 0;
      }
    });
    return o;
  });
  return rows;
}

function _getInventoryData() {
  const invSheet = _getInventorySheet();
  const lastRow = invSheet.getLastRow();
  if (lastRow < 2) return {};
  
  const data = invSheet.getRange(2, 1, lastRow - 1, 5).getValues();
  const inventory = {};
  
  data.forEach(row => {
    const [source, type, capacity, currentStock, lastUpdated] = row;
    inventory[source] = {
      type,
      capacity: Number(capacity),
      currentStock: Number(currentStock),
      lastUpdated
    };
  });
  
  return inventory;
}

function _getBudgetData() {
  const budgetSheet = _getBudgetSheet();
  const lastRow = budgetSheet.getLastRow();
  if (lastRow < 2) return [];
  
  const data = budgetSheet.getRange(2, 1, lastRow - 1, 7).getValues();
  const budgets = [];
  
  // คำนวณงบประมาณที่ใช้ไปจากข้อมูลจริงใน DATA sheet
  const actualUsage = _calculateBudgetUsageFromData();
  
  data.forEach(row => {
    const [mission, fiscalYear, allocatedBudget, usedBudget, remainingBudget, lastUpdated, status] = row;
    
    // ใช้ข้อมูลการใช้งานจริงแทนที่ used_budget ใน Budget sheet
    const actualUsedBudget = actualUsage[mission] || 0;
    const actualRemainingBudget = Number(allocatedBudget) - actualUsedBudget;
    const utilization = allocatedBudget > 0 ? ((actualUsedBudget / allocatedBudget) * 100) : 0;
    
    // กำหนดสถานะตามการใช้งาน
    let actualStatus = 'Active';
    if (actualUsedBudget > Number(allocatedBudget)) {
      actualStatus = 'Over Budget';
    } else if (utilization >= 80) {
      actualStatus = 'Warning';
    }
    
    budgets.push({
      mission,
      fiscalYear,
      allocatedBudget: Number(allocatedBudget),
      usedBudget: actualUsedBudget,
      remainingBudget: actualRemainingBudget,
      lastUpdated: new Date(),
      status: actualStatus,
      utilization: utilization.toFixed(2)
    });
  });
  
  return budgets;
}

// คำนวณงบประมาณที่ใช้ไปจากข้อมูลจริงใน DATA sheet
function _calculateBudgetUsageFromData() {
  const dataSheet = _getSheet();
  const lastRow = dataSheet.getLastRow();
  if (lastRow < 2) return {};
  
  const data = dataSheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  const missionIndex = HEADERS.indexOf('mission');
  const amountIncVatIndex = HEADERS.indexOf('amountIncVat');
  const dateIndex = HEADERS.indexOf('date');
  
  const currentYear = new Date().getFullYear() + 543; // แปลงเป็น พ.ศ.
  const budgetUsage = {};
  
  data.forEach(row => {
    const mission = row[missionIndex];
    const amount = Number(row[amountIncVatIndex]) || 0;
    const rowDate = new Date(row[dateIndex]);
    const rowYear = rowDate.getFullYear() + 543; // แปลงเป็น พ.ศ.
    
    // เฉพาะข้อมูลในปีงบประมาณปัจจุบัน
    if (mission && amount > 0 && rowYear === currentYear) {
      if (!budgetUsage[mission]) {
        budgetUsage[mission] = 0;
      }
      budgetUsage[mission] += amount;
    }
  });
  
  return budgetUsage;
}

function _updateRow(obj) {
  const sh = _getSheet();
  _ensureHeader(sh);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return false;
  
  const data = sh.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  const idIndex = HEADERS.indexOf('id');
  
  console.log('_updateRow: Looking for ID:', obj.id, 'Type:', typeof obj.id);
  console.log('_updateRow: Available IDs:', data.map(row => ({ id: row[idIndex], type: typeof row[idIndex] })).slice(0, 5));
  
  for (let i = 0; i < data.length; i++) {
    const sheetId = data[i][idIndex];
    // Try both strict equality and string comparison
    if (sheetId === obj.id || String(sheetId) === String(obj.id)) {
      console.log('_updateRow: Found matching ID at row', i + 2);
      
      // ย้อนกลับการเปลี่ยนแปลงยอดคงเหลือจากข้อมูลเก่า
      const oldRowData = {};
      HEADERS.forEach((h, idx) => {
        oldRowData[h] = data[i][idx];
      });
      _reverseInventoryUpdate(oldRowData);
      
      // อัปเดตข้อมูลใหม่
      obj.timestamp = new Date().toISOString();
      const row = HEADERS.map(h => h === 'rawJson' ? JSON.stringify(obj) : (obj[h] ?? ''));
      sh.getRange(i + 2, 1, 1, HEADERS.length).setValues([row]);
      
      // อัปเดตยอดคงเหลือด้วยข้อมูลใหม่
      _updateInventory(obj);
      
      return true;
    }
  }
  
  console.log('_updateRow: No matching ID found');
  return false;
}

function _deleteRow(id) {
  const sh = _getSheet();
  _ensureHeader(sh);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return false;
  
  const data = sh.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  const idIndex = HEADERS.indexOf('id');
  
  console.log('_deleteRow: Looking for ID:', id, 'Type:', typeof id);
  console.log('_deleteRow: Available IDs:', data.map(row => ({ id: row[idIndex], type: typeof row[idIndex] })).slice(0, 5));
  
  for (let i = 0; i < data.length; i++) {
    const sheetId = data[i][idIndex];
    // Try both strict equality and string comparison
    if (sheetId === id || String(sheetId) === String(id)) {
      console.log('_deleteRow: Found matching ID at row', i + 2);
      
      // ก่อนลบ ต้องย้อนกลับการเปลี่ยนแปลงยอดคงเหลือ
      const rowData = {};
      HEADERS.forEach((h, idx) => {
        rowData[h] = data[i][idx];
      });
      _reverseInventoryUpdate(rowData);
      
      // ลบแถว
      sh.deleteRow(i + 2);
      return true;
    }
  }
  
  console.log('_deleteRow: No matching ID found');
  return false;
}

function _getAvailableIds() {
  const sh = _getSheet();
  _ensureHeader(sh);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  
  const data = sh.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  const idIndex = HEADERS.indexOf('id');
  
  // Return detailed info about IDs for debugging
  return data.map(row => ({
    id: row[idIndex],
    type: typeof row[idIndex],
    string: String(row[idIndex])
  })).filter(item => item.id).slice(0, 10); // Return first 10 IDs for debugging
}

function _getNextSequenceNumber() {
  const sh = _getSheet();
  _ensureHeader(sh);
  const lastRow = sh.getLastRow();
  
  // ใช้วันที่ปัจจุบันเป็นส่วนหนึ่งของลำดับ
  const today = new Date();
  const yearMonth = today.getFullYear().toString().substr(2, 2) + 
                    (today.getMonth() + 1).toString().padStart(2, '0');
  
  if (lastRow < 2) {
    // ไม่มีข้อมูล เริ่มต้นที่ 001
    return yearMonth + '001';
  }
  
  // หาลำดับสูงสุดในเดือนปัจจุบัน
  const data = sh.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  const timestampIndex = HEADERS.indexOf('timestamp');
  let maxSequence = 0;
  
  data.forEach(row => {
    const timestamp = row[timestampIndex];
    if (timestamp) {
      const recordDate = new Date(timestamp);
      const recordYearMonth = recordDate.getFullYear().toString().substr(2, 2) + 
                             (recordDate.getMonth() + 1).toString().padStart(2, '0');
      
      if (recordYearMonth === yearMonth) {
        maxSequence++;
      }
    }
  });
  
  return yearMonth + (maxSequence + 1).toString().padStart(3, '0');
}

function _reverseInventoryUpdate(transactionData) {
  const invSheet = _getInventorySheet();
  const source = transactionData.fuelSource;
  const liters = Number(transactionData.liters) || 0;
  const refillTarget = transactionData.refillTarget;
  const docType = transactionData.docType; // เพิ่มการดึง docType จาก transactionData
  
  if (!FUEL_SOURCES[source]) return;
  
  const lastRow = invSheet.getLastRow();
  if (lastRow < 2) return;
  
  const sourceData = invSheet.getRange(2, 1, lastRow - 1, 5).getValues();
  
  if (source === 'จัดซื้อ') {
    // ย้อนกลับการเติม - ลดยอดคงเหลือ
    if (refillTarget && FUEL_SOURCES[refillTarget]) {
      _updateSourceInventory(invSheet, sourceData, refillTarget, -liters);
    }
  } else if (source === 'สนามบินนครสวรรค์ - ถัง 200L' || source === 'สนามบินคลองหลวง - ถัง 200L') {
    // ย้อนกลับการซื้อถัง - ลดยอดคงเหลือ
    _updateSourceInventory(invSheet, sourceData, source, -liters);
  } else if (docType === 'เติมน้ำมัน') {
    // ย้อนกลับการเติมน้ำมัน - ลดยอดคงเหลือ
    _updateSourceInventory(invSheet, sourceData, source, -liters);
  } else {
    // ย้อนกลับการจ่าย - เพิ่มยอดคงเหลือ
    _updateSourceInventory(invSheet, sourceData, source, liters);
  }
}

function doGet(e) {
  const action = (e.parameter && e.parameter.action) || 'list';
  let result;
  try {
    if (action === 'append') {
      const dataStr = (e.parameter && e.parameter.data) || '{}';
      const obj = JSON.parse(dataStr);
      const id = _appendRow(obj);
      result = { success: true, id };
    } else if (action === 'update') {
      const id = e.parameter && e.parameter.id;
      const dataStr = (e.parameter && e.parameter.data) || '{}';
      if (!id) {
        result = { success: false, error: 'ID is required for update action' };
      } else {
        console.log('Update request - ID:', id, 'Data:', dataStr);
        const obj = JSON.parse(dataStr);
        obj.id = id; // ให้แน่ใจว่า ID ถูกต้อง
        const updated = _updateRow(obj);
        if (updated) {
          result = { success: true, message: 'Record updated successfully' };
        } else {
          result = { success: false, error: 'Record not found', debug: { searchId: id, availableIds: _getAvailableIds() } };
        }
      }
    } else if (action === 'list') {
      const rows = _listRows();
      result = { success: true, rows };
    } else if (action === 'inventory') {
      const inventory = _getInventoryData();
      result = { success: true, inventory };
    } else if (action === 'budget') {
      const budgets = _getBudgetData();
      result = { success: true, budgets };
    } else if (action === 'init_budget') {
      // สำหรับการสร้าง Budget Sheet ใหม่
      const budgetSheet = _getBudgetSheet();
      result = { success: true, message: 'Budget sheet initialized' };
    } else if (action === 'update_budget') {
      // อัปเดตงบประมาณโดยตรง
      const mission = e.parameter && e.parameter.mission;
      const allocatedBudget = e.parameter && e.parameter.allocatedBudget;
      if (!mission || allocatedBudget === undefined) {
        result = { success: false, error: 'Mission and allocatedBudget are required' };
      } else {
        const updated = _directUpdateBudget(mission, Number(allocatedBudget));
        if (updated) {
          result = { success: true, message: 'Budget updated successfully' };
        } else {
          result = { success: false, error: 'Mission not found' };
        }
      }
    } else if (action === 'test_tank_inventory') {
      // ทดสอบการอัปเดต inventory สำหรับถังน้ำมัน 200L
      const testResult = testTankInventoryUpdate();
      result = { success: true, message: testResult };
    } else if (action === 'test_add_tank') {
      // ทดสอบการเพิ่มข้อมูลถังน้ำมัน
      const testResult = testAddTankPurchase();
      result = { success: true, message: testResult };
    } else if (action === 'force_update_tank') {
      // บังคับอัปเดต inventory ถังน้ำมัน
      const tanks = Number(e.parameter && e.parameter.tanks) || 10;
      const testResult = forceUpdateTankInventory(tanks);
      result = { success: true, message: testResult };
    } else if (action === 'check_inventory') {
      // ตรวจสอบสถานะ inventory
      const testResult = checkInventoryStatus();
      result = { success: true, message: testResult };
    } else if (action === 'add_budget') {
      // เพิ่มภารกิจใหม่
      const mission = e.parameter && e.parameter.mission;
      const fiscalYear = e.parameter && e.parameter.fiscalYear || '2567';
      const allocatedBudget = e.parameter && e.parameter.allocatedBudget;
      if (!mission || !allocatedBudget) {
        result = { success: false, error: 'Mission and allocatedBudget are required' };
      } else {
        const added = _addBudget(mission, fiscalYear, Number(allocatedBudget));
        if (added) {
          result = { success: true, message: 'Budget added successfully' };
        } else {
          result = { success: false, error: 'Failed to add budget or mission already exists' };
        }
      }
    } else if (action === 'delete') {
      const id = e.parameter && e.parameter.id;
      if (!id) {
        result = { success: false, error: 'ID is required for delete action' };
      } else {
        console.log('Delete request - ID:', id);
        const deleted = _deleteRow(id);
        if (deleted) {
          result = { success: true, message: 'Record deleted successfully' };
        } else {
          result = { success: false, error: 'Record not found', debug: { searchId: id, availableIds: _getAvailableIds() } };
        }
      }
    } else if (action === 'get_next_sequence') {
      // สร้างลำดับถัดไป
      const nextSeq = _getNextSequenceNumber();
      result = { success: true, sequence: nextSeq };
    } else if (action === 'init_inventory') {
      // สำหรับการสร้าง Inventory Sheet ใหม่
      const invSheet = _getInventorySheet();
      result = { success: true, message: 'Inventory sheet initialized' };
    } else if (action === 'direct_inventory_update') {
      // อัปเดตยอดคงเหลือโดยตรง
      const source = e.parameter && e.parameter.source;
      const stock = e.parameter && e.parameter.stock;
      if (!source || stock === undefined) {
        result = { success: false, error: 'Source and stock are required' };
      } else {
        const updated = _directUpdateInventory(source, Number(stock));
        if (updated) {
          result = { success: true, message: 'Inventory updated directly' };
        } else {
          result = { success: false, error: 'Source not found' };
        }
      }
    } else if (action === 'init_inventory_data') {
      // นำเข้าข้อมูลยอดคงเหลือเริ่มต้น
      result = initializeInventoryFromCSV();
    } else if (action === 'create_sample_data') {
      // สร้างข้อมูลตัวอย่าง
      result = createSampleData();
    } else if (action === 'direct_drum_inventory_update') {
      // อัปเดตยอดคงเหลือ drum storage โดยตรง
      const source = e.parameter && e.parameter.source;
      const drums = e.parameter && e.parameter.drums;
      const liters = e.parameter && e.parameter.liters;
      if (!source || drums === undefined || liters === undefined) {
        result = { success: false, error: 'Source, drums, and liters are required' };
      } else {
        try {
          const updated = _directUpdateDrumInventory(source, Number(drums), Number(liters));
          if (updated) {
            result = { success: true, message: 'Drum inventory updated directly' };
          } else {
            result = { success: false, error: 'Drum storage source not found or not drum_storage type' };
          }
        } catch (updateError) {
          console.error('Error in _directUpdateDrumInventory:', updateError);
          result = { success: false, error: 'Update failed: ' + String(updateError) };
        }
      }
    } else if (action === 'debug_inventory') {
      // ฟังก์ชันใหม่สำหรับ debug inventory
      result = _debugInventoryData();
    } else if (action === 'fix_inventory') {
      // ฟังก์ชันใหม่สำหรับแก้ไข inventory
      result = _fixInventoryData();
    } else {
      result = { success: false, error: 'Unknown action' };
    }
  } catch (err) {
    result = { success: false, error: String(err) };
  }

  // JSONP support
  const cb = e.parameter && e.parameter.callback;
  const text = cb ? `${cb}(${JSON.stringify(result)})` : JSON.stringify(result);
  const output = ContentService.createTextOutput(text);
  output.setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
  return output;
}

function _directUpdateInventory(sourceName, newStock) {
  const invSheet = _getInventorySheet();
  const lastRow = invSheet.getLastRow();
  if (lastRow < 2) return false;
  
  const sourceData = invSheet.getRange(2, 1, lastRow - 1, 8).getValues(); // Updated to 8 columns
  
  for (let i = 0; i < sourceData.length; i++) {
    if (sourceData[i][0] === sourceName) {
      // อัปเดตยอดคงเหลือและเวลา
      invSheet.getRange(i + 2, 4).setValue(newStock);    // Current_Stock
      invSheet.getRange(i + 2, 8).setValue(new Date());  // Last_Updated (column 8)
      return true;
    }
  }
  return false;
}

function _directUpdateDrumInventory(sourceName, newDrums, newLiters) {
  const invSheet = _getInventorySheet();
  const lastRow = invSheet.getLastRow();
  
  // ถ้าไม่มีข้อมูลใน inventory ให้สร้างใหม่
  if (lastRow < 2) {
    console.log('No inventory data found, initializing...');
    _initializeInventorySheet(invSheet);
  }
  
  // ตรวจสอบและเพิ่มแหล่งน้ำมันที่ขาดหายไป
  _ensureInventoryRows(invSheet);
  
  // อ่านข้อมูลใหม่หลังจาก initialize
  const newLastRow = invSheet.getLastRow();
  if (newLastRow < 2) {
    console.log('Failed to initialize inventory sheet');
    return false;
  }
  
  const sourceData = invSheet.getRange(2, 1, newLastRow - 1, 8).getValues();
  
  // Debug: แสดงข้อมูลที่มีอยู่
  console.log('Looking for source:', sourceName);
  console.log('Available sources:', sourceData.map(row => `${row[0]} (${row[1]})`));
  
  for (let i = 0; i < sourceData.length; i++) {
    if (sourceData[i][0] === sourceName) {
      console.log('Found source:', sourceName, 'Type:', sourceData[i][1]);
      
      // ตรวจสอบว่าเป็น drum storage
      if (sourceData[i][1] === 'drum_storage') {
        // อัปเดตยอดคงเหลือ (ลิตร), จำนวนถัง, และเวลา
        invSheet.getRange(i + 2, 4).setValue(newLiters);   // Current_Stock (liters)
        invSheet.getRange(i + 2, 5).setValue(newDrums);    // Current_Drums
        invSheet.getRange(i + 2, 8).setValue(new Date());  // Last_Updated
        
        console.log('Updated drum inventory:', {
          source: sourceName,
          drums: newDrums,
          liters: newLiters
        });
        
        return true;
      } else {
        console.log('Source found but not drum_storage type:', sourceData[i][1]);
        return false;
      }
    }
  }
  
  console.log('Source not found in inventory');
  return false;
}

// ฟังก์ชันสำหรับ debug ข้อมูล inventory
function _debugInventoryData() {
  try {
    const invSheet = _getInventorySheet();
    const lastRow = invSheet.getLastRow();
    
    const result = {
      success: true,
      sheetExists: true,
      lastRow: lastRow,
      sources: []
    };
    
    if (lastRow >= 2) {
      const sourceData = invSheet.getRange(2, 1, lastRow - 1, 8).getValues();
      result.sources = sourceData.map((row, index) => ({
        row: index + 2,
        source: row[0],
        type: row[1],
        capacity: row[2],
        currentStock: row[3],
        currentDrums: row[4],
        unitSize: row[5],
        location: row[6],
        lastUpdated: row[7]
      }));
    }
    
    // ตรวจสอบว่ามี drum storage หรือไม่
    const drumSources = result.sources.filter(s => s.type === 'drum_storage');
    result.drumStorageCount = drumSources.length;
    result.drumSources = drumSources;
    
    return result;
  } catch (error) {
    return {
      success: false,
      error: String(error)
    };
  }
}

// ฟังก์ชันสำหรับแก้ไขข้อมูล inventory
function _fixInventoryData() {
  try {
    const invSheet = _getInventorySheet();
    
    // ลบข้อมูลเก่าทั้งหมด
    invSheet.clear();
    
    // สร้างใหม่
    _initializeInventorySheet(invSheet);
    
    const lastRow = invSheet.getLastRow();
    const sourceData = invSheet.getRange(2, 1, lastRow - 1, 8).getValues();
    
    return {
      success: true,
      message: 'Inventory data fixed and reinitialized',
      totalSources: sourceData.length,
      drumSources: sourceData.filter(row => row[1] === 'drum_storage').length,
      sources: sourceData.map(row => ({ name: row[0], type: row[1] }))
    };
  } catch (error) {
    return {
      success: false,
      error: String(error)
    };
  }
}

function _directUpdateBudget(mission, newAllocatedBudget) {
  const budgetSheet = _getBudgetSheet();
  const lastRow = budgetSheet.getLastRow();
  if (lastRow < 2) return false;
  
  const budgetData = budgetSheet.getRange(2, 1, lastRow - 1, 7).getValues();
  
  for (let i = 0; i < budgetData.length; i++) {
    if (budgetData[i][0] === mission) {
      const usedBudget = Number(budgetData[i][3]) || 0;
      const newRemainingBudget = newAllocatedBudget - usedBudget;
      
      // อัปเดตงบประมาณ
      budgetSheet.getRange(i + 2, 3).setValue(newAllocatedBudget); // Allocated_Budget
      budgetSheet.getRange(i + 2, 5).setValue(newRemainingBudget); // Remaining_Budget
      budgetSheet.getRange(i + 2, 6).setValue(new Date()); // Last_Updated
      
      // ตรวจสอบสถานะงบประมาณ
      if (newRemainingBudget <= 0) {
        budgetSheet.getRange(i + 2, 7).setValue('Over Budget');
      } else if (newRemainingBudget / newAllocatedBudget < 0.1) {
        budgetSheet.getRange(i + 2, 7).setValue('Warning');
      } else {
        budgetSheet.getRange(i + 2, 7).setValue('Active');
      }
      
      return true;
    }
  }
  return false;
}

function _addBudget(mission, fiscalYear, allocatedBudget) {
  const budgetSheet = _getBudgetSheet();
  const lastRow = budgetSheet.getLastRow();
  
  // ตรวจสอบว่ามีภารกิจนี้อยู่แล้วหรือไม่
  if (lastRow >= 2) {
    const budgetData = budgetSheet.getRange(2, 1, lastRow - 1, 7).getValues();
    for (let i = 0; i < budgetData.length; i++) {
      if (budgetData[i][0] === mission && budgetData[i][1] === fiscalYear) {
        return false; // มีอยู่แล้ว
      }
    }
  }
  
  // เพิ่มภารกิจใหม่
  const newRow = [mission, fiscalYear, allocatedBudget, 0, allocatedBudget, new Date(), 'Active'];
  budgetSheet.appendRow(newRow);
  
  // จัดรูปแบบตัวเลข
  const newRowIndex = budgetSheet.getLastRow();
  budgetSheet.getRange(newRowIndex, 3, 1, 3).setNumberFormat('#,##0.00');
  
  return true;
}

// ฟังก์ชันสำหรับนำเข้าข้อมูลยอดคงเหลือเริ่มต้น
function initializeInventoryFromCSV() {
  const invSheet = _getInventorySheet();
  
  // ข้อมูลเริ่มต้น
  const initialData = [
    ['สนามบินนครสวรรค์ แท๊ง 1', 'tankfarm', 20000, 15000, new Date('2024-01-15 10:00:00')],
    ['สนามบินนครสวรรค์ แท๊ง 2', 'tankfarm', 20000, 12500, new Date('2024-01-15 10:00:00')],
    ['สนามบินคลองหลวง แท๊ง 1', 'tankfarm', 15000, 8000, new Date('2024-01-15 10:00:00')],
    ['96-0677 กทม.', 'truck', 7000, 5500, new Date('2024-01-15 09:30:00')],
    ['97-9769 กทม.', 'truck', 12000, 9000, new Date('2024-01-15 09:30:00')],
    ['50-9109 กทม.', 'truck', 16000, 12000, new Date('2024-01-15 09:30:00')],
    ['52-4018 กทม.', 'truck', 16000, 14000, new Date('2024-01-15 09:30:00')],
    ['53-1224 กทม.', 'truck', 16000, 11000, new Date('2024-01-15 09:30:00')],
    ['53-1225 กทม.', 'truck', 16000, 13500, new Date('2024-01-15 09:30:00')],
    ['54-3780 กทม.', 'truck', 16000, 10500, new Date('2024-01-15 09:30:00')],
    ['54-3781 กทม.', 'truck', 16000, 15000, new Date('2024-01-15 09:30:00')],
    ['สฝษ/บ. 2320-036-0001/001', 'truck', 8000, 6000, new Date('2024-01-15 09:30:00')],
    // Drum Storage: capacity = -1 (unlimited), currentStock in drums
    ['สนามบินนครสวรรค์ - ถัง 200L', 'drum_storage', -1, 5, new Date('2024-01-15 08:00:00')],
    ['สนามบินคลองหลวง - ถัง 200L', 'drum_storage', -1, 3, new Date('2024-01-15 08:00:00')]
  ];
  
  // ลบข้อมูลเก่า (ยกเว้นหัวตาราง)
  const lastRow = invSheet.getLastRow();
  if (lastRow > 1) {
    invSheet.deleteRows(2, lastRow - 1);
  }
  
  // เพิ่มข้อมูลใหม่
  if (initialData.length > 0) {
    invSheet.getRange(2, 1, initialData.length, 5).setValues(initialData);
  }
  
  console.log('Inventory initialized with ' + initialData.length + ' records');
  return { success: true, message: 'Inventory initialized successfully', count: initialData.length };
}

// ฟังก์ชันสำหรับสร้างข้อมูลตัวอย่าง
function createSampleData() {
  const sheet = _getSheet();
  
  // ข้อมูลตัวอย่าง
  const sampleData = [
    ['2024-01-15', 'ฝนหลวง', 'TU-95', '96-0677 กทม.', 500, 35.50, 17750, 19525, 'ปฏิบัติการฝนหลวง'],
    ['2024-01-16', 'ฝนหลวง', 'TU-95', '97-9769 กทม.', 750, 35.50, 26625, 29287.50, 'ปฏิบัติการฝนหลวง'],
    ['2024-01-17', 'เกษตร', 'C-130', 'สนามบินนครสวรรค์ แท๊ง 1', 1200, 35.50, 42600, 46860, 'บินสำรวจพื้นที่เกษตร'],
    ['2024-01-18', 'ฝนหลวง', 'TU-95', '50-9109 กทม.', 600, 35.50, 21300, 23430, 'ปฏิบัติการฝนหลวง'],
    ['2024-01-19', 'จัดซื้อ', '', 'จัดซื้อ', 5000, 35.50, 177500, 195250, 'เติมถัง 96-0677 กทม.', '96-0677 กทม.'],
    ['2024-01-20', 'เกษตร', 'C-130', 'สนามบินคลองหลวง แท๊ง 1', 800, 35.50, 28400, 31240, 'บินสำรวจพื้นที่เกษตร'],
    ['2024-01-21', 'ฝนหลวง', 'TU-95', 'สนามบินนครสวรรค์ - ถัง 200L', 600, 35.50, 21300, 23430, 'ใช้ถังน้ำมันสำรอง'],
    ['2024-01-22', 'เกษตร', 'C-130', '52-4018 กทม.', 900, 35.50, 31950, 35145, 'บินสำรวจพื้นที่เกษตร']
  ];
  
  // ลบข้อมูลเก่า (ยกเว้นหัวตาราง)
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
  
  // เพิ่มข้อมูลใหม่
  if (sampleData.length > 0) {
    const range = sheet.getRange(2, 1, sampleData.length, sampleData[0].length);
    range.setValues(sampleData);
  }
  
  console.log('Sample data created with ' + sampleData.length + ' records');
  return { success: true, message: 'Sample data created successfully', count: sampleData.length };
}

// ฟังก์ชันสำหรับทดสอบการสร้าง Inventory Sheet
function testCreateInventorySheet() {
  const invSheet = _getInventorySheet();
  console.log('Inventory sheet created/accessed successfully');
}

// ==================== DRUM MANAGEMENT FUNCTIONS ====================

function _getDrumManagementSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(DRUM_MANAGEMENT_SHEET_NAME);
  if (!sh) {
    // สร้างชีทใหม่ถ้าไม่มี
    sh = ss.insertSheet(DRUM_MANAGEMENT_SHEET_NAME);
    _initializeDrumManagementSheet(sh);
  }
  return sh;
}

function _initializeDrumManagementSheet(drumSheet) {
  // สร้างหัวตาราง
  const headers = [
    'Drum_ID', 'Location', 'Status', 'Purchase_Date', 'Purchase_Price',
    'Current_Volume', 'Max_Capacity', 'Last_Refill_Date', 'Last_Usage_Date',
    'Condition', 'Serial_Number', 'Supplier', 'Notes'
  ];
  
  drumSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  // จัดรูปแบบหัวตาราง
  const headerRange = drumSheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#4CAF50');
  headerRange.setFontColor('white');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');
  
  // ตั้งความกว้างคอลัมน์
  drumSheet.setColumnWidth(1, 120); // Drum_ID
  drumSheet.setColumnWidth(2, 150); // Location
  drumSheet.setColumnWidth(3, 100); // Status
  drumSheet.setColumnWidth(4, 120); // Purchase_Date
  drumSheet.setColumnWidth(5, 120); // Purchase_Price
  drumSheet.setColumnWidth(6, 120); // Current_Volume
  drumSheet.setColumnWidth(7, 120); // Max_Capacity
  drumSheet.setColumnWidth(8, 130); // Last_Refill_Date
  drumSheet.setColumnWidth(9, 130); // Last_Usage_Date
  drumSheet.setColumnWidth(10, 100); // Condition
  drumSheet.setColumnWidth(11, 120); // Serial_Number
  drumSheet.setColumnWidth(12, 150); // Supplier
  drumSheet.setColumnWidth(13, 200); // Notes
  
  // เพิ่มข้อมูลตัวอย่าง
  const sampleData = [
    ['DRUM-NSW-001', 'สนามบินนครสวรรค์', 'Active', new Date('2024-01-15'), 2500.00, 200, 200, new Date('2024-01-15'), null, 'Good', 'NSW-D001', 'บริษัท ถังน้ำมัน จำกัด', 'ถังใหม่ สภาพดี'],
    ['DRUM-NSW-002', 'สนามบินนครสวรรค์', 'Active', new Date('2024-01-15'), 2500.00, 150, 200, new Date('2024-01-15'), new Date('2024-01-20'), 'Good', 'NSW-D002', 'บริษัท ถังน้ำมัน จำกัด', 'ใช้งานปกติ'],
    ['DRUM-NSW-003', 'สนามบินนครสวรรค์', 'Active', new Date('2024-01-15'), 2500.00, 0, 200, new Date('2024-01-15'), new Date('2024-01-22'), 'Good', 'NSW-D003', 'บริษัท ถังน้ำมัน จำกัด', 'ถังว่าง'],
    ['DRUM-NSW-004', 'สนามบินนครสวรรค์', 'Maintenance', new Date('2024-01-15'), 2500.00, 0, 200, new Date('2024-01-15'), new Date('2024-01-18'), 'Needs Repair', 'NSW-D004', 'บริษัท ถังน้ำมัน จำกัด', 'ต้องซ่อมวาล์ว'],
    ['DRUM-NSW-005', 'สนามบินนครสวรรค์', 'Active', new Date('2024-01-15'), 2500.00, 200, 200, new Date('2024-01-15'), null, 'Good', 'NSW-D005', 'บริษัท ถังน้ำมัน จำกัด', 'ถังใหม่ สภาพดี'],
    ['DRUM-KL-001', 'สนามบินคลองหลวง', 'Active', new Date('2024-01-20'), 2500.00, 180, 200, new Date('2024-01-20'), new Date('2024-01-21'), 'Good', 'KL-D001', 'บริษัท ถังน้ำมัน จำกัด', 'ใช้งานปกติ'],
    ['DRUM-KL-002', 'สนามบินคลองหลวง', 'Active', new Date('2024-01-20'), 2500.00, 200, 200, new Date('2024-01-20'), null, 'Good', 'KL-D002', 'บริษัท ถังน้ำมัน จำกัด', 'ถังใหม่ สภาพดี'],
    ['DRUM-KL-003', 'สนามบินคลองหลวง', 'Active', new Date('2024-01-20'), 2500.00, 50, 200, new Date('2024-01-20'), new Date('2024-01-22'), 'Good', 'KL-D003', 'บริษัท ถังน้ำมัน จำกัด', 'เหลือน้อย'],
    ['DRUM-KL-004', 'สนามบินคลองหลวง', 'Reserved', new Date('2024-01-20'), 2500.00, 200, 200, new Date('2024-01-20'), null, 'Good', 'KL-D004', 'บริษัท ถังน้ำมัน จำกัด', 'สำรองไว้'],
    ['DRUM-KL-005', 'สนามบินคลองหลวง', 'Active', new Date('2024-01-20'), 2500.00, 0, 200, new Date('2024-01-20'), new Date('2024-01-23'), 'Good', 'KL-D005', 'บริษัท ถังน้ำมัน จำกัด', 'ถังว่าง']
  ];
  
  // เพิ่มข้อมูลตัวอย่าง
  sampleData.forEach(row => {
    drumSheet.appendRow(row);
  });
  
  // จัดรูปแบบข้อมูล
  const dataRange = drumSheet.getRange(2, 1, sampleData.length, headers.length);
  
  // จัดรูปแบบตัวเลข
  drumSheet.getRange(2, 5, sampleData.length, 1).setNumberFormat('#,##0.00'); // Purchase_Price
  drumSheet.getRange(2, 6, sampleData.length, 2).setNumberFormat('#,##0'); // Current_Volume, Max_Capacity
  
  // จัดรูปแบบวันที่
  drumSheet.getRange(2, 4, sampleData.length, 1).setNumberFormat('dd/mm/yyyy'); // Purchase_Date
  drumSheet.getRange(2, 8, sampleData.length, 2).setNumberFormat('dd/mm/yyyy'); // Last_Refill_Date, Last_Usage_Date
  
  // เพิ่ม Data Validation สำหรับ Status
  const statusRange = drumSheet.getRange(2, 3, 1000, 1);
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Active', 'Maintenance', 'Reserved', 'Retired'])
    .build();
  statusRange.setDataValidation(statusRule);
  
  // เพิ่ม Data Validation สำหรับ Condition
  const conditionRange = drumSheet.getRange(2, 10, 1000, 1);
  const conditionRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Good', 'Fair', 'Needs Repair', 'Damaged'])
    .build();
  conditionRange.setDataValidation(conditionRule);
  
  console.log('Drum Management sheet initialized with sample data');
}

// ฟังก์ชันสำหรับดึงข้อมูลถัง
function _getDrumData() {
  try {
    const drumSheet = _getDrumManagementSheet();
    const lastRow = drumSheet.getLastRow();
    
    if (lastRow < 2) {
      return {
        success: true,
        drums: [],
        summary: {
          total: 0,
          active: 0,
          maintenance: 0,
          reserved: 0,
          retired: 0
        }
      };
    }
    
    const data = drumSheet.getRange(2, 1, lastRow - 1, 13).getValues();
    const drums = data.map(row => ({
      drumId: row[0],
      location: row[1],
      status: row[2],
      purchaseDate: row[3],
      purchasePrice: row[4],
      currentVolume: row[5],
      maxCapacity: row[6],
      lastRefillDate: row[7],
      lastUsageDate: row[8],
      condition: row[9],
      serialNumber: row[10],
      supplier: row[11],
      notes: row[12]
    }));
    
    // สรุปข้อมูล
    const summary = {
      total: drums.length,
      active: drums.filter(d => d.status === 'Active').length,
      maintenance: drums.filter(d => d.status === 'Maintenance').length,
      reserved: drums.filter(d => d.status === 'Reserved').length,
      retired: drums.filter(d => d.status === 'Retired').length
    };
    
    // สรุปตามสถานที่
    const locationSummary = {};
    drums.forEach(drum => {
      if (!locationSummary[drum.location]) {
        locationSummary[drum.location] = {
          total: 0,
          active: 0,
          totalVolume: 0,
          maxVolume: 0
        };
      }
      locationSummary[drum.location].total++;
      if (drum.status === 'Active') {
        locationSummary[drum.location].active++;
      }
      locationSummary[drum.location].totalVolume += drum.currentVolume || 0;
      locationSummary[drum.location].maxVolume += drum.maxCapacity || 0;
    });
    
    return {
      success: true,
      drums: drums,
      summary: summary,
      locationSummary: locationSummary
    };
  } catch (error) {
    return {
      success: false,
      error: String(error)
    };
  }
}