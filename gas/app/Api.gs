/**
 * 웹 앱 입구. 응답은 항상 {ok, data, error, rev}(기획서 6장).
 * 화면은 헤더 없이 요청한다. POST 본문은 JSON 문자열 하나(text/plain).
 */

// 파일은 순서대로 읽히므로, 다른 파일의 함수를 가리키는 표는 요청 때 만든다.
function getActions_() {
  return {
    bootstrap: getBootstrap_,
    feed: getFeed_,
    idea: getIdea_,
    mine: getMine_
  };
}

function postActions_() {
  return {
    check_code: postCheckCode_,
    create: postCreate_,
    reply: postReply_,
    update: postUpdate_,
    remove: postRemove_,
    water: postWater_,
    report: postReport_,
    visit: postVisit_,
    admin_list: postAdminList_,
    hide: postHide_,
    unhide: postUnhide_,
    erase: postErase_,
    digest: postDigest_,
    stats: postStats_,
    set_code: postSetCode_
  };
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  return run_(function () {
    var fn = getActions_()[p.action];
    if (!fn) fail_('INVALID', 'action');
    return fn(p);
  });
}

function doPost(e) {
  return run_(function () {
    var body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      fail_('INVALID', 'json');
    }
    if (!body || typeof body !== 'object') fail_('INVALID', 'json');
    var fn = postActions_()[body.action];
    if (!fn) fail_('INVALID', 'action');
    return fn(body);
  });
}

function run_(fn) {
  var out;
  try {
    out = { ok: true, data: fn(), error: null };
  } catch (err) {
    if (err instanceof ApiError) {
      out = { ok: false, data: null, error: { code: err.code, message: err.message } };
    } else {
      console.error(err && err.stack || err);
      out = { ok: false, data: null, error: { code: 'INVALID', message: String(err && err.message || err) } };
    }
  }
  out.rev = rev_();
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** 모든 쓰기는 스크립트 잠금 안에서. 10초 안에 못 얻으면 BUSY. */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) fail_('BUSY');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** rev가 바뀌면 키가 바뀌므로 쓰기 뒤에는 바로 새 값을 읽는다. 100KB를 넘으면 캐시하지 않는다. */
function cached_(key, fn) {
  var c = cache_();
  var full = key + '_v' + rev_();
  var hit = c.get(full);
  if (hit) return JSON.parse(hit);
  var data = fn();
  var json = JSON.stringify(data);
  if (json.length < 95000) c.put(full, json, config_().cache_sec);
  return data;
}
