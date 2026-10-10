// 개인정보 감지(기획서 5-1). 서버(gas/app/Guard.gs)와 같은 규칙. 저장은 막지 않고 경고만.

const PHONE_RE = /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const NAME_RE = /([가-힣]{2,3})(이가|이는|이를|이랑|네 집|네 가정)/g;
const NAME_EXCLUDE = ['어린', '어린이', '아이', '형제', '자매', '부모', '성도', '우리', '친구', '선배', '후배',
  '동생', '언니', '오빠', '누나', '가족', '이웃', '사람', '선생님', '선생', '교사', '학생', '할머니',
  '할아버지', '어른', '아기', '막내', '첫째', '둘째', '셋째', '조부모', '다른'];

/** 걸린 부분 목록: {start, end, kind: 'phone'|'email'|'name', name?} */
export function findPrivate(text) {
  const s = String(text || '');
  const hits = [];
  for (const [re, kind] of [[PHONE_RE, 'phone'], [EMAIL_RE, 'email']]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))) hits.push({ start: m.index, end: m.index + m[0].length, kind });
  }
  NAME_RE.lastIndex = 0;
  let m;
  while ((m = NAME_RE.exec(s))) {
    const word = m[1];
    if (NAME_EXCLUDE.some((x) => word === x || word.endsWith(x))) continue;
    hits.push({ start: m.index, end: m.index + word.length, kind: 'name', name: word });
  }
  return hits.sort((a, b) => a.start - b.start);
}

/** "지훈이가" → "우리 아이가", "민수네 집" → "그 아이네 집" */
export function replaceNames(text) {
  return String(text || '').replace(NAME_RE, (all, word, suffix) => {
    if (NAME_EXCLUDE.some((x) => word === x || word.endsWith(x))) return all;
    return suffix.startsWith('이') ? '우리 아이' + suffix.slice(1) : '그 아이' + suffix;
  });
}
