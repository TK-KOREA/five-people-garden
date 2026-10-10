/**
 * 코드 확인, 잠금, 횟수 제한, 입력 검사, 개인정보 감지(기획서 5-1, 6장).
 */

function ApiError(code, message) {
  this.code = code;
  this.message = message || code;
}

function fail_(code, message) {
  throw new ApiError(code, message);
}

function cache_() {
  return CacheService.getScriptCache();
}

function incr_(key, ttl) {
  var c = cache_();
  var n = Number(c.get(key) || 0) + 1;
  c.put(key, String(n), ttl);
  return n;
}

/** 편집 코드는 공백과 대소문자를 무시한다(기획서 3-5). */
function normalizeCode_(s) {
  return String(s || '').replace(/\s+/g, '').toLowerCase();
}

/**
 * which: 'edit' 또는 'admin'. 틀리면 그 기기만 10분 잠근다. 전체 기준은 공격만 막도록 넉넉하게.
 */
function checkCode_(which, code, deviceId) {
  var rule = LOCK[which];
  var dev = String(deviceId || 'none').slice(0, 64);
  var devKey = 'fail_' + which + '_' + dev;
  var hourKey = 'fail_' + which + '_all_' + Utilities.formatDate(new Date(), TZ, 'yyyyMMddHH');
  var c = cache_();
  if (Number(c.get(devKey) || 0) >= rule.perDevice) fail_('LOCKED_OUT');
  if (Number(c.get(hourKey) || 0) >= rule.global) fail_('LOCKED_OUT');

  var stored = props_().getProperty(which === 'edit' ? 'EDIT_CODE' : 'ADMIN_CODE') || '';
  var ok = stored !== '' && (which === 'edit'
    ? normalizeCode_(code) === normalizeCode_(stored)
    : String(code || '') === stored);
  if (ok) return true;
  incr_(devKey, LOCK.windowSec);
  incr_(hourKey, LOCK.globalWindowSec);
  fail_(which === 'edit' ? 'BAD_EDIT_CODE' : 'BAD_ADMIN_CODE');
}

/** 관리 action은 관리 코드와 이름을 함께 받는다. */
function requireAdmin_(body) {
  checkCode_('admin', body.admin_code, body.device_id);
  var name = String(body.admin_name || '').trim().slice(0, 20);
  if (!name) fail_('INVALID', 'admin_name');
  return name;
}

/** 쓰기 횟수 제한. 잠금 안에서 부른다. */
function checkRate_(deviceId) {
  var cfg = config_();
  var minute = Utilities.formatDate(new Date(), TZ, 'yyyyMMddHHmm');
  var c = cache_();
  var devKey = 'w_' + String(deviceId).slice(0, 64) + '_' + minute;
  var allKey = 'w_all_' + minute;
  if (Number(c.get(devKey) || 0) >= cfg.rate_write_per_min) fail_('RATE_LIMIT');
  if (Number(c.get(allKey) || 0) >= cfg.rate_write_global_per_min) fail_('RATE_LIMIT');
  incr_(devKey, 120);
  incr_(allKey, 120);
}

// ---------- 입력 검사 ----------

/** 글자 수는 이모지도 한 글자로 센다(UTF-16 단위로 세면 이모지가 둘로 쪼개진다). */
function charLen_(s) {
  return Array.from(String(s)).length;
}

/** 앞에서 n글자와 나머지로 나눈다. 이모지 한가운데서 자르지 않는다. */
function cutChars_(s, n) {
  var chars = Array.from(String(s));
  return [chars.slice(0, n).join(''), chars.slice(n).join('')];
}

function str_(v, max, field, required) {
  var s = v == null ? '' : String(v).replace(/\r\n?/g, '\n').trim();
  if (required && !s) fail_('INVALID', field + ' 필요');
  if (charLen_(s) > max) fail_('INVALID', field + ' 길이');
  return s;
}

/** 쉼표로 받은 목록 값을 config 목록으로 검사하고 쉼표로만 붙인다. */
function listValue_(v, allowed, field, required) {
  var items = Array.isArray(v) ? v : String(v || '').split(',');
  items = items.map(function (x) { return String(x).trim(); }).filter(String);
  var seen = {};
  items = items.filter(function (x) { if (seen[x]) return false; seen[x] = true; return true; });
  items.forEach(function (x) { if (allowed.indexOf(x) < 0) fail_('INVALID', field + ' 값'); });
  if (required && !items.length) fail_('INVALID', field + ' 필요');
  return items.join(',');
}

function idValue_(v, prefix, field) {
  var s = String(v || '');
  if (!ID_RE.test(s) || (prefix && s.charAt(0) !== prefix)) fail_('INVALID', field || 'id');
  return s;
}

function deviceValue_(v) {
  var s = String(v || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(s)) fail_('INVALID', 'device_id');
  return s;
}

function requestValue_(v) {
  var s = String(v || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(s)) fail_('INVALID', 'request_id');
  return s;
}

// ---------- 개인정보 감지 (저장은 막지 않고 flagged로 표시) ----------

var PHONE_RE = /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/;
var EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/;
var NAME_RE = /([가-힣]{2,3})(이가|이는|이를|이랑|네 집|네 가정)/g;
var NAME_EXCLUDE = ['어린', '어린이', '아이', '형제', '자매', '부모', '성도', '우리', '친구', '선배', '후배',
  '동생', '언니', '오빠', '누나', '가족', '이웃', '사람', '선생님', '선생', '교사', '학생', '할머니',
  '할아버지', '어른', '아기', '막내', '첫째', '둘째', '셋째', '조부모', '다른'];

function looksPrivate_(texts) {
  for (var i = 0; i < texts.length; i++) {
    var t = String(texts[i] || '');
    if (PHONE_RE.test(t) || EMAIL_RE.test(t)) return true;
    NAME_RE.lastIndex = 0;
    var m;
    while ((m = NAME_RE.exec(t))) {
      var word = m[1];
      var excluded = NAME_EXCLUDE.some(function (x) { return word === x || word.slice(-x.length) === x; });
      if (!excluded) return true;
    }
  }
  return false;
}

/** 경고를 무시하고 저장된 글을 TK에게 메일로 알린다(기획서 5-1). 실패해도 저장은 그대로. */
function mailFlagged_(kind, id, ideaId, text) {
  try {
    var to = Session.getEffectiveUser().getEmail();
    if (!to) return;
    MailApp.sendEmail(to, '[' + APP_NAME + '] 개인정보 경고를 무시하고 저장된 ' + kind,
      kind + ' ' + id + '\n\n' + text + '\n\n' + PUBLIC_URL + '#/idea/' + ideaId +
      '\n\n관리 화면에서 고치거나 숨길 수 있어요.');
  } catch (e) {
    console.warn('mailFlagged_ ' + e);
  }
}
