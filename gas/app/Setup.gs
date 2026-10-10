/**
 * 한 번에 세팅하는 함수(기획서 5-1). 편집기에서 실행한다. 여러 번 실행해도 안전하다.
 * 처음에는 setupAll 하나만 실행하면 된다.
 */

function setupAll() {
  setupSheets();
  setupProperties();
  setupTriggers();
}

/** 탭 여섯 개, 머리글 고정·보호, 서식, 드롭다운, 프리셋. 이미 있는 탭과 행은 건드리지 않는다. */
function setupSheets() {
  var ss = ss_();
  Object.keys(SCHEMA).forEach(function (name) {
    var cols = SCHEMA[name];
    var sh = ss.getSheetByName(name);
    var created = false;
    if (!sh) {
      sh = ss.insertSheet(name);
      created = true;
    }
    if (sh.getMaxColumns() < cols.length) sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());
    if (created) {
      if (sh.getMaxColumns() > cols.length) sh.deleteColumns(cols.length + 1, sh.getMaxColumns() - cols.length);
      sh.getRange(1, 1, 1, cols.length).setValues([cols.map(function (c) { return c[0]; })]).setFontWeight('bold');
      sh.setFrozenRows(1);
      var rows = sh.getMaxRows() - 1;
      sh.getRange(2, 1, rows, cols.length).setNumberFormats(
        Array.apply(null, Array(rows)).map(function () { return formats_(name); }));
      sh.getRange(1, 1, 1, cols.length).protect().setDescription(name + ' 머리글').setWarningOnly(true);
      sh.getRange(2, 1, rows, 1).protect().setDescription(name + ' id 열').setWarningOnly(true);
      cols.forEach(function (c, i) { if (c[1] === 't') sh.setColumnWidth(i + 1, 160); });
    }
  });
  addValidation_('ideas', 'status', DEFAULTS.statuses);
  addValidation_('replies', 'kind', DEFAULTS.reply_kinds);
  fillPresets_();
  Logger.log('setupSheets 끝: ' + Object.keys(SCHEMA).join(', '));
}

function addValidation_(name, col, values) {
  var sh = sheet_(name);
  var idx = SCHEMA[name].map(function (c) { return c[0]; }).indexOf(col) + 1;
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
  sh.getRange(2, idx, sh.getMaxRows() - 1, 1).setDataValidation(rule);
}

function presetConfigRows_() {
  return Object.keys(DEFAULTS).map(function (k) {
    var v = DEFAULTS[k];
    return { key: k, values: Array.isArray(v) ? v.join(',') : String(v) };
  });
}

function presetQuestionRows_() {
  var now = kstNow_();
  return DEFAULT_QUESTIONS.map(function (text, i) {
    return { id: newId_('Q'), text: text, order: i + 1, active: true, created_at: now };
  });
}

/** 빈 탭에만 프리셋을 채운다. config는 빠진 키만 더한다. */
function fillPresets_() {
  var have = {};
  table_('config').forEach(function (r) { have[String(r.key).trim()] = 1; });
  var missing = presetConfigRows_().filter(function (r) { return !have[r.key]; });
  appendRows_('config', missing);

  if (!table_('questions').length) appendRows_('questions', presetQuestionRows_());

  if (!table_('ideas').length) {
    var now = kstNow_();
    appendRows_('ideas', SEEDS.map(function (s) {
      return {
        id: newId_('I'), created_at: now, updated_at: now, title: s[0], summary: '', detail: '', age: '',
        seat: s[1], setting: '', verse: '', status: '씨앗', question_id: '', parent_ids: '', waters: 0,
        author: SEED_AUTHOR, deleted: false, last_activity_at: now, reply_count: 0, last_reply_preview: '',
        report_count: 0, hidden: false, edit_token_hash: '', device_id: 'seed', request_id: '', flagged: false
      };
    }));
  }
}

/**
 * EDIT_CODE, ADMIN_CODE, REV, SALT를 넣는다. 이미 있으면 그대로 둔다.
 * 로그는 스크립트 편집 권한이 있는 사람이 볼 수 있으므로, 운영 전에 관리 화면에서 두 코드를 바꾼다.
 */
function setupProperties() {
  var p = props_();
  if (!p.getProperty('EDIT_CODE')) {
    p.setProperty('EDIT_CODE', '다섯사람' + String(Math.floor(1000 + Math.random() * 9000)));
  }
  if (!p.getProperty('ADMIN_CODE')) p.setProperty('ADMIN_CODE', randomCode_(20));
  if (!p.getProperty('REV')) p.setProperty('REV', '0');
  if (!p.getProperty('SALT')) p.setProperty('SALT', Utilities.getUuid());
  Logger.log('참여 코드: %s', p.getProperty('EDIT_CODE'));
  Logger.log('관리 코드: %s', p.getProperty('ADMIN_CODE'));
  Logger.log('운영 전에 관리 화면에서 두 코드를 바꿔 주세요.');
}

function randomCode_(n) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  var s = '';
  for (var i = 0; i < n; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

/** 주간 백업(월요일 새벽 3시)과 매일 guard 정리(새벽 4시). 같은 트리거가 있으면 지우고 다시 만든다. */
function setupTriggers() {
  ['weeklyBackup', 'dailyGuardCleanup'].forEach(function (fn) {
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === fn) ScriptApp.deleteTrigger(t);
    });
  });
  ScriptApp.newTrigger('weeklyBackup').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(3).create();
  ScriptApp.newTrigger('dailyGuardCleanup').timeBased().everyDays(1).atHour(4).create();
  Logger.log('트리거: weeklyBackup(월 3시), dailyGuardCleanup(매일 4시)');
}

/** 관리자 전용: config와 questions만 프리셋으로 되돌린다. 아이디어와 이어 쓰기는 지우지 않는다. */
function resetPresets() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    rewriteTable_('config', presetConfigRows_());
    rewriteTable_('questions', presetQuestionRows_());
    bumpRev_();
    Logger.log('config와 questions를 프리셋으로 되돌렸어요.');
  } finally {
    lock.releaseLock();
  }
}
