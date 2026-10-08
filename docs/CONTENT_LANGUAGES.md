# Weather content languages

## API contract

The API accepts `lang=ru`, `lang=en` or `lang=el` on `/api/weather/forecast`, `/api/weather/ai-forecast` and `/api/weather/marine`. Content cache keys include language; unsupported languages return HTTP 400. Omitting the parameter preserves Russian compatibility.

Official bulletin paragraphs keep the Greek original in `el` and add localized `text` plus `translated` (false for Greek). Observed place names use localized `place`, preserving `place_el`. Climate documents expose localized `title`, `summary.text` and `sections[key].text`; `title_el` retains the original title. AI narrative strings, districts, confidence and wind descriptions use the requested language while keeping the numeric structure. Marine alerts and warning narrative fields are localized; the official Greek description is retained when available.

Responses include `language` and `translation_status` (`ready`/`pending`), with individual bulletin and climate-document status too. A missing translation is `null`: display a localized pending notice, never another language's text as fallback. Official map and district-table image lettering remains as published; images are not OCR-translated.

## Codex background translation

`backend/content_languages.py` uses the existing authenticated Codex CLI as requested. Google Translate is no longer called. Translation happens only in the background, never during API requests. The deployed service uses the existing AI-weather runner identity and its CLI credentials in place, without copying or exposing them.

The production worker reads preserved original public weather content from the application's localhost API: Greek official bulletins and climate documents, Russian AI forecasts, and English/Greek marine warnings. It does not read private observations or change the source aranet4 database, model generator or collectors. The local database collection mode exists for tests/offline mirrors.

New/changed sentences are deduplicated across issues and sent in batches of up to 48 source/target pairs. Codex runs in an isolated temporary directory with a read-only sandbox, low reasoning effort, disabled shell/browser/app tools and web search, ephemeral session, no approval prompts and a strict structured output schema. The existing account model is retained. The translation prompt specifies Cyprus weather terminology and forbids commands/tools. Outputs must contain each requested id exactly once, non-empty translations and unchanged numeric weather values. Known district names, confidence labels and station names have reviewed deterministic translations.

The separate persistent cache defaults to `translations/content.sqlite3` beside the application mirror. Keys include SHA-256 source text, source language and target language. Rows record provider `codex`; legacy Google entries are not served as fallback. The API opens the cache read-only. The worker writes only this cache and its own Codex session/temp data. A failed batch becomes pending and retries after 15 minutes; other batches and weather data continue working. Successful translations are reused forever while the source sentence stays identical. The worker scans for new bulletins/AI documents every five minutes.

## Deployment and warmup

Deploy `backend/content_languages.py` and the updated `backend/server.py`. Install `deploy/cyprus-weather-translations.service`, reload systemd and enable/start it. Create the cache directory owned by the existing Codex runner user, readable by the API user. The unit uses `PrivateTmp=true` for writable isolated work files and explicitly permits the existing user's Codex state directory. Adjust machine-specific service identities and paths when deploying to another host; reusable Python code resolves cache paths from configuration.

Restart the API once initial Codex batches complete so it adopts the new cache path and clears old pending responses. Normally response-cache TTL is two minutes. Check each language on the three content endpoints, individual bulletin/document status, service logs and cache counts grouped by language/provider. Initial translation of all climate and AI prose takes several minutes. A provider outage leaves readable original-language content available and explicit pending status for missing translations; it does not block history sync or API requests.

## Verification

`PYTHONPATH=backend .venv/bin/python -m pytest backend/tests` covers original source preservation, cache language separation, Codex read-only structured invocation, numeric preservation, overlapping bulletin deduplication, no provider calls during HTTP requests, missing no-fallback behavior and localized marine warnings. No changes are committed or pushed by this workflow.
