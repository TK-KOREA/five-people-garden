// 쓰기 흐름: 개인정보 경고 → 참여 코드 확인 → 보내기(보내지 못하면 기기에 남김). 기획서 3-5, 5-1, 6-1.
import { post, messageFor, MESSAGES } from './api.js';
import * as store from './store.js';
import { el, openSheet, toast } from './ui.js';
import { findPrivate, replaceNames } from './privacy.js';

/** 글 안에서 걸린 부분을 <mark>로 보여 준다(텍스트 노드만 씀). */
function highlighted(text, hits) {
  const out = [];
  let pos = 0;
  for (const h of hits) {
    if (h.start < pos) continue;
    out.push(text.slice(pos, h.start), el('mark', null, text.slice(h.start, h.end)));
    pos = h.end;
  }
  out.push(text.slice(pos));
  return out;
}

/**
 * fields: {key: text}. 걸린 것이 없으면 'send'.
 * 있으면 시트를 띄워 'edit'(고쳐 쓰기) / 'send'(그대로 나누기)를 돌려준다.
 * "우리 아이로 바꾸기"를 누르면 fields를 바꾸고 'replaced'를 돌려준다.
 */
export function privacyCheck(fields) {
  const found = Object.entries(fields)
    .map(([k, v]) => [k, String(v || ''), findPrivate(v)])
    .filter(([, , hits]) => hits.length);
  if (!found.length) return Promise.resolve('send');
  const hasName = found.some(([, , hits]) => hits.some((h) => h.kind === 'name'));
  return new Promise((resolve) => {
    let result = 'edit';
    const dlg = openSheet(el('div', null,
      el('h2', { class: 'sheet-title' }, '잠깐만요'),
      el('p', { class: 'sheet-text' }, '이름이나 연락처처럼 보여요. 학년이나 역할로 바꿔 써 주세요.'),
      found.map(([, text, hits]) => el('p', { class: 'quote' }, highlighted(text, hits))),
      el('div', { class: 'stack' },
        hasName && el('button', {
          type: 'button', class: 'btn',
          onclick: () => {
            for (const [k] of found) fields[k] = replaceNames(fields[k]);
            result = 'replaced';
            dlg.close();
          },
        }, '"우리 아이"로 바꾸기'),
        el('button', { type: 'button', class: 'btn ghost', onclick: () => { result = 'edit'; dlg.close(); } }, '고쳐 쓰기'),
        el('button', { type: 'button', class: 'btn link', onclick: () => { result = 'send'; dlg.close(); } }, '그대로 나누기'),
      ),
    ), { label: '개인정보 확인', onClose: () => resolve(result) });
  });
}

/** 참여 코드를 묻는다. 넣으면 문자열, 닫으면 null. */
export function promptCode(message) {
  return new Promise((resolve) => {
    let value = null;
    const input = el('input', { type: 'text', class: 'input', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': '참여 코드' });
    const submit = (e) => {
      e.preventDefault();
      if (!input.value.trim()) return input.focus();
      value = input.value.trim();
      dlg.close();
    };
    const dlg = openSheet(el('form', { onsubmit: submit },
      el('h2', { class: 'sheet-title' }, '참여 코드'),
      message && el('p', { class: 'sheet-text warn' }, message),
      el('p', { class: 'sheet-text' }, '교회 단톡방 공지에 있는 참여 코드를 넣어 주세요. 쓴 글은 그대로 있어요.'),
      input,
      el('p', { class: 'hint' }, '공지의 링크로 열면 코드 없이 쓸 수 있어요.'),
      el('div', { class: 'row-end' }, el('button', { type: 'submit', class: 'btn' }, '보내기')),
    ), { label: '참여 코드', onClose: () => resolve(value) });
    setTimeout(() => input.focus(), 50);
  });
}

/**
 * create/reply를 보낸다. 코드가 없거나 틀리면 묻고 다시 보낸다.
 * 성공하면 결과, 못 보내면 null. 보내지 못한 글은 outbox에 남는다.
 */
export async function sendWrite(action, body, button) {
  body.request_id = body.request_id || store.randomId(24);
  body.device_id = store.deviceId();
  store.setOutbox({ action, body, at: Date.now() });
  if (button) button.disabled = true;
  let message = '';
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      let code = store.editCode();
      if (!code) {
        code = await promptCode(message);
        if (!code) return null;
      }
      try {
        const data = await post(action, { ...body, edit_code: code });
        store.setEditCode(code);
        store.setOutbox(null);
        if (data.edit_token) store.addToken(data.id, data.edit_token);
        return data;
      } catch (e) {
        if (e.code === 'BAD_EDIT_CODE') {
          store.setEditCode('');
          message = MESSAGES.BAD_EDIT_CODE;
          continue;
        }
        if (e.code === 'INVALID' || e.code === 'NOT_FOUND') store.setOutbox(null);
        toast(messageFor(e));
        return null;
      }
    }
    return null;
  } finally {
    if (button) button.disabled = false;
  }
}
