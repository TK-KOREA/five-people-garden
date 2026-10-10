// 여러 화면이 함께 쓰는 조각: 물 주기 버튼, 살펴봐 주세요.
import { post, messageFor } from '../api.js';
import * as store from '../store.js';
import { el, icon, toast, confirmSheet, openSheet } from '../ui.js';

/** 물 준 수는 1 이상일 때만 보인다(설계 원칙 5). */
export function waterButton(targetId, waters, { small } = {}) {
  const day = store.kstDay();
  let count = waters || 0;
  const label = el('span', { class: 'count' });
  const btn = el('button', { type: 'button', class: 'chip-btn water' + (small ? ' small' : '') }, icon('drop', 18), label);
  const draw = () => {
    label.textContent = count > 0 ? String(count) : '';
    const done = store.wateredToday(targetId, day);
    btn.classList.toggle('done', done);
    btn.setAttribute('aria-label', (done ? '오늘 물을 주었어요' : '물 주기') + (count > 0 ? `, ${count}` : ''));
  };
  draw();
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (store.wateredToday(targetId, day)) return toast('오늘은 이미 물을 주었어요.');
    // 먼저 보여 주고 뒤에서 보낸다. 실패하면 되돌린다.
    count += 1;
    store.markWatered(targetId, day);
    draw();
    toast('물을 주었어요.');
    try {
      const d = await post('water', { device_id: store.deviceId(), target_id: targetId });
      count = d.waters;
      draw();
    } catch (err) {
      count -= 1;
      store.unmarkWatered(targetId);
      draw();
      toast(messageFor(err));
    }
  });
  return btn;
}

export async function reportTarget(targetId) {
  const yes = await confirmSheet('이 글을 살펴봐 달라고 관리자에게 알릴까요?', '알리기');
  if (!yes) return;
  try {
    await post('report', { device_id: store.deviceId(), target_id: targetId });
    toast('살펴봐 달라고 알렸어요. 고마워요.');
  } catch (err) {
    toast(messageFor(err));
  }
}

export function reportButton(targetId, label = '살펴봐 주세요') {
  return el('button', { type: 'button', class: 'text-link', onclick: (e) => { e.stopPropagation(); reportTarget(targetId); } }, icon('flag', 16), label);
}

// ---------- 별칭 칩 ----------

const FALLBACK_NICKNAMES = ['섬기는 형제', '섬기는 자매', '초등 저학년 부모', '초등 고학년 부모', '중고등부 부모',
  '청년 형제', '청년 자매', '중고등부 형제자매', '연로한 형제', '연로한 자매'];

export function nicknameList(boot) {
  return (boot && boot.config && boot.config.nicknames) || FALLBACK_NICKNAMES;
}

/** 프리셋 칩에서 고르거나 직접 쓴다. 고른 값은 기기에 기억한다. */
export function nicknameField(boot, limit = 20) {
  let value = store.load('nickname', '');
  const input = el('input', { type: 'text', class: 'input', maxlength: String(limit), placeholder: '직접 쓰기', 'aria-label': '별칭 직접 쓰기', autocomplete: 'off' });
  const chips = el('div', { class: 'chips' });
  const drawChips = () => chips.replaceChildren(...nicknameList(boot).map((n) =>
    el('button', {
      type: 'button', class: 'chip' + (n === value ? ' on' : ''), 'aria-pressed': String(n === value),
      onclick: () => { value = n; input.value = ''; drawChips(); },
    }, n)));
  if (value && !nicknameList(boot).includes(value)) input.value = value;
  input.addEventListener('input', () => { value = input.value.trim(); drawChips(); });
  drawChips();
  const node = el('div', { class: 'field' },
    el('p', { class: 'label' }, '어떻게 불러 드릴까요?'),
    chips, input,
    el('p', { class: 'hint' }, '이름이나 연락처 대신 학년이나 역할로 써 주세요. 이 기기에서는 다음에도 기억해요.'),
  );
  return {
    node,
    get value() { return value; },
    remember() { if (value) store.save('nickname', value); },
  };
}

export function nicknameSheet(boot) {
  return new Promise((resolve) => {
    const f = nicknameField(boot);
    let picked = null;
    const dlg = openSheet(el('div', null, f.node,
      el('div', { class: 'row-end' }, el('button', { type: 'button', class: 'btn', onclick: () => { picked = f.value; f.remember(); dlg.close(); } }, '이 별칭으로'))),
    { label: '별칭', onClose: () => resolve(picked) });
  });
}
