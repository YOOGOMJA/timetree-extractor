# SQLite Cache Reader Implementation Plan

> **For agentic workers:** REQUIRED: Use test-driven-development for implementation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TimeTree IndexedDB SQLite cache에서 event row를 읽기 위한 첫 단계로 block snapshot 복원 logic을 안정화한다.

**Architecture:** `src/browser/sqlite-cache-blocks.ts`는 IndexedDB block storage 복원만 담당한다. SQLite query와 event row mapping은 별도 파일에서 후속 구현한다.

**Tech Stack:** TypeScript, Node test runner, no new runtime dependency for this gate.

---

## Chunk 1: SQLite block restoration

**Files:**
- Create: `src/browser/sqlite-cache-blocks.ts`
- Modify: `src/browser/index.ts`
- Test: `test/browser/sqlite-cache-blocks.test.ts`
- Docs: `docs/specs/sqlite-cache-reader-contract.md`

- [x] **Step 1: Write the contract document**
- [x] **Step 2: Write failing tests for negative offset restoration, path filtering, and boundary failure**
- [x] **Step 3: Run tests and verify RED**
- [x] **Step 4: Implement minimal restoration logic**
- [x] **Step 5: Run tests and verify GREEN**
- [x] **Step 6: Run full verification**

## Chunk 2: SQLite row mapper

**Files:**
- Create: `src/browser/sqlite-event-row-mapper.ts`
- Modify: `src/browser/index.ts`
- Test: `test/browser/sqlite-event-row-mapper.test.ts`

- [x] **Step 1: Write failing mapper tests**
- [x] **Step 2: Run tests and verify RED**
- [x] **Step 3: Implement minimal mapper**
- [x] **Step 4: Run tests and verify GREEN**
- [x] **Step 5: Run full verification**
