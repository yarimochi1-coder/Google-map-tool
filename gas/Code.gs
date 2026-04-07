var SHEET_NAME = 'properties';
var HISTORY_SHEET_NAME = 'visit_history';
var HEADERS = ['id','lat','lng','address','name','status','building_age','deterioration','photo_url','memo','staff','roof_type','estimated_area','contract_amount','rejection_reason','revisit','last_visit_date','created_at','updated_at','user_id','visit_count'];
var HISTORY_HEADERS = ['id','property_id','status','staff','visited_at','memo'];
var DAILY_STATS_NAME = 'daily_stats';
var DAILY_STATS_HEADERS = ['date','visits','contacts','face_to_face','measurements','appointments','contracts','notes'];
var LAYER_PINS_NAME = 'layer_pins';
var LAYER_PINS_HEADERS = ['id','lat','lng','name','address','memo','layer','created_at'];

function doGet(e) {
  try {
    if (!validateApiKey(e.parameter.apiKey)) {
      return jsonResponse({ success: false, error: 'Unauthorized' });
    }
    var action = e.parameter.action;
    switch (action) {
      case 'list':
        return jsonResponse({ success: true, data: getAllProperties() });
      case 'get':
        return jsonResponse({ success: true, data: getPropertyById(e.parameter.id) });
      case 'dashboard':
        return jsonResponse({ success: true, data: getDashboard(e.parameter.date) });
      case 'history':
        return jsonResponse({ success: true, data: getHistory(e.parameter.property_id) });
      case 'analytics':
        return jsonResponse({ success: true, data: getAnalytics() });
      case 'daily_stats':
        return jsonResponse({ success: true, data: getDailyStats() });
      case 'layer_pins':
        return jsonResponse({ success: true, data: getLayerPins() });
      default:
        return jsonResponse({ success: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (!validateApiKey(body.apiKey)) {
      return jsonResponse({ success: false, error: 'Unauthorized' });
    }
    var action = body.action;
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      switch (action) {
        case 'create':
          return jsonResponse({ success: true, data: createProperty(body.data) });
        case 'update':
          return jsonResponse({ success: true, data: updateProperty(body.data) });
        case 'delete':
          deleteProperty(body.data.id || body.id);
          return jsonResponse({ success: true });
        case 'bulkSync':
          return jsonResponse({ success: true, data: bulkSync(body.items) });
        case 'import':
          return jsonResponse({ success: true, data: bulkImport(body.data) });
        case 'log_visit':
          return jsonResponse({ success: true, data: logVisit(body.data) });
        case 'import_daily_stats':
          return jsonResponse({ success: true, data: importDailyStats(body.data) });
        case 'create_layer_pin':
          return jsonResponse({ success: true, data: createLayerPin(body.data) });
        case 'delete_layer_pin':
          deleteLayerPin(body.data.id || body.id);
          return jsonResponse({ success: true });
        case 'import_layer_pins':
          return jsonResponse({ success: true, data: importLayerPins(body.data) });
        case 'update_layer_pin':
          return jsonResponse({ success: true, data: updateLayerPin(body.data) });
        default:
          return jsonResponse({ success: false, error: 'Unknown action: ' + action });
      }
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// --- Sheet helpers ---

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
  return sheet;
}

function getHistorySheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(HISTORY_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(HISTORY_SHEET_NAME);
    sheet.getRange(1, 1, 1, HISTORY_HEADERS.length).setValues([HISTORY_HEADERS]);
  }
  return sheet;
}

// --- CRUD Operations ---

function getDailyStatsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DAILY_STATS_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(DAILY_STATS_NAME);
    sheet.getRange(1, 1, 1, DAILY_STATS_HEADERS.length).setValues([DAILY_STATS_HEADERS]);
  }
  return sheet;
}

function getDailyStats() {
  var sheet = getDailyStatsSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var headers = data[0];
  var results = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = data[i][j];
    }
    obj.visits = Number(obj.visits) || 0;
    obj.contacts = Number(obj.contacts) || 0;
    obj.face_to_face = Number(obj.face_to_face) || 0;
    obj.measurements = Number(obj.measurements) || 0;
    obj.appointments = Number(obj.appointments) || 0;
    obj.contracts = Number(obj.contracts) || 0;
    results.push(obj);
  }
  return results;
}

function getLayerPinsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(LAYER_PINS_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(LAYER_PINS_NAME);
    sheet.getRange(1, 1, 1, LAYER_PINS_HEADERS.length).setValues([LAYER_PINS_HEADERS]);
  }
  return sheet;
}

function getLayerPins() {
  var sheet = getLayerPinsSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var headers = data[0];
  var results = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = data[i][j];
    }
    obj.lat = Number(obj.lat);
    obj.lng = Number(obj.lng);
    results.push(obj);
  }
  return results;
}

function createLayerPin(data) {
  var sheet = getLayerPinsSheet();
  var id = data.id || Utilities.getUuid();
  var now = new Date().toISOString();
  var row = LAYER_PINS_HEADERS.map(function(h) {
    if (h === 'id') return id;
    if (h === 'created_at') return data.created_at || now;
    return data[h] || '';
  });
  sheet.appendRow(row);
  data.id = id;
  return data;
}

function deleteLayerPin(id) {
  var sheet = getLayerPinsSheet();
  var allData = sheet.getDataRange().getValues();
  var idCol = allData[0].indexOf('id');
  for (var i = 1; i < allData.length; i++) {
    if (allData[i][idCol] === id) {
      sheet.deleteRow(i + 1);
      return;
    }
  }
}

function updateLayerPin(data) {
  var sheet = getLayerPinsSheet();
  var allData = sheet.getDataRange().getValues();
  var headers = allData[0];
  var idCol = headers.indexOf('id');
  for (var i = 1; i < allData.length; i++) {
    if (allData[i][idCol] === data.id) {
      for (var j = 0; j < headers.length; j++) {
        var key = headers[j];
        if (key !== 'id' && key !== 'created_at' && data[key] !== undefined) {
          sheet.getRange(i + 1, j + 1).setValue(data[key]);
        }
      }
      return data;
    }
  }
  return createLayerPin(data);
}

function importLayerPins(dataArray) {
  var sheet = getLayerPinsSheet();
  var rows = [];
  var now = new Date().toISOString();
  for (var i = 0; i < dataArray.length; i++) {
    var d = dataArray[i];
    var row = LAYER_PINS_HEADERS.map(function(h) {
      if (h === 'id') return d.id || Utilities.getUuid();
      if (h === 'created_at') return d.created_at || now;
      return d[h] || '';
    });
    rows.push(row);
  }
  if (rows.length > 0) {
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, rows.length, LAYER_PINS_HEADERS.length).setValues(rows);
  }
  return { imported: rows.length };
}

function importDailyStats(dataArray) {
  var sheet = getDailyStatsSheet();
  var rows = [];
  for (var i = 0; i < dataArray.length; i++) {
    var d = dataArray[i];
    var row = DAILY_STATS_HEADERS.map(function(h) {
      return d[h] || (h === 'notes' ? '' : 0);
    });
    rows.push(row);
  }
  if (rows.length > 0) {
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, rows.length, DAILY_STATS_HEADERS.length).setValues(rows);
  }
  return { imported: rows.length };
}

function getAllProperties() {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var headers = data[0];
  var results = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = data[i][j];
    }
    obj.lat = Number(obj.lat);
    obj.lng = Number(obj.lng);
    obj.visit_count = Number(obj.visit_count) || 0;
    results.push(obj);
  }
  return results;
}

function getPropertyById(id) {
  var all = getAllProperties();
  for (var i = 0; i < all.length; i++) {
    if (all[i].id === id) return all[i];
  }
  return null;
}

function createProperty(data) {
  var sheet = getSheet();
  var id = data.id || Utilities.getUuid();
  var now = new Date().toISOString();
  var row = HEADERS.map(function(h) {
    if (h === 'id') return id;
    if (h === 'created_at') return data.created_at || now;
    if (h === 'updated_at') return data.updated_at || now;
    if (h === 'visit_count') return Number(data.visit_count) || 0;
    return data[h] || '';
  });
  sheet.appendRow(row);
  data.id = id;
  return data;
}

function updateProperty(data) {
  var sheet = getSheet();
  var allData = sheet.getDataRange().getValues();
  var headers = allData[0];
  var idCol = headers.indexOf('id');
  for (var i = 1; i < allData.length; i++) {
    if (allData[i][idCol] === data.id) {
      for (var j = 0; j < headers.length; j++) {
        var key = headers[j];
        if (key !== 'id' && key !== 'created_at' && data[key] !== undefined) {
          sheet.getRange(i + 1, j + 1).setValue(data[key]);
        }
      }
      var updatedAtCol = headers.indexOf('updated_at');
      sheet.getRange(i + 1, updatedAtCol + 1).setValue(new Date().toISOString());
      return data;
    }
  }
  return createProperty(data);
}

function deleteProperty(id) {
  var sheet = getSheet();
  var allData = sheet.getDataRange().getValues();
  var idCol = allData[0].indexOf('id');
  for (var i = 1; i < allData.length; i++) {
    if (allData[i][idCol] === id) {
      sheet.deleteRow(i + 1);
      return;
    }
  }
}

// --- Visit History ---

function logVisit(data) {
  var sheet = getHistorySheet();
  var id = Utilities.getUuid();
  var now = new Date().toISOString();
  var row = [
    id,
    data.property_id || '',
    data.status || '',
    data.staff || '',
    data.visited_at || now,
    data.memo || ''
  ];
  sheet.appendRow(row);
  return { id: id };
}

function getHistory(propertyId) {
  var sheet = getHistorySheet();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var headers = data[0];
  var results = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = data[i][j];
    }
    if (!propertyId || obj.property_id === propertyId) {
      results.push(obj);
    }
  }
  return results;
}

// --- Bulk operations ---

function bulkSync(items) {
  var results = [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    switch (item.action) {
      case 'create':
        results.push(createProperty(item.data));
        break;
      case 'update':
        results.push(updateProperty(item.data));
        break;
      case 'delete':
        deleteProperty(item.data.id);
        results.push({ id: item.data.id, deleted: true });
        break;
      case 'log_visit':
        results.push(logVisit(item.data));
        break;
    }
  }
  return results;
}

function bulkImport(dataArray) {
  var sheet = getSheet();
  var rows = [];
  var now = new Date().toISOString();
  for (var i = 0; i < dataArray.length; i++) {
    var data = dataArray[i];
    var id = data.id || Utilities.getUuid();
    var row = HEADERS.map(function(h) {
      if (h === 'id') return id;
      if (h === 'created_at') return data.created_at || now;
      if (h === 'updated_at') return data.updated_at || now;
      if (h === 'visit_count') return Number(data.visit_count) || 0;
      return data[h] || '';
    });
    rows.push(row);
  }
  if (rows.length > 0) {
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, rows.length, HEADERS.length).setValues(rows);
  }
  return { imported: rows.length };
}

// --- Analytics ---

function getAnalytics() {
  var properties = getAllProperties();
  var history = getHistory();

  // Funnel
  var total = properties.length;
  var absent = 0, interphone = 0, child = 0, grandmother = 0, grandfather = 0;
  var ng = 0, instant_return = 0, measured = 0, appointment = 0, contract = 0, completed = 0, impossible = 0;

  for (var i = 0; i < properties.length; i++) {
    switch(properties[i].status) {
      case 'absent': absent++; break;
      case 'interphone': interphone++; break;
      case 'child': child++; break;
      case 'grandmother': grandmother++; break;
      case 'grandfather': grandfather++; break;
      case 'ng': ng++; break;
      case 'instant_return': instant_return++; break;
      case 'measured': measured++; break;
      case 'appointment': appointment++; break;
      case 'contract': contract++; break;
      case 'completed': completed++; break;
      case 'impossible': impossible++; break;
    }
  }

  var contacted = total - absent;
  var funnel = {
    total: total,
    absent: absent,
    contacted: contacted,
    contactRate: total > 0 ? Math.round(contacted / total * 100) : 0,
    interphone: interphone,
    ng: ng,
    instant_return: instant_return,
    measured: measured,
    appointment: appointment,
    contract: contract,
    completed: completed,
    measureToAppo: measured > 0 ? Math.round(appointment / measured * 100) : 0,
    appoToContract: appointment > 0 ? Math.round(contract / appointment * 100) : 0,
    overallRate: total > 0 ? Math.round(contract / total * 100 * 10) / 10 : 0
  };

  // Hourly analysis from visit_history
  var hourlyData = {};
  for (var h = 0; h < 24; h++) { hourlyData[h] = { visits: 0, contacts: 0, appointments: 0 }; }

  for (var i = 0; i < history.length; i++) {
    var rec = history[i];
    var dateStr = String(rec.visited_at);
    var hourMatch = dateStr.match(/(\d{1,2}):\d{2}/);
    if (hourMatch) {
      var hour = parseInt(hourMatch[1]);
      hourlyData[hour].visits++;
      if (rec.status !== 'absent') hourlyData[hour].contacts++;
      if (rec.status === 'appointment') hourlyData[hour].appointments++;
    }
  }

  // Day of week analysis
  var dowData = {0:{v:0,c:0},1:{v:0,c:0},2:{v:0,c:0},3:{v:0,c:0},4:{v:0,c:0},5:{v:0,c:0},6:{v:0,c:0}};
  for (var i = 0; i < history.length; i++) {
    var rec = history[i];
    var d = new Date(rec.visited_at);
    if (!isNaN(d.getTime())) {
      var dow = d.getDay();
      dowData[dow].v++;
      if (rec.status !== 'absent') dowData[dow].c++;
    }
  }

  // Response type analysis
  var responseAnalysis = { child: {total:0,appo:0}, grandmother: {total:0,appo:0}, grandfather: {total:0,appo:0} };
  for (var i = 0; i < history.length; i++) {
    var s = history[i].status;
    if (responseAnalysis[s]) responseAnalysis[s].total++;
  }
  // Check which property_ids eventually became appointments
  var appoIds = {};
  for (var i = 0; i < properties.length; i++) {
    if (properties[i].status === 'appointment' || properties[i].status === 'contract' || properties[i].status === 'completed') {
      appoIds[properties[i].id] = true;
    }
  }
  for (var i = 0; i < history.length; i++) {
    var s = history[i].status;
    if (responseAnalysis[s] && appoIds[history[i].property_id]) {
      responseAnalysis[s].appo++;
    }
  }

  // Average visits to contract
  var contractProperties = properties.filter(function(p) { return p.status === 'contract' || p.status === 'completed'; });
  var avgVisitsToContract = 0;
  if (contractProperties.length > 0) {
    var totalVisits = 0;
    for (var i = 0; i < contractProperties.length; i++) {
      totalVisits += contractProperties[i].visit_count || 1;
    }
    avgVisitsToContract = Math.round(totalVisits / contractProperties.length * 10) / 10;
  }

  return {
    funnel: funnel,
    hourly: hourlyData,
    dayOfWeek: dowData,
    responseAnalysis: responseAnalysis,
    avgVisitsToContract: avgVisitsToContract,
    totalHistory: history.length
  };
}

// --- Dashboard ---

function getDashboard(dateStr) {
  var all = getAllProperties();
  var date = dateStr || new Date().toISOString().split('T')[0];
  var todayVisits = 0;
  var todayCreated = 0;
  var statusCounts = {};
  for (var i = 0; i < all.length; i++) {
    var p = all[i];
    if (!statusCounts[p.status]) statusCounts[p.status] = 0;
    statusCounts[p.status]++;
    if (p.last_visit_date === date) {
      todayVisits++;
    }
    if (typeof p.created_at === 'string' && p.created_at.indexOf(date) === 0) {
      todayCreated++;
    }
  }
  return {
    date: date,
    totalPins: all.length,
    todayVisits: todayVisits,
    todayCreated: todayCreated,
    appointments: statusCounts['appointment'] || 0,
    contracts: statusCounts['contract'] || 0,
    statusCounts: statusCounts
  };
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
