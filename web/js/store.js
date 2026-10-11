// 기기(브라우저)에 두는 값. 저장소가 막혀 있어도 화면은 돌아가야 하므로 모두 try로 감싼다.

const P = 'fpg_';

export function load(key, fallback) {
  try {
    const v = localStorage.getItem(P + key);
    return v == null ? fallback : JSON.parse(v);
  } catch (e) {
    return fallback;
  }
}

export function save(key, value) {
  try {
    if (value === undefined) localStorage.removeItem(P + key);
    else localStorage.setItem(P + key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

// 관리 코드는 탭을 닫으면 사라지는 sessionStorage에만(기획서 6장).
export function sessionLoad(key) {
  try { return sessionStorage.getItem(P + key) || ''; } catch (e) { return ''; }
}
export function sessionSave(key, value) {
  try {
    if (value) sessionStorage.setItem(P + key, value);
    else sessionStorage.removeItem(P + key);
  } catch (e) { /* 없어도 된다 */ }
}

export function randomId(n = 20) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export function deviceId() {
  let id = load('device_id', '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    id = randomId(20);
    save('device_id', id);
  }
  return id;
}

// 참여 코드
export const editCode = () => load('edit_code', '');
export const setEditCode = (c) => save('edit_code', c || undefined);

// 내 글: {id: edit_token}. 내 글 모아 보기와 고치기·지우기에 쓴다.
export function tokens() {
  return load('tokens', {});
}
export function addToken(id, token) {
  if (!id || !token) return;
  const t = tokens();
  t[id] = token;
  save('tokens', t);
}
export function tokenFor(id) {
  return tokens()[id] || '';
}

// 내 생각마다 마지막으로 본 이어 쓰기 수(새로 달린 수 표시용)
export function seenReplies(id) {
  return load('seen', {})[id] ?? null;
}
export function setSeenReplies(id, n) {
  const s = load('seen', {});
  s[id] = n;
  save('seen', s);
}

// 최근에 본 생각 상세(이어 쓰기 포함). 다시 열 때 서버를 기다리지 않고 먼저 그린다. 최근 20개.
export function cachedIdea(id) {
  return load('idea_cache', {})[id] || null;
}
export function cacheIdea(data) {
  if (!data || !data.idea) return;
  const c = load('idea_cache', {});
  delete c[data.idea.id];
  c[data.idea.id] = data;
  const keys = Object.keys(c);
  for (const k of keys.slice(0, Math.max(0, keys.length - 20))) delete c[k];
  save('idea_cache', c);
}
/** 상세 저장분에서 ids에 없는 글을 지운다. 숨긴 글이 기기에 남지 않게(기획서 6장, QA B-08). */
export function keepIdeas(ids) {
  const keep = new Set(ids);
  const c = load('idea_cache', {});
  let changed = false;
  for (const k of Object.keys(c)) if (!keep.has(k)) { delete c[k]; changed = true; }
  if (changed) save('idea_cache', c);
}

export function forgetIdea(id) {
  const c = load('idea_cache', {});
  delete c[id];
  save('idea_cache', c);
}

// 보내지 못한 글(기획서 6-1). request_id는 다시 보낼 때도 같은 값.
export function outbox() {
  return load('outbox', null);
}
export function setOutbox(item) {
  save('outbox', item || undefined);
}

// 물 준 기록: 하루 한 번 표시용. 판단은 서버가 한다.
export function wateredToday(id, day) {
  const w = load('watered', {});
  return w[id] === day;
}
export function unmarkWatered(id) {
  const w = load('watered', {});
  delete w[id];
  save('watered', w);
}
export function markWatered(id, day) {
  const w = load('watered', {});
  for (const k of Object.keys(w)) if (w[k] !== day) delete w[k];
  w[id] = day;
  save('watered', w);
}

export function kstDay(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
