var SHEET_NAME = 'properties';
var HISTORY_SHEET_NAME = 'visit_history';
var HEADERS = ['id','lat','lng','address','name','status','building_age','deterioration','photo_url','memo','staff','roof_type','estimated_area','contract_amount','rejection_reason','revisit','last_visit_date','created_at','updated_at','user_id','visit_count','flyer_distributed','flyer_name'];
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
  var idCol = headers.indexOf('id');
  var updatedCol = headers.indexOf('updated_at');
  var dateColumns = ['last_visit_date', 'created_at', 'updated_at'];
  var dateCols = dateColumns.map(function(h) { return headers.indexOf(h); });
  var tz = Session.getScriptTimeZone();

  // IDごとに最新のupdated_atを持つ行だけ残す（重複除外）
  var bestRows = {};
  for (var i = 1; i < data.length; i++) {
    var id = data[i][idCol];
    if (!id) continue;
    var u = String(data[i][updatedCol] || '');
    if (!bestRows[id] || u > bestRows[id].u) {
      bestRows[id] = { row: data[i], u: u };
    }
  }

  var results = [];
  var ids = Object.keys(bestRows);
  for (var k = 0; k < ids.length; k++) {
    var row = bestRows[ids[k]].row;
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var val = row[j];
      if (dateCols.indexOf(j) !== -1 && val instanceof Date) {
        val = Utilities.formatDate(val, tz, 'yyyy/MM/dd HH:mm:ss');
      }
      obj[headers[j]] = val;
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

// Utility: 空の created_at / last_visit_date を現在時刻で埋める（手動実行用）
function backfillDates() {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var createdCol = headers.indexOf('created_at');
  var updatedCol = headers.indexOf('updated_at');
  var lastVisitCol = headers.indexOf('last_visit_date');
  var now = new Date().toISOString();
  var filled = 0;
  for (var i = 1; i < data.length; i++) {
    var changed = false;
    if (!data[i][createdCol]) {
      // updated_at があればそれを優先、なければ now
      var fallback = data[i][updatedCol] || now;
      sheet.getRange(i + 1, createdCol + 1).setValue(fallback);
      changed = true;
    }
    if (!data[i][lastVisitCol]) {
      var lvFallback = data[i][updatedCol] || data[i][createdCol] || now;
      sheet.getRange(i + 1, lastVisitCol + 1).setValue(lvFallback);
      changed = true;
    }
    if (changed) filled++;
  }
  Logger.log('Backfilled ' + filled + ' rows');
  return filled;
}

// Utility: 重複行を削除（id が同じ行を統合、空IDも削除、最新のupdated_atを残す）
function dedupeProperties() {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return 0;
  var headers = data[0];
  var idCol = headers.indexOf('id');
  var updatedCol = headers.indexOf('updated_at');
  // 後ろから走査して、後出し（updated_atが新しい方を優先）で保持
  var bestByid = {};
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var id = row[idCol];
    if (!id) continue; // 空IDは捨てる
    var u = row[updatedCol] || '';
    if (!bestByid[id] || String(u) > String(bestByid[id].u)) {
      bestByid[id] = { row: row, u: u };
    }
  }
  var keptRows = Object.keys(bestByid).map(function(k) { return bestByid[k].row; });
  // シートクリア→書き直し
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (keptRows.length > 0) {
    sheet.getRange(2, 1, keptRows.length, headers.length).setValues(keptRows);
  }
  var removed = (data.length - 1) - keptRows.length;
  Logger.log('Kept ' + keptRows.length + ' rows, removed ' + removed);
  return removed;
}

// Utility: visit_historyの最新visited_atをpropertiesのlast_visit_dateに反映
function syncLastVisitFromHistory() {
  var propSheet = getSheet();
  var propData = propSheet.getDataRange().getValues();
  if (propData.length <= 1) return 'No properties';
  var propHeaders = propData[0];
  var propIdCol = propHeaders.indexOf('id');
  var lastVisitCol = propHeaders.indexOf('last_visit_date');
  var createdCol = propHeaders.indexOf('created_at');
  var statusCol = propHeaders.indexOf('status');
  var visitCountCol = propHeaders.indexOf('visit_count');

  // visit_historyから各property_idの最新visited_atと訪問数を集計
  var histSheet = getHistorySheet();
  var histData = histSheet.getDataRange().getValues();
  var histHeaders = histData[0];
  var hPidCol = histHeaders.indexOf('property_id');
  var hVisitedCol = histHeaders.indexOf('visited_at');
  var hStatusCol = histHeaders.indexOf('status');
  var hMemoCol = histHeaders.indexOf('memo');

  var latestByPid = {};
  var visitCountByPid = {};
  var earliestByPid = {}; // created_atフォールバック用
  var tz = Session.getScriptTimeZone();

  for (var i = 1; i < histData.length; i++) {
    var pid = histData[i][hPidCol];
    var visited = histData[i][hVisitedCol];
    var memo = histData[i][hMemoCol] || '';
    if (!pid || !visited) continue;

    // Dateオブジェクトなら文字列化
    var visitedStr = (visited instanceof Date)
      ? Utilities.formatDate(visited, tz, 'yyyy/MM/dd HH:mm:ss')
      : String(visited);

    // 最新を記録（ステータス修正は除外）
    if (memo !== 'ステータス修正') {
      if (!latestByPid[pid] || visitedStr > latestByPid[pid]) {
        latestByPid[pid] = visitedStr;
      }
      if (!earliestByPid[pid] || visitedStr < earliestByPid[pid]) {
        earliestByPid[pid] = visitedStr;
      }
      // visit_count: 同日同物件は1回として、'再訪問'は別カウント
      visitCountByPid[pid] = (visitCountByPid[pid] || 0) + 1;
    }
  }

  // properties を更新
  var updated = 0;
  for (var i = 1; i < propData.length; i++) {
    var pid = propData[i][propIdCol];
    if (!pid) continue;
    var changed = false;
    if (latestByPid[pid]) {
      propSheet.getRange(i + 1, lastVisitCol + 1).setValue(latestByPid[pid]);
      changed = true;
    }
    if (!propData[i][createdCol] && earliestByPid[pid]) {
      propSheet.getRange(i + 1, createdCol + 1).setValue(earliestByPid[pid]);
      changed = true;
    }
    if (changed) updated++;
  }

  Logger.log('syncLastVisitFromHistory: Updated ' + updated + ' properties');
  return 'Updated ' + updated + ' properties from visit_history';
}

// Utility: 同じ座標の重複物件を統合し、visit_historyのproperty_idも付け替える
function dedupeByLocation() {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return 'No data';
  var headers = data[0];
  var idCol = headers.indexOf('id');
  var latCol = headers.indexOf('lat');
  var lngCol = headers.indexOf('lng');
  var updatedCol = headers.indexOf('updated_at');
  var visitCountCol = headers.indexOf('visit_count');

  // lat_lng をキーにして、最新の updated_at を持つ行を残す
  var bestByLoc = {};
  var idMapping = {}; // oldId -> newId

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var id = row[idCol];
    if (!id) continue;
    var lat = String(Number(row[latCol]).toFixed(7));
    var lng = String(Number(row[lngCol]).toFixed(7));
    var locKey = lat + '_' + lng;
    var u = String(row[updatedCol] || '');

    if (!bestByLoc[locKey]) {
      bestByLoc[locKey] = { row: row, id: id, u: u, totalVisits: Number(row[visitCountCol]) || 0 };
    } else {
      // 新しい方を残す
      bestByLoc[locKey].totalVisits += Number(row[visitCountCol]) || 0;
      if (u > bestByLoc[locKey].u) {
        idMapping[bestByLoc[locKey].id] = id; // 古いIDを新しいIDにマッピング
        bestByLoc[locKey].row = row;
        bestByLoc[locKey].id = id;
        bestByLoc[locKey].u = u;
      } else {
        idMapping[id] = bestByLoc[locKey].id; // このIDを勝者にマッピング
      }
    }
  }

  // visit_countを統合（最大値を採用）
  var keptRows = [];
  var locKeys = Object.keys(bestByLoc);
  for (var k = 0; k < locKeys.length; k++) {
    var entry = bestByLoc[locKeys[k]];
    entry.row[visitCountCol] = entry.totalVisits;
    keptRows.push(entry.row);
  }

  // propertiesシート書き直し
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (keptRows.length > 0) {
    sheet.getRange(2, 1, keptRows.length, headers.length).setValues(keptRows);
  }

  // visit_historyのproperty_idを付け替え
  var histSheet = getHistorySheet();
  var histData = histSheet.getDataRange().getValues();
  if (histData.length > 1) {
    var histHeaders = histData[0];
    var histPidCol = histHeaders.indexOf('property_id');
    var remapped = 0;
    for (var i = 1; i < histData.length; i++) {
      var oldPid = histData[i][histPidCol];
      if (idMapping[oldPid]) {
        histSheet.getRange(i + 1, histPidCol + 1).setValue(idMapping[oldPid]);
        remapped++;
      }
    }
    Logger.log('Remapped ' + remapped + ' visit_history records');
  }

  var removed = (data.length - 1) - keptRows.length;
  Logger.log('dedupeByLocation: Kept ' + keptRows.length + ', removed ' + removed + ', remapped ' + Object.keys(idMapping).length + ' IDs');
  return 'Kept ' + keptRows.length + ', removed ' + removed;
}

function createProperty(data) {
  var sheet = getSheet();
  var id = data.id || Utilities.getUuid();
  var now = new Date().toISOString();

  // 同じIDまたは同じ座標の既存物件がある場合はupdateにフォールバック
  var allData = sheet.getDataRange().getValues();
  if (allData.length > 1) {
    var headers = allData[0];
    var idCol = headers.indexOf('id');
    var latCol = headers.indexOf('lat');
    var lngCol = headers.indexOf('lng');
    for (var i = 1; i < allData.length; i++) {
      if (allData[i][idCol] === id) {
        // 同じIDが既にある → updateに切り替え
        data.id = id;
        return updateProperty(data);
      }
      if (data.lat && data.lng &&
          Number(allData[i][latCol]).toFixed(6) === Number(data.lat).toFixed(6) &&
          Number(allData[i][lngCol]).toFixed(6) === Number(data.lng).toFixed(6)) {
        // 同じ座標 → 既存を更新
        data.id = allData[i][idCol];
        return updateProperty(data);
      }
    }
  }

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
  // 空文字列や空で既存データを上書きしないフィールド
  var protectedIfEmpty = ['last_visit_date', 'created_at', 'status', 'staff', 'name'];
  for (var i = 1; i < allData.length; i++) {
    if (allData[i][idCol] === data.id) {
      for (var j = 0; j < headers.length; j++) {
        var key = headers[j];
        if (key === 'id' || key === 'created_at') continue;
        if (data[key] === undefined) continue;
        // 空文字列で既存の非空値を上書きしない
        if ((data[key] === '' || data[key] === null) &&
            allData[i][j] !== '' && allData[i][j] !== null &&
            protectedIfEmpty.indexOf(key) !== -1) continue;
        sheet.getRange(i + 1, j + 1).setValue(data[key]);
      }
      var updatedAtCol = headers.indexOf('updated_at');
      sheet.getRange(i + 1, updatedAtCol + 1).setValue(new Date().toISOString());
      return data;
    }
  }
  Logger.log('updateProperty: ID not found, skipping: ' + data.id);
  return data;
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
  var visitedAtCol = headers.indexOf('visited_at');
  var results = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var val = data[i][j];
      // visited_at がDateオブジェクトの場合、JSTの文字列に変換（UTC変換を防ぐ）
      if (j === visitedAtCol && val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss');
      }
      obj[headers[j]] = val;
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
