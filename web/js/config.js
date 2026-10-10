// 배포 주소는 이 파일 한 곳에만 둔다(기획서 4장). 비밀 값은 넣지 않는다.
const PROD_API = 'https://script.google.com/macros/s/AKfycbxhSjqfo4EvJWfpGjWaNpAAm-Qp34NE5u00QK-RLAjyJp-NLzein_Pk0tlIk1c5uLYrLQ/exec';
// 내 컴퓨터에서만 ?api=로 흉내 서버(gas/test/server.js)를 쓸 수 있다.
const DEV_API = location.hostname === 'localhost' ? new URLSearchParams(location.search).get('api') : null;
export const API_URL = DEV_API || PROD_API;
export const PUBLIC_URL = 'https://tk-korea.github.io/five-people-garden/';
export const APP_NAME = '한 아이 곁에 다섯 사람';

// 0단계 결과: 요청의 약 7%가 8~20초 뒤 실패하므로 시간 제한과 한 번 다시 보내기를 둔다.
export const TIMEOUT_MS = 8000;
export const RETRIES = 1;
