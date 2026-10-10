// 흉내 서버: Apps Script 코드를 메모리 시트로 돌려 화면을 내 컴퓨터에서 시험한다.
// 실행: node gas/test/server.js  →  http://localhost:8730/?api=http://localhost:8731/exec
// 편집 코드와 관리 코드는 시작할 때 터미널에 찍힌다.
'use strict';

const http = require('http');
const { makeEnv } = require('./harness');

const env = makeEnv({ realClock: true });
env.call('setupAll');
console.log('참여 코드:', env.props.get('EDIT_CODE'));
console.log('관리 코드:', env.props.get('ADMIN_CODE'));

const PORT = Number(process.env.PORT || 8731);
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (out) => {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(out);
  };
  const delay = Number(process.env.DELAY || 300);
  if (req.method === 'GET') {
    const params = Object.fromEntries(url.searchParams);
    setTimeout(() => send(env.rawGet(params)), delay);
  } else if (req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => setTimeout(() => send(env.rawPost(body)), delay));
  } else {
    res.writeHead(405);
    res.end();
  }
}).listen(PORT, () => console.log(`흉내 서버: http://localhost:${PORT}/exec`));
