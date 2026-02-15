# Codebase Issue Tasks

## 1) Typo fix task
**Task:** Rename `docs/Brand Guidlines.md` to `docs/Brand Guidelines.md` and update any references.

**Why:** The filename contains a spelling mistake (`Guidlines`), which makes documentation harder to find and looks unpolished.

**Acceptance criteria:**
- File is renamed with corrected spelling.
- Any links/imports pointing to the old filename are updated.
- No broken documentation links remain.

---

## 2) Bug fix task
**Task:** Add authentication/authorization checks to `POST /api/projects/[id]/request-update`.

**Why:** The endpoint currently triggers outbound update-request emails without verifying the caller’s identity/permissions.

**Acceptance criteria:**
- Unauthenticated calls return `401`.
- Authenticated users without project access return `403`.
- Authorized project members/leads can still send update requests successfully.

---

## 3) Comment/documentation discrepancy task
**Task:** Update or remove the stale inline comment `// Send to each recipient (mocked)` in `src/pages/api/projects/[id]/request-update.ts`.

**Why:** The implementation calls `sendEmail(...)` directly, so the comment describing behavior as "mocked" is inaccurate and misleading.

**Acceptance criteria:**
- Inline comment reflects actual behavior (real email send) or is removed.
- Nearby comments remain accurate and concise.

---

## 4) Test improvement task
**Task:** Add API tests for `POST /api/projects/[id]/request-update` recipient handling and access control.

**Why:** The route contains non-trivial recipient filtering/deduplication logic and (after bug fix) authorization logic that should be regression-tested.

**Acceptance criteria:**
- Tests cover recipient ID filtering, duplicate email deduplication, and empty-recipient error paths.
- Tests cover `401/403` authorization paths and a successful authorized request path.
- Tests assert that `sendEmail` is called with expected recipients only.
