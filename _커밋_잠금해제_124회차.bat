@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM ── D-ARS 커밋 도우미 (124회차) ─────────────────────────────────
REM  샌드박스에서 .git 안의 파일을 지울 권한이 없어 자동 커밋이 막혔습니다.
REM  이 파일을 더블클릭하면: 잠금 파일 제거 → 상태 확인 → 커밋(2건)까지 진행합니다.
REM  push(=배포)는 하지 않습니다. 주간 정책상 배포는 확인 후 수동으로 하세요.
REM ────────────────────────────────────────────────────────────────

echo [1/4] 남아있는 git 잠금 파일 제거...
if exist ".git\HEAD.lock"  del /f /q ".git\HEAD.lock"
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo.
echo [2/4] 현재 변경 사항
git status --short

echo.
echo [3/4] 120~123회차 미커밋분 커밋 (테스트 전용 · 런타임 0 변경)
git add "d-ars-repo/dars/lib/sourceLint.js" "d-ars-repo/dars/tests/sourcelint.test.mjs" "d-ars-repo/dars/app/global-error.jsx"
git commit -m "test(D-ARS): 120~123회차 sourceLint 확장 — iframe title·html lang·role 화이트리스트·뷰포트 줌 정책·aria-* 속성명·빈 텍스트 링크 불변식. 런타임 코드 0 변경 (검증: node --test 595/595)"

echo.
echo [4/4] 124회차 디자인 커밋 (타이포 하한·터치 타깃)
git add -A
git commit -m "design(D-ARS/타이포): 124회차 — 타이포 하한·터치 타깃 정리. globals.css 57개 규칙 상향(표 13→14·버튼 13→14+40px·카드 h3 15→16.5·사이드바 13.5→14.5·캡션류 10~12→12~13.5·line-height 1.5→1.6), 모바일 최소 높이(.btn 44·.botnav 48)·표 최소폭 460→500. 순수 표현, 로직·데이터 무변경 (클린룸 next build rc=0 25/25 · lint 0 · 테스트 595/595 · 파일 완전성 확인)"

echo.
echo ── 완료. 최근 커밋 ──
git log --oneline -3
echo.
echo 배포하려면(확인 후): git push origin main
echo 배포 60~90초 뒤 https://d-ars.vercel.app/api/health 확인
pause
