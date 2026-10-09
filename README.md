# 다섯 사람 아이디어 정원

## Claude Code로 이어서 하기

1. 이 폴더를 원하는 곳에 둡니다. 예: `~/Projects/five-people-garden`
2. 터미널을 열고 이 폴더로 이동해 Claude Code를 시작합니다.

   ```bash
   cd ~/Projects/five-people-garden
   claude
   ```

   Claude Code가 아직 없으면 먼저 설치합니다.

   ```bash
   curl -fsSL https://claude.ai/install.sh | bash
   ```

3. 첫 메시지로 아래를 붙여 넣습니다.

   ```text
   CLAUDE.md와 docs/plan.md를 읽고, 0단계 시험 페이지와 최소 Apps Script를 만들어 줘. 깃 저장소도 초기화해 줘.
   ```

Claude Code는 시작할 때 `CLAUDE.md`를 자동으로 읽으므로, 그 안의 배경과 지켜야 할 것을 따로 설명하지 않아도 됩니다.

## 폴더

| 경로 | 내용 |
| --- | --- |
| CLAUDE.md | Claude Code가 매번 읽는 프로젝트 안내 |
| docs/plan.md | 개발기획서·디자인 가이드 (원본: Claude 문서, 아래 링크) |
| docs/background.md | 배경, 구절, 처음 방안, 질문, 진행 기록 |
| design/ | 시안 소스와 설명 |
| web/ | (만들 곳) GitHub Pages 화면 |
| gas/ | (만들 곳) Apps Script 코드 |

## 원본 링크

- 기획서 원본: https://claude.ai/code/artifact/1fa48726-4515-47a1-9079-1f45f69c44e2
- 시안 캔버스: https://claude.ai/artifact/RiTGixbfaxk2kjFkGr5RFV

기획서를 고칠 때는 `docs/plan.md`를 기준으로 삼고, 원본 문서와 달라지면 어느 쪽이 최신인지 맨 위에 날짜를 적어 둡니다.
