/**
 * 시트 읽기·쓰기. 한 요청에서 탭마다 getValues는 한 번만 부른다(기획서 6장 읽기 성능).
 * 쓰기는 appendRow를 쓰지 않고, 행 범위에 서식을 건 뒤 setValues로 쓴다(0단계 결과).
 */

function ss_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('스크립트가 시트에 붙어 있지 않아요.');
  return ss;
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('탭이 없어요: ' + name + ' (setupSheets를 실행해 주세요)');
  return sh;
}

/**
 * 탭 전체를 객체 배열로 읽는다. 각 행에 _row(시트 행 번호)를 붙인다.
 * 같은 요청 안에서 다시 부르면 처음 읽은 것을 돌려준다.
 */
var tableCache_ = {};
function table_(name) {
  if (tableCache_[name]) return tableCache_[name];
  var sh = sheet_(name);
  var cols = SCHEMA[name];
  var last = sh.getLastRow();
  var rows = [];
  if (last >= 2) {
    var values = sh.getRange(2, 1, last - 1, cols.length).getValues();
    for (var i = 0; i < values.length; i++) {
      var obj = { _row: i + 2 };
      for (var c = 0; c < cols.length; c++) obj[cols[c][0]] = readCell_(values[i][c], cols[c][1]);
      rows.push(obj);
    }
  }
  tableCache_[name] = rows;
  return rows;
}

function readCell_(v, type) {
  if (type === 'n') return Number(v) || 0;
  if (type === 'b') return v === true || String(v).toUpperCase() === 'TRUE';
  if (v instanceof Date) return Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
  return v == null ? '' : String(v);
}

/** 글은 앞에 '를 붙여 수식·숫자·날짜로 바뀌지 않게 한다. 시트가 '를 떼고 저장한다. */
function writeCell_(v, type) {
  if (type === 'n') return Number(v) || 0;
  if (type === 'b') return v ? "'TRUE" : "'FALSE";
  var s = v == null ? '' : String(v);
  return s === '' ? '' : "'" + s;
}

function formats_(name) {
  return SCHEMA[name].map(function (c) { return c[1] === 'n' ? '0' : '@'; });
}

/** 새 행들을 맨 아래에 한 번에 쓴다. 표 캐시에도 넣는다. */
function appendRows_(name, objs) {
  if (!objs.length) return;
  var sh = sheet_(name);
  var cols = SCHEMA[name];
  var start = sh.getLastRow() + 1;
  var need = start + objs.length - 1 - sh.getMaxRows();
  if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need);
  var fmt = formats_(name);
  var range = sh.getRange(start, 1, objs.length, cols.length);
  range.setNumberFormats(objs.map(function () { return fmt; }));
  range.setValues(objs.map(function (o) {
    return cols.map(function (c) { return writeCell_(o[c[0]], c[1]); });
  }));
  if (tableCache_[name]) {
    objs.forEach(function (o, i) { o._row = start + i; tableCache_[name].push(o); });
  }
}

/** 이미 읽은 행 객체(_row 있음)를 통째로 다시 쓴다. */
function saveRow_(name, obj) {
  var sh = sheet_(name);
  var cols = SCHEMA[name];
  var range = sh.getRange(obj._row, 1, 1, cols.length);
  range.setNumberFormats([formats_(name)]);
  range.setValues([cols.map(function (c) { return writeCell_(obj[c[0]], c[1]); })]);
}

/** 탭의 데이터 행을 모두 지우고 다시 쓴다(guard 정리, config 되돌리기). */
function rewriteTable_(name, objs) {
  var sh = sheet_(name);
  var cols = SCHEMA[name];
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, cols.length).clearContent();
  delete tableCache_[name];
  if (objs.length) {
    var start = 2;
    var need = start + objs.length - 1 - sh.getMaxRows();
    if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need);
    var fmt = formats_(name);
    var range = sh.getRange(start, 1, objs.length, cols.length);
    range.setNumberFormats(objs.map(function () { return fmt; }));
    range.setValues(objs.map(function (o) {
      return cols.map(function (c) { return writeCell_(o[c[0]], c[1]); });
    }));
  }
}

function findById_(name, id) {
  var rows = table_(name);
  for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
  return null;
}

// ---------- 시간과 id ----------

function kstNow_() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function kstDate_(d) {
  return Utilities.formatDate(d || new Date(), TZ, 'yyyy-MM-dd');
}

function newId_(prefix) {
  var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var s = '';
  for (var i = 0; i < 6; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return prefix + '-' + Utilities.formatDate(new Date(), TZ, 'yyyyMMdd') + '-' + s;
}

function sha256_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

// ---------- 설정과 rev ----------

var configCache_ = null;
/** config 탭을 읽어 DEFAULTS 위에 덮는다. 잘못된 값은 기본값을 쓴다. */
function config_() {
  if (configCache_) return configCache_;
  var cfg = JSON.parse(JSON.stringify(DEFAULTS));
  try {
    table_('config').forEach(function (r) {
      var key = String(r.key).trim();
      if (!(key in DEFAULTS)) return;
      if (LIST_KEYS.indexOf(key) >= 0) {
        var list = String(r.values).split(',').map(function (x) { return x.trim(); }).filter(String);
        if (list.length) cfg[key] = list;
      } else {
        var n = Number(String(r.values).trim());
        if (isFinite(n) && n > 0) cfg[key] = n;
      }
    });
  } catch (e) {
    // config 탭이 없으면 기본값으로 돈다.
  }
  configCache_ = cfg;
  return cfg;
}

function props_() {
  return PropertiesService.getScriptProperties();
}

function rev_() {
  return Number(props_().getProperty('REV') || 0);
}

/** 쓰기마다 부른다. 잠금 안에서만. */
function bumpRev_() {
  var r = rev_() + 1;
  props_().setProperty('REV', String(r));
  return r;
}

function addLog_(action, targetId, before, after, author, adminName) {
  appendRows_('log', [{
    at: kstNow_(),
    action: action,
    target_id: targetId || '',
    before: before == null ? '' : (typeof before === 'string' ? before : JSON.stringify(before)),
    after: after == null ? '' : (typeof after === 'string' ? after : JSON.stringify(after)),
    author: author || '',
    admin_name: adminName || ''
  }]);
}
