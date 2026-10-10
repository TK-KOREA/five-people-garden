# 한 아이 곁에 다섯 사람

교회 성도들이 "한 아이 곁에 의미 있는 다섯 사람(친구, 부모, 봉사, 다른 부모, 조부모)"을 세우는 방안을 나누고 이어 쓰는 모바일 웹 페이지.

- 페이지: https://tk-korea.github.io/five-people-garden/
- 기준 문서: [docs/plan.md](docs/plan.md) (기획서·디자인 가이드), [docs/stage0-results.md](docs/stage0-results.md) (0단계 시험 결과)

## 폴더

| 경로 | 내용 |
| --- | --- |
| CLAUDE.md | Claude Code가 매번 읽는 프로젝트 안내 |
| docs/ | 기획서, 배경, 0단계 결과 |
| design/ | 시안 소스와 설명 |
| web/ | GitHub Pages 화면 (`index.html`, `css/`, `js/`). `web/stage0/`은 0단계 시험 페이지 |
| gas/app/ | Apps Script 서버 (시트에 붙은 스크립트, clasp로 올림) |
| gas/stage0/ | 0단계 최소 Apps Script (보관용) |
| gas/test/ | Node 흉내 환경: API 논리 시험과 흉내 서버 |

## 처음 세팅 (한 번)

1. `cd gas/app && clasp push` (`.clasp.json`은 저장소에 없으므로 처음 한 번 `gas/stage0` 순서대로 만든다)
2. `clasp open-script` → 편집기에서 `setupAll` 실행, 권한 허용. 실행 로그에 참여 코드와 관리 코드가 나온다.
3. 운영 전에 관리 화면(`/#/admin`)에서 두 코드를 바꾼다.

코드를 고친 뒤에는 `clasp push` 하고 `clasp redeploy <배포 id> --description "…"`로 같은 주소를 유지한다. 배포 주소는 `web/js/config.js` 한 곳에만 있다.

## 내 컴퓨터에서 시험

```bash
node gas/test/run.js
```

화면까지 보려면 흉내 서버와 정적 서버를 띄우고 `http://localhost:8730/?api=http://localhost:8731/exec`를 연다. 흉내 서버의 참여·관리 코드는 터미널에 찍힌다.

```bash
node gas/test/server.js
```

```bash
cd web && python3 -m http.server 8730
```

## 원본 링크

- 기획서 원본: https://claude.ai/code/artifact/1fa48726-4515-47a1-9079-1f45f69c44e2
- 시안 캔버스: https://claude.ai/artifact/RiTGixbfaxk2kjFkGr5RFV

기획서를 고칠 때는 `docs/plan.md`를 기준으로 삼고, 원본 문서와 달라지면 어느 쪽이 최신인지 맨 위에 날짜를 적어 둡니다.
