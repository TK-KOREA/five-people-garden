// 함께 다듬기(상세): 생각 전문, 갈라진 가지, 이어 쓴 생각, 아래 고정 입력줄.
import { get, post, messageFor } from '../api.js';
import * as store from '../store.js';
import { el, icon, seatBadges, statusBadge, relTime, toast, confirmSheet, openSheet, isKakao, copyText, autoGrow } from '../ui.js';
import { PUBLIC_URL, APP_NAME } from '../config.js';
import { state, go, refreshBoot } from '../app.js';
import { waterButton, reportButton, nicknameSheet } from './common.js';
import { sendWrite, privacyCheck } from '../write.js';

const KINDS = ['덧붙임', '질문', '해 봤어요'];
const KIND_CLASS = { '덧붙임': 'k-add', '질문': 'k-ask', '해 봤어요': 'k-tried' };
const KIND_HINT = {
  '덧붙임': '여기에 더하면 좋을 것은…',
  '질문': '이런 경우엔 어떻게 할까요?',
  '해 봤어요': '언제, 무엇을 해 봤고, 아이가 어떻게 반응했나요?',
};

async function share(idea) {
  const url = PUBLIC_URL + '#/idea/' + idea.id;
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: APP_NAME, text: idea.title, url });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const ok = await copyText(idea.title + '\n' + url);
  toast(ok ? '링크를 복사했어요. 카톡 대화방에 붙여 넣어 주세요.' : url);
}

function doPrint() {
  // 0단계: Android 카톡 인앱에서는 인쇄가 안 됐다.
  if (isKakao()) toast('이 기능은 카톡 안에서 안 될 수 있어요. 오른쪽 위 메뉴에서 다른 브라우저로 열어 주세요.');
  window.print();
}

function editReplySheet(reply, onDone) {
  const ta = autoGrow(el('textarea', { class: 'input', rows: '4', maxlength: '500', 'aria-label': '이어 쓴 내용' }));
  ta.value = reply.text;
  const save = el('button', {
    type: 'button', class: 'btn',
    onclick: async () => {
      const text = ta.value.trim();
      if (!text) return ta.focus();
      const fields = { text };
      const choice = await privacyCheck(fields);
      if (choice === 'edit') return;
      if (choice === 'replaced') { ta.value = fields.text; return; }
      save.disabled = true;
      try {
        await post('update', { id: reply.id, edit_token: store.tokenFor(reply.id), text: fields.text });
        dlg.close();
        toast('고쳤어요.');
        onDone();
      } catch (e) {
        toast(messageFor(e));
        save.disabled = false;
      }
    },
  }, '고치기');
  const dlg = openSheet(el('div', null, el('h2', { class: 'sheet-title' }, '내 글 고치기'), ta, el('div', { class: 'row-end' }, save)), { label: '내 글 고치기' });
}

function replyItem(r, reload) {
  const mine = !!store.tokenFor(r.id);
  return el('li', { class: 'reply', dataset: { kind: r.kind } },
    el('div', { class: 'reply-top' },
      el('span', { class: 'kind ' + (KIND_CLASS[r.kind] || '') }, r.kind),
      el('span', { class: 'meta' }, r.author),
      r.is_op && el('span', { class: 'op' }, '처음 나눈 분'),
      el('span', { class: 'meta' }, relTime(r.created_at)),
    ),
    el('p', { class: 'reply-text' }, r.text),
    el('div', { class: 'reply-foot' },
      waterButton(r.id, r.waters, { small: true }),
      mine && el('button', { type: 'button', class: 'text-link', onclick: () => editReplySheet(r, reload) }, '고치기'),
      mine && el('button', {
        type: 'button', class: 'text-link',
        onclick: async () => {
          if (!(await confirmSheet('이 글을 지울까요?', '지우기'))) return;
          try {
            await post('remove', { id: r.id, edit_token: store.tokenFor(r.id) });
            toast('지웠어요.');
            reload();
          } catch (e) { toast(messageFor(e)); }
        },
      }, '지우기'),
      !mine && reportButton(r.id),
    ),
  );
}

function replyBar(ideaId, onSent) {
  let kind = '덧붙임';
  const ta = autoGrow(el('textarea', { class: 'input bar-input', rows: '1', maxlength: '500', placeholder: KIND_HINT[kind], 'aria-label': '이 생각에 이어서 써 주세요', enterkeyhint: 'send' }));
  const draftKey = 'reply_draft_' + ideaId;
  // 쓰던 이어 쓰기마다 request_id 하나. 다시 보내도 서버가 한 번만 저장한다.
  const rqKey = 'reply_rq_' + ideaId;
  ta.value = store.load(draftKey, '');
  ta.addEventListener('input', () => store.save(draftKey, ta.value || undefined));
  const kinds = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': '이어 쓰기 종류' });
  const drawKinds = () => kinds.replaceChildren(...KINDS.map((k) => el('button', {
    type: 'button', role: 'radio', 'aria-checked': String(k === kind), class: 'seg-btn ' + KIND_CLASS[k] + (k === kind ? ' on' : ''),
    onclick: () => { kind = k; ta.placeholder = KIND_HINT[k]; drawKinds(); },
  }, k)));
  drawKinds();
  const nick = el('button', { type: 'button', class: 'nick-btn' });
  const drawNick = () => { nick.textContent = (store.load('nickname', '') || '별칭 고르기') + ' ▾'; };
  drawNick();
  nick.addEventListener('click', async () => { await nicknameSheet(state.boot); drawNick(); });

  const send = el('button', { type: 'button', class: 'btn send', 'aria-label': '보내기' }, '보내기');
  let busy = false;
  send.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    try {
      await sendOnce();
    } finally {
      busy = false;
    }
  });
  async function sendOnce() {
    const text = ta.value.trim();
    if (!text) return ta.focus();
    if (!store.load('nickname', '')) {
      const n = await nicknameSheet(state.boot);
      drawNick();
      if (!n) return;
    }
    const fields = { text, author: store.load('nickname', '') };
    const choice = await privacyCheck(fields);
    if (choice === 'edit') return ta.focus();
    if (choice === 'replaced') { ta.value = fields.text; store.save(draftKey, ta.value); return ta.focus(); }
    let rq = store.load(rqKey, '');
    if (!rq) { rq = store.randomId(24); store.save(rqKey, rq); }
    const data = await sendWrite('reply', { idea_id: ideaId, kind, text: fields.text, author: fields.author, request_id: rq }, send);
    if (!data) return;
    store.save(rqKey, undefined);
    ta.value = '';
    ta.style.height = 'auto';
    store.save(draftKey, undefined);
    toast(data.status === '열매' ? '이어 썼어요. 열매가 맺혔어요.' : '이어 썼어요.');
    onSent();
  }

  const bar = el('div', { class: 'bar', role: 'region', 'aria-label': '이어 쓰기' },
    el('div', { class: 'bar-head' }, kinds, nick),
    el('div', { class: 'bar-row' }, ta, send),
  );
  // 키보드가 올라오면 입력줄을 그 위로 올린다(0단계: Android 카톡에서 가림 0px).
  const vv = window.visualViewport;
  const place = () => {
    if (!bar.isConnected) return;
    const offset = vv ? Math.max(0, innerHeight - vv.height - vv.offsetTop) : 0;
    bar.style.transform = offset ? `translateY(${-offset}px)` : '';
  };
  if (vv) {
    vv.addEventListener('resize', place);
    vv.addEventListener('scroll', place);
  }
  return bar;
}

export async function renderIdea(m, id) {
  if (!/^I-\d{8}-[a-z0-9]{6}$/.test(id)) return go('#/');
  const head = el('div');
  const body = el('div');
  m.append(head, body);
  let filter = '';

  const cached = state.items.find((x) => x.id === id);
  if (cached) drawIdea(cached, null);
  else head.replaceChildren(el('p', { class: 'empty' }, '불러오는 중이에요…'));

  function drawIdea(idea, data) {
    const mine = !!store.tokenFor(idea.id);
    if (idea.deleted) {
      head.replaceChildren(el('article', { class: 'detail deleted' }, el('p', { class: 'muted' }, '지워진 생각이에요.')));
      return;
    }
    const branches = data ? data.branches : [];
    head.replaceChildren(el('article', { class: 'detail' },
      el('div', { class: 'card-top' }, seatBadges(idea.seat), statusBadge(idea.status)),
      el('p', { class: 'meta' }, `${idea.author} · ${relTime(idea.created_at)}${idea.updated_at && idea.updated_at !== idea.created_at ? ' · 고침' : ''}`),
      el('h2', { class: 'detail-title' }, idea.title),
      data && idea.detail ? el('p', { class: 'detail-text' }, idea.detail) : (!data && idea.summary ? el('p', { class: 'detail-text' }, idea.summary) : null),
      (idea.age || idea.setting) && el('div', { class: 'chips static' },
        String(idea.age || '').split(',').filter(Boolean).map((a) => el('span', { class: 'chip' }, a)),
        String(idea.setting || '').split(',').filter(Boolean).map((a) => el('span', { class: 'chip' }, a))),
      idea.verse && el('p', { class: 'verse' }, idea.verse),
      idea.status === '쉼' && el('p', { class: 'rest-note' }, '지금은 쉬는 중이에요. 언제든 다시 이어 쓸 수 있어요.'),
      branches.length > 0 && el('details', { class: 'branches' },
        el('summary', null, `갈라진 가지 ${branches.length}`),
        el('ul', null, branches.map((b) => el('li', null, el('a', { href: '#/idea/' + b.id }, b.title))))),
      el('div', { class: 'actions' },
        waterButton(idea.id, idea.waters),
        el('button', { type: 'button', class: 'chip-btn', onclick: () => share(idea) }, icon('share', 18), '카톡으로 보내기'),
        el('button', { type: 'button', class: 'chip-btn', onclick: doPrint }, icon('print', 18), '인쇄'),
      ),
      el('div', { class: 'actions minor' },
        mine && el('button', { type: 'button', class: 'text-link', onclick: () => go('#/edit/' + idea.id) }, icon('pen', 16), '고치기'),
        mine && el('button', {
          type: 'button', class: 'text-link',
          onclick: async () => {
            if (!(await confirmSheet('이 생각을 지울까요? 이어 쓴 글이 있으면 "지워진 생각" 카드로 남아요.', '지우기'))) return;
            try {
              await post('remove', { id: idea.id, edit_token: store.tokenFor(idea.id) });
              toast('지웠어요.');
              refreshBoot().catch(() => {});
              go('#/');
            } catch (e) { toast(messageFor(e)); }
          },
        }, '지우기'),
        !mine && reportButton(idea.id),
      ),
    ));
  }

  function drawReplies(data) {
    const replies = data.replies;
    const shown = filter ? replies.filter((r) => r.kind === filter) : replies;
    body.replaceChildren(el('section', { class: 'replies', 'aria-label': '이어 쓴 생각' },
      el('h3', { class: 'section-title' }, `함께 다듬은 생각 ${replies.length}`),
      replies.length > 0 && el('div', { class: 'chips' }, [['전체', ''], ...KINDS.map((k) => [k, k])].map(([label, v]) => el('button', {
        type: 'button', class: 'chip' + (filter === v ? ' on' : ''), 'aria-pressed': String(filter === v),
        onclick: () => { filter = v; drawReplies(data); },
      }, label))),
      replies.length === 0
        ? el('p', { class: 'empty nudge' }, '첫 생각을 이어 주세요')
        : el('ul', { class: 'reply-list' }, shown.map((r) => replyItem(r, load))),
    ));
  }

  async function load() {
    try {
      const data = await get('idea', { id });
      if (!m.isConnected) return;
      drawIdea(data.idea, data);
      drawReplies(data);
      if (store.tokenFor(id)) store.setSeenReplies(id, data.idea.reply_count);
      if (!data.idea.deleted && !document.querySelector('.bar')) {
        document.body.classList.add('has-bar');
        m.append(replyBar(id, () => { load(); refreshBoot().catch(() => {}); }));
      }
    } catch (e) {
      if (!m.isConnected) return;
      let msg = messageFor(e);
      // 내 글이면 숨김(관리자)과 지움(내가)을 나눠 알린다(QA B-03).
      if (e.code === 'NOT_FOUND' && store.tokenFor(id)) {
        try {
          const mine = (await get('mine', { ids: id })).ideas[0];
          if (mine && mine.hidden) msg = '이름이 있어 잠시 가렸어요. 역할로 바꿔 다시 나눠 주세요.';
          else if (mine && mine.deleted) msg = '지운 생각이에요.';
        } catch (e2) { /* 기본 문구 */ }
        if (!m.isConnected) return;
      }
      head.replaceChildren(el('p', { class: 'empty' }, msg));
      body.replaceChildren(el('button', { type: 'button', class: 'btn ghost', onclick: () => go('#/') }, '나눔으로 가기'));
    }
  }
  await load();
}
