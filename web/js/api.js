// 서버 요청. 헤더 없이 보낸다: GET은 쿼리, POST는 JSON 문자열 본문(Content-Type 지정 안 함 → text/plain).
import { API_URL, TIMEOUT_MS, RETRIES } from './config.js';

export class ApiError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

// 8-6 문구
export const MESSAGES = {
  BAD_EDIT_CODE: '코드가 맞지 않아요. 단톡방 최근 공지의 코드를 넣어 주세요.',
  BAD_ADMIN_CODE: '관리 코드가 맞지 않아요.',
  LOCKED_OUT: '코드를 여러 번 틀려 10분간 잠겼어요. 잠시 뒤 다시 해 주세요.',
  RATE_LIMIT: '조금 천천히 써 주세요. 잠시 뒤 다시 보낼 수 있어요.',
  BUSY: '지금 여러 분이 함께 쓰고 있어요. 잠시 뒤 다시 눌러 주세요.',
  NOT_FOUND: '이 생각은 지금 볼 수 없어요.',
  INVALID: '보낸 내용을 다시 확인해 주세요.',
  NETWORK: '지금은 저장하지 못했어요. 쓴 내용은 남아 있으니 잠시 뒤 다시 눌러 주세요.',
};

export function messageFor(err) {
  return MESSAGES[err && err.code] || MESSAGES.NETWORK;
}

let lastRev = null;
export const currentRev = () => lastRev;

async function once(url, init) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await r.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      // 구글 오류 페이지(404 등)는 연결 오류로 본다.
      throw new ApiError('NETWORK', 'HTTP ' + r.status);
    }
    return json;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('NETWORK', e.name === 'AbortError' ? 'timeout' : e.message);
  } finally {
    clearTimeout(timer);
  }
}

async function request(url, init) {
  let lastErr;
  for (let i = 0; i <= RETRIES; i++) {
    try {
      const json = await once(url, init);
      if (typeof json.rev === 'number') lastRev = json.rev;
      if (!json.ok) throw new ApiError(json.error?.code || 'INVALID', json.error?.message);
      return json.data;
    } catch (e) {
      lastErr = e;
      if (e.code !== 'NETWORK') throw e; // 서버가 답한 오류는 다시 보내지 않는다.
    }
  }
  throw lastErr;
}

export function get(action, params = {}) {
  const q = new URLSearchParams({ action, ...params });
  return request(API_URL + '?' + q.toString(), { method: 'GET' });
}

// POST는 request_id로 서버가 한 번만 저장하므로 다시 보내도 안전하다.
export function post(action, body = {}) {
  return request(API_URL, { method: 'POST', body: JSON.stringify({ action, ...body }) });
}
