# Task 4 — final human review exercise

Read the cited final-code ranges and assess the behavior. The answer key is deliberately separate: `human-review-answers.md`.

## 1. YAML configuration nesting

**Section:** `server/scanner/index.ts:56–70` (YAML flattening and indentation stack).

**Intended behavior:** retain parent mappings across blank/comment lines and clear them only at an actual document separator, so ordinary nested Spring keys remain associated with the right service.

**Possible-defect question:** Could comment stripping or indentation transitions still attach a value to the wrong parent, and what focused fixture would demonstrate that?

## 2. HTTP and Feign endpoint identity

**Section:** `server/scanner/index.ts:86–100,217–235` (sanitized HTTP endpoint parsing, annotation line attribution, Feign config resolution and evidence).

**Intended behavior:** preserve sanitized host/port identity; cite a literal Feign annotation at HIGH confidence and a resolved `clients.<alias>.url` config value at MEDIUM confidence with its config file and line; unresolved placeholders create no invented destination.

**Possible-defect question:** Do exact regressions assert confidence, evidence path/line, and host/port independently, without serializing URL credentials, path, query or fragment?

## 3. RabbitMQ topology limits

**Section:** `server/scanner/index.ts:103–136,247–280` (conservative call argument parsing, destination identities and listener queues).

**Intended behavior:** `convertAndSend(exchange, routingKey, payload)` produces an exchange/routing-key destination, distinct from queue names. The two-argument literal overload represents a default-exchange routing destination; dynamic/unsupported expressions are omitted. The scanner does not infer exchange-to-queue bindings, including from equal strings or visible binding declarations.

**Possible-defect question:** Does a matching routing-key/queue string fabricate producer-to-consumer reachability? What explicit binding semantics remain outside the scanner's supported subset?

## 4. Bounded file-descriptor reads

**Section:** `server/security/walk.ts:39–65` (safe-file gate, canonical containment, opened-file verification, bounded descriptor reads).

**Intended behavior:** read no more than the remaining aggregate byte allowance plus one overflow-detection byte from the already verified descriptor; count actual bytes, including UTF-8 multibyte content; preserve symlink/canonical and inode/device checks.

**Possible-defect question:** If a file grows after its pre-open metadata is observed, can any code path still read or allocate the full growing file before rejecting it?
