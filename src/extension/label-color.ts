// 라벨 이름 기반 결정적 색 (#75). TimeTree 라벨의 color 인덱스(enum)를 hex로 해독하는
// 신뢰할 매핑이 없으므로, 이름을 해시해 안정적인 hue를 만든다 — 가짜 정밀도를 주지 않으면서
// 카테고리를 시각적으로 구분한다.

export function labelHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return ((hash % 360) + 360) % 360;
}

export function labelChipColors(name: string): { bg: string; fg: string } {
  const hue = labelHue(name);
  return {
    bg: `hsl(${hue} 70% 94%)`,
    fg: `hsl(${hue} 55% 32%)`,
  };
}
