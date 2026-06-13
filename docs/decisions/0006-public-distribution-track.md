# Decision 0006: 공개 Chrome Web Store 배포를 목표로 한다

결론: **이 프로젝트는 공개 Chrome Web Store 배포를 목표로 한다.** 0002의 "public extension/store distribution = no-go"를 이 항목에 한해 **supersede**한다. 단, 배포는 무조건이 아니라 아래 **게이팅 체크리스트를 모두 통과한 뒤**에만 제출한다. 로컬 전용·데이터 최소화·no-silent-loss 같은 핵심 제약은 배포 후에도 유지한다.

> **게이팅 진행(2026-06-13)**: 1(#92 ✅ API 변경 감지)·3(#94 ✅ 스토어 준비)·4(#95 ✅ privacy policy). 법무(#93)는 소유자가 **리스크를 수용**해 진행 결정(법적 clearance 아님 — `docs/legal/timetree-aup-risk-review.md`). 분쟁 시 옵션 B(비공개 한정)/C(보류)로 후퇴. 남은 것: #96(제출 직전 정확성 회귀)·스크린샷·privacy 공개 URL.

## Decision status

| 항목 | 0002 판단 | 0006 갱신 |
| --- | --- | --- |
| Public extension/store distribution | no-go | **go (게이팅 통과 시)** |
| Browser extension UI | no-go | go (이미 shipped: #67·#75) |
| Internal API 기반 exporter | no-go for now | go (현행 유지, 리스크 완화 전제) |
| SaaS/hosted collector | no-go | **no-go 유지** |
| 서버 전송·credential 저장 | no-go | **no-go 유지** (로컬 전용 불변) |

## Decision drivers

1. **제품 가치 실재**: TimeTree엔 공식 export가 없다. 개인+공유 일정 마이그레이션은 수작업/포기 외 대안이 없어, 배포 시 실사용자 가치가 크다(`docs/product/value-proposition.md`).
2. **이미 제품 형태**: 대시보드·ICS/JSON·반복/시간대/RECURRENCE-ID 정합까지 갖춰 0002의 "prototype" 단계를 넘었다. RECURRENCE-ID override는 실 Google import로 검증됨(#85).
3. **로컬 전용이 심사·신뢰에 유리**: 서버 전송 0, credential 미저장은 Web Store 프라이버시 심사와 사용자 신뢰 양쪽에 강점.

## 게이팅 체크리스트 (배포 제출 전 전부 충족)

배포를 막는 것은 기술이 아니라 아래 리스크다. 각 항목이 닫히기 전엔 스토어 제출하지 않는다.

1. **내부 비공식 API 의존 (최대 리스크)**
   - TimeTree `/api/v1/...`는 public contract가 아니다 → 언제든 변경·차단 가능. 스토어 심사는 통과해도 **런타임이 조용히 깨질 수 있다.**
   - 대응: (a) 엔드포인트/contract 변경 **감지 + graceful 실패 메시지**(사용자에게 "TimeTree 변경으로 일시 불가" 안내, 잘못된 export 금지), (b) `X-TimeTreeA` 버전 핀 노출·관리, (c) 깨짐 시 데이터 손상 없이 중단.

2. **TimeTree AUP / ToS 법적 검토**
   - 자동 접근이 약관 위반인지 확인 필요. 위반 소지 있으면 배포 보류 또는 범위 축소.
   - retry/backoff 금지(부하 회피) 정책 유지.

3. **Chrome Web Store 정책 정합**
   - `host_permissions`를 `https://timetreeapp.com/*`로 최소화, 단일 목적 명시, **remote code 금지**(현 esbuild 번들 유지), 개인정보처리방침 URL 필수.
   - 리스팅 자산(아이콘·스크린샷·설명)·권한 사유 작성.

4. **프라이버시·공유 데이터**
   - 공유 캘린더 타인 데이터: 로컬 전용·데이터 최소화(참가자/첨부 내용 미포함, 개수만 #81) 유지, 공유 경고 동의(현행) 명문화, privacy policy 문서화.

5. **데이터 정확성 게이트 (유지)**
   - 반복/시간대/RECURRENCE-ID 정합 회귀 없음. 잘못된 export는 사용자 피해 → 회귀 시 배포 보류.

## Chosen path

1. 위 게이팅 1~5를 이슈로 분해해 닫는다(특히 1·2·3).
2. 베타: **직접 설치(unpacked/CRX)** 로 소수 검증 → 실데이터 마이그레이션 신뢰 확인.
3. 스토어 리스팅·privacy policy·권한 사유 준비.
4. 법무/AUP 확인 후 제출. 심사 피드백 반영.
5. 배포 후에도 내부 API 변경 모니터링 + graceful 실패를 1급으로 유지.

## Alternatives considered

### A. 직접 설치 배포만 (스토어 X)
거절. 제품 가치를 넓게 전달하려는 목표(공개 배포)와 맞지 않음. 단, **베타 단계로는 채택**(Chosen path 2).

### B. 비배포 유지
거절. 제품으로 이미 충분히 성숙했고, 마이그레이션 수요가 실재.

### C. SaaS/서버 수집
거절(불변). 프라이버시·신뢰·심사 모두 악화. 로컬 전용이 차별점.

## 0002와의 관계

0002의 distribution no-go는 **프로젝트 초기 리스크 회피용**이었다. contract-first 구현·UI·검증이 진행되며 그 전제가 바뀌었다. 0006은 distribution 항목만 supersede하며, 0002의 나머지 제약(서버 전송·credential·SaaS no-go)은 그대로 유효하다.
