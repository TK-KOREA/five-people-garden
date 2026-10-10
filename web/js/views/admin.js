// 관리(관리 코드로만 열림, 탭에 없음). 기획서 3-3 관리, 7장 1단계 관리 화면.
import { post, messageFor } from '../api.js';
import * as store from '../store.js';
import { el, toast, confirmSheet, openSheet, copyText, autoGrow, relTime } from '../ui.js';

function creds() {
  return { admin_code: store.sessionLoad('admin_code'), admin_name: store.load('admin_name', ''), device_id: store.deviceId() };
}

async function adminPost(action, body = {}) {
  return post(action, { ...creds(), ...body });
}

function loginForm(m, message) {
  const code = el('input', { type: 'password', class: 'input', autocomplete: 'off', 'aria-label': '관리 코드', placeholder: '관리 코드' });
  const name = el('input', { type: 'text', class: 'input', maxlength: '20', 'aria-label': '관리자 이름', placeholder: '관리자 이름 (변경 이력에 남아요)' });
  name.value = store.load('admin_name', '');
  m.replaceChildren(el('form', {
    class: 'compose',
    onsubmit: (e) => {
      e.preventDefault();
      if (!code.value || !name.value.trim()) return toast('코드와 이름을 넣어 주세요.');
      store.sessionSave('admin_code', code.value);
      store.save('admin_name', name.value.trim());
      renderAdmin(m);
    },
  },
  message && el('p', { class: 'note' }, message),
  el('p', { class: 'hint' }, '관리 코드는 이 탭을 닫으면 잊어요.'),
  code, name,
  el('button', { type: 'submit', class: 'btn wide' }, '들어가기')));
}

function editSheet(item, reload) {
  const isIdea = item.type === 'idea';
  const title = el('input', { type: 'text', class: 'input', maxlength: '60', 'aria-label': '제목' });
  const text = autoGrow(el('textarea', { class: 'input', rows: '5', 'aria-label': isIdea ? '설명' : '이어 쓴 내용' }));
  title.value = item.title;
  text.value = isIdea ? item.detail : item.text;
  const save = el('button', {
    type: 'button', class: 'btn',
    onclick: async () => {
      save.disabled = true;
      try {
        const body = isIdea ? { id: item.id, title: title.value.trim(), detail: text.value.trim() } : { id: item.id, text: text.value.trim() };
        await adminPost('update', body);
        dlg.close();
        toast('고쳤어요.');
        reload();
      } catch (e) {
        toast(messageFor(e));
        save.disabled = false;
      }
    },
  }, '고치기');
  const dlg = openSheet(el('div', null,
    el('h2', { class: 'sheet-title' }, '본문 고치기'),
    el('p', { class: 'hint' }, '이름은 "우리 아이", "○학년 아이"처럼 역할로 바꿔 주세요.'),
    isIdea && title, text,
    el('div', { class: 'row-end' }, save)), { label: '본문 고치기' });
}

function itemCard(item, reload, { hidden } = {}) {
  const act = (action, label, confirmMsg) => el('button', {
    type: 'button', class: 'btn ghost small',
    onclick: async () => {
      if (confirmMsg && !(await confirmSheet(confirmMsg, label))) return;
      try {
        await adminPost(action, { target_id: item.id });
        toast(action === 'hide' ? '숨겼어요. 관리 화면에서 되돌릴 수 있어요.' : action === 'erase' ? '지웠어요.' : '되돌렸어요.');
        reload();
      } catch (e) { toast(messageFor(e)); }
    },
  }, label);
  return el('li', { class: 'card' },
    el('div', { class: 'card-top' },
      el('span', { class: 'badge' }, item.type === 'idea' ? '생각' : '이어 쓰기 · ' + item.kind),
      item.flagged && el('span', { class: 'flag-tag' }, '개인정보 경고 무시'),
      item.report_count > 0 && el('span', { class: 'flag-tag' }, `살펴봐 주세요 ${item.report_count}`),
      el('span', { class: 'meta' }, `${item.author} · ${relTime(item.created_at)}`),
    ),
    item.type === 'idea'
      ? [el('h3', { class: 'card-title' }, item.title), item.detail && el('p', { class: 'reply-text clamp' }, item.detail)]
      : [el('p', { class: 'meta' }, '생각: ' + item.idea_title), el('p', { class: 'reply-text' }, item.text)],
    el('div', { class: 'actions' },
      el('a', { class: 'btn ghost small', href: '#/idea/' + item.idea_id }, '보기'),
      !hidden && el('button', { type: 'button', class: 'btn ghost small', onclick: () => editSheet(item, reload) }, '고치기'),
      hidden ? act('unhide', '되돌리기') : act('hide', '숨기기'),
      act('erase', '개인정보 지우기', '본문과 별칭, 변경 이력의 이 글 기록을 [삭제]로 덮어요. 되돌릴 수 없어요. 지울까요?'),
    ),
  );
}

function toolsSection() {
  const out = el('div');
  const digest = el('button', {
    type: 'button', class: 'btn ghost small',
    onclick: async () => {
      try {
        const d = await adminPost('digest');
        const ta = el('textarea', { class: 'input', rows: '10', readonly: true });
        ta.value = d.text;
        out.replaceChildren(el('p', { class: 'label' }, '이번 주 소식 (단톡방에 붙여 넣기)'), ta,
          el('button', { type: 'button', class: 'btn small', onclick: async () => toast((await copyText(d.text)) ? '복사했어요.' : '복사하지 못했어요.') }, '복사'));
      } catch (e) { toast(messageFor(e)); }
    },
  }, '이번 주 소식 만들기');
  const stats = el('button', {
    type: 'button', class: 'btn ghost small',
    onclick: async () => {
      try {
        const s = await adminPost('stats');
        out.replaceChildren(el('p', { class: 'label' }, '정원 상태'), el('dl', { class: 'defs' }, [
          ['쓴 기기', s.writer_devices], ['나눈 생각', s.ideas], ['이어 쓰기가 달린 생각', `${s.ideas_with_replies} (${s.reply_ratio}%)`],
          ['해 봤어요', s.tried], ['다녀간 기기 (30일)', s.visit_devices_30d], ['이틀 이상 다녀간 기기', s.returning_devices_30d],
          ['연결별 생각', Object.entries(s.counts).map(([k, v]) => `${k} ${v}`).join(' · ')],
        ].map(([k, v]) => [el('dt', null, k), el('dd', null, String(v))])));
      } catch (e) { toast(messageFor(e)); }
    },
  }, '정원 상태');
  const code = el('button', {
    type: 'button', class: 'btn ghost small',
    onclick: () => {
      let which = 'edit';
      const input = el('input', { type: 'text', class: 'input', autocomplete: 'off', 'aria-label': '새 코드' });
      const hint = el('p', { class: 'hint' }, '편집 코드는 휴대폰으로 넣기 쉬운 8자 이상(예: 다섯사람1009).');
      const seg = el('div', { class: 'chips' });
      const drawSeg = () => seg.replaceChildren(...[['edit', '편집 코드'], ['admin', '관리 코드']].map(([v, l]) => el('button', {
        type: 'button', class: 'chip' + (which === v ? ' on' : ''), 'aria-pressed': String(which === v),
        onclick: () => { which = v; hint.textContent = v === 'edit' ? '편집 코드는 휴대폰으로 넣기 쉬운 8자 이상(예: 다섯사람1009).' : '관리 코드는 공백 없이 16자 이상.'; drawSeg(); },
      }, l)));
      drawSeg();
      out.replaceChildren(el('form', {
        onsubmit: async (e) => {
          e.preventDefault();
          if (!(await confirmSheet('코드를 바꾸면 옛 코드는 바로 쓸 수 없어요. 바꿀까요?', '바꾸기'))) return;
          try {
            const d = await adminPost('set_code', { which, new_code: input.value.trim() });
            if (which === 'admin') store.sessionSave('admin_code', input.value.trim());
            if (d.notice) {
              const ta = el('textarea', { class: 'input', rows: '5', readonly: true });
              ta.value = d.notice;
              out.replaceChildren(el('p', { class: 'label' }, '단톡방 공지 문구'), ta,
                el('button', { type: 'button', class: 'btn small', onclick: async () => toast((await copyText(d.notice)) ? '복사했어요.' : '복사하지 못했어요.') }, '복사'));
            } else {
              out.replaceChildren(el('p', { class: 'note' }, '관리 코드를 바꿨어요. 새 코드를 안전한 곳에 적어 두세요.'));
            }
          } catch (err) { toast(messageFor(err) + (err.message && err.code === 'INVALID' ? ` (${err.message})` : '')); }
        },
      }, el('p', { class: 'label' }, '코드 바꾸기'), seg, input, hint, el('button', { type: 'submit', class: 'btn small' }, '바꾸기')));
    },
  }, '코드 바꾸기');
  return el('section', { class: 'admin-tools' }, el('h3', { class: 'section-title' }, '도구'), el('div', { class: 'actions' }, digest, stats, code), out);
}

export async function renderAdmin(m) {
  if (!creds().admin_code) return loginForm(m);
  m.replaceChildren(el('p', { class: 'empty' }, '불러오는 중이에요…'));
  let d;
  try {
    d = await adminPost('admin_list');
  } catch (e) {
    if (e.code === 'BAD_ADMIN_CODE' || e.code === 'LOCKED_OUT') {
      store.sessionSave('admin_code', '');
      return loginForm(m, messageFor(e));
    }
    m.replaceChildren(el('p', { class: 'empty' }, messageFor(e)));
    return;
  }
  const reload = () => renderAdmin(m);
  m.replaceChildren(
    el('section', null,
      el('h3', { class: 'section-title' }, `살펴볼 글 ${d.attention.length}`),
      d.attention.length ? el('ul', { class: 'mine-list' }, d.attention.map((x) => itemCard(x, reload))) : el('p', { class: 'hint' }, '경고를 무시한 글이나 신고된 글이 없어요.'),
    ),
    toolsSection(),
    el('section', null,
      el('h3', { class: 'section-title' }, `숨긴 글 ${d.hidden.length}`),
      d.hidden.length ? el('ul', { class: 'mine-list' }, d.hidden.map((x) => itemCard(x, reload, { hidden: true }))) : el('p', { class: 'hint' }, '숨긴 글이 없어요.'),
    ),
    el('section', null,
      el('h3', { class: 'section-title' }, '최근 변경 이력'),
      el('ul', { class: 'log-list' }, d.log.map((l) => el('li', null,
        el('span', { class: 'meta' }, l.at.slice(5, 16).replace('T', ' ')),
        ` ${l.action} `,
        el('span', { class: 'mono' }, l.target_id),
        l.admin_name && el('span', { class: 'meta' }, ` · ${l.admin_name}`),
      ))),
    ),
    el('button', { type: 'button', class: 'btn ghost', onclick: () => { store.sessionSave('admin_code', ''); renderAdmin(m); } }, '관리 화면 나가기'),
  );
}
