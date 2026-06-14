// fetch 실패를 사용자 메시지로 변환한다(#92, 배포 게이팅 1).
// 순수 함수 — DOM/네트워크 의존 없음.
export type FetchFailureKind = 'contract' | 'transient' | 'auth';

// content-script는 모든 실패를 { ok:false, issues } 한 채널로 합쳐 보낸다
// (throw도 message boundary에서 ok:false로 변환됨, content-script.ts). 그래서
// 소스가 아니라 issue 내용으로 분류한다: 401/403=auth(로그인 만료, #113),
// 그 외 HTTP/네트워크=transient, shape/validation 위반=contract(형식 변경 가능성).
const AUTH_ISSUE = /^HTTP 40[13]\b/i;
const TRANSIENT_ISSUE = /^HTTP \d{3}\b|failed to fetch|networkerror|load failed/i;

export function classifyFetchIssues(issues: string[]): FetchFailureKind {
  if (issues.some((issue) => AUTH_ISSUE.test(issue))) return 'auth';
  if (issues.some((issue) => TRANSIENT_ISSUE.test(issue))) return 'transient';
  return 'contract';
}

export function describeFetchFailure(
  kind: FetchFailureKind,
  issues?: string[],
): { title: string; detail: string } {
  const detail = issues && issues.length > 0 ? issues.join(', ') : '';
  if (kind === 'contract') {
    return {
      title: 'TimeTree 응답 형식이 바뀐 것 같습니다. 지금은 안전하게 가져올 수 없어요. (가져오기 중단)',
      detail,
    };
  }
  if (kind === 'auth') {
    return {
      title: 'TimeTree 로그인이 풀렸어요. TimeTree 탭에서 다시 로그인한 뒤 이어서 시도하세요.',
      detail,
    };
  }
  return {
    title: 'TimeTree에 접근하지 못했습니다. 로그인·네트워크를 확인하고 다시 시도하세요.',
    detail,
  };
}
