// 정규화 경고 코드(`NORMALIZATION_WARNING_VALUES`)를 사용자용 한국어 문구로 매핑한다 (#68).
// label은 무슨 일이 일어났는지, hint는 왜/어떻게(사용자 관점)를 한 줄로 설명한다.
// 새 enum 값이 추가되면 여기에도 추가해야 한다 — warning-copy.test.ts가 동기화를 강제한다.

export type WarningCopy = { label: string; hint: string };

const WARNING_COPY: Record<string, WarningCopy> = {
  'timezone-missing': {
    label: '시간대 정보 없는 일정은 UTC로 처리',
    hint: '원본에 시간대가 없어 UTC 기준으로 내보냈습니다.',
  },
  'timezone-not-iana': {
    label: '표준이 아닌 시간대 → UTC로 변환',
    hint: 'Google Calendar 호환을 위해 UTC로 내보냈습니다.',
  },
  'recurrence-unsupported': {
    label: '지원하지 않는 반복 규칙은 제외',
    hint: '표준 반복(매일·매주·매월·매년)만 내보냅니다.',
  },
  'attachment-omitted': {
    label: '첨부는 제외(개수만 메모)',
    hint: '이미지·파일 자체는 빼되 "첨부 N개" 메모로 남깁니다. 파일은 TimeTree에서 직접 받으세요.',
  },
  'participant-omitted': {
    label: '참가자는 인원수만',
    hint: '개인정보 보호를 위해 참가자 정보는 빼고 "참가자 N명"만 메모로 남깁니다.',
  },
  'title-empty': {
    label: '제목 없는 일정에 임시 제목 사용',
    hint: '제목이 비어 있어 기본 제목으로 채웠습니다.',
  },
  'reminder-unsupported': {
    label: '일부 알림은 변환 불가로 제외',
    hint: '표준으로 표현할 수 없는 알림은 내보내지 않습니다.',
  },
  'url-invalid': {
    label: '잘못된 링크는 제외',
    hint: '형식이 올바르지 않은 URL은 빼고 내보냅니다.',
  },
  'recurrence-override-orphaned': {
    label: '수정된 반복 회차가 단독 일정으로 처리됨',
    hint: '원본 반복 일정이 내보내기 범위 밖이라 시리즈로 묶지 못했습니다.',
  },
};

export function describeWarning(code: string): WarningCopy {
  return WARNING_COPY[code] ?? { label: code, hint: '' };
}
