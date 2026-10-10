// 나눔(첫 화면): 처음 안내, 지난번 이후 새 소식, 나누기 줄, 다섯 연결 띠, 오늘의 질문, 생각 카드.
import { get, messageFor } from '../api.js';
import * as store from '../store.js';
import { el, fill, icon, seatBadges, relTime, toast } from '../ui.js';
import { state, go, refreshBoot } from '../app.js';
import { waterButton } from './common.js';
import { sendWrite } from '../write.js';

const FOLD_AFTER = 3; // 같은 기기의 글이 연달아 3개를 넘으면 접는다(기획서 3-4).

function isNew(item) {
  return state.lastVisit > 0 && Date.parse(item.last_activity_at) > state.lastVisit;
}

export function ideaCard(item) {
  const open = () => go('#/idea/' + item.id);
  if (item.deleted) {
    return el('article', { class: 'card deleted', onclick: open },
      el('p', { class: 'muted' }, '지워진 생각이에요.'),
      item.last_reply_preview && el('p', { class: 'preview' }, item.last_reply_preview),
      el('div', { class: 'card-foot' }, el('span', { class: 'meta' }, `이어 쓰기 ${item.reply_count}`)),
    );
  }
  const replies = item.reply_count > 0
    ? el('span', { class: 'meta' }, icon('reply', 16), `이어 쓰기 ${item.reply_count}`)
    : el('span', { class: 'meta nudge' }, '첫 생각을 이어 주세요');
  return el('article', { class: 'card' + (isNew(item) ? ' is-new' : '') },
    el('a', { class: 'card-link', href: '#/idea/' + item.id },
      el('div', { class: 'card-top' },
        seatBadges(item.seat),
        el('span', { class: 'meta' }, `${item.author} · ${relTime(item.created_at)}`),
        isNew(item) && el('span', { class: 'new-dot' }, '새로'),
      ),
      el('h3', { class: 'card-title' }, item.title),
      item.last_reply_preview && el('p', { class: 'preview' }, item.last_reply_preview),
    ),
    el('div', { class: 'card-foot' }, waterButton(item.id, item.waters, { small: true }), replies),
  );
}

/** 같은 기기(dk)의 글이 연달아 나오면 FOLD_AFTER개 뒤를 접는다. */
function cardsWithFolds(items) {
  const out = [];
  let i = 0;
  while (i < items.length) {
    let j = i;
    while (j + 1 < items.length && items[i].dk && items[j + 1].dk === items[i].dk) j++;
    const run = items.slice(i, j + 1);
    run.slice(0, FOLD_AFTER).forEach((it) => out.push(ideaCard(it)));
    if (run.length > FOLD_AFTER) {
      const rest = run.slice(FOLD_AFTER);
      const holder = el('div', { class: 'fold' });
      const btn = el('button', {
        type: 'button', class: 'fold-btn',
        onclick: () => holder.replaceWith(...rest.map(ideaCard)),
      }, `${run[0].author}의 생각 ${rest.length}개 더`);
      holder.append(btn);
      out.push(holder);
    }
    i = j + 1;
  }
  return out;
}

function introCard(onClose) {
  return el('section', { class: 'intro', 'aria-label': '처음 안내' },
    el('p', null, '아이 곁에 의미 있는 다섯 사람(친구, 부모, 봉사, 다른 부모, 조부모)을 세우는 방법을 함께 나누는 곳이에요.'),
    el('p', null, '읽기와 물 주기(공감)는 누구나 할 수 있어요.'),
    el('p', null, '단톡방 링크로 열면 계속 기억돼요.'),
    el('div', { class: 'row-end' },
      el('button', { type: 'button', class: 'btn ghost small', onclick: () => go('#/help') }, '더 알아보기'),
      el('button', { type: 'button', class: 'btn small', onclick: onClose }, '알겠어요'),
    ),
  );
}

function sinceCard() {
  if (!state.lastVisit) return null;
  const items = state.items.filter((x) => !x.deleted);
  const newIdeas = items.filter((x) => Date.parse(x.created_at) > state.lastVisit).length;
  const newReplies = items.filter((x) => Date.parse(x.created_at) <= state.lastVisit && Date.parse(x.last_activity_at) > state.lastVisit).length;
  if (!newIdeas && !newReplies) return null;
  return el('p', { class: 'since' }, `지난번 이후 새 생각 ${newIdeas} · 이어 쓰기 ${newReplies}`);
}

function outboxBanner(redraw) {
  const box = store.outbox();
  if (!box) return null;
  const sendBtn = el('button', {
    type: 'button', class: 'btn small',
    onclick: async () => {
      const data = await sendWrite(box.action, box.body, sendBtn);
      if (data) {
        toast(box.action === 'reply' ? '이어 썼어요.' : '생각을 나눴어요.');
        await refreshBoot().catch(() => {});
        redraw();
      }
    },
  }, '지금 보내기');
  return el('div', { class: 'banner' },
    el('p', null, '보내지 못한 글이 있어요. 지금 보낼까요?'),
    el('p', { class: 'quote small' }, box.body.title || box.body.text || ''),
    el('div', { class: 'row-end' },
      el('button', { type: 'button', class: 'btn ghost small', onclick: () => { store.setOutbox(null); redraw(); } }, '지우기'),
      sendBtn,
    ),
  );
}

function seatStrip(onPick) {
  const counts = (state.boot && state.boot.counts) || {};
  const seats = ((state.boot && state.boot.config.seats) || ['친구', '부모', '봉사', '다른 부모', '조부모']).filter((s) => s !== '함께');
  const colors = (state.boot && state.boot.config.seat_colors) || {};
  const all = [['전체', ''], ...seats.map((s) => [s, s])];
  return el('nav', { class: 'strip', 'aria-label': '다섯 연결로 거르기' },
    all.map(([label, value]) => {
      const c = colors[label];
      const n = counts[label] ?? 0;
      const pressed = state.seat === value;
      return el('button', {
        type: 'button', class: 'seat' + (pressed ? ' on' : ''), 'aria-pressed': String(pressed),
        'aria-label': `${label} ${n}개`, onclick: () => onPick(value),
      },
        el('span', { class: 'circle', style: c ? `background:${c.bg};color:${c.fg}` : '' }, el('span', { class: 'num' }, n)),
        el('span', { class: 'seat-name' }, label),
        el('span', { class: 'num-below', 'aria-hidden': 'true' }, n),
      );
    }),
  );
}

function questionCard() {
  const q = state.boot && state.boot.today_question;
  if (!q) return null;
  return el('section', { class: 'question', 'aria-label': '오늘의 질문' },
    el('p', { class: 'eyebrow' }, '오늘의 질문'),
    el('p', { class: 'q-text' }, q.text),
    el('button', { type: 'button', class: 'btn sun', onclick: () => go('#/new?q=' + encodeURIComponent(q.id)) }, '이 질문에서 떠오른 방안 나누기'),
  );
}

export async function renderFeed(m, { restoreScroll } = {}) {
  const top = el('div');
  const list = el('div', { class: 'list', 'aria-live': 'polite' });
  const more = el('div', { class: 'more' });
  m.append(top, list, more);

  const drawTop = () => {
    fill(top,
      outboxBanner(draw),
      !store.load('intro_closed', false) && introCard(() => { store.save('intro_closed', true); draw(); }),
      sinceCard(),
      el('button', { type: 'button', class: 'compose-line', onclick: () => go('#/new' + (state.seat ? '?seat=' + encodeURIComponent(state.seat) : '')) },
        icon('pen', 18), '어떤 방안이 떠올랐나요?'),
      seatStrip(pickSeat),
      !state.seat && questionCard(),
    );
  };
  const drawList = () => {
    if (!state.boot && !state.items.length) {
      list.replaceChildren(el('p', { class: 'empty' }, '불러오는 중이에요…'));
    } else if (!state.items.length) {
      list.replaceChildren(el('p', { class: 'empty' }, state.seat ? `${state.seat} 연결에는 아직 생각이 없어요. 첫 생각을 나눠 주세요.` : '아직 나눈 생각이 없어요. 떠오른 것을 한 줄로 나눠 주세요.'));
    } else {
      list.replaceChildren(...cardsWithFolds(state.items));
    }
    more.replaceChildren(state.nextCursor ? el('button', { type: 'button', class: 'btn ghost wide', onclick: loadMore }, '생각 더 보기') : '');
  };
  function draw() { drawTop(); drawList(); }

  async function pickSeat(value) {
    state.seat = state.seat === value ? '' : value;
    draw();
    await loadSeat();
  }

  async function loadSeat() {
    if (!state.seat) {
      state.items = state.boot ? state.boot.items : [];
      state.nextCursor = state.boot ? state.boot.next_cursor : null;
      drawList();
      return;
    }
    list.replaceChildren(el('p', { class: 'empty' }, '불러오는 중이에요…'));
    try {
      const d = await get('feed', { seat: state.seat });
      state.items = d.items;
      state.nextCursor = d.next_cursor;
    } catch (e) {
      toast(messageFor(e));
      state.items = [];
    }
    drawList();
  }

  async function loadMore(e) {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const params = { cursor: state.nextCursor };
      if (state.seat) params.seat = state.seat;
      const d = await get('feed', params);
      state.items = state.items.concat(d.items);
      state.nextCursor = d.next_cursor;
      drawList();
    } catch (err) {
      toast(messageFor(err));
      btn.disabled = false;
    }
  }

  draw();
  if (restoreScroll) requestAnimationFrame(() => window.scrollTo(0, restoreScroll));
  try {
    await refreshBoot();
    if (state.seat) await loadSeat();
    if (m.isConnected) draw();
  } catch (e) {
    if (!state.boot) list.replaceChildren(el('p', { class: 'empty' }, '지금은 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.'));
    else toast('새 소식을 불러오지 못했어요. 저장된 화면을 보여 드려요.');
  }
}
