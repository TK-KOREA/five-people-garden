// 입구: 코드 링크 받기, 저장된 응답 먼저 그리기, 라우팅.
import { get, post } from './api.js';
import * as store from './store.js';
import { el, fill, icon, setSeatColors, toast } from './ui.js';
import { renderFeed } from './views/feed.js';
import { renderIdea } from './views/idea.js';
import { renderCompose } from './views/compose.js';
import { renderMine } from './views/mine.js';
import { renderHelp } from './views/help.js';
import { renderAdmin } from './views/admin.js';

export const state = {
  boot: null, // 마지막 bootstrap 응답
  items: [], // 지금 보이는 피드
  nextCursor: null,
  seat: '', // 거르는 연결
  lastVisit: 0, // 지난번 방문 시각(ms). "새로" 표시 기준
  loading: false,
  scrollTop: false, // 다음 첫 화면은 맨 위부터(나누기 직후)
};

// ---------- #c= 코드 링크 (기획서 3-5) ----------

function takeCodeFromHash() {
  const m = location.hash.match(/^#c=(.*)$/);
  if (!m) return false;
  let code = m[1];
  try { code = decodeURIComponent(code); } catch (e) { /* 그대로 */ }
  code = code.trim();
  if (code) store.setEditCode(code);
  history.replaceState(null, '', location.pathname + location.search);
  if (code) setTimeout(() => toast('이제 생각을 나눌 수 있어요.'), 300);
  return true;
}

// ---------- 글자 크기 3단계 ----------

const SCALES = ['100', '125', '150'];
function applyScale(v) {
  document.documentElement.dataset.scale = SCALES.includes(v) ? v : '100';
}
function cycleScale() {
  const cur = store.load('scale', '100');
  const next = SCALES[(SCALES.indexOf(cur) + 1) % SCALES.length];
  store.save('scale', next);
  applyScale(next);
  toast(`글자 크기 ${next}%`);
}

// ---------- 데이터 ----------

export function applyBoot(data) {
  state.boot = data;
  setSeatColors(data.config && data.config.seat_colors);
}

/** 저장된 응답을 먼저 보여 주고, 새 응답이 오면 합치지 않고 통째로 바꾼다(기획서 6장 캐시). */
export async function refreshBoot() {
  const data = await get('bootstrap');
  applyBoot(data);
  store.save('boot_cache', data);
  store.keepIdeas((data.items || []).map((x) => x.id));
  if (!state.seat) {
    state.items = data.items;
    state.nextCursor = data.next_cursor;
  }
  return data;
}

/** 방금 나눈 생각을 서버에 다시 묻지 않고 피드 맨 위에 넣는다. 새 응답이 오면 통째로 바뀐다. */
export function addItemLocally(item) {
  if (!item || !state.boot) return;
  state.boot.items = [item, ...(state.boot.items || []).filter((x) => x.id !== item.id)];
  const counts = state.boot.counts || {};
  counts['전체'] = (counts['전체'] || 0) + 1;
  String(item.seat || '').split(',').forEach((s) => { if (s in counts) counts[s] += 1; });
  if (!state.seat) state.items = state.boot.items;
  store.save('boot_cache', state.boot);
}

/** 카드 하나의 값만 바꾼다(이어 쓰기 수, 미리보기, 상태 등). */
export function patchItem(id, fields) {
  for (const list of [state.items, state.boot && state.boot.items]) {
    const it = (list || []).find((x) => x.id === id);
    if (it) Object.assign(it, fields);
  }
  if (state.boot) store.save('boot_cache', state.boot);
}

function recordVisit() {
  const today = store.kstDay();
  if (store.load('visit_day', '') === today) return;
  post('visit', { device_id: store.deviceId() })
    .then(() => store.save('visit_day', today))
    .catch(() => { /* 다음에 다시 */ });
}

// ---------- 라우팅 ----------

export function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, query] = h.split('?');
  return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(query || '') };
}

const main = () => document.getElementById('main');

function setHeader({ title, back } = {}) {
  const header = document.getElementById('header');
  fill(header,
    back
      ? el('button', { type: 'button', class: 'icon-btn', 'aria-label': '뒤로', onclick: () => (history.length > 1 ? history.back() : go('#/')) }, icon('back', 24))
      : null,
    el('h1', { class: back ? 'h-title small' : 'h-title' }, title || '한 아이 곁에 다섯 사람'),
    el('div', { class: 'h-actions' },
      el('button', { type: 'button', class: 'icon-btn text-btn small-text', onclick: () => go('#/mine') }, '내 글'),
      el('button', { type: 'button', class: 'icon-btn text-btn', 'aria-label': '글자 크기', onclick: cycleScale }, '가'),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': '도움말', onclick: () => go('#/help') }, icon('help', 22)),
    ),
  );
}

let scrollMemo = 0;
async function route() {
  if (takeCodeFromHash()) { /* 해시를 지웠으니 첫 화면으로 */ }
  const { parts, params } = parseHash();
  const m = main();
  const prevWasFeed = m.dataset.view === 'feed';
  if (prevWasFeed) scrollMemo = window.scrollY;
  m.replaceChildren();
  document.body.classList.remove('has-bar');
  const view = parts[0] || '';
  m.dataset.view = view || 'feed';
  try {
    if (view === '' ) {
      setHeader();
      const restore = state.scrollTop ? 0 : scrollMemo;
      state.scrollTop = false;
      await renderFeed(m, { restoreScroll: restore });
    } else if (view === 'idea' && parts[1]) {
      setHeader({ back: true, title: '함께 다듬기' });
      await renderIdea(m, parts[1], { focusReply: params.get('reply') === '1' });
    } else if (view === 'new') {
      setHeader({ back: true, title: '생각 나누기' });
      renderCompose(m, { seat: params.get('seat') || '', questionId: params.get('q') || '', parentId: params.get('parent') || '' });
    } else if (view === 'edit' && parts[1]) {
      setHeader({ back: true, title: '내 생각 고치기' });
      await renderCompose(m, { editId: parts[1] });
    } else if (view === 'mine') {
      setHeader({ back: true, title: '내가 나눈 생각' });
      await renderMine(m);
    } else if (view === 'help') {
      setHeader({ back: true, title: '도움말' });
      renderHelp(m);
    } else if (view === 'admin') {
      setHeader({ back: true, title: '관리' });
      renderAdmin(m);
    } else {
      go('#/');
    }
  } catch (e) {
    console.error(e);
    m.append(el('p', { class: 'empty' }, '화면을 그리지 못했어요. 새로고침해 주세요.'));
  }
  if (view !== '') window.scrollTo(0, 0);
}

function start() {
  applyScale(store.load('scale', '100'));
  store.deviceId();
  const prev = store.load('last_visit', 0);
  state.lastVisit = prev;
  // 다음 방문의 기준은 이번에 연 시각. 같은 날 여러 번 열어도 직전 방문 기준.
  store.save('last_visit', Date.now());
  const cached = store.load('boot_cache', null);
  if (cached) {
    applyBoot(cached);
    state.items = cached.items || [];
    state.nextCursor = cached.next_cursor;
  }
  window.addEventListener('hashchange', route);
  route();
  recordVisit();
}

start();
