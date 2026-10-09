# 0단계 시험 결과

기획서 7장 0단계. 시험 페이지 `web/stage0/`, 서버 `gas/stage0/`.

## 준비

- 시트: TK의 구글 시트 한 개. 시트 id와 스크립트 id는 `gas/stage0/.clasp.json`에 있고, 공개 저장소에는 올리지 않는다(.gitignore).
- Apps Script: 위 시트에 붙은 스크립트. 시험 탭 `stage0_text`, `stage0_log`를 스크립트가 만든다.
- 실행 계정: TK 개인 구글 계정
- 웹 앱 배포 id: `AKfycbyIAX5vgaanTk0NZXbSymXFyba6oVpezgAVxtRc20l4owbblAo0-O8vCekdRl3ZljGWtg`
- 웹 앱 주소: https://script.google.com/macros/s/AKfycbyIAX5vgaanTk0NZXbSymXFyba6oVpezgAVxtRc20l4owbblAo0-O8vCekdRl3ZljGWtg/exec
- 시험 페이지 주소: (GitHub Pages 주소 채울 것)/stage0/

### 순서

1. https://script.google.com/home/usersettings 에서 "Google Apps Script API"를 켠다.
2. `clasp login` (브라우저에서 시트 주인 계정으로 허용).
3. `cd gas/stage0 && clasp create --parentId <시트 id> --title "다섯 사람 0단계" --rootDir .` 뒤 appsscript.json을 원래대로 되돌리고 `clasp push`. `--type sheets`를 함께 주면 clasp 3.4가 parentId를 무시하고 새 시트를 만든다.
4. `clasp open-script` → 편집기에서 `setupStage0` 실행, 권한 허용.
5. `clasp deploy --description "stage0"` → 나온 배포 id로 `https://script.google.com/macros/s/<id>/exec`. 코드를 고치면 `clasp push` 뒤 `clasp redeploy <id>`로 주소를 유지한다.
6. `web/stage0/stage0.js`의 `API_URL`에 넣고 GitHub Pages에 올린다.
7. 각 기기에서 시험 페이지를 열고, 끝나면 "결과 > 시트로 보내기". 아래 표에 옮긴다.

## 1. 연결과 응답 시간

목표: 저장된 응답 화면 1초 안, 서버 응답 3초 안. 오래 쉬었다 부른 첫 호출은 따로 적는다.

2026-10-09 17:15~17:25 KST, Mac(유선)에서 측정. 휴대폰 값은 아래 표에 더 채운다.

| 기기 | GET read 이어서(중앙값) | GET ping | POST echo | 10분 넘게 쉰 뒤 첫 호출 | 저장된 응답 표시 |
| --- | --- | --- | --- | --- | --- |
| Mac 브라우저 창(fetch, localhost) | 2.2초 (n=8, 서버 0.4~1.8초) | - | - | 2.3초 (배포 직후 첫 호출) | 11ms |
| Mac curl | 2.3~4.7초 (서버 0.5~0.8초) | 중앙값 1.5초, 최소 0.9초 (n=30) | 1.5~1.7초 | 첫 read 47.9초(1회, 서버 0.7초) | - |
| iOS 카톡 | | | | | |
| Android 카톡 | | | | | |

- 브라우저 fetch에서 GET·POST 모두 CORS 오류 없이 오간다(헤더 없이, POST는 Content-Type 지정 안 함).
- POST Content-Type(서버가 본 값): `text/plain`
- 한글·이모지 왕복: 그대로
- 시간대: `Utilities.formatDate(…, "yyyy-MM-dd'T'HH:mm:ssXXX")`가 `2026-10-09T17:15:59+09:00`을 낸다.
- 왕복의 대부분은 구글 쪽 리디렉션이다. ping은 서버 실행 50ms인데 왕복 1.5초, read는 시트를 열어 서버 0.5~1.8초.
- **간헐 실패**: 약 7%(curl ping 30회 중 2회, 브라우저 20여 회 중 2회)가 8~20초 기다린 뒤 HTTP 404 "Drive 현재 파일을 열 수 없습니다" 페이지로 끝났다. 쿠키 없는 curl에서도 나므로 로그인 상태와 무관하다. 배포 직후라 그런지 시간이 지난 뒤 다시 잰다.
- 저장된 응답을 먼저 그리면 11ms로 목표(1초)를 넉넉히 맞춘다. 서버 응답은 이어서 부를 때 2초 안팎으로 목표(3초) 안이지만, 가끔 4~5초까지 간다.

## 2. 시트에 글자 그대로 남기

같은 값 16개를 쓰는 방식별로 써 보고 다시 읽었다(stage0_text2 탭). 통과 = 글자 그대로, 수식 없음.

| 방식 | 통과 | 실패한 값 |
| --- | --- | --- |
| appendRow | 6/16 | `=1+1`, `+1+1`, `=HYPERLINK(…)`, `0012`→12, `1/2`·`2026-10-09`→날짜, `3.14`→숫자, `TRUE`→참거짓, 앞 `'` 떨어짐 |
| @ 서식 + setValues | 12/16 | `=1+1`, `=HYPERLINK(…)`가 수식으로 실행됨, 앞 `'` 떨어짐 |
| @ 서식 + 리치 텍스트 | 13/16 | `+1+1`이 수식이 됨, 앞 `'` 떨어짐 |
| **@ 서식 + 모든 글 앞에 `'`** | **16/16** | |
| **@ 서식 + `= + - @ '`로 시작할 때만 앞에 `'`** | **16/16** | |

- **기획서 6장의 가정과 다르다.** 일반 텍스트 서식(@)은 숫자·날짜 변환과 `+`·`-`·`@`는 막지만, `=`로 시작하는 값은 @ 칸에서도 수식으로 실행된다.
- **appendRow는 사람이 입력한 것처럼 값을 해석하고, 그 칸의 서식을 해석 결과로 덮어쓴다.** 새로 생긴 행에서 @ 서식이 이어지지 않는다(`0.###…`나 `m/d`로 바뀜).
- 앞에 붙인 `'`는 시트가 "글자 표시"로 쓰고 떼어 저장하므로, 읽을 때 원래 값이 그대로 나온다. 원래 `'`로 시작하는 글도 `'`를 하나 더 붙이면 그대로 남는다.
- KST 시각 문자열(`2026-10-09T17:17:52+09:00`)은 appendRow로 써도 날짜로 바뀌지 않았지만, 위 이유로 같은 방식을 쓴다.

## 3. 카톡 인앱 브라우저

| 항목 | iOS 카톡 | Android 카톡 | 비고 |
| --- | --- | --- | --- |
| localStorage 유지(창 닫고 다시 열기) | | | |
| localStorage 유지(카톡 껐다 켜기) | | | |
| `#c=` 영문 코드 링크 | | | |
| `#c=` 한글 코드 링크 | | | |
| navigator.share | | | |
| 링크 복사(대체) | | | |
| window.print | | | |
| 키보드와 하단 입력줄(보정 켬) | | | |
| 키보드와 하단 입력줄(보정 끔) | | | |
| 시스템 글꼴 최대 반영 | | | |
| 큰 글씨에서 연결 띠·카드 | | | |

### 카톡 인앱에서 안 되는 기능

-

## 4. 결정

- 구조(기획서 4장): B 깃헙 화면 + Apps Script API / A iframe —
- 1단계에 반영할 것:
  - 시트 쓰기는 appendRow를 쓰지 않는다. 새 행 범위를 잡아 `setNumberFormat('@')` 뒤 `setValues`로 한 번에 쓴다.
  - 글 열(제목, 설명, 이어 쓰기, 별칭, 시각, id 등)의 값은 모두 앞에 `'`를 붙여 쓴다. 숫자 열(waters, reply_count, report_count)은 숫자 그대로.
  - 화면의 요청에 시간 제한(예: 8초)과 한 번 다시 보내기를 둔다. POST는 request_id로 중복 저장이 막혀 있어 다시 보내도 안전하다. JSON이 아닌 응답은 연결 오류로 본다.

## 기기별 원본 요약

(시험 페이지 "결과"의 요약을 그대로 붙여 넣는다.)
