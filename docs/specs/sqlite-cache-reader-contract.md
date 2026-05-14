# SQLite cache reader contract

결론: TimeTree cache reader는 TimeTree 내부 SQLite schema 변화가 core contract로 번지는 것을 막기 위해 **block 복원**, **SQLite row 읽기**, **row mapper**를 분리한다.

## Boundary

| Layer | 책임 | 변경 가능성 |
| --- | --- | --- |
| `sqlite-cache-blocks` | IndexedDB `blocks`/`metadata`를 SQLite byte array로 복원 | TimeTree VFS 저장 방식 변경 시 수정 |
| `sqlite-cache-reader` | 복원된 SQLite bytes와 injected SQLite engine으로 `events` row를 read-only cursor scan | SQLite engine 또는 query strategy 변경 시 수정 |
| `indexeddb-sqlite-cache-reader` | Browser `indexedDB`에서 `metadata`/`blocks` store를 readonly로 읽어 cache reader에 전달 | IndexedDB store 이름이나 browser API 경계 변경 시 수정 |
| `sqljs-adapter` | `sql.js` `Database(Uint8Array)`를 reader port에 연결 | SQLite engine package 변경 시 수정 |
| `sqlite-event-row-mapper` | SQLite `events` row를 `RawTimeTreeEvent`로 mapping | TimeTree column/schema 변경 시 수정 |
| `core/contracts` | exporter 내부 raw contract validation | 되도록 안정적으로 유지 |
| `core/normalize` | raw event를 export 가능한 normalized event로 변환 | export policy 변경 시 수정 |

## Block restoration contract

Input:

- `fileSize`: `metadata.fileSize`
- `blocks`: IndexedDB `blocks` store에서 읽은 row 목록
- `path`: 선택적 target path. 현재 smoke 기준 `/timetree`

Rules:

1. `offset >= 0`이면 absolute file offset으로 해석한다.
2. `offset < 0`이면 `fileSize + offset`으로 해석한다.
3. target path가 지정되면 다른 path의 block은 무시한다.
4. block이 file boundary 밖으로 나가면 fail closed한다.
5. source block byte를 mutate하지 않는다.
6. raw SQLite file을 repo나 log에 저장하지 않는다.

Output:

- 성공: `Uint8Array` byte snapshot
- 실패: issue list

## Reader contract

`events` table은 active VFS snapshot에서 `COUNT(*)` 같은 aggregate query가 실패할 수 있다. 실제 smoke에서는 cursor scan이 성공했으므로 reader는 `SELECT ... FROM events` cursor scan 중심으로 설계한다. Reader는 explicit column list를 사용하고 `COUNT(*)`를 성공 조건으로 삼지 않는다.

Resource rules:

1. Prepared statement는 성공/실패와 무관하게 `free()` 한다.
2. Database는 성공/실패와 무관하게 `close()` 한다.
3. IndexedDB는 `readonly` transaction으로만 연다.
4. Row validation failure는 fail-closed로 처리하고 partially mapped events를 반환하지 않는다.

## Mapper contract

SQLite row mapper는 `mapApiEventToRawTimeTreeEvent`와 별도 함수로 둔다.

```text
SQLite events row
  -> mapSqliteEventRowToRawTimeTreeEvent
  -> RawTimeTreeEvent
  -> normalizeRawTimeTreeEvent
```

`recurrences`, `attendees`, `alerts`, `attachment`, `files`는 SQLite `jsonb`가 `Uint8Array`로 관찰됐다. decode 전에는 raw private dump하지 않고 warning 또는 fail-closed로 처리한다.

## Engine decision

현재 runtime adapter는 `sql.js`를 선택한다. `sql.js`는 browser에서 `initSqlJs({ locateFile })`로 WebAssembly module을 초기화하고 `new SQL.Database(Uint8Array)`로 SQLite file bytes를 열 수 있다. Reader core는 `sql.js`를 직접 전제하지 않고 `openDatabase(bytes)` port를 사용한다.


## JSONB decode contract

SQLite JSONB column은 SQLite JSON function을 통해서만 다룬다. Reader SQL은 `recurrences`, `attendees`, `alerts`, `attachment`, `files`에 `json(column) AS column`을 사용한다.

- `recurrences`: string array이면 `RawTimeTreeEvent.recurrences`에 보존한다.
- `attendees`, `alerts`, `attachment`, `files`: decode 가능해도 raw value를 넘기지 않고 warning 판단에만 사용한다.
- malformed JSONB는 fail-closed 또는 `recurrence-not-normalized` warning으로 처리한다.
