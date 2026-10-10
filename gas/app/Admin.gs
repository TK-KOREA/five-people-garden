/**
 * 관리 action(기획서 3-3 관리, 6장). 모두 POST, admin_code와 admin_name을 받는다.
 * 1단계: admin_list, 본문 고치기(update에 admin_code), hide, unhide, erase, digest, stats, set_code.
 */

function adminItem_(r, type) {
  var idea = type === 'reply' ? findById_('ideas', r.idea_id) : null;
  return {
    type: type, id: r.id, idea_id: type === 'reply' ? r.idea_id : r.id,
    idea_title: idea ? idea.title : '',
    title: type === 'idea' ? r.title : '', detail: type === 'idea' ? r.detail : '',
    kind: type === 'reply' ? r.kind : '', text: type === 'reply' ? r.text : '',
    author: r.author, created_at: r.created_at, flagged: r.flagged, report_count: r.report_count,
    hidden: r.hidden, deleted: r.deleted
  };
}

function postAdminList_(body) {
  requireAdmin_(body);
  var alert = config_().report_alert;
  var all = [];
  table_('ideas').forEach(function (r) { all.push(adminItem_(r, 'idea')); });
  table_('replies').forEach(function (r) { all.push(adminItem_(r, 'reply')); });
  var byNew = function (a, b) { return a.created_at < b.created_at ? 1 : -1; };
  var log = table_('log').slice(-50).reverse().map(function (l) {
    return { at: l.at, action: l.action, target_id: l.target_id, before: l.before, after: l.after,
      author: l.author, admin_name: l.admin_name };
  });
  // 관리자에게만 지금 참여 코드와 단톡방 링크를 보여 준다(UX 점검 ①). 관리 코드는 돌려주지 않는다.
  var code = props_().getProperty('EDIT_CODE') || '';
  return {
    invite: { code: code, link: PUBLIC_URL + '#c=' + encodeURIComponent(code) },
    attention: all.filter(function (x) { return !x.hidden && !x.deleted && (x.flagged || x.report_count >= alert); }).sort(byNew),
    hidden: all.filter(function (x) { return x.hidden; }).sort(byNew),
    log: log,
    questions: table_('questions').map(function (q) { return { id: q.id, text: q.text, order: q.order, active: q.active }; })
  };
}

function setHidden_(body, hidden) {
  var adminName = requireAdmin_(body);
  var id = idValue_(body.target_id);
  if (id.charAt(0) === 'Q') fail_('INVALID', 'target_id');
  return withLock_(function () {
    var isIdea = id.charAt(0) === 'I';
    var row = findById_(isIdea ? 'ideas' : 'replies', id);
    if (!row) fail_('NOT_FOUND');
    if (row.hidden === hidden) return { id: id, hidden: hidden };
    row.hidden = hidden;
    row.updated_at = kstNow_();
    saveRow_(isIdea ? 'ideas' : 'replies', row);
    if (!isIdea) {
      var idea = findById_('ideas', row.idea_id);
      if (idea) { refreshIdea_(idea, false); saveRow_('ideas', idea); }
    }
    addLog_(hidden ? 'hide' : 'unhide', id, String(!hidden), String(hidden), row.author, adminName);
    bumpRev_();
    return { id: id, hidden: hidden };
  });
}

function postHide_(body) { return setHidden_(body, true); }
function postUnhide_(body) { return setHidden_(body, false); }

/** 개인정보 지우기: 본문과 별칭, log의 그 글 기록을 [삭제]로 덮는다(기획서 6-1). */
function postErase_(body) {
  var adminName = requireAdmin_(body);
  var id = idValue_(body.target_id);
  if (id.charAt(0) === 'Q') fail_('INVALID', 'target_id');
  var mark = '[삭제]';
  return withLock_(function () {
    var isIdea = id.charAt(0) === 'I';
    var row = findById_(isIdea ? 'ideas' : 'replies', id);
    if (!row) fail_('NOT_FOUND');
    if (isIdea) {
      row.title = mark; row.summary = mark; row.detail = mark; row.verse = '';
    } else {
      row.text = mark;
    }
    row.author = mark;
    row.flagged = false;
    row.updated_at = kstNow_();
    saveRow_(isIdea ? 'ideas' : 'replies', row);
    var ideaId = isIdea ? id : row.idea_id;
    var idea = findById_('ideas', ideaId);
    if (idea) { refreshIdea_(idea, false); saveRow_('ideas', idea); }
    table_('log').forEach(function (l) {
      if (l.target_id !== id) return;
      l.before = l.before ? mark : '';
      l.after = l.after ? mark : '';
      if (l.author) l.author = mark;
      saveRow_('log', l);
    });
    addLog_('erase', id, '', '', '', adminName);
    bumpRev_();
    return { id: id, erased: true };
  });
}

/** 이번 주 소식: 지난 7일의 새 생각과 해 봤어요 3~5개를 카톡용 글로 묶는다. */
function postDigest_(body) {
  requireAdmin_(body);
  var since = kstDate_(new Date(Date.now() - 7 * 86400000));
  var ideas = table_('ideas').filter(function (r) {
    return !r.hidden && !r.deleted && r.created_at.slice(0, 10) >= since;
  }).sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
  var tried = table_('replies').filter(function (r) {
    return replyVisible_(r) && r.kind === '해 봤어요' && r.created_at.slice(0, 10) >= since;
  }).sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
  var pickTried = tried.slice(0, 2);
  var pickIdeas = ideas.slice(0, 5 - pickTried.length);
  var lines = ['[' + APP_NAME + '] 이번 주 소식', ''];
  if (pickIdeas.length) {
    lines.push('새로 나눈 생각');
    pickIdeas.forEach(function (r) { lines.push('· ' + r.title, '  ' + PUBLIC_URL + '#/idea/' + r.id); });
    lines.push('');
  }
  if (pickTried.length) {
    lines.push('해 봤어요');
    pickTried.forEach(function (r) {
      var idea = findById_('ideas', r.idea_id);
      lines.push('· ' + (idea ? idea.title : '') + ' — ' + cutChars_(r.text.replace(/\s+/g, ' '), 40)[0],
        '  ' + PUBLIC_URL + '#/idea/' + r.idea_id);
    });
    lines.push('');
  }
  if (!pickIdeas.length && !pickTried.length) lines.push('이번 주에는 새 소식이 없어요. 떠오른 생각을 한 줄로 나눠 주세요.', '');
  lines.push('읽기와 물 주기는 누구나 할 수 있어요.', PUBLIC_URL);
  return { text: lines.join('\n'), ideas: pickIdeas.length, tried: pickTried.length };
}

/** 정원 상태(관리자만). 비교와 순위는 만들지 않고 전체 숫자만. */
function postStats_(body) {
  requireAdmin_(body);
  var ideas = table_('ideas').filter(function (r) { return !r.hidden && !r.deleted; });
  var replies = table_('replies').filter(replyVisible_);
  var writers = {};
  ideas.concat(replies).forEach(function (r) { if (r.device_id && r.device_id !== 'seed') writers[r.device_id] = 1; });
  var visits = {};
  table_('guard').forEach(function (g) {
    if (g.action !== 'visit') return;
    visits[g.device_id] = visits[g.device_id] || {};
    visits[g.device_id][g.date] = 1;
  });
  var visitDevices = Object.keys(visits);
  var returning = visitDevices.filter(function (d) { return Object.keys(visits[d]).length >= 2; });
  var withReplies = ideas.filter(function (r) { return r.reply_count > 0; }).length;
  return {
    writer_devices: Object.keys(writers).length,
    ideas: ideas.length,
    ideas_with_replies: withReplies,
    reply_ratio: ideas.length ? Math.round(withReplies / ideas.length * 100) : 0,
    tried: replies.filter(function (r) { return r.kind === '해 봤어요'; }).length,
    counts: counts_(),
    visit_devices_30d: visitDevices.length,
    returning_devices_30d: returning.length
  };
}

/** 코드 교체. 옛 코드는 바로 무효. 참여 코드면 단톡방 공지 문구를 만들어 준다. 코드는 log에 남기지 않는다. */
function postSetCode_(body) {
  var adminName = requireAdmin_(body);
  var which = body.which === 'admin' ? 'admin' : body.which === 'edit' ? 'edit' : '';
  if (!which) fail_('INVALID', 'which');
  var code = String(body.new_code || '').trim();
  if (which === 'edit' && normalizeCode_(code).length < 8) fail_('INVALID', '참여 코드는 8자 이상');
  if (which === 'admin' && (code.length < 16 || /\s/.test(code))) fail_('INVALID', '관리 코드는 공백 없이 16자 이상');
  return withLock_(function () {
    props_().setProperty(which === 'edit' ? 'EDIT_CODE' : 'ADMIN_CODE', code);
    addLog_('set_code', '', '', which, '', adminName);
    bumpRev_();
    var res = { which: which };
    if (which === 'edit') {
      res.notice = '[' + APP_NAME + '] 참여 코드가 바뀌었어요. 생각을 나누려면 아래 링크로 다시 열어 주세요.\n' +
        PUBLIC_URL + '#c=' + encodeURIComponent(code) + '\n이 링크는 단톡방 안에서만 나눠 주세요.';
    }
    return res;
  });
}
