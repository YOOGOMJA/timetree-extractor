---
name: feature-build
description: TimeTree Extractor의 기능 추가/변경/구현 요청 시 *반드시* 이 스킬을 사용. 트리거 표현 — "구현해줘", "추가해줘", "만들어줘", "수정해줘", "보완해줘", "UI/화면/디자인/sidepanel/버튼", "새 필드/spec/contract/decision/warning enum", "normalize/ics emit/MV3/manifest", 후속 "다시/그 부분만 다시". ux-designer / contract-designer / core-implementer / extension-implementer / verifier 5개 서브에이전트를 디자인→contract→구현→검증의 순서로 오케스트레이트한다. 이 스킬 없이 위 에이전트들을 임의 호출하지 말 것. 단순 정보 질문(어디 정의돼 있어, 왜 이래)은 트리거하지 않음.
---

# feature-build — TimeTree Extractor Implementation Orchestrator

이 스킬은 사용자의 기능 변경/추가/수정 요청을 5단계로 실행한다. integrator(리더) 역할은 이 스킬을 invoke한 메인 에이전트가 수행한다.

## 운영 모드 (Claude Code 환경 한정)

이 환경에서는 `TeamCreate`가 없으므로 **서브 에이전트 모드 + 파일 기반 통신**으로 동작.

- 각 에이전트는 `Agent` 도구로 호출. 호출 시 반드시 `model: "opus"` 명시.
- `subagent_type`은 빌트인 `general-purpose` 사용. 에이전트 정의는 prompt에서 "Read `.claude/agents/{name}.md` and act strictly as that agent"로 로드시킨다.
- 병렬 가능 작업(서로 다른 입력만 받음)은 `run_in_background: true`로 동시 실행 후 결과 수집.
- 에이전트 간 통신은 **`_workspace/` 파일을 통한 간접 통신**. 메인이 산출물 path를 다음 에이전트의 prompt에 명시한다.

## Phase 0: 컨텍스트 확인 (항상)

```bash
ls _workspace/ 2>/dev/null
```

- **초기 실행** — `_workspace/`가 없음 → `mkdir -p _workspace`
- **후속/부분 재실행** — `_workspace/`가 있고 사용자가 "다시"/"수정"/"보완"이라고 함 → 어느 단계 산출물을 갱신할지 사용자 발화에서 판별. 다른 단계 산출물은 건드리지 않는다
- **새 실행** — `_workspace/`가 있는데 *완전히 다른 작업* 요청 → `mv _workspace _workspace_prev_$(date +%Y%m%d-%H%M)` 후 새 `_workspace/` 생성. 백업 사실을 사용자에게 한 줄 알린다

## Phase 1: 요청 분석 (메인 단독)

사용자 요청을 읽고 활성화할 에이전트를 결정한다. 다음 표가 표준 매핑.

| 변경 종류 | ux-designer | contract-designer | core-implementer | extension-implementer | verifier |
|---|:---:|:---:|:---:|:---:|:---:|
| UI만 (버튼 텍스트, 레이아웃, 컴포넌트) | ✅ | ❌ | ❌ | ✅ | ✅ |
| 새 export 필드 추가 | ✅ (노출 결정) | ✅ | ✅ | ✅ | ✅ |
| ICS emit 규칙 변경 | ❌ | ✅ | ✅ | ❌ | ✅ |
| 새 endpoint 허용 | ❌ | ✅ | ✅ (matchTimeTreeEndpoint) | ✅ (manifest host_permissions) | ✅ |
| Warning enum 신설 | ✅ (화면 노출 결정) | ✅ | ✅ | ✅ | ✅ |
| Spec drift 정리 | ❌ | ✅ | ✅ | ❌ | ✅ |
| 빌드/manifest/Preact 도입만 | ❌ | ❌ | ❌ | ✅ | ✅ |

판단이 모호하면 **상위 set**으로 결정한다 (의심스러우면 contract-designer 포함). 사용자에게 한 줄 알린다 — 예: "다음 에이전트들이 활성화됩니다: ux-designer, contract-designer, core-implementer, extension-implementer, verifier". 사용자가 명시적 정정을 요청하지 않으면 곧장 Phase 2로 진행.

## Phase 2: 디자인 단계

활성화된 에이전트에 따라 분기:

**ux-designer + contract-designer 둘 다 활성화** → 병렬 호출 후 교차 점검:

1. 두 에이전트를 `run_in_background: true`로 동시 호출
   ```
   Agent(
     subagent_type: "general-purpose",
     model: "opus",
     description: "UX design",
     run_in_background: true,
     prompt: "Read .claude/agents/ux-designer.md and act strictly as that agent. 사용자 요청: <원 요청>. 산출물 path: _workspace/01_ux_design.md."
   )
   ```
   contract-designer도 동일 형식, 산출물 path는 `_workspace/02_contract.md`.
2. 두 결과 모두 수집 후 메인이 교차 점검:
   - ux-designer의 *화면 노출 field*가 contract-designer의 contract와 정합한가
   - mismatch면 한쪽에 짧은 보강 요청을 prompt로 다시 호출, 산출물 패치
3. 통과 → Phase 3 진입

**ux-designer 단독** 또는 **contract-designer 단독** → 단일 호출 후 결과 저장. 교차 점검 생략.

**둘 다 비활성화** → Phase 2 스킵, Phase 3 직진.

## Phase 3: 구현 단계

활성화된 implementer에 따라 분기. 다음 의존 규칙을 따른다:

- `core-implementer`가 `src/core/index.ts`의 export surface를 변경하면 → **순차**: core 먼저, extension은 그 후
- 변경이 독립적이면 (예: core는 normalize.ts 내부만, extension은 sidepanel.html만) → **병렬**
- 의존 여부 판단이 모호하면 **순차로 진행한다**. 잘못된 병렬이 더 비싼 실수

호출 prompt에는 *항상* Phase 2 산출물 path를 입력으로 명시:
```
prompt: "Read .claude/agents/core-implementer.md and act strictly as that agent.
입력:
  - _workspace/02_contract.md (contract 결정)
  - .claude/agents/core-implementer.md 본문
산출물 path: _workspace/03_core_diff.md.
한 모듈을 완성하면 즉시 'MODULE COMPLETE: <module name>'을 출력하고 멈춘다."
```

implementer가 *한 모듈 완성*을 알리면 즉시 Phase 4(verifier)를 호출한다. 모듈 단위 incremental QA가 핵심이다.

## Phase 4: 검증 단계 (incremental)

implementer가 모듈을 마칠 때마다 verifier 호출:

```
Agent(
  subagent_type: "general-purpose",
  model: "opus",
  description: "Verifier QA",
  prompt: "Read .claude/agents/verifier.md and act strictly as that agent.
입력:
  - 변경 파일 목록: <git status --porcelain 와 git diff --name-only HEAD 둘 다 사용해 untracked 포함>
  - 영향 spec: <implementer 산출물에서 명시한 spec path>
  - 이전 산출물: _workspace/02_contract.md, _workspace/03_core_diff.md, ...
산출물 path: _workspace/verify_p3_<module>.md."
)
```

verifier 결과 확인 후, 보고서 상단에 `ICS_REVIEWER_NEEDED: yes`가 있으면 메인이 직접 ics-emitter-reviewer를 호출한다:

```
Agent(
  subagent_type: "ics-emitter-reviewer",
  model: "opus",
  description: "ICS emitter review",
  prompt: "변경 파일: <목록>. 이전 RED baseline: <경로 또는 '없음'>. 결과 저장: _workspace/verify_ics_reviewer.md."
)
```

ics-emitter-reviewer 결과를 받으면 verifier를 *두 번째로* 호출해 ics 결과를 종합 보고서에 흡수시킨다:

```
prompt: "Read .claude/agents/verifier.md and act strictly as that agent.
이전 verifier 보고서: _workspace/verify_p3_<module>.md
ics-emitter-reviewer 결과: _workspace/verify_ics_reviewer.md
ics 결과의 P0/P1/P2를 자기 보고서에 흡수해 갱신하라. 산출물 path: _workspace/verify_p3_<module>.md (덮어쓰기)."
```

결과 처리:
- **P0 있음** → 진행 차단. P0 finding을 해당 implementer에 prompt로 전달하고 implementer 재호출. P0 해결 후 verifier 재호출
- **P1만 있음** → 사용자에게 "P1 N건 발견 — 처리하고 가시겠어요, 지금 진행할까요?" 결정권 부여
- **모두 통과** → 다음 모듈 또는 종료

모든 모듈 완료 후 verifier에 최종 종합 보고서 1회 더 요청:
```
산출물 path: _workspace/verify_final.md
```

## 데이터 전달 프로토콜

워크스페이스 구조:
```
_workspace/
├── 00_design_md_convention.md     (ux-designer 첫 실행 시, 1회)
├── 01_ux_design.md                (ux-designer)
├── 02_contract.md                 (contract-designer)
├── 03_core_diff.md                (core-implementer)
├── 04_extension_diff.md           (extension-implementer)
├── verify_p3_core.md              (모듈별 verify)
├── verify_p3_extension.md
├── verify_ics_reviewer.md         (verifier가 ics-emitter-reviewer 호출 시)
└── verify_final.md                (최종 종합)
```

규칙:
- 파일명은 `{phase}_{agent}_{artifact}.{ext}` 컨벤션. phase는 P1/P2/P3/P4 또는 단순 번호.
- 메인 에이전트가 모든 호출의 prompt에 정확한 산출물 path를 명시한다. 에이전트가 path를 임의로 바꾸면 다음 단계가 깨진다.
- `_workspace/`는 commit하지 않는다 (`.gitignore`에 추가, 다음 phase에서 처리).
- 후속 작업 시 기존 산출물을 *덮어쓰지 않고* 하단에 변경 로그를 누적하는 것을 우선. 완전 재작성은 사용자가 명시 요청할 때만.

## 에러 핸들링

| 시나리오 | 처리 |
|---|---|
| 에이전트가 빈 결과/실패 반환 | 1회 재시도. 그래도 실패면 사용자에 보고 후 해당 단계 결과 없이 진행. 최종 보고서에 누락 명시. |
| 두 에이전트 산출물이 상충 (예: ux 노출 field ≠ contract field) | 삭제하지 않고 양쪽 출처 병기. 사용자에 결정 요청. |
| verifier가 P0 발견 | 진행 차단. 해당 implementer에 finding 전달 후 재호출. |
| verifier가 ics-emitter-reviewer 호출에 실패 | verifier는 그 사실을 보고서에 명시. 메인은 사용자에게 "ICS 영역 변경이지만 reviewer 호출 실패 — 수동 검토 권장"을 알린다. |
| `npm install` 또는 `npm run build` 실패 | 즉시 사용자 에스컬레이션. `--no-verify`, `--force` 등 자동 우회 금지. |
| `_workspace/` 권한/디스크 오류 | 즉시 사용자 에스컬레이션. |
| 사용자 요청이 privacy-and-local-only-boundary 또는 v1-export-policy를 위반 (예: HAR 저장, attachment binary export) | contract-designer가 해당 요청을 거부하도록 prompt에 정책 path 명시. 사용자 정정 요청. |

## 후속 작업 / 부분 재실행

사용자 발화 예시별 진입점:

| 사용자 발화 | 진입점 | 동작 |
|---|---|---|
| "그 디자인 다시 손봐줘" | Phase 2 (ux-designer만) | 기존 `_workspace/01_ux_design.md`를 입력으로 ux-designer 재호출. 다른 산출물은 그대로. |
| "spec 부분만 수정" | Phase 2 (contract-designer만) | 기존 `02_contract.md` 갱신. |
| "core 구현에서 X 누락됐어" | Phase 3 (core-implementer만) → Phase 4 | implementer 재호출 후 verifier 재호출. |
| "다시 전체 점검" | Phase 4만 | verifier 단독 호출, 최종 종합 보고서 갱신. |
| "처음부터 다시" | Phase 0 → 전체 | `_workspace/`를 `_workspace_prev_*`로 백업 후 전체 새 실행. |

## 사용자 보고 형식

각 phase 종료 후 메인은 사용자에게 1~3줄 요약:

```
[Phase 2] ux-designer + contract-designer 완료. 산출물: _workspace/01_ux_design.md, 02_contract.md. 신규 토큰 0, 신규 warning enum 1 (`label-color-approximation` 추가).
```

Phase 4 종료 후에는 P0/P1/P2 카운트 + 변경 파일 리스트 + 전체 보고서 path.

## 테스트 시나리오

### 정상 흐름 — "sidepanel 시작일 기본값을 30일 전으로 바꿔줘"
1. Phase 1: ux-designer + extension-implementer + verifier 활성화 (contract 변경 없음)
2. Phase 2: ux-designer 단독 호출 → `01_ux_design.md`에 기본값 변경 결정과 컴포넌트 props 영향
3. Phase 3: extension-implementer가 `sidepanel.ts`/`sidepanel.html` 수정 → "MODULE COMPLETE: sidepanel"
4. Phase 4: verifier 호출 → build·test 통과, layer boundary OK, UI↔contract 정합
5. 완료. 사용자에 1줄 요약.

### 에러 흐름 — "새 calendar color field를 ICS에 emit해줘"
1. Phase 1: 5개 에이전트 모두 활성화
2. Phase 2: contract-designer가 `docs/specs/v1-export-policy.md`의 intentional exclusion(per-event color) 발견 → 산출물에 "이 변경은 v1-export-policy 정책 갱신을 요구함, 거부 권고" 명시
3. 메인이 사용자에 escalate: "이 변경은 v1-export-policy의 정책 변경을 필요로 합니다. (1) 정책 변경 후 진행 (2) 요청 철회. 어느 쪽으로 갈까요?"
4. 사용자 결정에 따라 spec 갱신 → Phase 2 contract-designer 재호출 → Phase 3로

## 명시적 비-범위

- **commit/PR 작성**: 이 스킬의 범위 밖. 사용자가 별도로 요청하면 그때 AGENTS.md의 Lore Commit Protocol을 따라 처리.
- **단순 정보 질문**(`어디 정의돼 있어?`, `왜 이래?`): 이 스킬을 트리거하지 않는다. 메인이 직접 답한다.
- **CLI(`src/cli/`) 작업**: 본 워크플로우는 extension 중심. CLI 변경이 필요하면 별도 진입점을 사용자가 명시.
- **외부 web 조사 전반**: ux-designer의 design.md 1회 fetch를 제외하면 외부 web을 적극 쓰지 않는다.
