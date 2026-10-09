// 0단계 시험 페이지. Apps Script 웹 앱을 배포한 뒤 아래 한 줄만 바꾼다.
const API_URL = 'https://script.google.com/macros/s/AKfycbyIAX5vgaanTk0NZXbSymXFyba6oVpezgAVxtRc20l4owbblAo0-O8vCekdRl3ZljGWtg/exec';

const K = {
  api: 's0_api',
  log: 's0_net_log',
  lastCall: 's0_last_call',
  cached: 's0_cached_read',
  visits: 's0_visits',
  firstVisit: 's0_first_visit',
  lastVisit: 's0_last_visit',
  code: 's0_code',
  codeAt: 's0_code_at',
  manual: 's0_manual',
  formula: 's0_formula',
  scale: 's0_scale',
};

const FORMULA_INPUTS = [
  '=1+1',
  '+1+1',
  '-1+1',
  '@SUM(1,1)',
  '=HYPERLINK("https://example.com","x")',
  '0012',
  '1/2',
  '2026-10-09',
  '3.14',
  'TRUE',
  "'앞따옴표",
  '  앞뒤 공백  ',
  '줄\n바꿈',
  '한글 😀',
  '- 목록처럼 쓴 글',
  "''두 따옴표",
];

const FORMULA_LABELS = {
  at: '시각(@)',
  appendRow: 'appendRow',
  raw: '@ + setValues',
  quote_all: "@ + 모두 앞에 '",
  quote_risky: "@ + 위험할 때만 '",
  rich: '@ + 리치 텍스트',
};

const ECHO_TEXT = '한글 확인 😀 =1+1 "따옴표" & <꺾쇠>';

const SEATS = [
  ['전체', '#F1EEE7', '#2B2A27', 24],
  ['친구', '#E3EEF6', '#2C5878', 6],
  ['부모', '#F6E8D8', '#7A4F2F', 4],
  ['봉사', '#E2EEDC', '#3E6A35', 5],
  ['다른 부모', '#F3E4E0', '#8E4331', 3],
  ['조부모', '#ECE6F2', '#5B4878', 2],
];

const MANUAL_LABELS = {
  storage: 'localStorage 유지',
  code: '#c= 링크',
  share: 'navigator.share',
  print: 'window.print',
  kbd: '키보드와 하단 입력줄',
  font: '시스템 글꼴 최대',
};

const state = {
  firstCallDone: false,
  cacheShownMs: null,
  hashBefore: location.hash,
  printEvents: [],
  kbdMaxCover: 0,
};

// ---------- 도움 함수 ----------

const $ = (id) => document.getElementById(id);

// 사용자 글과 서버 값은 모두 textContent로 넣는다.
function el(tag, attrs, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v;
    else n.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}

function store(key, value) {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    if (v == null) return fallback;
    try { return JSON.parse(v); } catch (e) { return v; }
  } catch (e) {
    return fallback;
  }
}

function kv(dl, pairs) {
  dl.replaceChildren();
  for (const [k, v, cls] of pairs) {
    dl.append(el('dt', null, k), el('dd', cls ? { class: cls } : null, v));
  }
}

function kst(ts) {
  if (!ts) return '-';
  const d = new Date(Number(ts) + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function ago(ms) {
  if (ms == null) return '처음';
  const s = Math.round(ms / 1000);
  if (s < 60) return s + '초';
  const m = Math.round(s / 60);
  if (m < 60) return m + '분';
  const h = Math.floor(m / 60);
  return h + '시간 ' + (m % 60) + '분';
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return 'clipboard API';
  } catch (e) {
    const ta = el('textarea', { style: 'position:fixed;top:0;left:0;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    ta.remove();
    return ok ? 'execCommand' : null;
  }
}

// JSON이 아니면(구글 오류 페이지 등) 제목과 앞부분을 오류로 남긴다.
async function readJson(r) {
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    const title = (text.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
    const plain = text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return { ok: false, error: { code: 'HTTP ' + r.status, message: (title + ' ' + plain.slice(0, 160)).trim() } };
  }
}

function apiUrl() {
  return load(K.api, '') || API_URL;
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

// ---------- 기기 ----------

const ua = navigator.userAgent;
const env = {
  kakao: /KAKAOTALK/i.test(ua),
  ios: /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1),
  android: /Android/i.test(ua),
};
env.label = (env.ios ? 'iOS' : env.android ? 'Android' : '기타') + ' ' + (env.kakao ? '카톡 인앱' : '브라우저');

function renderEnv() {
  kv($('env'), [
    ['판별', env.label],
    ['UA', ua],
    ['화면', `${screen.width}×${screen.height} · 창 ${innerWidth}×${innerHeight} · DPR ${devicePixelRatio}`],
    ['다크 모드', matchMedia('(prefers-color-scheme: dark)').matches ? '예' : '아니오'],
    ['서버 주소', apiUrl() || '없음 — stage0.js의 API_URL을 채워 주세요', apiUrl() ? null : 'bad'],
  ]);
  $('api-input').value = load(K.api, '');
}

// ---------- 1. 연결 ----------

async function call(kind) {
  const url = apiUrl();
  if (!url) {
    toast('서버 주소가 없어요.');
    return null;
  }
  const last = Number(load(K.lastCall, 0));
  const gap = last ? Date.now() - last : null;
  const first = !state.firstCallDone;
  state.firstCallDone = true;
  const t = performance.now();
  let res = null;
  let err = null;
  try {
    let r;
    if (kind === 'ping' || kind === 'read') {
      r = await fetch(url + '?action=' + kind);
    } else {
      r = await fetch(url, { method: 'POST', body: JSON.stringify({ action: 'echo', text: ECHO_TEXT }) });
    }
    res = await readJson(r);
    if (!res.ok) err = (res.error && res.error.code + ' ' + res.error.message) || '응답 오류';
  } catch (e) {
    err = e.name + ': ' + e.message;
  }
  const ms = Math.round(performance.now() - t);
  store(K.lastCall, String(Date.now()));

  const entry = {
    at: Date.now(),
    kind,
    ms,
    server_ms: res ? res.server_ms : null,
    gap,
    first,
    ok: !err,
    err,
  };
  if (kind === 'echo' && res && res.data) {
    entry.echo_same = res.data.text === ECHO_TEXT;
    entry.content_type = res.data.content_type;
  }
  if (kind === 'read' && res && res.ok) {
    store(K.cached, { at: Date.now(), data: res.data, server_at: res.at });
  }
  const log = load(K.log, []);
  log.unshift(entry);
  store(K.log, log.slice(0, 100));
  renderNet();
  if (err) toast('연결 오류: ' + err);
  return entry;
}

// 처음 그릴 때만 표시 시간을 잰다. 서버 응답 뒤 다시 그릴 때는 재지 않는다.
function renderCache(initial) {
  const c = load(K.cached, null);
  if (initial && c) state.cacheShownMs = Math.round(performance.now());
  const nav = performance.getEntriesByType('navigation')[0];
  kv($('cache-info'), [
    ['저장된 응답', c ? `시트 ${c.data.rows}행 · ${kst(c.at)}에 받음` : '없음(첫 방문)'],
    ['저장된 응답 표시', state.cacheShownMs != null ? state.cacheShownMs + 'ms (페이지 열기부터)' : '-'],
    ['페이지 DOMContentLoaded', nav ? Math.round(nav.domContentLoadedEventEnd) + 'ms' : '-'],
  ]);
}

function netStats(log) {
  const out = {};
  for (const kind of ['ping', 'read', 'echo']) {
    const ok = log.filter((e) => e.kind === kind && e.ok);
    const warm = ok.filter((e) => e.gap != null && e.gap < 60 * 1000).map((e) => e.ms);
    const cold = ok.filter((e) => e.gap == null || e.gap >= 10 * 60 * 1000);
    out[kind] = { n: ok.length, warm: median(warm), warmN: warm.length, cold };
  }
  return out;
}

function renderNet() {
  const log = load(K.log, []);
  const s = netStats(log);
  const pairs = [];
  for (const kind of ['read', 'ping', 'echo']) {
    const x = s[kind];
    if (!x.n) continue;
    const coldTxt = x.cold.length
      ? x.cold.slice(0, 3).map((e) => `${e.ms}ms(쉰 ${ago(e.gap)})`).join(', ')
      : '-';
    pairs.push([kind, `이어 부를 때 중앙값 ${x.warm ?? '-'}ms (n=${x.warmN}) · 10분 넘게 쉰 뒤 ${coldTxt}`]);
  }
  const echo = log.find((e) => e.kind === 'echo' && e.ok);
  if (echo) {
    pairs.push(['POST 본문', `${echo.content_type || '?'} · 한글·이모지 ${echo.echo_same ? '그대로' : '달라짐'}`, echo.echo_same ? 'ok' : 'bad']);
  }
  kv($('net-stats'), pairs.length ? pairs : [['기록', '아직 없음']]);

  const table = $('net-log');
  table.replaceChildren(
    el('tr', null, ...['시각', '종류', '왕복', '서버', '쉰 시간', '결과'].map((h) => el('th', null, h))),
  );
  for (const e of log.slice(0, 20)) {
    table.append(el('tr', null,
      el('td', null, kst(e.at).slice(5)),
      el('td', null, e.kind + (e.first ? ' ·첫' : '')),
      el('td', null, e.ms + 'ms'),
      el('td', null, e.server_ms != null ? e.server_ms + 'ms' : '-'),
      el('td', null, ago(e.gap)),
      el('td', { class: e.ok ? 'ok' : 'bad' }, e.ok ? '성공' : e.err),
    ));
  }
}

async function burst() {
  const btn = $('burst');
  btn.disabled = true;
  for (const kind of ['read', 'ping', 'echo']) {
    for (let i = 0; i < 5; i++) {
      const r = await call(kind);
      if (!r || !r.ok) { btn.disabled = false; return; }
    }
  }
  btn.disabled = false;
  toast('15번 불렀어요.');
}

// ---------- 2. 수식 ----------

async function runFormula() {
  const url = apiUrl();
  if (!url) return toast('서버 주소가 없어요.');
  const inputs = [...FORMULA_INPUTS];
  const extra = $('formula-extra').value;
  if (extra) inputs.push(extra);
  const btn = $('formula-run');
  btn.disabled = true;
  $('formula-sum').textContent = '쓰는 중…';
  const t = performance.now();
  try {
    const r = await fetch(url, { method: 'POST', body: JSON.stringify({ action: 'formula', inputs }) });
    const res = await readJson(r);
    if (!res.ok) throw new Error(res.error.code + ' ' + res.error.message);
    const saved = { at: Date.now(), ms: Math.round(performance.now() - t), columns: res.data.columns, results: res.data.results };
    store(K.formula, saved);
    renderFormula();
  } catch (e) {
    $('formula-sum').textContent = '실패: ' + e.message;
    $('formula-sum').className = 'result bad';
  }
  btn.disabled = false;
}

// 글자 그대로 남고 수식이 없으면 통과.
function cellPass(r, i) {
  const v = r.value[i];
  return v.type === 'string' && v.value === r.input && r.formula[i] === '';
}

function formulaSummary(saved) {
  if (!saved || !saved.columns) return null;
  const rs = saved.results;
  const cols = saved.columns.slice(1).map((name, k) => {
    const i = k + 1;
    const fails = rs.filter((r) => !cellPass(r, i)).map((r) => r.input);
    return { name, label: FORMULA_LABELS[name] || name, pass: rs.length - fails.length, fails };
  });
  const timeText = rs.every((r) => r.value[0].type === 'string');
  return { n: rs.length, cols, timeText };
}

function renderFormula() {
  const saved = load(K.formula, null);
  const sum = $('formula-sum');
  const table = $('formula-table');
  table.replaceChildren();
  sum.replaceChildren();
  const s = formulaSummary(saved);
  if (!s) return;
  sum.className = 'result';
  sum.append(el('span', null, `${kst(saved.at)} · ${saved.ms}ms · 시각 열 문자열 ${s.timeText ? '예' : '아니오'}`));
  for (const c of s.cols) {
    sum.append(el('br'), el('span', { class: c.pass === s.n ? 'ok' : 'bad' }, `${c.label}: ${c.pass}/${s.n}`),
      el('span', { class: 'soft' }, c.fails.length ? ' 실패 ' + c.fails.map((x) => JSON.stringify(x)).join(', ') : ''));
  }

  table.append(el('tr', null, el('th', null, '입력'), el('th', null, '행'),
    ...saved.columns.slice(1).map((name) => el('th', null, FORMULA_LABELS[name] || name))));
  for (const r of saved.results) {
    const cell = (i) => {
      const v = r.value[i];
      const parts = [`${v.type}: ${JSON.stringify(v.value)}`];
      if (r.formula[i]) parts.push('수식 ' + r.formula[i]);
      parts.push('서식 ' + (r.format[i] || '-'));
      return el('td', { class: cellPass(r, i) ? 'wrap ok' : 'wrap bad' }, parts.join('\n'));
    };
    table.append(el('tr', null,
      el('td', { class: 'wrap mono' }, JSON.stringify(r.input)),
      el('td', null, r.row),
      ...saved.columns.slice(1).map((_, k) => cell(k + 1)),
    ));
  }
}

// ---------- 3-1. 저장소 ----------

function initStorage() {
  let lsOk = true;
  try {
    localStorage.setItem('s0_probe', '1');
    localStorage.removeItem('s0_probe');
  } catch (e) {
    lsOk = false;
  }
  let ssOk = true;
  try {
    sessionStorage.setItem('s0_probe', '1');
    sessionStorage.removeItem('s0_probe');
  } catch (e) {
    ssOk = false;
  }
  const visits = Number(load(K.visits, 0)) + 1;
  const prevVisit = load(K.lastVisit, null);
  if (!load(K.firstVisit, null)) store(K.firstVisit, String(Date.now()));
  store(K.visits, String(visits));
  store(K.lastVisit, String(Date.now()));
  state.storage = { lsOk, ssOk, visits, prevVisit, firstVisit: load(K.firstVisit, null) };
}

function renderStorage() {
  const s = state.storage;
  kv($('storage'), [
    ['localStorage', s.lsOk ? '쓸 수 있음' : '쓸 수 없음', s.lsOk ? 'ok' : 'bad'],
    ['sessionStorage', s.ssOk ? '쓸 수 있음' : '쓸 수 없음'],
    ['열기 횟수', s.visits + '번째'],
    ['처음 연 시각', kst(s.firstVisit)],
    ['지난번 연 시각', s.prevVisit ? `${kst(s.prevVisit)} (${ago(Date.now() - s.prevVisit)} 전)` : '-'],
  ]);
}

// ---------- 3-2. #c= ----------

// 기획서 3-5: 공백과 대소문자는 무시한다.
function normalizeCode(c) {
  return c.replace(/\s+/g, '').toLowerCase();
}

function takeCodeFromHash() {
  const m = location.hash.match(/^#c=(.*)$/);
  if (!m) return;
  let raw = m[1];
  try { raw = decodeURIComponent(raw); } catch (e) { /* 그대로 둔다 */ }
  const code = normalizeCode(raw);
  if (code) {
    store(K.code, code);
    store(K.codeAt, String(Date.now()));
  }
  history.replaceState(null, '', location.pathname + location.search);
  state.codeReceived = { raw: m[1], code };
}

function renderCode() {
  const got = state.codeReceived;
  const saved = load(K.code, null);
  kv($('code'), [
    ['이번에 받은 해시', got ? got.raw : '없음'],
    ['풀어 쓴 코드', got ? got.code : '-'],
    ['기기에 저장된 코드', saved ? `${saved} (${kst(load(K.codeAt, null))})` : '없음', saved ? 'ok' : null],
    ['지금 주소', location.href],
    ['주소창에서 지움', got ? (location.hash ? '아니오' : '예') : '-', got ? (location.hash ? 'bad' : 'ok') : null],
  ]);
}

async function copyCodeLink(code) {
  const link = location.origin + location.pathname + '#c=' + encodeURIComponent(code);
  $('code-link').textContent = link;
  const how = await copyText(link);
  toast(how ? '링크를 복사했어요.' : '복사하지 못했어요. 위 링크를 길게 눌러 복사해 주세요.');
}

// ---------- 3-3. 공유 ----------

function renderShare() {
  kv($('share'), [
    ['navigator.share', typeof navigator.share === 'function' ? '있음' : '없음', typeof navigator.share === 'function' ? 'ok' : 'bad'],
    ['navigator.clipboard', navigator.clipboard ? '있음' : '없음'],
  ]);
}

async function runShare() {
  const res = $('share-res');
  if (typeof navigator.share !== 'function') {
    res.textContent = 'navigator.share가 없어요. 링크 복사로 대신합니다.';
    return runCopy();
  }
  try {
    await navigator.share({ title: '0단계 시험', text: '다섯 사람 아이디어 정원 공유 시험', url: location.origin + location.pathname });
    res.textContent = '공유 완료(성공으로 돌아옴)';
    res.className = 'result ok';
    state.shareResult = '성공';
  } catch (e) {
    res.textContent = '공유 실패: ' + e.name + ' ' + e.message;
    res.className = 'result bad';
    state.shareResult = e.name;
  }
}

async function runCopy() {
  const how = await copyText(location.origin + location.pathname);
  $('share-res').textContent = how ? `복사됨 (${how})` : '복사 실패';
  state.copyResult = how || '실패';
}

// ---------- 3-4. 인쇄 ----------

function renderPrint() {
  kv($('print'), [
    ['window.print', typeof window.print === 'function' ? '있음' : '없음'],
    ['인쇄 이벤트', state.printEvents.length ? state.printEvents.join(', ') : '아직 없음'],
  ]);
}

function runPrint() {
  state.printEvents = [];
  const t = performance.now();
  try {
    window.print();
    const ms = Math.round(performance.now() - t);
    // print()가 창을 띄우는 동안 막히면 ms가 커진다. 바로 돌아오면 아무 일도 없었을 수 있다.
    $('print-res').textContent = `print()가 ${ms}ms 만에 돌아왔어요. 인쇄 창이 떴는지 아래에서 골라 주세요.`;
    state.printMs = ms;
  } catch (e) {
    $('print-res').textContent = '오류: ' + e.name + ' ' + e.message;
    state.printMs = 'error';
  }
  setTimeout(renderPrint, 500);
}

addEventListener('beforeprint', () => { state.printEvents.push('beforeprint'); renderPrint(); });
addEventListener('afterprint', () => { state.printEvents.push('afterprint'); renderPrint(); });

// ---------- 3-5. 키보드 ----------

let kbdFix = true;

function placeBar() {
  const bar = $('bar');
  if (bar.hidden) return;
  const vv = window.visualViewport;
  if (kbdFix && vv) {
    const offset = innerHeight - vv.height - vv.offsetTop;
    bar.style.transform = offset > 0 ? `translateY(${-offset}px)` : '';
  } else {
    bar.style.transform = '';
  }
  requestAnimationFrame(() => {
    const rect = bar.getBoundingClientRect();
    const visibleBottom = vv ? vv.offsetTop + vv.height : innerHeight;
    const cover = Math.max(0, Math.round(rect.bottom - visibleBottom));
    state.kbdMaxCover = Math.max(state.kbdMaxCover, cover);
    const info = vv
      ? `inner ${innerHeight} · vv ${Math.round(vv.height)} · top ${Math.round(vv.offsetTop)} · 가림 ${cover}px`
      : `visualViewport 없음 · inner ${innerHeight}`;
    $('bar-info').textContent = info;
    renderKbd(cover);
  });
}

function renderKbd(cover) {
  const vv = window.visualViewport;
  kv($('kbd'), [
    ['visualViewport', vv ? '있음' : '없음', vv ? 'ok' : 'bad'],
    ['지금 가림', cover == null ? '-' : cover + 'px', cover ? 'bad' : null],
    ['가장 많이 가림', state.kbdMaxCover + 'px'],
  ]);
}

function toggleBar() {
  const bar = $('bar');
  bar.hidden = !bar.hidden;
  const btn = $('kbd-toggle');
  btn.setAttribute('aria-pressed', String(!bar.hidden));
  btn.textContent = bar.hidden ? '하단 입력줄 켜기' : '하단 입력줄 끄기';
  placeBar();
}

function toggleFix() {
  kbdFix = !kbdFix;
  const btn = $('kbd-fix');
  btn.setAttribute('aria-pressed', String(kbdFix));
  btn.textContent = 'visualViewport 보정: ' + (kbdFix ? '켬' : '끔');
  placeBar();
}

if (window.visualViewport) {
  visualViewport.addEventListener('resize', placeBar);
  visualViewport.addEventListener('scroll', placeBar);
}
addEventListener('resize', placeBar);

// ---------- 3-6. 글꼴 ----------

function renderStrip() {
  const strip = $('strip');
  strip.replaceChildren();
  for (const [name, bg, fg, n] of SEATS) {
    strip.append(el('div', { class: 'seat' },
      el('span', { class: 'circle', style: `background:${bg};color:${fg}` }, n),
      el('span', null, name),
    ));
  }
}

function measureFont() {
  const probe = el('span', { style: 'position:absolute;visibility:hidden;white-space:nowrap;display:inline-block;font-size:16px;line-height:1' }, '가나다라마바사아자차');
  const apple = el('span', { style: 'position:absolute;visibility:hidden;font:-apple-system-body' }, '가');
  const rem = el('span', { style: 'position:absolute;visibility:hidden;display:inline-block;font-size:1rem;line-height:1' }, '가');
  document.body.append(probe, apple, rem);
  const r = probe.getBoundingClientRect();
  const appleSize = getComputedStyle(apple).fontSize;
  const out = {
    rootPx: getComputedStyle(document.documentElement).fontSize,
    probeComputed: getComputedStyle(probe).fontSize,
    probeHeight: Math.round(r.height * 10) / 10,
    probeCharW: Math.round((r.width / 10) * 10) / 10,
    remHeight: Math.round(rem.getBoundingClientRect().height * 10) / 10,
    appleBody: CSS.supports('font', '-apple-system-body') ? appleSize : '지원 안 함',
    textSizeAdjust: getComputedStyle(document.documentElement).webkitTextSizeAdjust || '-',
  };
  probe.remove();
  apple.remove();
  rem.remove();
  const strip = $('strip');
  out.stripOverflow = strip.scrollWidth > strip.clientWidth + 1;
  out.docOverflow = document.documentElement.scrollWidth > innerWidth + 1;
  out.zoom = Math.round((out.probeHeight / 16) * 100) / 100;
  state.font = out;
  return out;
}

function renderFont() {
  const f = measureFont();
  kv($('font'), [
    ['글자 크기 단계', (load(K.scale, '100')) + '%'],
    ['html 글자 크기', f.rootPx],
    ['16px 글자 실측', `높이 ${f.probeHeight}px · 글자 폭 ${f.probeCharW}px (×${f.zoom})`, f.zoom > 1.05 ? 'bad' : null],
    ['1rem 실측 높이', f.remHeight + 'px'],
    ['-apple-system-body', f.appleBody],
    ['text-size-adjust', f.textSizeAdjust],
    ['연결 띠 넘침', f.stripOverflow ? '예(가로 스크롤)' : '아니오', f.stripOverflow ? 'bad' : 'ok'],
    ['화면 가로 넘침', f.docOverflow ? '예' : '아니오', f.docOverflow ? 'bad' : 'ok'],
  ]);
}

function setScale(v) {
  document.documentElement.dataset.scale = v;
  store(K.scale, v);
  document.querySelectorAll('[data-scale]').forEach((b) => {
    if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', String(b.dataset.scale === v));
  });
  requestAnimationFrame(renderFont);
}

// ---------- 직접 확인 ----------

function renderManual() {
  const m = load(K.manual, {});
  document.querySelectorAll('.manual').forEach((box) => {
    const key = box.dataset.key;
    box.replaceChildren(el('span', { class: 'soft' }, '직접 확인'));
    for (const v of ['됨', '일부', '안 됨']) {
      const b = el('button', { type: 'button', 'aria-pressed': String(m[key] === v) }, v);
      b.addEventListener('click', () => {
        const cur = load(K.manual, {});
        cur[key] = cur[key] === v ? undefined : v;
        store(K.manual, cur);
        renderManual();
        renderSummary();
      });
      box.append(b);
    }
  });
}

// ---------- 결과 ----------

function buildSummary() {
  const lines = [];
  const m = load(K.manual, {});
  const log = load(K.log, []);
  const s = netStats(log);
  lines.push(`### ${env.label} — ${kst(Date.now())} KST`);
  lines.push(`- UA: ${ua}`);
  for (const kind of ['read', 'ping', 'echo']) {
    const x = s[kind];
    if (!x.n) continue;
    const cold = x.cold.length ? x.cold.slice(0, 3).map((e) => `${e.ms}ms(쉰 ${ago(e.gap)})`).join(', ') : '-';
    lines.push(`- ${kind}: 이어 부를 때 중앙값 ${x.warm ?? '-'}ms (n=${x.warmN}), 쉰 뒤 ${cold}`);
  }
  const echo = log.find((e) => e.kind === 'echo' && e.ok);
  if (echo) lines.push(`- POST 본문: ${echo.content_type}, 한글·이모지 ${echo.echo_same ? '그대로' : '달라짐'}`);
  const fails = log.filter((e) => !e.ok);
  if (fails.length) lines.push(`- 연결 실패 ${fails.length}회: ${fails[0].err}`);
  lines.push(`- 저장된 응답 표시: ${state.cacheShownMs != null ? state.cacheShownMs + 'ms' : '저장된 응답 없음'}`);
  const fs = formulaSummary(load(K.formula, null));
  if (fs) {
    lines.push(`- 시트 쓰기(${fs.n}개 값): ` + fs.cols.map((c) => `${c.label} ${c.pass}/${fs.n}`).join(', ') + `, 시각 열 문자열 ${fs.timeText ? '예' : '아니오'}`);
  }
  const st = state.storage;
  lines.push(`- localStorage: ${st.lsOk ? '됨' : '안 됨'}, ${st.visits}번째 열기, 처음 ${kst(st.firstVisit)}`);
  const saved = load(K.code, null);
  lines.push(`- #c=: 저장된 코드 ${saved || '없음'}${state.codeReceived ? `, 이번에 받음 "${state.codeReceived.code}", 주소창 지움 ${location.hash ? '아니오' : '예'}` : ''}`);
  lines.push(`- share: ${typeof navigator.share === 'function' ? '있음' : '없음'}${state.shareResult ? ', 결과 ' + state.shareResult : ''}${state.copyResult ? ', 복사 ' + state.copyResult : ''}`);
  lines.push(`- print: ${state.printMs != null ? `print() ${state.printMs}ms` : '안 눌러 봄'}, 이벤트 ${state.printEvents.join('/') || '없음'}`);
  lines.push(`- 키보드: visualViewport ${window.visualViewport ? '있음' : '없음'}, 가장 많이 가림 ${state.kbdMaxCover}px (보정 ${kbdFix ? '켬' : '끔'})`);
  const f = state.font;
  if (f) {
    lines.push(`- 글꼴: html ${f.rootPx}, 16px 실측 ${f.probeHeight}px(×${f.zoom}), -apple-system-body ${f.appleBody}, 띠 넘침 ${f.stripOverflow ? '예' : '아니오'}, 가로 넘침 ${f.docOverflow ? '예' : '아니오'} (단계 ${load(K.scale, '100')}%)`);
  }
  const manual = Object.entries(MANUAL_LABELS).map(([k, label]) => `${label} ${m[k] || '?'}`).join(' · ');
  lines.push(`- 직접 확인: ${manual}`);
  return lines.join('\n');
}

function renderSummary() {
  $('summary').value = buildSummary();
}

async function sendSummary() {
  const url = apiUrl();
  if (!url) return toast('서버 주소가 없어요.');
  const btn = $('sum-send');
  btn.disabled = true;
  renderSummary();
  try {
    const r = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ action: 'report', ua, kakao: env.label, summary: $('summary').value }),
    });
    const res = await readJson(r);
    if (!res.ok) throw new Error(res.error.code + ' ' + res.error.message);
    $('sum-res').textContent = `stage0_log ${res.data.row}행에 남겼어요.`;
    $('sum-res').className = 'result ok';
  } catch (e) {
    $('sum-res').textContent = '보내지 못했어요: ' + e.message;
    $('sum-res').className = 'result bad';
  }
  btn.disabled = false;
}

// ---------- 시작 ----------

function bind() {
  document.querySelectorAll('[data-call]').forEach((b) => b.addEventListener('click', () => call(b.dataset.call)));
  $('burst').addEventListener('click', burst);
  $('net-clear').addEventListener('click', () => { store(K.log, undefined); renderNet(); });
  $('formula-run').addEventListener('click', runFormula);
  $('storage-reset').addEventListener('click', () => {
    Object.values(K).forEach((k) => store(k, undefined));
    toast('지웠어요. 새로고침하면 처음 방문처럼 보여요.');
  });
  document.querySelectorAll('[data-codelink]').forEach((b) => b.addEventListener('click', () => copyCodeLink(b.dataset.codelink)));
  $('share-run').addEventListener('click', runShare);
  $('copy-run').addEventListener('click', runCopy);
  $('print-run').addEventListener('click', runPrint);
  $('kbd-toggle').addEventListener('click', toggleBar);
  $('kbd-fix').addEventListener('click', toggleFix);
  $('bar-send').addEventListener('click', () => { $('bar-input').value = ''; toast('보냈어요(시험).'); });
  document.querySelectorAll('button[data-scale]').forEach((b) => b.addEventListener('click', () => setScale(b.dataset.scale)));
  $('api-save').addEventListener('click', () => {
    store(K.api, $('api-input').value.trim() || undefined);
    renderEnv();
    toast('저장했어요.');
  });
  $('sum-refresh').addEventListener('click', renderSummary);
  $('sum-copy').addEventListener('click', async () => {
    renderSummary();
    toast((await copyText($('summary').value)) ? '복사했어요.' : '복사하지 못했어요.');
  });
  $('sum-send').addEventListener('click', sendSummary);
  addEventListener('hashchange', () => { takeCodeFromHash(); renderCode(); });
}

function start() {
  takeCodeFromHash();
  initStorage();
  renderCache(true);
  renderEnv();
  renderNet();
  renderFormula();
  renderStorage();
  renderCode();
  renderShare();
  renderPrint();
  renderKbd(null);
  renderStrip();
  renderManual();
  bind();
  setScale(String(load(K.scale, '100')));
  renderSummary();
  addEventListener('load', () => setTimeout(renderCache, 0));
  if (apiUrl()) call('read').then(() => { renderCache(); renderSummary(); });
}

start();
