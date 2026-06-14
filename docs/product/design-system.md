# TimeTree Exporter 디자인 시스템 (v1)

> 단계 4 산출물. 검토 반영 데모(`demo/sidepanel-redesign.html`)에서 추출한 **정식 토큰·컴포넌트 규약**. 단계 5에서 실제 `sidepanel.html`/`.tsx`에 점진 적용한다.
> 방향: 차분·신뢰. TimeTree 녹색 혈통(pine)을 1차색으로, 회색은 **녹-회 단일 패밀리(slate)**로 통일(기존 gray/slate 난립 해결). signature = "정직한 영수증(ledger)" 충실도.

## 색 토큰

```css
:root{
  --pine:#1F6B4F; --pine-deep:#16513B; --pine-weak:#E7F0EB;   /* 1차·신뢰 */
  --ink:#16241F; --slate:#5B6B63; --slate-faint:#8A998F;       /* 텍스트(단일 패밀리) */
  --paper:#F7F8F6; --card:#FFFFFF; --line:#E3E7E3; --line-faint:#EEF1EE;
  --amber:#B45309; --amber-weak:#FBF3E3; --amber-line:#EAD9B4;  /* 경고 단일 시그널 */
  --danger:#B23A3A; --danger-weak:#FBECEC;                      /* 손실/오류 */
}
[data-theme="dark"], @media (prefers-color-scheme:dark){
  --pine:#5FBF95; --pine-deep:#3FA37B; --pine-weak:#163125;
  --ink:#E8EFEA; --slate:#A6B5AC; --slate-faint:#76857C;
  --paper:#0E1613; --card:#15201B; --line:#243029; --line-faint:#1B2620;
  --amber:#E0A45C; --amber-weak:#2A2113; --amber-line:#3D2F16;
  --danger:#E08585; --danger-weak:#2A1717;
}
```

**의미 규칙**: pine=긍정/신뢰/포함, slate=중립/제외(의도된), amber=주의(형식·공유), danger=손실(처리 실패)/오류. **충실도 바의 빨강 트랙 폐기** — 중립 트랙 + 세그먼트(포함/기간밖/형식/실패)로.

## 간격·radius·타이포

```css
--space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-5:24px;
--radius-sm:6px; --radius:10px; --radius-lg:14px; --radius-pill:999px;
--font-display:"Space Grotesk";  /* 숫자·히어로(캐릭터) */
--font-body:"Pretendard",system-ui;  /* 한국어 본문 */
```
- 숫자/카운트는 항상 `font-variant-numeric:tabular-nums` + display 폰트.
- 타입 스케일: hero 25 / big-count 40 / h-14 / body-13 / sub-12 / eyebrow-10.5(uppercase, letter-spacing).
- 실제 확장 적용 시 폰트는 **번들·subset**(원격 코드 금지) — 데모만 CDN.

## 컴포넌트 규약

| 컴포넌트 | 규칙 |
| --- | --- |
| `.btn` | primary(pine)·ghost(line→hover pine). **모든 인터랙티브에 hover + focus-visible(2px pine)**. `touch-action:manipulation`, 최소 44px 히트. |
| 배지 | `.badge-share`(함께 N명, pine-weak) / `.badge-self`(나만) — **공유 캘린더 1급 시각화**. |
| 캘린더 행 | dot + 이름(ellipsis) + 배지 + tabular 카운트. |
| 칩(카테고리) | pill, pine-weak, tabular 카운트. |
| 이슈 | `<details>` 드릴다운(네이티브, aria 자동) + chevron 회전. |
| ledger(signature) | big-count + 세그먼트 바 + 4줄 회계(포함/기간밖/형식/실패). |
| sticky exportbar | 하단 고정·frosted. **1차 액션을 스크롤 바닥에서 끌어올림**. |
| 상태(빈/로딩/오류) | 로딩=실제 spinner + 단계 라벨 + 진행 카운트. 오류=`role="alert" aria-live="assertive"`, 로그인 만료 전용 카피·동선. |
| 파괴적 | "한 번 더 누르기" 인라인 확인(기록 지우기). |

## 적용 순서 (단계 5)

팀 합의 = **토큰 먼저**.
1. `:root` 토큰 레이어 + 다크모드 → 회색 slate 단일화 (F1).
2. fidelity 요약을 Preact로 흡수 → single render path 1보 (F2).
3. `Section`/`CountRow`/`Chip`/`IssueRow` 컴포넌트 추출 (F3).
4. exportbar sticky·loading 진행감·ledger·공유 배지 등 화면별 검토 반영.

기능 공백(부분 실패·로그인 동선·재시도·dropped 분해)은 별도 로직 트랙.
