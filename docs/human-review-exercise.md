# Task 4 — final human review exercise

Read the cited final-code ranges and assess the behavior. The answer key is deliberately separate: `human-review-answers.md`.

## 1. YAML configuration nesting

**Section:** `server/scanner/index.ts:56–70` (YAML flattening and indentation stack).

**Intended behavior:** retain parent mappings across blank/comment lines and clear them only at an actual document separator, so ordinary nested Spring keys remain associated with the right service.

**Possible-defect question:** Could comment stripping or indentation transitions still attach a value to the wrong parent, and what focused fixture would demonstrate that?

## 2. HTTP and Feign endpoint identity

**Section:** `server/scanner/index.ts:85–90,153–164,178–204` (sanitized HTTP endpoint parsing, service/external identity, call and annotation handling).

**Intended behavior:** prefer explicit/resolvable Feign URLs; preserve port identity; map only exact known service hosts; avoid returning credentials, URL paths, fragments, queries, or unresolved placeholder aliases as confident external destinations.

**Possible-defect question:** Does the source distinguish a URL resolved from configuration from a literal code URL in confidence and evidence, while retaining the correct host/port identity?

## 3. Bounded file-descriptor reads

**Section:** `server/security/walk.ts:39–65` (safe-file gate, canonical containment, opened-file verification, bounded descriptor reads).

**Intended behavior:** read no more than the remaining aggregate byte allowance plus one overflow-detection byte from the already verified descriptor; count actual bytes, including UTF-8 multibyte content; preserve symlink/canonical and inode/device checks.

**Possible-defect question:** If a file grows after its pre-open metadata is observed, can any code path still read or allocate the full growing file before rejecting it?
