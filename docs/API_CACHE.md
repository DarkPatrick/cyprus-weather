# Public API response cache

The API uses one bounded in-process cache shared by all request threads. Successful serialized JSON bodies live for 120 seconds. Cache hits do not open SQLite or calculate thermal indices. Requests missing the same key share one producer through a future; failures are propagated and not retained.

## Keys and bounds

- Stations, official forecast, marine, AI forecast and health: shared per endpoint.
- Snapshot: station and normalized user altitude.
- Model, hourly observations, UV and air: endpoint, station, range and applicable aggregation. Live rolling windows close to the current 24-hour historical / 24-hour forecast window (26 hours back for UV) are aligned to minutes, allowing clients whose clocks differ by seconds to reuse data. This can shift a live-window boundary by at most 59 seconds. Exact historical ranges and raw observations preserve the requested bounds.
- Lightning and map history: endpoint and exact bounds. The application already aligns map requests to ten minutes.
- Retained bodies: at most 1024 entries and 64 MiB, with expiration and LRU eviction. Oversized responses are shared in flight but not retained. This bounds cached bodies, not total process or transient request memory.
- Cache-Control remains no-store for clients; X-Weather-Cache reports MISS, HIT or COALESCED for server diagnostics.

Threading HTTP server backlog is 256 (previously 5). This is a queue of connections waiting to be accepted, not a promise of 256 simultaneous users.

## Deployment and verification — 2026-10-08

Updated only server.py and response_cache.py on the weather API deployment, with backup at /var/backups/cyprus-weather/cache-20261008T124114Z. Restarted cyprus-weather-api. Socket inspection confirmed LISTEN backlog 256. Public HTTPS snapshot returned 200, X-Weather-Cache: HIT and six observations.

All 69 backend tests passed. A bounded real-server check issued 20 simultaneous identical cold snapshot requests: one MISS, 19 COALESCED, identical response bodies, 0.15 CPU seconds for the batch. Warm single request took 2.5 ms over loopback; cold snapshots before caching took approximately 120–130 ms. This is a correctness/smoke check, not a maximum-capacity load test.
