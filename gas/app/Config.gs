/**
 * 한 아이 곁에 다섯 사람 — 상수와 시트 구조.
 * 기획서: docs/plan.md 5장(데이터 모델), 6장(API와 보안).
 */

var TZ = 'Asia/Seoul';
var PUBLIC_URL = 'https://tk-korea.github.io/five-people-garden/';
var APP_NAME = '한 아이 곁에 다섯 사람';

/** config 탭이 비거나 잘못돼도 화면이 깨지지 않게 하는 기본값(기획서 5-1). */
var DEFAULTS = {
  seats: ['친구', '부모', '봉사', '다른 부모', '조부모', '함께'],
  seat_colors: ['친구:#E3EEF6/#2C5878', '부모:#F6E8D8/#7A4F2F', '봉사:#E2EEDC/#3E6A35',
    '다른 부모:#F3E4E0/#8E4331', '조부모:#ECE6F2/#5B4878', '함께:#F1EEE7/#2B2A27'],
  ages: ['유아', '초등 저학년', '초등 고학년', '중고등부로 올라가기', '중고등부', '세대 함께'],
  settings: ['식탁', '집회', '나들이·놀이', '기도', '생일·특별한 날', '가정 방문', '기타'],
  statuses: ['씨앗', '싹', '시도', '열매', '쉼'],
  reply_kinds: ['덧붙임', '질문', '해 봤어요'],
  nicknames: ['섬기는 형제', '섬기는 자매', '초등 저학년 부모', '초등 고학년 부모', '중고등부 부모',
    '청년 형제', '청년 자매', '중고등부 형제자매', '연로한 형제', '연로한 자매'],
  limit_title: 60,
  limit_detail: 2000,
  limit_reply: 500,
  limit_author: 20,
  limit_verse: 30,
  limit_question: 100,
  rate_write_per_min: 10,
  rate_write_global_per_min: 60,
  cache_sec: 60,
  page_size: 20,
  report_alert: 1
};

/** 목록으로 읽는 config 키. 나머지는 숫자. */
var LIST_KEYS = ['seats', 'seat_colors', 'ages', 'settings', 'statuses', 'reply_kinds', 'nicknames'];

var DEFAULT_QUESTIONS = [
  '지금 우리 아이들 중 부모 말고 기억하는 어른이 거의 없는 아이는 몇 명쯤일까?',
  '아이가 집회를 떠나는 시점은 언제인가? (중고등부로 올라갈 때, 이사, 사춘기)',
  '성도들이 아이와 관계를 맺지 못하는 진짜 이유는 무엇인가? (시간, 어색함, 방법을 모름)',
  '이미 자연스럽게 잘 되고 있는 관계는 어디서 생겼는가?'
];

var SEED_AUTHOR = '섬기는 형제';
var SEEDS = [
  ['아이마다 부모 외에 이름을 알고 기도해 주는 성도가 몇 명인지 적어 보기', '함께'],
  ['아이 곁의 다섯 연결을 서로 다른 사람으로 채우기', '함께'],
  ['한 달에 한 번, 다른 가정의 아이를 우리 집 식탁에 초대하기', '다른 부모'],
  ['6학년이 중고등부로 올라가기 전에 선배 형제자매와 미리 만나기', '친구'],
  ['성도마다 아이 한두 명의 이름을 불러 매주 기도하기', '조부모,봉사']
];

/**
 * 탭 구조. type: t 글(앞에 ' 붙여 씀), n 숫자, b 참/거짓(TRUE/FALSE 글).
 * 0단계 결과: @ 서식만으로는 =가 수식이 되므로 글은 모두 앞에 '를 붙이고 setValues로 쓴다.
 */
var SCHEMA = {
  ideas: [
    ['id', 't'], ['created_at', 't'], ['updated_at', 't'], ['title', 't'], ['summary', 't'], ['detail', 't'],
    ['age', 't'], ['seat', 't'], ['setting', 't'], ['verse', 't'], ['status', 't'], ['question_id', 't'],
    ['parent_ids', 't'], ['lens_child', 't'], ['lens_parent', 't'], ['lens_server', 't'], ['lens_elder', 't'],
    ['lens_youth', 't'], ['check_life', 't'], ['check_noprogram', 't'], ['check_small', 't'], ['check_lasting', 't'],
    ['waters', 'n'], ['author', 't'], ['deleted', 'b'], ['last_activity_at', 't'], ['reply_count', 'n'],
    ['last_reply_preview', 't'], ['report_count', 'n'], ['hidden', 'b'], ['edit_token_hash', 't'],
    ['device_id', 't'], ['request_id', 't'], ['flagged', 'b']
  ],
  replies: [
    ['id', 't'], ['idea_id', 't'], ['kind', 't'], ['text', 't'], ['author', 't'], ['waters', 'n'],
    ['report_count', 'n'], ['created_at', 't'], ['updated_at', 't'], ['hidden', 'b'], ['deleted', 'b'],
    ['edit_token_hash', 't'], ['device_id', 't'], ['request_id', 't'], ['flagged', 'b']
  ],
  questions: [['id', 't'], ['text', 't'], ['order', 'n'], ['active', 'b'], ['created_at', 't']],
  config: [['key', 't'], ['values', 't']],
  log: [['at', 't'], ['action', 't'], ['target_id', 't'], ['before', 't'], ['after', 't'], ['author', 't'], ['admin_name', 't']],
  guard: [['at', 't'], ['device_id', 't'], ['action', 't'], ['target_id', 't'], ['date', 't']]
};

/** 화면으로 내보내지 않는 열. */
var PRIVATE_COLUMNS = ['edit_token_hash', 'device_id', 'request_id', 'flagged', 'report_count', 'hidden'];

var ID_RE = /^[IRQ]-\d{8}-[a-z0-9]{6}$/;

/** 코드 대입 막기(기획서 6장). */
var LOCK = {
  edit: { perDevice: 10, global: 200 },
  admin: { perDevice: 5, global: 30 },
  windowSec: 600,
  globalWindowSec: 3600
};

var STATUS_RANK = { '씨앗': 0, '싹': 1, '시도': 2, '열매': 3 };
