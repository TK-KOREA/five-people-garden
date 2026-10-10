/**
 * 읽기(bootstrap, feed, idea, mine)와 성도 쓰기(check_code, create, reply, update, remove, water, report, visit).
 */

// ---------- 화면으로 내보내는 모양 ----------

/** 같은 기기의 글을 묶어 접기 위한 짧은 열쇠. device_id 자체는 내보내지 않는다. */
function deviceKey_(deviceId) {
  if (!deviceId) return '';
  var salt = props_().getProperty('SALT') || '';
  return sha256_(salt + deviceId).slice(0, 10);
}

/** 숨김이면 안 보이고, 지운 생각은 이어 쓰기가 있을 때만 "지워진 생각" 카드로 남는다. */
function ideaVisible_(r) {
  return !r.hidden && (!r.deleted || r.reply_count > 0);
}

function replyVisible_(r) {
  return !r.hidden && !r.deleted;
}

function feedItem_(r) {
  if (r.deleted) {
    return {
      id: r.id, deleted: true, created_at: r.created_at, last_activity_at: r.last_activity_at,
      seat: r.seat, status: r.status, reply_count: r.reply_count, last_reply_preview: r.last_reply_preview,
      title: '', summary: '', author: '', waters: 0, dk: ''
    };
  }
  return {
    id: r.id, created_at: r.created_at, updated_at: r.updated_at, last_activity_at: r.last_activity_at,
    title: r.title, summary: r.summary, has_detail: r.detail.length > r.summary.length,
    seat: r.seat, age: r.age, setting: r.setting, verse: r.verse, status: r.status,
    question_id: r.question_id, parent_ids: r.parent_ids, waters: r.waters, author: r.author,
    reply_count: r.reply_count, last_reply_preview: r.last_reply_preview, dk: deviceKey_(r.device_id)
  };
}

function ideaFull_(r) {
  var item = feedItem_(r);
  if (!r.deleted) item.detail = r.detail;
  return item;
}

function replyItem_(r, idea) {
  return {
    id: r.id, idea_id: r.idea_id, kind: r.kind, text: r.text, author: r.author, waters: r.waters,
    created_at: r.created_at, updated_at: r.updated_at,
    is_op: !!(idea && idea.device_id && r.device_id === idea.device_id),
    dk: deviceKey_(r.device_id)
  };
}

function sortFeed_(a, b) {
  if (a.last_activity_at !== b.last_activity_at) return a.last_activity_at < b.last_activity_at ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function hasSeat_(r, seat) {
  return String(r.seat).split(',').indexOf(seat) >= 0;
}

/** 연결 띠 숫자: 숨김·삭제를 뺀 전체 글. 여러 연결이면 각 연결에 1씩(기획서 5-1). */
function counts_() {
  var cfg = config_();
  var counts = { '전체': 0 };
  cfg.seats.forEach(function (s) { counts[s] = 0; });
  table_('ideas').forEach(function (r) {
    if (r.hidden || r.deleted) return;
    counts['전체']++;
    String(r.seat).split(',').forEach(function (s) { if (s in counts) counts[s]++; });
  });
  return counts;
}

/** KST 2026-01-01부터 지난 날 수를 질문 수로 나눈 나머지 번째(기획서 5-1). */
function todayQuestion_() {
  var qs = table_('questions').filter(function (q) { return q.active; })
    .sort(function (a, b) { return a.order - b.order; });
  if (!qs.length) return null;
  var today = new Date(kstDate_() + 'T00:00:00+09:00');
  var start = new Date('2026-01-01T00:00:00+09:00');
  var days = Math.floor((today - start) / 86400000);
  var q = qs[((days % qs.length) + qs.length) % qs.length];
  return { id: q.id, text: q.text };
}

function clientConfig_() {
  var cfg = config_();
  var colors = {};
  cfg.seat_colors.forEach(function (x) {
    var m = String(x).match(/^(.+?):(#[0-9A-Fa-f]{6})\/(#[0-9A-Fa-f]{6})$/);
    if (m) colors[m[1].trim()] = { bg: m[2], fg: m[3] };
  });
  return {
    seats: cfg.seats, seat_colors: colors, ages: cfg.ages, settings: cfg.settings, statuses: cfg.statuses,
    reply_kinds: cfg.reply_kinds, nicknames: cfg.nicknames, page_size: cfg.page_size,
    limits: {
      title: cfg.limit_title, detail: cfg.limit_detail, reply: cfg.limit_reply,
      author: cfg.limit_author, verse: cfg.limit_verse
    }
  };
}

function feedPage_(seat, cursor) {
  var cfg = config_();
  var list = table_('ideas').filter(ideaVisible_);
  if (seat) list = list.filter(function (r) { return hasSeat_(r, seat); });
  list.sort(sortFeed_);
  if (cursor) {
    var parts = String(cursor).split('|');
    list = list.filter(function (r) {
      return r.last_activity_at < parts[0] || (r.last_activity_at === parts[0] && r.id < parts[1]);
    });
  }
  var page = list.slice(0, cfg.page_size);
  var last = page[page.length - 1];
  return {
    items: page.map(feedItem_),
    next_cursor: list.length > page.length && last ? last.last_activity_at + '|' + last.id : null
  };
}

// ---------- GET ----------

function getBootstrap_() {
  return cached_('boot', function () {
    var page = feedPage_('', '');
    return {
      config: clientConfig_(),
      today_question: todayQuestion_(),
      counts: counts_(),
      items: page.items,
      next_cursor: page.next_cursor,
      server_time: kstNow_()
    };
  });
}

function getFeed_(p) {
  var seat = String(p.seat || '');
  if (seat && config_().seats.indexOf(seat) < 0) fail_('INVALID', 'seat');
  var cursor = String(p.cursor || '');
  if (cursor && !/^[0-9T:+\-]{25}\|I-\d{8}-[a-z0-9]{6}$/.test(cursor)) fail_('INVALID', 'cursor');
  return cached_('feed_' + seat + '_' + cursor, function () { return feedPage_(seat, cursor); });
}

function getIdea_(p) {
  var id = idValue_(p.id, 'I');
  return cached_('idea_' + id, function () {
    var idea = findById_('ideas', id);
    if (!idea || !ideaVisible_(idea)) fail_('NOT_FOUND');
    var replies = table_('replies').filter(function (r) { return r.idea_id === id && replyVisible_(r); })
      .sort(function (a, b) { return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0; });
    var branches = table_('ideas').filter(function (r) {
      return !r.hidden && !r.deleted && String(r.parent_ids).split(',').indexOf(id) >= 0;
    });
    return {
      idea: ideaFull_(idea),
      replies: replies.map(function (r) { return replyItem_(r, idea); }),
      branches: branches.map(function (r) { return { id: r.id, title: r.title }; })
    };
  });
}

/** 기기에 있는 내 글 id로 내 생각과 이어 쓰기를 모은다. 숨긴 글은 숨김 표시만 보낸다. */
function getMine_(p) {
  var ids = String(p.ids || '').split(',').map(function (x) { return x.trim(); }).filter(String).slice(0, 50);
  ids.forEach(function (id) { idValue_(id); });
  var ideas = [];
  var replies = [];
  ids.forEach(function (id) {
    if (id.charAt(0) === 'I') {
      var r = findById_('ideas', id);
      if (!r) return;
      if (r.hidden) ideas.push({ id: id, hidden: true });
      else if (r.deleted) ideas.push({ id: id, deleted: true });
      else ideas.push({ id: id, title: r.title, status: r.status, reply_count: r.reply_count,
        last_activity_at: r.last_activity_at, waters: r.waters });
    } else if (id.charAt(0) === 'R') {
      var rp = findById_('replies', id);
      if (!rp) return;
      var parent = findById_('ideas', rp.idea_id);
      if (rp.hidden) replies.push({ id: id, idea_id: rp.idea_id, hidden: true });
      else if (rp.deleted) replies.push({ id: id, idea_id: rp.idea_id, deleted: true });
      else replies.push({ id: id, idea_id: rp.idea_id, kind: rp.kind, text: rp.text, waters: rp.waters,
        idea_title: parent && !parent.deleted && !parent.hidden ? parent.title : '' });
    }
  });
  return { ideas: ideas, replies: replies };
}

// ---------- POST: 성도 쓰기 ----------

function postCheckCode_(body) {
  checkCode_('edit', body.edit_code, body.device_id);
  return { valid: true };
}

/** 같은 request_id가 이미 저장돼 있으면 처음 결과를 돌려준다. */
function dedupe_(requestId, tab) {
  var hit = cache_().get('rq_' + requestId);
  if (hit) return JSON.parse(hit);
  var rows = table_(tab);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (rows[i].request_id === requestId) return { id: rows[i].id, edit_token: null, duplicate: true };
  }
  return null;
}

function remember_(requestId, result) {
  cache_().put('rq_' + requestId, JSON.stringify(result), 21600);
}

function author_(v) {
  var s = str_(v, config_().limit_author, 'author');
  return s || '함께하는 성도';
}

function postCreate_(body) {
  var cfg = config_();
  var deviceId = deviceValue_(body.device_id);
  var requestId = requestValue_(body.request_id);
  var title = str_(body.title, 10000, 'title', true);
  var detail = str_(body.detail, 10000, 'detail');
  // 제목이 넘치면 자르지 않고 넘친 부분을 설명 앞으로 옮긴다(기획서 3-4).
  if (charLen_(title) > cfg.limit_title) {
    var parts = cutChars_(title, cfg.limit_title);
    title = parts[0].trim();
    detail = parts[1].trim() + (detail ? '\n' + detail : '');
  }
  if (charLen_(detail) > cfg.limit_detail) fail_('INVALID', 'detail 길이');
  var seat = listValue_(body.seat, cfg.seats, 'seat') || '함께';
  var age = listValue_(body.age, cfg.ages, 'age');
  var setting = listValue_(body.setting, cfg.settings, 'setting');
  var verse = str_(body.verse, cfg.limit_verse, 'verse');
  var author = author_(body.author);
  var questionId = body.question_id ? idValue_(body.question_id, 'Q', 'question_id') : '';
  var parentId = body.parent_id ? idValue_(body.parent_id, 'I', 'parent_id') : '';
  checkCode_('edit', body.edit_code, deviceId);

  var result = withLock_(function () {
    var dup = dedupe_(requestId, 'ideas');
    if (dup) return dup;
    checkRate_(deviceId);
    var now = kstNow_();
    var token = Utilities.getUuid();
    var flagged = looksPrivate_([title, detail, author]);
    var row = {
      id: newId_('I'), created_at: now, updated_at: now, title: title, summary: cutChars_(detail, 140)[0],
      detail: detail, age: age, seat: seat, setting: setting, verse: verse, status: '씨앗',
      question_id: questionId, parent_ids: parentId, waters: 0, author: author, deleted: false,
      last_activity_at: now, reply_count: 0, last_reply_preview: '', report_count: 0, hidden: false,
      edit_token_hash: sha256_(token), device_id: deviceId, request_id: requestId, flagged: flagged
    };
    appendRows_('ideas', [row]);
    addLog_('create', row.id, '', { title: title, detail: detail, seat: seat, age: age, setting: setting, verse: verse }, author, '');
    bumpRev_();
    var res = { id: row.id, edit_token: token, flagged: flagged };
    remember_(requestId, res);
    if (flagged) mailFlagged_('생각', row.id, row.id, title + '\n' + detail + '\n별칭: ' + author);
    return res;
  });
  return result;
}

/** 이어 쓰기 수, 미리보기, 상태를 다시 계산한다. 상태는 올리기만 하고 쉼은 건드리지 않는다. */
function refreshIdea_(idea, raiseStatus) {
  var replies = table_('replies').filter(function (r) { return r.idea_id === idea.id && replyVisible_(r); })
    .sort(function (a, b) { return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0; });
  idea.reply_count = replies.length;
  var last = replies[replies.length - 1];
  idea.last_reply_preview = last ? cutChars_(last.kind + ' · ' + last.author + ' — ' + cutChars_(last.text.replace(/\s+/g, ' '), 60)[0], 80)[0] : '';
  if (raiseStatus && idea.status !== '쉼') {
    var tried = replies.filter(function (r) { return r.kind === '해 봤어요'; }).length;
    var target = tried >= 2 ? '열매' : tried >= 1 ? '시도' : replies.length ? '싹' : '씨앗';
    if ((STATUS_RANK[target] || 0) > (STATUS_RANK[idea.status] || 0)) idea.status = target;
  }
}

function postReply_(body) {
  var cfg = config_();
  var deviceId = deviceValue_(body.device_id);
  var requestId = requestValue_(body.request_id);
  var ideaId = idValue_(body.idea_id, 'I', 'idea_id');
  var kind = String(body.kind || '');
  if (cfg.reply_kinds.indexOf(kind) < 0) fail_('INVALID', 'kind');
  var text = str_(body.text, cfg.limit_reply, 'text', true);
  var author = author_(body.author);
  checkCode_('edit', body.edit_code, deviceId);

  return withLock_(function () {
    var dup = dedupe_(requestId, 'replies');
    if (dup) return dup;
    var idea = findById_('ideas', ideaId);
    if (!idea || idea.hidden || idea.deleted) fail_('NOT_FOUND');
    checkRate_(deviceId);
    var now = kstNow_();
    var token = Utilities.getUuid();
    var flagged = looksPrivate_([text, author]);
    var row = {
      id: newId_('R'), idea_id: ideaId, kind: kind, text: text, author: author, waters: 0, report_count: 0,
      created_at: now, updated_at: now, hidden: false, deleted: false, edit_token_hash: sha256_(token),
      device_id: deviceId, request_id: requestId, flagged: flagged
    };
    appendRows_('replies', [row]);
    var before = idea.status;
    refreshIdea_(idea, true);
    idea.last_activity_at = now;
    saveRow_('ideas', idea);
    addLog_('reply', row.id, '', { idea_id: ideaId, kind: kind, text: text }, author, '');
    if (idea.status !== before) addLog_('status', ideaId, before, idea.status, '', '자동');
    bumpRev_();
    var res = { id: row.id, edit_token: token, status: idea.status, flagged: flagged };
    remember_(requestId, res);
    if (flagged) mailFlagged_('이어 쓰기', row.id, ideaId, kind + ': ' + text + '\n별칭: ' + author);
    return res;
  });
}

/** edit_token이 맞거나 관리 코드가 맞아야 고치고 지울 수 있다. 관리자면 이름을 돌려준다. */
function authorizeOwner_(body, row) {
  if (body.admin_code) return requireAdmin_(body);
  var token = String(body.edit_token || '');
  if (!token || !row.edit_token_hash || sha256_(token) !== row.edit_token_hash) fail_('NOT_FOUND');
  return '';
}

var IDEA_EDITABLE = ['title', 'detail', 'age', 'seat', 'setting', 'verse'];

function postUpdate_(body) {
  var cfg = config_();
  var id = idValue_(body.id);
  var isIdea = id.charAt(0) === 'I';
  if (id.charAt(0) === 'Q') fail_('INVALID', 'id');

  return withLock_(function () {
    var row = findById_(isIdea ? 'ideas' : 'replies', id);
    if (!row || row.deleted) fail_('NOT_FOUND');
    var adminName = authorizeOwner_(body, row);
    if (!adminName && row.hidden) fail_('NOT_FOUND');
    var before = {};
    var after = {};
    if (isIdea) {
      IDEA_EDITABLE.forEach(function (f) {
        if (!(f in body)) return;
        var v;
        if (f === 'title') v = str_(body.title, cfg.limit_title, 'title', true);
        else if (f === 'detail') v = str_(body.detail, cfg.limit_detail, 'detail');
        else if (f === 'verse') v = str_(body.verse, cfg.limit_verse, 'verse');
        else if (f === 'seat') v = listValue_(body.seat, cfg.seats, 'seat') || '함께';
        else if (f === 'age') v = listValue_(body.age, cfg.ages, 'age');
        else v = listValue_(body.setting, cfg.settings, 'setting');
        if (v !== row[f]) { before[f] = row[f]; after[f] = v; row[f] = v; }
      });
      row.summary = cutChars_(row.detail, 140)[0];
    } else {
      if ('text' in body) {
        var t = str_(body.text, cfg.limit_reply, 'text', true);
        if (t !== row.text) { before.text = row.text; after.text = t; row.text = t; }
      }
    }
    if (!Object.keys(after).length) return { id: id, changed: false };
    row.updated_at = kstNow_();
    var texts = isIdea ? [row.title, row.detail, row.author] : [row.text, row.author];
    var nowPrivate = looksPrivate_(texts);
    var newlyFlagged = false;
    if (adminName) row.flagged = nowPrivate && row.flagged;
    else if (nowPrivate && !row.flagged) { row.flagged = true; newlyFlagged = true; }
    saveRow_(isIdea ? 'ideas' : 'replies', row);
    if (!isIdea) {
      var idea = findById_('ideas', row.idea_id);
      if (idea) { refreshIdea_(idea, false); saveRow_('ideas', idea); }
    }
    addLog_('update', id, before, after, row.author, adminName);
    bumpRev_();
    if (newlyFlagged) mailFlagged_(isIdea ? '생각(고침)' : '이어 쓰기(고침)', id, isIdea ? id : row.idea_id, texts.join('\n'));
    return { id: id, changed: true };
  });
}

function postRemove_(body) {
  var id = idValue_(body.id);
  var isIdea = id.charAt(0) === 'I';
  if (id.charAt(0) === 'Q') fail_('INVALID', 'id');
  return withLock_(function () {
    var row = findById_(isIdea ? 'ideas' : 'replies', id);
    if (!row || row.deleted) fail_('NOT_FOUND');
    var adminName = authorizeOwner_(body, row);
    row.deleted = true;
    row.updated_at = kstNow_();
    saveRow_(isIdea ? 'ideas' : 'replies', row);
    if (!isIdea) {
      var idea = findById_('ideas', row.idea_id);
      if (idea) { refreshIdea_(idea, false); saveRow_('ideas', idea); }
    }
    addLog_('remove', id, isIdea ? { title: row.title } : { text: row.text }, '', row.author, adminName);
    bumpRev_();
    return { id: id, removed: true };
  });
}

/** 물 주기와 살펴봐 주세요는 기기×대상×KST 날짜당 1회(guard 탭). */
function oncePerDay_(deviceId, action, targetId) {
  var today = kstDate_();
  var done = table_('guard').some(function (g) {
    return g.device_id === deviceId && g.action === action && g.target_id === targetId && g.date === today;
  });
  if (done) return false;
  appendRows_('guard', [{ at: kstNow_(), device_id: deviceId, action: action, target_id: targetId, date: today }]);
  return true;
}

function targetRow_(targetId) {
  var isIdea = targetId.charAt(0) === 'I';
  var row = findById_(isIdea ? 'ideas' : 'replies', targetId);
  if (!row || row.hidden || row.deleted) fail_('NOT_FOUND');
  return { row: row, tab: isIdea ? 'ideas' : 'replies' };
}

function postWater_(body) {
  var deviceId = deviceValue_(body.device_id);
  var targetId = idValue_(body.target_id);
  if (targetId.charAt(0) === 'Q') fail_('INVALID', 'target_id');
  return withLock_(function () {
    var t = targetRow_(targetId);
    if (!oncePerDay_(deviceId, 'water', targetId)) return { waters: t.row.waters, already: true };
    t.row.waters += 1;
    saveRow_(t.tab, t.row);
    bumpRev_();
    return { waters: t.row.waters, already: false };
  });
}

function postReport_(body) {
  var deviceId = deviceValue_(body.device_id);
  var targetId = idValue_(body.target_id);
  if (targetId.charAt(0) === 'Q') fail_('INVALID', 'target_id');
  return withLock_(function () {
    var t = targetRow_(targetId);
    if (!oncePerDay_(deviceId, 'report', targetId)) return { already: true };
    t.row.report_count += 1;
    saveRow_(t.tab, t.row);
    addLog_('report', targetId, '', String(t.row.report_count), '', '');
    return { already: false };
  });
}

/** 방문은 기기×KST 날짜당 한 행. 화면이 하루 한 번 보낸다. 실패해도 화면에는 알리지 않는다. */
function postVisit_(body) {
  var deviceId = deviceValue_(body.device_id);
  var key = 'visit_' + deviceId + '_' + kstDate_();
  if (cache_().get(key)) return { recorded: false };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return { recorded: false };
  try {
    var rec = oncePerDay_(deviceId, 'visit', '');
    cache_().put(key, '1', 21600);
    return { recorded: rec };
  } finally {
    lock.releaseLock();
  }
}
