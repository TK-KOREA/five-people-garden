// 화면 도움 함수. 사용자 글과 서버 값은 모두 textContent(텍스트 노드)로만 넣는다. innerHTML 금지.

export function el(tag, attrs, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  append(n, children);
  return n;
}

/** replaceChildren와 같지만 null·false는 건너뛴다(replaceChildren은 null을 "null" 글자로 넣는다). */
export function fill(n, ...children) {
  n.replaceChildren();
  append(n, children);
  return n;
}

function append(n, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(n, c);
    else n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const SVG = 'http://www.w3.org/2000/svg';
// 아이콘은 고정된 모양만 코드로 만든다(사용자 글이 섞이지 않음).
const PATHS = {
  seed: [['circle', { cx: 12, cy: 13, r: 4 }]],
  sprout: [['path', { d: 'M12 20v-8' }], ['path', { d: 'M12 12c0-4-3-6-7-6 0 4 3 6 7 6z' }], ['path', { d: 'M12 12c0-4 3-6 7-6 0 4-3 6-7 6z' }]],
  can: [['path', { d: 'M5 10h10v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z' }], ['path', { d: 'M15 12l5-4' }], ['path', { d: 'M8 10V7a2 2 0 0 1 4 0v3' }]],
  fruit: [['circle', { cx: 12, cy: 14, r: 6 }], ['path', { d: 'M12 8c0-2 1-4 3-4' }]],
  moon: [['path', { d: 'M15 4a8 8 0 1 0 5 13A7 7 0 0 1 15 4z' }]],
  drop: [['path', { d: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z' }]],
  reply: [['path', { d: 'M4 5h16v11H9l-5 4z' }]],
  share: [['path', { d: 'M12 3v12' }], ['path', { d: 'M7 8l5-5 5 5' }], ['path', { d: 'M5 13v6h14v-6' }]],
  print: [['path', { d: 'M7 9V3h10v6' }], ['rect', { x: 4, y: 9, width: 16, height: 8, rx: 2 }], ['path', { d: 'M7 14h10v7H7z' }]],
  flag: [['path', { d: 'M5 21V4' }], ['path', { d: 'M5 4h12l-2 4 2 4H5' }]],
  back: [['path', { d: 'M15 5l-7 7 7 7' }]],
  close: [['path', { d: 'M6 6l12 12M18 6L6 18' }]],
  help: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14' }], ['circle', { cx: 12, cy: 17, r: 0.6 }]],
  mine: [['circle', { cx: 12, cy: 8, r: 4 }], ['path', { d: 'M4 21c1-4 4-6 8-6s7 2 8 6' }]],
  pen: [['path', { d: 'M4 20l4-1 11-11-3-3L5 16z' }]],
};

export function icon(name, size = 20) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('class', 'icon');
  for (const [tag, attrs] of PATHS[name] || []) {
    const p = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) p.setAttribute(k, v);
    s.append(p);
  }
  return s;
}

export const STATUS = {
  '씨앗': { icon: 'seed', cls: 'st-seed' },
  '싹': { icon: 'sprout', cls: 'st-sprout' },
  '시도': { icon: 'can', cls: 'st-try' },
  '열매': { icon: 'fruit', cls: 'st-fruit' },
  '쉼': { icon: 'moon', cls: 'st-rest' },
};

export const STATUS_MEANING = {
  '씨앗': '막 나눈 생각이에요.',
  '싹': '누군가 이어 쓴 생각이에요.',
  '시도': '누군가 실제로 해 본 생각이에요.',
  '열매': '두 번 이상 해 본 이야기가 쌓인 생각이에요.',
  '쉼': '지금은 쉬는 중이에요. 언제든 다시 이어 쓸 수 있어요.',
};

export function statusBadge(status) {
  const s = STATUS[status] || STATUS['씨앗'];
  return el('span', { class: 'status ' + s.cls }, icon(s.icon, 16), status || '씨앗');
}

let seatColors = {};
export function setSeatColors(c) { seatColors = c || {}; }

export function seatBadges(seatStr) {
  return String(seatStr || '함께').split(',').filter(Boolean).map((s) => {
    const c = seatColors[s];
    return el('span', { class: 'badge', style: c ? `background:${c.bg};color:${c.fg}` : '' }, s);
  });
}

export function relTime(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!t) return '';
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return Math.floor(diff / 60) + '분 전';
  if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
  const k = new Date(t + 9 * 3600 * 1000);
  const today = new Date(Date.now() + 9 * 3600 * 1000);
  const days = Math.round((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) -
    Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate())) / 86400000);
  if (days === 1) return '어제';
  if (days < 7) return days + '일 전';
  return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일`;
}

// ---------- 토스트 ----------

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ---------- 시트(dialog) ----------
// <dialog>.showModal()은 포커스를 시트 안에 묶어 둔다(기획서 8-7).

export function openSheet(content, { onClose, label } = {}) {
  const dlg = el('dialog', { class: 'sheet', 'aria-label': label || '' });
  const close = el('button', { type: 'button', class: 'icon-btn sheet-close', 'aria-label': '닫기', onclick: () => dlg.close() }, icon('close'));
  dlg.append(close, content);
  dlg.addEventListener('close', () => { dlg.remove(); onClose && onClose(dlg.returnValue); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

export function confirmSheet(message, okLabel = '네') {
  return new Promise((resolve) => {
    let result = false;
    const dlg = openSheet(el('div', null,
      el('p', { class: 'sheet-text' }, message),
      el('div', { class: 'row-end' },
        el('button', { type: 'button', class: 'btn ghost', onclick: () => dlg.close() }, '아니요'),
        el('button', { type: 'button', class: 'btn', onclick: () => { result = true; dlg.close(); } }, okLabel),
      ),
    ), { onClose: () => resolve(result) });
  });
}

export function isKakao() {
  return /KAKAOTALK/i.test(navigator.userAgent);
}

export function autoGrow(ta) {
  const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 320) + 'px'; };
  ta.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return ta;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = el('textarea', { style: 'position:fixed;top:0;left:0;opacity:0', readonly: true });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    ta.remove();
    return ok;
  }
}
