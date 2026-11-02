# Task 4 — human review exercise answers

## 1. YAML configuration nesting

Blank and comment lines continue without changing the parent stack; only `---` resets the document stack. Mapping indentation pops peers/deeper parents before constructing the dotted key. The regression has application name, PostgreSQL URL, and Redis URL nested below `spring`, with both a blank and a comment inside the application mapping, and checks evidence lines. This remains a deliberately limited YAML subset; block scalars, anchors, sequences and unusual syntax are not a complete YAML parser.

## 2. HTTP and Feign endpoint identity

The URL parser returns lowercase hostname plus explicit or protocol-default port while retaining no URL credentials/path/query/fragment in graph data. Literal Feign URLs cite the annotation line at HIGH confidence; supported `clients.<alias>.url` values cite the matched configuration file and line at MEDIUM confidence. An unresolved explicit URL creates no target. Regression assertions independently pin the host/port, confidence, path and line for literal and config-resolved URLs. External node identity includes port, and exact service names/module names are matched rather than dotted prefixes. Dynamic URLs, alternate placeholder syntax, environment interpolation and full framework resolution remain outside scope.

## 3. RabbitMQ topology limits

Named-exchange `convertAndSend(exchange, routingKey, payload)` creates a destination node with an exchange/routing-key subtype and identity; listener queues have separate queue identities. Matching names do not join them, and this MVP does not infer bindings (even if a binding declaration appears in scanned source). The simple two-argument form is accepted only with a literal first argument and a nonempty payload expression, as a default-exchange destination; unsupported call shapes and dynamic names are skipped. Kafka handling remains on its existing topic model. Regression tests assert distinct nodes, no producer-to-consumer path, the default-exchange case, and the explicit-binding limitation.

## 4. Bounded file-descriptor reads

The walker verifies canonical containment and `O_NOFOLLOW` descriptor identity before reading. Every read buffer is at most the remaining allowance plus one byte, and the loop rejects immediately when that extra byte is observed; no `readFile()` path remains. UTF-8 content is decoded only after accepted bytes are collected, and `ScannedFile.bytes` records actual bytes, not `stat.size`. Tests accept a multibyte file at the exact byte boundary and reject an opened file exceeding the configured remaining allowance. The file may change concurrently, but the read allocation/byte ceiling is enforced on actual descriptor reads.
