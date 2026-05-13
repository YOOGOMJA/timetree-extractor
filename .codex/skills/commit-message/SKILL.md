---
name: commit-message
description: Use when creating, reviewing, or rewriting git commit messages for this repository. Applies Conventional Commits / commitlint format plus evidence-based commit message best practices and Lore-style trailers when useful.
---

# Commit Message

Use this skill before creating, reviewing, or rewriting a git commit message in this repository.

## Required shape

```text
<type>[optional scope][!]: <subject>

<body, optional>

<footer or trailers, optional>
```

## Header rules

- Use Conventional Commits / commitlint style.
- Use lowercase `type`.
- Preferred types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci`, `perf`, `style`, `revert`.
- Use `scope` only when it adds useful context, for example `docs`, `skill`, `export`, `schema`, or `ics`.
- Write the subject in Korean unless a package or upstream convention requires English.
- Keep the subject concise, objective, and action-oriented.
- Do not end the subject with a period.
- Prefer one logical change per commit. If more than one type fits, consider splitting the commit.

## Body rules

Add a body when the header alone does not explain the decision.

The body should explain:

1. what problem or ambiguity existed before the change,
2. why this change is the appropriate direction,
3. important tradeoffs or rejected alternatives.

Avoid repeating the diff. The code shows how; the body should preserve why.

## Footer and trailers

- Use `BREAKING CHANGE:` or `!` for breaking changes.
- Use git-native trailers for decision context when useful:
  - `Constraint:`
  - `Rejected:`
  - `Confidence:`
  - `Scope-risk:`
  - `Directive:`
  - `Tested:`
  - `Not-tested:`
  - `Related:`

## Before committing

1. Inspect `git diff --cached`.
2. Identify the primary intent and choose exactly one commit type.
3. Confirm the subject answers "If applied, this commit will ...".
4. Use a body if future readers need context not visible in the diff.
5. Include verification in `Tested:` or `Not-tested:` for substantive changes.

## Examples

```text
docs: 커밋 메시지 기준을 고정한다

Commit history needs a predictable format for both humans and tooling,
so repository guidance now combines Conventional Commits with concise
why-focused bodies.

Constraint: User prefers traditional commitlint conventions
Confidence: high
Scope-risk: narrow
Tested: Reviewed AGENTS.md and commit-message skill content
```

```text
feat(ics): 종일 일정 변환을 추가한다

TimeTree all-day events must remain all-day after calendar migration.
The exporter now maps date-only events to ICS VALUE=DATE fields instead
of midnight timestamp ranges.

Tested: All-day event fixture export test
```
