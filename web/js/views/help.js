// 도움말: 처음 안내, 다섯 연결, 상태의 뜻(기획서 3-4 "?"), 쓰는 법.
import { el, statusBadge, STATUS_MEANING } from '../ui.js';
import { state } from '../app.js';
import * as store from '../store.js';

const SEAT_DESC = [
  ['친구', '또래와 한두 살 위 선배 형제자매'],
  ['부모', '아이 자신의 부모, 가정 안의 신앙 생활'],
  ['봉사', '어린이 집회와 중고등부를 섬기는 성도'],
  ['다른 부모', '우리 아이를 자기 집 식탁에 앉히는 다른 가정'],
  ['조부모', '할머니, 할아버지, 연로한 성도'],
  ['함께', '연결을 특정하지 않는 생각'],
];

export function renderHelp(m) {
  const colors = (state.boot && state.boot.config.seat_colors) || {};
  m.append(el('div', { class: 'help' },
    el('section', null,
      el('h2', { class: 'sheet-title' }, '이곳은'),
      el('p', null, '아이 곁에 의미 있는 다섯 사람(친구, 부모, 봉사, 다른 부모, 조부모)을 세우는 방법을 함께 나누는 곳이에요.'),
      el('p', null, '읽기와 물 주기(공감)는 누구나 할 수 있어요. 생각을 나누고 이어 쓰려면 단톡방 공지의 링크로 열어 주세요. 그 링크로 열면 이 기기가 계속 기억해요.'),
      el('p', { class: 'hint' }, '아이와 성도의 이름, 연락처는 쓰지 말아 주세요. "초등 고학년 아이", "섬기는 형제"처럼 학년이나 역할로 써 주세요.'),
    ),
    el('section', null,
      el('h2', { class: 'sheet-title' }, '다섯 연결'),
      el('p', { class: 'hint' }, '배정 명단이 아니라 생각을 나누어 보는 렌즈예요.'),
      el('dl', { class: 'defs' }, SEAT_DESC.map(([s, d]) => [
        el('dt', null, el('span', { class: 'badge', style: colors[s] ? `background:${colors[s].bg};color:${colors[s].fg}` : '' }, s)),
        el('dd', null, d),
      ])),
    ),
    el('section', null,
      el('h2', { class: 'sheet-title' }, '생각이 자라는 단계'),
      el('dl', { class: 'defs' }, Object.entries(STATUS_MEANING).map(([s, d]) => [el('dt', null, statusBadge(s)), el('dd', null, d)])),
      el('p', { class: 'hint' }, '이어 쓰기가 달리면 싹, 해 봤어요가 달리면 시도, 해 봤어요가 둘 이상이면 열매가 돼요. 누가 평가하는 것이 아니에요.'),
    ),
    el('section', null,
      el('h2', { class: 'sheet-title' }, '이어 쓰기'),
      el('p', null, '덧붙임은 더하면 좋을 것, 질문은 궁금한 것, 해 봤어요는 실제로 해 본 이야기예요.'),
      el('p', { class: 'hint' }, '이 기기에서 쓴 글은 이 기기에서 고치거나 지울 수 있어요. 다른 기기에서 쓴 글은 관리자에게 말씀해 주세요.'),
    ),
    el('button', { type: 'button', class: 'btn ghost', onclick: () => { store.save('intro_closed', false); history.back(); } }, '처음 안내 카드 다시 보기'),
    el('p', { class: 'admin-link' }, el('a', { href: '#/admin' }, '관리자')),
  ));
}
