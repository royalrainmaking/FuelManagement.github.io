// Global configuration for the Fuel Management app
window.APP_CONFIG = {
  // Google Sheets API URL (คัดลอกจาก Apps Script web app deployment)
  // ต้อง deploy Code.gs เป็น web app ก่อนใช้งาน
  apiUrl: "https://script.google.com/macros/s/AKfycbwanpxpYwM9ksxJo4QrUvGaDHg6pEkXuLNlphsw28bEE3eJlED85EO5V3DhdAxTQhPA/exec",
  
  // Google Sheets Document ID (จาก URL ที่คุณให้มา)
  sheetsId: "1uvWl02mWJJfJEbdiU0jxzgLwKf0nvMzYKF96Mn_z2CA",
  sheetsUrl: "https://docs.google.com/spreadsheets/d/1uvWl02mWJJfJEbdiU0jxzgLwKf0nvMzYKF96Mn_z2CA/edit",
  
  // Aircraft data with proper structure
  aircraftData: {
    'CARAVAN C208': ['1912', '1913', '1914', '1915', '1916', '1918'],
    'CARAVAN GRAND C208B': ['1921', '1922'],
    'CARAVAN GRAND EX': ['1931', '1932', '1933', '1934', '1935'],
    'CASA - 300': ['1531', '1532', '1533', '1534', '1535'],
    'CASA - 400': ['1541', '1542', '1543'],
    'NC212i': ['1544', '1545', '1546', '1547'],
    'skycourier': ['2511', '2512'],
    'L410': ['2611', '2612'],
    'SKA - 350': ['2011', '2012', '2013', '2014'],
    'CN - 235': ['2221', '2222'],
    'BELL 206B3': ['1615'],
    'BELL 407': ['2311'],
    'BELL 407GXP': ['2321', '2322'],
    'BELL 412 EP': ['21111'],
    'AS350 B2': ['18301'],
    'H130 T2': ['2411'],
    'AW139': ['2711']
  }
};