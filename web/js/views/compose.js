// 생각 나누기(입력)와 내 생각 고치기. 한 줄 제목만 필수, 연결은 "함께"가 미리 골라져 있다(기획서 3-1, 3-5).
import { get, post, messageFor } from '../api.js';
import * as store from '../store.js';
import { el, toast, autoGrow, charLen, cutChars } from '../ui.js';
import { state, go, refreshBoot } from '../app.js';
import { nicknameField } from './common.js';
import { sendWrite, privacyCheck } from '../write.js';

// 연결별 생각 꺼내기 문장(기획서 5-1)
const PROMPTS = {
  '친구': '아이 곁에 믿는 또래와 선배를 어떻게 이어 줄까요?',
  '부모': '우리 집 일상에서 아이가 주님을 누리는 순간은 언제일까요?',
  '봉사': '집회 밖에서도 아이가 섬기는 성도를 기억하게 하려면?',
  '다른 부모': '우리 집 식탁과 문을 다른 집 아이에게 어떻게 열 수 있을까요?',
  '조부모': '연로한 성도의 기도와 이야기가 아이에게 닿는 길은?',
  '함께': '다섯 연결을 함께 묶을 방법이 있을까요?',
};

const FALLBACK = {
  seats: ['친구', '부모', '봉사', '다른 부모', '조부모', '함께'],
  ages: ['유아', '초등 저학년', '초등 고학년', '중고등부로 올라가기', '중고등부', '세대 함께'],
  settings: ['식탁', '집회', '나들이·놀이', '기도', '생일·특별한 날', '가정 방문', '기타'],
  limits: { title: 60, detail: 2000, verse: 30, author: 20 },
};

function cfg() {
  return (state.boot && state.boot.config) || FALLBACK;
}

/** 여러 개 고르는 칩. onChange(values) */
function multiChips(options, selected, onChange, label) {
  const box = el('div', { class: 'chips', role: 'group', 'aria-label': label });
  const draw = () => box.replaceChildren(...options.map((o) => el('button', {
    type: 'button', class: 'chip' + (selected.includes(o) ? ' on' : ''), 'aria-pressed': String(selected.includes(o)),
    onclick: () => {
      const i = selected.indexOf(o);
      if (i >= 0) selected.splice(i, 1); else selected.push(o);
      onChange(selected, o);
      draw();
    },
  }, o)));
  draw();
  return { node: box, redraw: draw };
}

const split = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

export async function renderCompose(m, { seat = '', questionId = '', parentId = '', editId = '' } = {}) {
  const c = cfg();
  const editing = !!editId;
  let original = null;
  if (editing) {
    if (!store.tokenFor(editId)) {
      m.append(el('p', { class: 'empty' }, '이 기기에서 쓴 글만 고칠 수 있어요. 다른 기기에서 쓴 글은 관리자에게 말씀해 주세요.'));
      return;
    }
    try {
      original = (await get('idea', { id: editId })).idea;
    } catch (e) {
      m.append(el('p', { class: 'empty' }, messageFor(e)));
      return;
    }
  }

  const draft = editing ? null : store.load('compose_draft', null);
  const init = original || draft || {};
  // request_id는 쓰던 글마다 하나. 다시 보내도(보내지 못한 글 안내 포함) 같은 값이라 서버가 한 번만 저장한다.
  const requestId = (draft && draft.request_id) || store.randomId(24);
  const seats = split(init.seat || seat || '함께');
  const ages = split(init.age);
  const settings = split(init.setting);
  const question = questionId && state.boot && state.boot.today_question && state.boot.today_question.id === questionId
    ? state.boot.today_question : null;

  const prompt = el('p', { class: 'prompt' });
  const drawPrompt = (last) => {
    const pick = last && seats.includes(last) ? last : seats[seats.length - 1] || '함께';
    prompt.textContent = PROMPTS[pick] || '';
  };
  drawPrompt();

  const seatChips = multiChips(c.seats, seats, (vals, changed) => {
    // "함께"와 다른 연결은 함께 고르지 않는다. 다 빼면 "함께"로 돌아간다.
    if (changed === '함께' && vals.includes('함께')) vals.splice(0, vals.length, '함께');
    else if (changed !== '함께' && vals.includes('함께')) vals.splice(vals.indexOf('함께'), 1);
    if (!vals.length) vals.push('함께');
    drawPrompt(changed);
    saveDraft();
  }, '어느 연결의 생각인가요?');

  const title = autoGrow(el('textarea', {
    class: 'input title-input', rows: '2', id: 'title',
    placeholder: question ? '그래서 해 볼 수 있는 것은?' : '어떤 방안이 떠올랐나요?',
  }));
  title.value = init.title || '';
  const counter = el('p', { class: 'hint' });
  const drawCounter = () => {
    const n = charLen(title.value.trim());
    counter.textContent = n > c.limits.title ? `${n}자 · ${c.limits.title}자를 넘는 부분은 설명으로 옮겨요` : '자판의 마이크를 눌러 말로 써도 돼요.';
  };
  drawCounter();

  const detail = autoGrow(el('textarea', { class: 'input', rows: '3', id: 'detail', maxlength: String(c.limits.detail), placeholder: '조금 더 풀어 주세요 (선택)' }));
  detail.value = init.detail || '';
  const verse = el('input', { type: 'text', class: 'input', id: 'verse', maxlength: String(c.limits.verse), placeholder: '예: 딤후 1:5', autocomplete: 'off' });
  verse.value = init.verse || '';

  const ageChips = multiChips(c.ages, ages, saveDraft, '나이대');
  const settingChips = multiChips(c.settings, settings, saveDraft, '상황');
  const nick = editing ? null : nicknameField(state.boot, c.limits.author);

  function values() {
    return { title: title.value.trim(), detail: detail.value.trim(), seat: seats.join(','), age: ages.join(','), setting: settings.join(','), verse: verse.value.trim() };
  }
  function saveDraft() {
    if (!editing) store.save('compose_draft', { ...values(), request_id: requestId });
  }
  [title, detail, verse].forEach((x) => x.addEventListener('input', () => { saveDraft(); if (x === title) drawCounter(); }));

  const submit = el('button', { type: 'submit', class: 'btn wide' }, editing ? '고치기' : '나누기');

  let busy = false;
  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return; // 같은 순간 여러 번 눌러도 한 번만
    busy = true;
    try {
      await submitOnce();
    } finally {
      busy = false;
    }
  }

  async function submitOnce() {
    const v = values();
    if (!v.title) { title.focus(); return toast('한 줄만 써 주셔도 돼요.'); }
    // 제목이 넘치면 자르지 않고 넘친 부분을 설명 앞으로 옮긴다(기획서 3-4).
    if (charLen(v.title) > c.limits.title) {
      const [head, rest] = cutChars(v.title, c.limits.title);
      v.detail = rest.trim() + (v.detail ? '\n' + v.detail : '');
      v.title = head.trim();
      title.value = v.title;
      detail.value = v.detail;
      drawCounter();
      toast('제목이 길어 넘친 부분은 설명으로 옮겼어요.');
    }
    const fields = { title: v.title, detail: v.detail };
    if (nick) fields.author = nick.value;
    const choice = await privacyCheck(fields);
    if (choice === 'edit') return title.focus();
    if (choice === 'replaced') {
      title.value = fields.title;
      detail.value = fields.detail;
      saveDraft();
      return toast('바꿨어요. 확인하고 다시 눌러 주세요.');
    }

    if (editing) {
      submit.disabled = true;
      try {
        await post('update', { id: editId, edit_token: store.tokenFor(editId), ...v });
        toast('고쳤어요.');
        refreshBoot().catch(() => {});
        go('#/idea/' + editId);
      } catch (err) {
        toast(messageFor(err));
        submit.disabled = false;
      }
      return;
    }

    nick.remember();
    saveDraft();
    const body = { ...v, author: nick.value, question_id: question ? question.id : (questionId || ''), parent_id: parentId, request_id: requestId };
    const data = await sendWrite('create', body, submit);
    if (!data) return;
    store.save('compose_draft', undefined);
    toast('생각을 나눴어요. 다른 생각에 이어 써 볼까요?');
    state.seat = '';
    state.scrollTop = true;
    await refreshBoot().catch(() => {});
    go('#/');
  }

  m.append(el('form', { class: 'compose', onsubmit: onSubmit },
    question && el('div', { class: 'question small' }, el('p', { class: 'eyebrow' }, '오늘의 질문'), el('p', { class: 'q-text' }, question.text)),
    el('div', { class: 'field' },
      el('p', { class: 'label' }, '어느 연결의 생각인가요?'),
      seatChips.node,
      el('p', { class: 'hint' }, '여러 개를 골라도 돼요.'),
    ),
    prompt,
    el('div', { class: 'field' },
      el('label', { class: 'label', for: 'title' }, '한 줄로 써 주세요'),
      title, counter,
    ),
    el('div', { class: 'field' }, detail),
    el('details', { class: 'more-fields', open: !!(ages.length || settings.length || verse.value) || null },
      el('summary', null, '더 적기 · 나이대, 상황, 근거 구절'),
      el('div', { class: 'field' }, el('p', { class: 'label' }, '나이대'), ageChips.node),
      el('div', { class: 'field' }, el('p', { class: 'label' }, '상황'), settingChips.node),
      el('div', { class: 'field' }, el('label', { class: 'label', for: 'verse' }, '근거 구절 (장절만)'), verse),
    ),
    nick && nick.node,
    submit,
  ));
  if (!editing && !title.value) setTimeout(() => title.focus(), 100);
}
