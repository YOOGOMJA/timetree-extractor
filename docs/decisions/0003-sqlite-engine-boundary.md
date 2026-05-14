# 0003. SQLite engine boundary

결론: TimeTree cache reader는 `sql.js` 호환 interface를 기준으로 설계하되, core reader는 특정 package import에 직접 묶지 않는다.

## 배경

로그인된 TimeTree Web page smoke에서 `timetree-sqlite` IndexedDB cache가 확인됐다. `events` table에는 P0 field가 존재했고 cursor scan은 성공했다. 따라서 full cached event list 확보는 passive network observer보다 SQLite cache reader가 더 직접적이다.

## 결정

- Reader core는 `openDatabase(bytes)`를 주입받는다.
- Database interface는 `sql.js`의 주요 API 형태에 맞춘다.
  - `new SQL.Database(Uint8Array)`에 해당하는 factory
  - `db.prepare(sql)`
  - `stmt.step()`
  - `stmt.getAsObject()`
  - `stmt.free()`
  - `db.close()`
- Browser bundle/extension 단계에서 실제 engine adapter를 연결한다.
- 지금 단계에서는 package import를 reader core에 직접 넣지 않는다.

## 근거

`sql.js` 공식 문서 기준으로 browser에서는 `initSqlJs({ locateFile })`로 WebAssembly module을 초기화하고, `new SQL.Database(data)`에 `Uint8Array` SQLite file을 전달할 수 있다. Prepared statement는 `db.prepare`, `stmt.step`, `stmt.getAsObject`로 순회하고, `stmt.free`와 `db.close`로 resource를 해제한다.

## 기각한 대안

- TimeTree bundle 내부 SQLite helper 재사용: asset origin과 IndexedDB origin 문제가 있어 smoke에서 실패했다.
- Reader core에서 `sql.js`를 직접 import: bundler/extension packaging 결정 전에는 coupling이 크다.
- Aggregate query 중심 구현: active VFS snapshot에서 `COUNT(*)`가 malformed error를 낼 수 있어 cursor scan이 더 안전하다.

## 결과

다음 구현은 `readTimeTreeSqliteEvents`를 port-based reader로 만들고, package 선택과 browser packaging은 다음 gate로 미룬다.

Constraint: TimeTree cache schema와 VFS block format은 공식 API가 아님
Rejected: TimeTree bundle 재사용 | cross-origin IndexedDB 접근 제약
Rejected: Reader core의 직접 sql.js import | extension bundling 결정 전 coupling 증가
Confidence: medium
Scope-risk: moderate
Directive: SQLite bytes와 raw row를 파일/log로 저장하지 말 것
