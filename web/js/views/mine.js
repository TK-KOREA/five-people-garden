// 내가 나눈 생각: 기기에 있는 edit_token의 id로 내 생각과 이어 쓰기를 모은다(기획서 3-4).
import { get, messageFor } from '../api.js';
import * as store from '../store.js';
import { el, statusBadge } from '../ui.js';

export async function renderMine(m) {
  const ids = Object.keys(store.tokens()).slice(-50);
  if (!ids.length) {
    m.append(el('p', { class: 'empty' }, '이 기기에서 나눈 생각이 아직 없어요.'),
      el('p', { class: 'hint center' }, '다른 기기에서 쓴 글은 그 기기에서 볼 수 있어요.'));
    return;
  }
  const box = el('div', null, el('p', { class: 'empty' }, '불러오는 중이에요…'));
  m.append(box);
  let data;
  try {
    data = await get('mine', { ids: ids.join(',') });
  } catch (e) {
    box.replaceChildren(el('p', { class: 'empty' }, messageFor(e)));
    return;
  }
  const hiddenNote = el('p', { class: 'note' }, '이름이 있어 잠시 가렸어요. 역할로 바꿔 다시 나눠 주세요.');
  box.replaceChildren(
    el('h3', { class: 'section-title' }, `내 생각 ${data.ideas.filter((x) => !x.deleted).length}`),
    data.ideas.length
      ? el('ul', { class: 'mine-list' }, data.ideas.slice().reverse().map((x) => {
        if (x.hidden) return el('li', { class: 'card' }, hiddenNote.cloneNode(true));
        if (x.deleted) return el('li', { class: 'card muted' }, '지운 생각이에요.');
        const seen = store.seenReplies(x.id);
        const fresh = seen == null ? 0 : Math.max(0, x.reply_count - seen);
        return el('li', null, el('a', { class: 'card card-link', href: '#/idea/' + x.id },
          el('div', { class: 'card-top' }, statusBadge(x.status), fresh > 0 && el('span', { class: 'new-dot' }, `새 이어 쓰기 ${fresh}`)),
          el('h3', { class: 'card-title' }, x.title),
          el('p', { class: 'meta' }, `이어 쓰기 ${x.reply_count}`),
        ));
      }))
      : el('p', { class: 'hint' }, '아직 나눈 생각이 없어요.'),
    el('h3', { class: 'section-title' }, `내가 이어 쓴 글 ${data.replies.filter((x) => !x.deleted).length}`),
    data.replies.length
      ? el('ul', { class: 'mine-list' }, data.replies.slice().reverse().map((r) => {
        if (r.hidden) return el('li', { class: 'card' }, hiddenNote.cloneNode(true));
        if (r.deleted) return el('li', { class: 'card muted' }, '지운 글이에요.');
        return el('li', null, el('a', { class: 'card card-link', href: '#/idea/' + r.idea_id },
          el('p', { class: 'meta' }, `${r.kind} · ${r.idea_title || '지워진 생각'}`),
          el('p', { class: 'reply-text clamp' }, r.text),
        ));
      }))
      : el('p', { class: 'hint' }, '아직 이어 쓴 글이 없어요.'),
  );
}
