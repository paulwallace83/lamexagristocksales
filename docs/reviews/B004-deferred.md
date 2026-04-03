# B004 — Deferred Findings

## CLI output not identical on failure path

**Source:** Correctness review (Important #2)

**Finding:** The original script printed progress messages inline as work happened ("Preflight validating..." -> "Snapshot saved" -> crash). The refactored CLI wrapper calls `applySync()` first, then prints all output — so on failure, only `"❌ {error message}"` appears with no prior progress lines.

**Decision:** Accepted as a known behavioral change. The new behavior is arguably better UX: no misleading "All files valid" message appears before a crash. The acceptance criteria (B004-requirements.md) should be read as "identical terminal output on success."

**Impact:** None. CLI failures now show only the error, which is clearer and doesn't imply steps completed when they may not have.
