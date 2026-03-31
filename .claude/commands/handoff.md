Generate a structured handoff document that captures the current session state so a fresh Claude session can resume without compaction loss.

Output a markdown document with the following sections:

## Task
What is the overall goal of the current task? State it in 1-2 sentences.

## Status
Current state: what has been completed, what is in progress, what is blocked.

## Decisions Made
List any non-obvious decisions made during this session that aren't captured in the code (e.g. "chose approach X over Y because Z", "deferred feature W intentionally").

## Files Modified
List every file that was created or modified in this session, with a one-line description of what changed.

## Remaining Work
Bulleted list of steps still needed to complete the task, in order.

## How to Resume
The exact next action a fresh session should take to pick up where this left off. Be specific — name the file, function, or command.

## Warnings / Gotchas
Any traps, edge cases, or constraints the next session needs to know about that aren't obvious from the code.

---
After outputting this document, suggest saving it as `handoff.md` in the project root and starting a fresh session with: "Read handoff.md and continue the task."
