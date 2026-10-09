/**
 * 0단계 시험용 최소 Apps Script. 1단계 코드와 섞지 않고, 시험이 끝나면 배포를 보관(archive)한다.
 * 시트에 붙은(컨테이너 바인딩) 스크립트로 만든다.
 *
 * GET  ?action=ping   시트를 열지 않는 왕복
 * GET  ?action=read   시트를 열어 getValues 한 번 (bootstrap에 가까운 왕복)
 * POST {action:'echo', text}            본문 왕복, 한글·이모지 확인
 * POST {action:'formula', inputs:[…]}   쓰는 방식별로 시트에 쓰고 다시 읽기(stage0_text2 탭)
 * POST {action:'report', ua, kakao, summary}  기기별 결과를 stage0_log 탭에 남기기
 *
 * @OnlyCurrentDoc
 */

var TZ = 'Asia/Seoul';
var TEXT_SHEET = 'stage0_text2';
var LOG_SHEET = 'stage0_log';
var MAX_INPUTS = 20;
var MAX_INPUT_LEN = 200;
var MAX_SUMMARY_LEN = 20000;

function doGet(e) {
  var t0 = Date.now();
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'ping') return out_(t0, { action: 'ping' }, null);
    if (p.action === 'read') return out_(t0, readSheet_(), null);
    return out_(t0, null, { code: 'INVALID', message: 'unknown action' });
  } catch (err) {
    return out_(t0, null, { code: 'INVALID', message: String(err) });
  }
}

function doPost(e) {
  var t0 = Date.now();
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return out_(t0, null, { code: 'INVALID', message: 'bad json' });
  }
  try {
    if (body.action === 'echo') {
      return out_(t0, {
        action: 'echo',
        text: String(body.text || ''),
        content_type: e.postData.type,
        length: e.postData.length
      }, null);
    }
    if (body.action === 'formula' || body.action === 'report') {
      var lock = LockService.getScriptLock();
      var tl = Date.now();
      if (!lock.tryLock(10000)) return out_(t0, null, { code: 'BUSY', message: 'lock timeout' });
      try {
        var lockMs = Date.now() - tl;
        var data = body.action === 'formula' ? formulaTest_(body.inputs) : report_(body);
        data.lock_ms = lockMs;
        return out_(t0, data, null);
      } finally {
        lock.releaseLock();
      }
    }
    return out_(t0, null, { code: 'INVALID', message: 'unknown action' });
  } catch (err) {
    return out_(t0, null, { code: 'INVALID', message: String(err) });
  }
}

/** 편집기에서 한 번 실행해 권한을 주고 시험 탭을 만든다. */
function setupStage0() {
  var ss = ss_();
  textSheet_();
  logSheet_();
  Logger.log('시트: %s / 시간대: %s / 지금: %s', ss.getName(), Session.getScriptTimeZone(), kst_());
}

function readSheet_() {
  var sh = textSheet_();
  var values = sh.getDataRange().getValues();
  return { action: 'read', rows: values.length, max_rows: sh.getMaxRows() };
}

/**
 * 같은 값을 쓰는 방식별로 한 칸씩 넣고 다시 읽는다. 1차 시험에서 @ 서식만으로는 '='가
 * 수식이 되고, appendRow는 값을 해석해 서식을 덮어쓴다는 것을 확인해 후보 방식을 비교한다.
 *  A at         @ 서식 + setValue (KST 문자열이 날짜로 바뀌지 않는지)
 *  B appendRow  appendRow로 그대로
 *  C raw        @ 서식 + setValues 그대로
 *  D quote_all  @ 서식 + setValues, 모든 글 앞에 '
 *  E quote_risky @ 서식 + setValues, = + - @ ' 로 시작할 때만 앞에 '
 *  F rich       @ 서식 + setRichTextValue
 */
var FORMULA_COLUMNS = ['at', 'appendRow', 'raw', 'quote_all', 'quote_risky', 'rich'];

function formulaTest_(inputs) {
  if (!Array.isArray(inputs) || !inputs.length) throw new Error('inputs required');
  inputs = inputs.slice(0, MAX_INPUTS).map(function (s) { return String(s).slice(0, MAX_INPUT_LEN); });
  var sh = textSheet_();
  var at = kst_();
  var rows = [];
  inputs.forEach(function (s) {
    sh.appendRow(['', s]);
    var r = sh.getLastRow();
    sh.getRange(r, 1).setNumberFormat('@').setValue(at);
    sh.getRange(r, 3, 1, 3).setNumberFormat('@').setValues([[s, "'" + s, quoteRisky_(s)]]);
    sh.getRange(r, 6).setNumberFormat('@').setRichTextValue(SpreadsheetApp.newRichTextValue().setText(s).build());
    rows.push(r);
  });
  SpreadsheetApp.flush();
  var results = rows.map(function (r, i) {
    var rg = sh.getRange(r, 1, 1, FORMULA_COLUMNS.length);
    return {
      row: r,
      input: inputs[i],
      value: rg.getValues()[0].map(describe_),
      formula: rg.getFormulas()[0],
      display: rg.getDisplayValues()[0],
      format: rg.getNumberFormats()[0]
    };
  });
  return { action: 'formula', at: at, columns: FORMULA_COLUMNS, results: results };
}

function quoteRisky_(s) {
  return /^[=+\-@']/.test(s) ? "'" + s : s;
}

function report_(body) {
  var sh = logSheet_();
  sh.appendRow([
    kst_(),
    String(body.kakao || '').slice(0, 40),
    String(body.ua || '').slice(0, 500),
    String(body.summary || '').slice(0, MAX_SUMMARY_LEN)
  ]);
  return { action: 'report', row: sh.getLastRow() };
}

/** 읽은 값의 형식을 그대로 보여 주기 위해 {type, value}로 바꾼다. */
function describe_(v) {
  if (v instanceof Date) return { type: 'date', value: Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ssXXX") };
  return { type: typeof v, value: v };
}

function textSheet_() {
  var ss = ss_();
  var sh = ss.getSheetByName(TEXT_SHEET);
  if (sh) return sh;
  var n = FORMULA_COLUMNS.length;
  sh = ss.insertSheet(TEXT_SHEET);
  if (sh.getMaxColumns() > n) sh.deleteColumns(n + 1, sh.getMaxColumns() - n);
  // 격자를 작게 두어 appendRow가 새 행을 만들게 한다.
  if (sh.getMaxRows() > 2) sh.deleteRows(3, sh.getMaxRows() - 2);
  sh.getRange(1, 1, 1, n).setValues([FORMULA_COLUMNS]);
  sh.setFrozenRows(1);
  return sh;
}

function logSheet_() {
  var ss = ss_();
  var sh = ss.getSheetByName(LOG_SHEET);
  if (sh) return sh;
  sh = ss.insertSheet(LOG_SHEET);
  sh.getRange('A:D').setNumberFormat('@');
  sh.getRange(1, 1, 1, 4).setValues([['at', 'kakao', 'ua', 'summary']]);
  sh.setFrozenRows(1);
  return sh;
}

function ss_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('스크립트가 시트에 붙어 있지 않아요. 시트의 확장 프로그램 > Apps Script에서 만들어 주세요.');
  return ss;
}

function kst_() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/** 응답은 기획서대로 {ok, data, error, rev}. at과 server_ms는 0단계 측정용으로만 붙인다. */
function out_(t0, data, error) {
  var rev = Number(PropertiesService.getScriptProperties().getProperty('REV') || 0);
  var body = { ok: !error, data: data, error: error, rev: rev, at: kst_(), server_ms: Date.now() - t0 };
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
