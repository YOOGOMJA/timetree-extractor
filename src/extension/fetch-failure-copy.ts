// fetch 실패를 사용자 메시지로 변환한다(#92, 배포 게이팅 1).
// 실패 종류는 소스로 정해진다: FETCH_* ok:false = contract(TimeTree 형식 변경
// 가능성, shape/validation 위반), fetchJson throw = transient(HTTP/네트워크).
// 순수 함수 — DOM/네트워크 의존 없음.
export type FetchFailureKind = 'contract' | 'transient';

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
  return {
    title: 'TimeTree에 접근하지 못했습니다. 로그인·네트워크를 확인하고 다시 시도하세요.',
    detail,
  };
}
