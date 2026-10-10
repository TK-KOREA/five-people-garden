// 1단계 API 논리 시험. 실행: node gas/test/run.js
'use strict';

const assert = require('assert');
const { makeEnv } = require('./harness');

const env = makeEnv();
let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (e) {
    console.log('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 3).join('\n       '));
    process.exitCode = 1;
  }
}
function ok(res) {
  assert.strictEqual(res.ok, true, JSON.stringify(res.error));
  return res.data;
}
function err(res, code) {
  assert.strictEqual(res.ok, false, 'expected error ' + code);
  assert.strictEqual(res.error.code, code, JSON.stringify(res.error));
}

let n = 0;
const dev = (i) => 'device-' + String(i).padStart(4, '0');
const rq = () => 'request-' + String(++n).padStart(6, '0');

env.call('setupAll');
const CODE = env.props.get('EDIT_CODE');
const ADMIN = env.props.get('ADMIN_CODE');
const admin = (o) => Object.assign({ admin_code: ADMIN, admin_name: 'TK', device_id: dev(9999) }, o);

test('setupAll: 탭, 프리셋, 첫 씨앗, 코드', () => {
  for (const t of ['ideas', 'replies', 'questions', 'config', 'log', 'guard']) assert(env.sheets[t], t);
  assert.match(CODE, /^다섯사람\d{4}$/);
  assert(ADMIN.length >= 16);
  env.call('setupAll'); // 두 번 실행해도 안전
  const b = ok(env.get({ action: 'bootstrap' }));
  assert.strictEqual(b.items.length, 5);
  assert.strictEqual(b.counts['전체'], 5);
  assert.strictEqual(b.counts['함께'], 2);
  assert.strictEqual(b.counts['조부모'], 1);
  assert.strictEqual(b.counts['봉사'], 1);
  assert(b.today_question && b.today_question.text);
  assert.deepStrictEqual(b.config.seat_colors['친구'], { bg: '#E3EEF6', fg: '#2C5878' });
  assert.strictEqual(b.items[0].dk.length, 10);
  assert(!('device_id' in b.items[0]) && !('edit_token_hash' in b.items[0]));
});

test('글은 모두 따옴표를 붙여 쓴다', () => {
  for (const [name, sh] of Object.entries(env.sheets)) {
    sh.data.slice(1).forEach((row, r) => (row || []).forEach((v, c) => {
      assert(!(v && v.unquoted !== undefined), `${name} r${r + 2} c${c + 1} 따옴표 없음: ${v && v.unquoted}`);
    }));
  }
});

test('편집 코드: 틀리면 BAD_EDIT_CODE, 10번이면 그 기기만 LOCKED_OUT', () => {
  err(env.post({ action: 'check_code', edit_code: 'x', device_id: dev(1) }), 'BAD_EDIT_CODE');
  for (let i = 0; i < 9; i++) env.post({ action: 'check_code', edit_code: 'x', device_id: dev(1) });
  err(env.post({ action: 'check_code', edit_code: CODE, device_id: dev(1) }), 'LOCKED_OUT');
  ok(env.post({ action: 'check_code', edit_code: ' ' + CODE.replace('다섯', '다섯 ') + ' ', device_id: dev(2) }));
});

let idea1, token1;
test('create: 저장, 토큰, 피드 맨 위, 중복 request_id는 한 번만', () => {
  env.tick(1000); // 첫 씨앗과 같은 초면 id 순서로 정렬된다
  const r = rq();
  const body = { action: 'create', edit_code: CODE, device_id: dev(3), request_id: r, title: '=1+1 식탁 초대', detail: '설명', seat: '다른 부모,부모', author: '청년 형제' };
  const d = ok(env.post(body));
  assert.match(d.id, /^I-\d{8}-[a-z0-9]{6}$/);
  assert(d.edit_token);
  idea1 = d.id; token1 = d.edit_token;
  const again = ok(env.post(body));
  assert.strictEqual(again.id, d.id);
  const b = ok(env.get({ action: 'bootstrap' }));
  assert.strictEqual(b.items[0].id, d.id);
  assert.strictEqual(b.items[0].title, '=1+1 식탁 초대');
  assert.strictEqual(b.counts['전체'], 6);
  assert.strictEqual(b.counts['부모'], 1);
});

test('create: 코드 없으면 BAD_EDIT_CODE, 목록 밖 값은 INVALID, 연결 기본은 함께', () => {
  err(env.post({ action: 'create', edit_code: 'nope', device_id: dev(4), request_id: rq(), title: 't' }), 'BAD_EDIT_CODE');
  err(env.post({ action: 'create', edit_code: CODE, device_id: dev(4), request_id: rq(), title: 't', seat: '이웃' }), 'INVALID');
  err(env.post({ action: 'create', edit_code: CODE, device_id: dev(4), request_id: rq(), title: '  ' }), 'INVALID');
  const d = ok(env.post({ action: 'create', edit_code: CODE, device_id: dev(4), request_id: rq(), title: '연결 없이' }));
  const i = ok(env.get({ action: 'idea', id: d.id }));
  assert.strictEqual(i.idea.seat, '함께');
  assert.strictEqual(i.idea.author, '함께하는 성도');
});

test('create: 60자 넘는 제목은 넘친 부분을 설명으로', () => {
  const long = '가'.repeat(60) + '나머지 부분';
  const d = ok(env.post({ action: 'create', edit_code: CODE, device_id: dev(5), request_id: rq(), title: long, detail: '원래 설명' }));
  const i = ok(env.get({ action: 'idea', id: d.id })).idea;
  assert.strictEqual(i.title, '가'.repeat(60));
  assert.strictEqual(i.detail, '나머지 부분\n원래 설명');
});

test('reply: 덧붙임 → 싹, 해 봤어요 → 시도, 두 번째 해 봤어요 → 열매', () => {
  const r1 = ok(env.post({ action: 'reply', edit_code: CODE, device_id: dev(6), request_id: rq(), idea_id: idea1, kind: '덧붙임', text: '찬송도 한 곡', author: '섬기는 자매' }));
  assert.strictEqual(r1.status, '싹');
  const r2 = ok(env.post({ action: 'reply', edit_code: CODE, device_id: dev(3), request_id: rq(), idea_id: idea1, kind: '해 봤어요', text: '해 봤어요 1', author: '청년 형제' }));
  assert.strictEqual(r2.status, '시도');
  const r3 = ok(env.post({ action: 'reply', edit_code: CODE, device_id: dev(7), request_id: rq(), idea_id: idea1, kind: '해 봤어요', text: '해 봤어요 2' }));
  assert.strictEqual(r3.status, '열매');
  const i = ok(env.get({ action: 'idea', id: idea1 }));
  assert.strictEqual(i.idea.reply_count, 3);
  assert.strictEqual(i.replies.length, 3);
  assert.strictEqual(i.replies[1].is_op, true, '처음 나눈 분');
  assert.strictEqual(i.replies[0].is_op, false);
  assert.match(i.idea.last_reply_preview, /^해 봤어요 · 함께하는 성도 — 해 봤어요 2/);
  err(env.post({ action: 'reply', edit_code: CODE, device_id: dev(6), request_id: rq(), idea_id: idea1, kind: '칭찬', text: 'x' }), 'INVALID');
});

test('update: 토큰이 맞으면 고침, 틀리면 NOT_FOUND, log에 전후', () => {
  err(env.post({ action: 'update', id: idea1, edit_token: 'wrong', title: 'x' }), 'NOT_FOUND');
  const d = ok(env.post({ action: 'update', id: idea1, edit_token: token1, title: '고친 제목', verse: '딤후 1:5' }));
  assert.strictEqual(d.changed, true);
  const i = ok(env.get({ action: 'idea', id: idea1 })).idea;
  assert.strictEqual(i.title, '고친 제목');
  assert.strictEqual(i.verse, '딤후 1:5');
  assert.strictEqual(i.status, '열매', '고쳐도 상태 그대로');
  const log = env.sheets.log.data.filter(Boolean).map((r) => r[1]);
  assert(log.includes('update'));
});

test('개인정보: 전화번호는 flagged, 메일 알림, 제외 단어는 잡지 않음', () => {
  const before = env.mails.length;
  const d = ok(env.post({ action: 'create', edit_code: CODE, device_id: dev(8), request_id: rq(), title: '연락은 010-1234-5678로' }));
  assert.strictEqual(d.flagged, true);
  assert.strictEqual(env.mails.length, before + 1);
  const name = ok(env.post({ action: 'create', edit_code: CODE, device_id: dev(8), request_id: rq(), title: '지훈이가 좋아한 식탁' }));
  assert.strictEqual(name.flagged, true);
  const safe = ok(env.post({ action: 'create', edit_code: CODE, device_id: dev(10), request_id: rq(), title: '어린이가 좋아하고 형제네 집에서 모임' }));
  assert.strictEqual(safe.flagged, false);
});

test('water: 하루 한 번, 다음 날 다시', () => {
  const a = ok(env.post({ action: 'water', device_id: dev(11), target_id: idea1 }));
  assert.deepStrictEqual([a.waters, a.already], [1, false]);
  const b = ok(env.post({ action: 'water', device_id: dev(11), target_id: idea1 }));
  assert.deepStrictEqual([b.waters, b.already], [1, true]);
  env.tick(24 * 3600 * 1000);
  const c = ok(env.post({ action: 'water', device_id: dev(11), target_id: idea1 }));
  assert.deepStrictEqual([c.waters, c.already], [2, false]);
});

test('횟수 제한: 한 기기 1분 10회', () => {
  let limited = false;
  for (let i = 0; i < 12; i++) {
    const r = env.post({ action: 'create', edit_code: CODE, device_id: dev(12), request_id: rq(), title: '빠른 글 ' + i });
    if (!r.ok) { assert.strictEqual(r.error.code, 'RATE_LIMIT'); limited = true; }
  }
  assert(limited);
  env.tick(61 * 1000);
});

test('피드: 20개씩, cursor로 다음, 연결로 거르기', () => {
  for (let i = 0; i < 6; i++) {
    env.tick(1000);
    ok(env.post({ action: 'create', edit_code: CODE, device_id: dev(20 + i), request_id: rq(), title: '조부모 생각 ' + i, seat: '조부모' }));
  }
  const b = ok(env.get({ action: 'bootstrap' }));
  assert.strictEqual(b.items.length, 20);
  assert(b.next_cursor);
  const next = ok(env.get({ action: 'feed', cursor: b.next_cursor }));
  const ids = new Set(b.items.map((x) => x.id));
  next.items.forEach((x) => assert(!ids.has(x.id), 'no overlap'));
  assert.strictEqual(b.items.length + next.items.length, b.counts['전체']);
  const g = ok(env.get({ action: 'feed', seat: '조부모' }));
  assert.strictEqual(g.items.length, 7);
  assert.strictEqual(g.items[0].title, '조부모 생각 5');
  err(env.get({ action: 'feed', seat: '이웃' }), 'INVALID');
});

test('remove: 이어 쓰기가 있으면 지워진 생각 카드, 없으면 사라짐', () => {
  ok(env.post({ action: 'remove', id: idea1, edit_token: token1 }));
  const i = ok(env.get({ action: 'idea', id: idea1 }));
  assert.strictEqual(i.idea.deleted, true);
  assert.strictEqual(i.idea.title, '');
  assert.strictEqual(i.replies.length, 3);
  err(env.post({ action: 'reply', edit_code: CODE, device_id: dev(6), request_id: rq(), idea_id: idea1, kind: '덧붙임', text: 'x' }), 'NOT_FOUND');
  const d = ok(env.post({ action: 'create', edit_code: CODE, device_id: dev(30), request_id: rq(), title: '곧 지울 글' }));
  ok(env.post({ action: 'remove', id: d.id, edit_token: d.edit_token }));
  err(env.get({ action: 'idea', id: d.id }), 'NOT_FOUND');
});

test('mine: 내 글과 숨김 표시', () => {
  const d = ok(env.post({ action: 'create', edit_code: CODE, device_id: dev(31), request_id: rq(), title: '내 글' }));
  const r = ok(env.post({ action: 'reply', edit_code: CODE, device_id: dev(32), request_id: rq(), idea_id: d.id, kind: '질문', text: '어떻게?' }));
  ok(env.post(admin({ action: 'hide', target_id: r.id })));
  const m = ok(env.get({ action: 'mine', ids: [d.id, r.id].join(',') }));
  assert.strictEqual(m.ideas[0].title, '내 글');
  assert.strictEqual(m.ideas[0].reply_count, 0, '숨긴 이어 쓰기는 세지 않음');
  assert.strictEqual(m.replies[0].hidden, true);
});

test('관리: 틀린 코드, 목록, 숨김·되돌리기, 지우기', () => {
  err(env.post({ action: 'admin_list', admin_code: 'x', admin_name: 'TK', device_id: dev(40) }), 'BAD_ADMIN_CODE');
  err(env.post({ action: 'admin_list', admin_code: ADMIN, device_id: dev(40) }), 'INVALID');
  const list = ok(env.post(admin({ action: 'admin_list' })));
  assert(list.attention.some((x) => x.title === '연락은 010-1234-5678로'));
  assert(list.hidden.length >= 1);
  const target = list.attention.find((x) => x.title === '연락은 010-1234-5678로');
  ok(env.post(admin({ action: 'hide', target_id: target.id })));
  err(env.get({ action: 'idea', id: target.id }), 'NOT_FOUND');
  ok(env.post(admin({ action: 'unhide', target_id: target.id })));
  ok(env.get({ action: 'idea', id: target.id }));
  ok(env.post(admin({ action: 'erase', target_id: target.id })));
  const after = ok(env.get({ action: 'idea', id: target.id })).idea;
  assert.strictEqual(after.title, '[삭제]');
  const logText = JSON.stringify(env.sheets.log.data);
  assert(!logText.includes('010-1234-5678'), 'log에 번호가 남지 않음');
  const ideasText = JSON.stringify(env.sheets.ideas.data);
  assert(!ideasText.includes('010-1234-5678'), 'ideas에 번호가 남지 않음');
});

test('관리자 고치기: admin_code로 update', () => {
  const list = ok(env.post(admin({ action: 'admin_list' })));
  const t = list.attention.find((x) => x.title === '지훈이가 좋아한 식탁');
  ok(env.post(admin({ action: 'update', id: t.id, title: '초등 고학년 아이가 좋아한 식탁' })));
  const again = ok(env.post(admin({ action: 'admin_list' })));
  assert(!again.attention.some((x) => x.id === t.id), '고치면 경고 목록에서 빠짐');
});

test('set_code: 바꾸면 옛 코드 무효, 공지 문구', () => {
  err(env.post(admin({ action: 'set_code', which: 'edit', new_code: 'short' })), 'INVALID');
  const d = ok(env.post(admin({ action: 'set_code', which: 'edit', new_code: '새코드다섯사람2026' })));
  assert.match(d.notice, /#c=/);
  err(env.post({ action: 'check_code', edit_code: CODE, device_id: dev(50) }), 'BAD_EDIT_CODE');
  ok(env.post({ action: 'check_code', edit_code: '새코드 다섯사람 2026', device_id: dev(50) }));
  assert(!JSON.stringify(env.sheets.log.data).includes('새코드다섯사람2026'), '코드는 log에 없음');
});

test('digest와 stats', () => {
  ok(env.post({ action: 'visit', device_id: dev(60) }));
  env.tick(24 * 3600 * 1000);
  ok(env.post({ action: 'visit', device_id: dev(60) }));
  const dg = ok(env.post(admin({ action: 'digest' })));
  assert.match(dg.text, /이번 주 소식/);
  assert.match(dg.text, /#\/idea\/I-/);
  const st = ok(env.post(admin({ action: 'stats' })));
  assert(st.writer_devices >= 5);
  assert.strictEqual(st.returning_devices_30d, 1);
  assert(st.tried >= 2);
});

test('guard 정리: 30일 지난 행 지움', () => {
  const before = env.sheets.guard.getLastRow();
  env.tick(40 * 24 * 3600 * 1000);
  ok(env.post({ action: 'visit', device_id: dev(61) }));
  env.call('dailyGuardCleanup');
  assert.strictEqual(env.sheets.guard.getLastRow(), 2, `before ${before}`);
});

test('잘못된 요청', () => {
  err(env.get({ action: 'nope' }), 'INVALID');
  err(env.get({ action: 'idea', id: 'I-123' }), 'INVALID');
  const r = JSON.parse(env.ctx.doPost({ postData: { contents: 'not json' } }).content);
  err(r, 'INVALID');
  err(env.get({ action: 'mine', ids: 'R-20261010-zzzzzz,bad' }), 'INVALID');
});

test('이모지: 60자 경계에서 쪼개지지 않고, 글자 수는 이모지를 한 글자로 센다 (QA B-02)', () => {
  env.tick(61 * 1000);
  const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  const d = ok(env.post({ action: 'create', edit_code: '새코드다섯사람2026', device_id: dev(70), request_id: rq(), title: '가'.repeat(59) + '😀끝' }));
  const i = ok(env.get({ action: 'idea', id: d.id })).idea;
  assert(!lone.test(i.title) && !lone.test(i.detail), 'no lone surrogate');
  assert.strictEqual(i.title, '가'.repeat(59) + '😀');
  assert.strictEqual(i.detail, '끝');
  // UTF-16으로는 61이지만 글자로는 60 → 고치기 통과
  ok(env.post({ action: 'update', id: d.id, edit_token: d.edit_token, title: '나'.repeat(59) + '😀' }));
  err(env.post({ action: 'update', id: d.id, edit_token: d.edit_token, title: '나'.repeat(60) + '😀' }), 'INVALID');
});

test('마지막: 모든 글 칸에 따옴표', () => {
  for (const [name, sh] of Object.entries(env.sheets)) {
    sh.data.slice(1).forEach((row, r) => (row || []).forEach((v, c) => {
      assert(!(v && v.unquoted !== undefined), `${name} r${r + 2} c${c + 1}: ${v && v.unquoted}`);
    }));
  }
});

console.log(`\n${passed} passed`);
