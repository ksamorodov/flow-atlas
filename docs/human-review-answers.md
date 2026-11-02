# Task 4 — human review exercise answers

## 1. YAML configuration nesting

Blank and comment lines continue without changing the parent stack; only `---` resets the document stack. Mapping indentation pops peers/deeper parents before constructing the dotted key. The regression has application name, PostgreSQL URL, and Redis URL nested below `spring`, with both a blank and a comment inside the application mapping, and checks evidence lines. This remains a deliberately limited YAML subset; block scalars, anchors, sequences and unusual syntax are not a complete YAML parser.

## 2. HTTP and Feign endpoint identity

The URL parser returns lowercase hostname plus explicit or protocol-default port and `URL` is used only to extract the sanitized identity. Literal Feign URLs take precedence over `name`; supported `clients.<alias>.url` configuration values resolve to sanitized endpoints, and unresolved explicit URLs do not create logical-name edges. **Review finding:** the current edge-construction expression assigns `HIGH` confidence in both branches, so a resolved configuration URL is incorrectly labeled `HIGH`; it should be distinguished from literal code URLs and labeled `MEDIUM`. The current regression verifies URL resolution and sanitization but does not assert this confidence distinction. External node identity includes port, and exact service names/module names are matched rather than dotted prefixes. Coverage includes credentials and private URL data that must not survive serialization, multiple ports for one host, and a prefixed unrelated DNS host. The parser is heuristic, so dynamic URLs, alternate placeholder syntax and full framework resolution are outside scope.

## 3. Bounded file-descriptor reads

The walker verifies canonical containment and `O_NOFOLLOW` descriptor identity before reading. Every read buffer is at most the remaining allowance plus one byte, and the loop rejects immediately when that extra byte is observed; no `readFile()` path remains. UTF-8 content is decoded only after accepted bytes are collected, and `ScannedFile.bytes` records actual bytes, not `stat.size`. Tests accept a multibyte file at the exact byte boundary and reject an opened file exceeding the configured remaining allowance. The file may change concurrently, but the read allocation/byte ceiling is enforced on actual descriptor reads.
