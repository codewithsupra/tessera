# M0 spike — Yjs over InsForge realtime (2026-09-30)

**Verdict: GO.** InsForge realtime relays Yjs updates reliably with two provider features.

| Test | Result |
|---|---|
| Keystroke relay latency | ~300 ms (us-east) |
| Concurrent edits converge | ✅ |
| Payloads 1 KB → 256 KB, single message | ✅ |
| Payload ≥ 1 MB, single message | ❌ **silently dropped** (limit is between 256 KB and 1 MB) |
| 1 MB / 4 MB with 64 KB chunking | ✅ (0.9 s / 2.4 s) |
| Burst of 200 keystroke updates | ✅ 1.4 s |
| Offline edits → reconnect → merge | ✅ |
| Presence snapshot | ✅ |

## Required provider features (learned the hard way)
1. **Chunking.** Base64 payloads > 64 KB are split into `y-chunk {id,i,n,d}` messages and reassembled.
2. **Gap recovery.** A dropped update leaves the receiver with `doc.store.pendingStructs`, and every later update from that sender is buffered, not applied. After each apply, if anything is pending, publish `y-sv` (our state vector). Peers answer with `encodeStateAsUpdate(doc, sv)`.

Notes: every publish is persisted to `realtime.messages` (jsonb). Durable doc state still lives in our own `doc_updates`/`doc_snapshots` tables (M3), so realtime is transport only.
