# Локальная проверка — 2026-10-08

## Подтверждено

- Web production build: успешен (Vite).
- Android debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`, около 5 МБ. Gradle `assembleDebug`: BUILD SUCCESSFUL. Подпись проверена `apksigner verify`.
- Python: 65 тестов прошли. Перенесённые тесты парсеров/UTCI/агрегации плюс новые проверки публичного API, часового окна, источника/знака поправки давления и измерений/модели CO.
- JavaScript: 16 тестов прошли. Дата Кипра независимо от timezone процесса, центрирование экстремума, отсутствие лишнего текста стресса, старые/отсутствующие значения, разрывы часовых рядов, скользящие 24 часа через полночь и смену часового смещения.
- npm audit: 0 vulnerabilities после override совместимой uuid для xcode. Override только в инструментарии Capacitor.
- Живые источники: 55 CyDoM станций, почасовая погода/высоты Open-Meteo, UV CAMS, CAMS/DLI для всех шести веществ, морские выпуски A–D, погодные A/B/C и кэш переводов. Региональная температура моря поступает из бюллетеня.
- Визуально в браузере проверены мобильная раскладка, вкладки, карта, раскрытие официального выпуска, солнечный график с экстремумом/точкой сейчас и график CO с измерениями и прогнозом. При проверке графиков console errors отсутствовали.
- Публичная история импортирована из исходной weather.db; source rows не изменялись. aranet.db не копировалась. Git status исходного aranet4 пустой.
- cyprus-weather по-прежнему без commit: все новые исходники untracked. Ничего не пушилось и не публиковалось.

## Среда

Для Android подготовлены проектные SDK 36 и Temurin Java 21.0.12.1; они gitignored. По дополнительной просьбе пользователя системный Homebrew OpenJDK обновлён с 22 до 27. JAVA_HOME нового терминала переключён с фиксированной Java 20 на Homebrew OpenJDK; оригинальная настройка сохранена в резервной копии рядом с .zshrc. Проверены `java -version` и `$JAVA_HOME/bin/java -version` в новом интерактивном zsh: обе версии 27. Python virtualenv обоих проектов продолжает запускаться (3.13.2).

## Ограничения проверки

- Нет подключённого телефона/эмулятора (`adb devices` пусто): native runtime, геолокационные permissions и аппаратная кнопка Back требуют проверки на Android устройстве. Компиляция/подпись APK подтверждены; запуск APK на телефоне не заявляется.
- Актуальный APK подключается напрямую к HTTPS API на сервере do. Локальный backend остановлен; web интерфейс продолжает загружать погоду. Сертификат проверен, все погодные маршруты отвечают 200, домашний интерфейс — 401, отсутствующие indoor маршруты нового API — 404. Обе systemd службы enabled/active.
- История CyDoM поступает из базы существующего сервера; суточное окно проверено. Карточки используют последние шесть измерений; при отсутствии шести актуальных записей значение недоступно, счётчиков вида 1/6 нет. Графики охватывают полные последние 24 часа и сохраняют пробелы при отсутствии истории. Для основного приложения планируется использовать историю существующего сервера; локальный сбор нужен только при самостоятельном dev запуске.
- Источники обновляются независимо. Ошибки источников записываются в `/api/health`; пропуски и отсутствие модели не заполняются демонстрационными числами.
- Прогноз ИИ: реализованы формат чтения, свёрнутая таблица/текст и управляемый генератор. Реальный CLI вызов не делался; команда задаётся пользователем вручную. Данные молний в этой версии отсутствуют и помечены в prompt.
- Сезонный и месячный отчёты зависят от доступности PDF у источника. Показан последний полученный документ с его периодом; не создаётся выдуманный документ при недоступности.
- iOS target не создавался и iOS runtime не проверен. Путь добавления описан в README; нужны Xcode, signing и строка purpose для геолокации.
- Перед распространением требуется определить лицензию перенесённого Python ядра и условия использования внешних API.

Блокирующих ошибок сборки и тестов на момент проверки нет. Vite сообщает о размере пакета графиков (~600 КБ без сжатия); в APK этот файл упакован локально.

Дополнительно проверено в браузере: ночная карточка UTCI без подписи «В тени» и без карточки «На солнце»; график температуры с подписью «Последние 24 часа + прогноз на 24 часа». Локальный API перезапущен с выбором последних шести записей.

Добавлены серверная синхронизация с повтором read-only чтения при временном конфликте SQLite и отдельный CAMS CO прогноз. Проверка API: все шесть веществ доступны, CO CAMS содержит 48 значений в запрошенном окне. Тест зеркала подтверждает обновление публичных значений, сохранение дополнительных модельных полей и исключение indoor таблицы.

Проверка мобильной ширины 390 px: NET не обрезается, общая подпись UTCI / NET скрыта; направление ветра показано с румбом и градусами, модельный источник явно отмечен при отсутствии измерений. Давление продублировано в мм рт. ст. На солнечном графике восстановлены горизонт и сумерки −6°/−12°/−18° с подписями слева; поясняющий абзац убран. ИИ-прогноз: три закрытых блока на 4/12/24 часа, отдельно проверено раскрытие таблицы на 12 часов. APK пересобран с HTTPS API.

Дополнительно: мобильный tap highlight карточек отключён, рамка фокуса за открытым диалогом скрыта. Карта использует исходную цветовую шкалу aranet4, точки 10 px; подписи 34×24 px появляются с zoom 10 только при отсутствии пересечений. Проверены play/pause, продвижение по прошлым 24 часам, остановка при закрытии карты и переключатель ветровых стрелок. Тесты покрывают шкалу, столкновения подписей и направление стрелок. Морская ось X подписана датами, минимальный шаг подписей — сутки; браузерная проверка подтверждает 02.10–08.10 вместо 00:00. APK обновлён с HTTPS API.

Карточки воздуха: источник удалён с каждой карточки, единый блок DLI/CAMS находится под сеткой. На карточках отображаются низкий/умеренный/высокий/очень высокий уровни по часовой шкале DLI. Для PM2.5/PM10/NO2/O3 пороги совпадают с aranet4; SO2 и CO проверены на официальном https://www.airquality.dli.mlsi.gov.cy/ . Проверены границы всех шести шкал, отсутствие данных и мобильная раскладка без обрезания единиц CO.

Погодные слои карты восстановлены: осадки — сумма за последние 30 минут, с кольцами по интенсивности; молнии — read-only история Meteosat из существующей базы на do. Новый HTTPS endpoint `/api/weather/lightning` подтверждён; подключение не создаёт файлов и не меняет исходную базу. Текущий след молний — 4 часа, на таймлайне — час перед выбранным моментом; есть кнопка показа всех точек. Таймлайн 24 часа с шагом 10 минут. В браузере проверен реальный период 07.10 с дождём у AGROS/KILANI и четырьмя молниями. Тесты исключают будущие вспышки и дождь вне получасового окна.

Карточки воздуха используют цветовые классы низкого/умеренного/высокого/очень высокого уровня; подписи скрыты, уровень сохранён в accessible label. Источники остаются общим блоком под сеткой. ИИ-заголовки показывают интервал от времени выпуска до конца горизонта; все горизонты начинаются в момент выпуска, как в оригинале. Общая ситуация, сравнение с ECMWF и риски — отдельные закрытые блоки; таблица каждого периода вложена в собственный закрытый блок. Полоски вероятностей 46×6 px соответствуют исходному интерфейсу; пропуски не заменяются 0%, значения ограничены 0–100%. APK пересобран с действующим HTTPS API.


### Air overview: responsive phone layout

The air tab uses shorter cards and tighter spacing on phones. At viewport heights up to 740px, six cards use three columns; taller phones retain two columns. At heights up to 600px, the redundant footer caption is hidden while source information and settings remain available. An expanded map or settings continue to scroll naturally.

Verified in the browser with a collapsed map at 390×844, 375×667 and 320×568: all six populated cards, their source and collapsed settings fit above the bottom navigation; document scroll height equals viewport height. Android debug build succeeded. Device installation was not tested. Preview: `output/air-responsive-preview.jpg`.


Air compact styles now explicitly require a collapsed map via `:has(#mapwrap:not([open]))`. At 375×667, opening the map restores 154px cards and normal scrolling (1498px document); collapsing returns 98px cards and a 667px document. Android debug APK rebuilt successfully.


### Persistent light / dark theme

The top-right sun is a labelled toggle button. Dark mode shows a crescent; another click restores light mode. Selection is stored in localStorage and restored in the document head before the app paints. Cards, air-quality colors, navigation, controls, disclosures, dialogs and chart labels/palettes have dark variants. The browser theme-color follows the choice.

Browser verification: light → dark → reload retained dark mode; reverse switching restored light mode; sun graph and 390×844 air overview remained readable. Android debug build succeeded; native device installation was not tested. Preview: `output/dark-theme-preview.jpg`.


### Combined temperature and feels-like card

Weather now places the large temperature on the left and smaller feels-like indices on the right within one featured card. Each measurement keeps its own graph button; the radiation source caption is removed from this card. Day/night rules are unchanged. Browser checked at 390px and 320px widths; temperature and solar feels-like buttons opened the correct graphs. Android debug build succeeded. Preview: `output/temperature-overview-preview.jpg`.


### Startup geolocation

Replaced the dot glyph with an SVG location pin. Startup immediately requests a position in parallel with weather loading. Native permissions are checked/requested through Capacitor; both precise and approximate permission are accepted. Granted coordinates select the nearest station with observations no older than an hour. Denial/unavailable location leaves the saved/default station and manual selection working. Button retries share any pending request; map position marker is reused and appears when opening the map later. No background tracking is enabled.

Browser verified new icon and weather loading through the startup flow. Android APK compilation succeeded. Native permission dialog and granted GPS selection require a physical device; neither is claimed as runtime-tested here. Preview: `output/location-icon-preview.jpg`.


### Three feels-like columns

Shade, sun and NET now use three small columns beside the main temperature. NET source caption is an 8px footnote. UTCI stress text is replaced with cold-blue / neutral-green / warm-yellow-to-red backgrounds in both themes; textual category remains in the accessible name. NET retains a neutral background because its index is not UTCI and has no UTCI stress category. Existing night rules still hide sun and shade caption. Verified at 390px dark and 320px light widths and opened the solar feels-like graph. All 17 JavaScript tests passed, including missing values and heat/cold color boundaries. Android debug build succeeded. Preview: `output/feels-columns-preview.jpg`.


### NET footnote, wind strength and pressure level

NET now carries a superscript footnote marker; its explanation is beneath the combined temperature content. All three feels-like tiles have equal height (66px in the 390px browser check). Wind strength uses the original aranet4 Beaufort thresholds/names and ball count. Pressure shows an upper-right up/down arrow outside the original normal band (1009–1017 hPa, upper bound exclusive), assessed at sea level to avoid classifying mountain stations as low solely from elevation. Existing MSL/QNH source values are used directly; station pressure is reduced with the standard 15°C barometric approximation. Arrows describe level rather than time tendency.

19 JavaScript tests passed, including wind thresholds, missing values, sea-level pressure boundaries and altitude correction. Browser checked equal tile heights, wind text, high-pressure arrow and pressure chart opening. Android debug build succeeded. Preview: `output/weather-details-preview.jpg`.


### Lightning attribution, shared UTCI graph and today UV

Added Meteosat-12 / MTG Lightning Imager, EUMETSAT Data Store, ©EUMETSAT year and a description of the app processing to the sources disclosure. The map also shows a compact satellite credit. Official policy link: https://www.eumetsat.int/legal-framework/data-policy ; attribution format checked against https://www.eumetsat.int/about-us/terms-use (satellite data subject to Data Policy; no Creative Commons claim).

Both shade and sun tiles now open the same UTCI graph with two named curves. Past observation-derived and future model segments keep their provenance and shared legend controls. Radiation / UV shows the maximum among all available hours of the current Asia/Nicosia calendar day, level using original UV thresholds, peak time and future/past wording. UV request covers at least the full current day even on a 25-hour DST day; missing stays missing and zero is valid.

Sun/moon header glyphs replaced by centered inline SVGs; measured sun SVG center offsets are zero on both axes. Browser checked both UTCI entry points, both curves, current-day UV card, attribution disclosure and centered icon at 390×844. 21 JS tests passed (UV date, DST, missing/zero, levels included); Android debug build succeeded. Preview files: `output/uv-today-preview.jpg`, `output/shared-feels-preview.jpg`. Native device runtime remains untested.


AI forecast header now has a small last-update timestamp from the document `issued` field, formatted in Asia/Nicosia. Browser verified the label immediately below the heading; missing issue time explicitly stays unavailable. Android debug build succeeded. Preview: `output/ai-updated-preview.jpg`.

### UV blocks and disclosure taps (2026-10-08)

- UV now has current value on the left and today's maximum on the right, both with level captions and no maximum timestamp.
- Browser checked at 390 × 844: both blocks fit side by side. Screenshot: `output/uv-blocks-preview.jpg`.
- With sources expanded, user altitude is visible on Weather and hidden on Sun, Air, and Forecast.
- All disclosure summaries disable native tap highlight and text selection; keyboard focus remains available.
- Android debug build passed; refreshed `output/cyprus-weather-debug.apk`. No commits or pushes.

### Compact Sun overview (2026-10-08)

- Responsive Sun layout applies on phone screens only while both map and footer sources are collapsed. No clipping or forced overflow suppression.
- Browser viewport checks: 320 × 568, 375 × 667, 390 × 844. Document height matches viewport height and footer remains above navigation in all three sizes.
- Expanding sources or map restores regular card sizing and natural scrolling (verified separately).
- Screenshot: `output/sun-compact-preview.jpg` (375 × 667).
- Android debug build passed; refreshed `output/cyprus-weather-debug.apk`. No commits or pushes.

### Stable Sun sizing when sources expand (2026-10-08)

- Removed footer disclosure state from Sun compact-layout selectors. Expanding sources now adds content and scrolling without changing card or header sizes, matching Air behavior.
- Browser checked at 375 × 667 and 320 × 568: card heights and value/header font sizes match before and after the disclosure toggle.
- Screenshot: `output/sun-sources-preview.jpg`. This supersedes the previous entry's behavior for expanded sources; the map still controls compact sizing.
- Android debug build passed; refreshed `output/cyprus-weather-debug.apk`. No commits or pushes.

### Forecast cards and zoomable tomorrow map (2026-10-08)

- Official A/B/C bulletins and AI time intervals each use three columns, with no repeated “Выпуск” / “ИИ” prefix on cards.
- Cards open forecast text in a modal dialog. AI region tables stay collapsed within the dialog, including probability bars. Close button, Escape/backdrop, and native Android Back use the dialog close path.
- Official district table is separated from AI risks by spacing and a divider.
- Tomorrow map opens a Leaflet image viewer with zoom controls, wheel/pinch zoom and dragging. Browser zoom check doubled rendered image size from 300 × 207 to 600 × 414.
- Browser checked official B and AI 12-hour dialogs, nested table expansion, map viewer, three-column layout at widths 390 and 320 (no horizontal page overflow).
- JavaScript suite: 21 passed. Android debug build passed; refreshed `output/cyprus-weather-debug.apk`. No commits or pushes.
- Previews: `output/forecast-cards-preview.jpg`, `output/forecast-map-zoom-preview.jpg`.

### Readable bulletin names (2026-10-08)

- Official cards and modal titles use Утро / День / Вечер instead of A / B / C, retaining actual issue dates and times.
- Browser verified three cards at 390 × 844. Evening remains the latest available C bulletin (07.10 16:00); this is expected before the next scheduled 16:00 issue.
- Android debug build passed; refreshed `output/cyprus-weather-debug.apk`. Screenshot: `output/forecast-labels-preview.jpg`. No commits or pushes.

### Bulletin freshness order and age (2026-10-08)

- Official bulletin cards sort by issue timestamp, newest first. Missing issues stay at the end.
- Previous Cyprus calendar day is labeled Вчера; older issues show days ago. Dates and actual issue times remain visible.
- Added tests for freshness ordering, missing issues, midnight and Cyprus DST calendar boundaries. JavaScript suite: 23 passed.
- Browser verified current order День → Утро → Вечер, with yesterday label on evening issue. Android debug build passed; refreshed `output/cyprus-weather-debug.apk`.
- Screenshot: `output/forecast-freshness-preview.jpg`. No commits or pushes.

### Separate AI district and commentary columns (2026-10-08)

- All AI horizon tables now have separate Район and Комментарий columns, followed by the existing weather columns.
- Browser checked the expanded 12-hour table at 390 × 844; names and explanatory text occupy separate cells. Existing horizontal table scrolling preserved.
- Android debug build passed; refreshed `output/cyprus-weather-debug.apk`. Screenshot: `output/ai-table-columns-preview.jpg`. No commits or pushes.

### Relative AI periods and expired cards (2026-10-08)

- AI card intervals use вчера / сегодня / завтра in Asia/Nicosia, retaining HH:MM at both ends.
- Cards whose end is earlier than now are excluded during rendering and removed automatically while the forecast screen stays open; foreground visibility changes also update them. At the exact endpoint they remain until that time passes.
- Added tests for expiration boundaries, relative calendar days, and Cyprus DST. JavaScript suite: 25 passed.
- Browser verified labels with retained times at 390 × 844. Android debug build passed; refreshed `output/cyprus-weather-debug.apk`.
- Screenshot: `output/ai-relative-preview.jpg`. No commits or pushes.

### Oldest-first bulletins, shared header, ten-minute data cache (2026-10-08)

- Per latest request, official bulletin cards sort oldest to newest from left to right. Missing issues remain last. Supersedes the previous newest-first order.
- All weather API requests use a shared ten-minute memory cache with deduplication of in-flight requests; rolling query windows reuse the same cache entry per station and aggregation. Errors are also throttled. Station/altitude changes have separate keys. Tab switching renders existing state without API requests.
- Scheduled main refresh waits ten minutes after completion; lightning refresh is ten minutes, and map reopen requests use the same cache.
- Sun daily rise/set calculations cache by Cyprus calendar date and coordinates; the date formatter is reused instead of recreated for each sample. Local measurement: initial 5.8 ms, repeated calls averaged 0.0012 ms (not a device benchmark).
- Responsive header, toolbar, collapsed-map summary, observation status, and first section heading now use common CSS across all tabs, regardless of open sources.
- Browser geometry verified across all four tabs at 375 × 667 and 320 × 568: identical header heights and first title positions/heights. Sun and Air remain within viewport height with collapsed map/sources at both sizes.
- JavaScript suite: 27 passed, including cache reuse, ten-minute expiry, throttled failures, and reversed bulletin order. Android debug build passed; refreshed `output/cyprus-weather-debug.apk`.
- Screenshot: `output/header-order-preview.jpg`. No commits or pushes.

### Compact AI intervals and aligned bulletin titles (2026-10-08)

- AI intervals show the relative day once when both endpoints share it (сегодня 11:40 — 15:40), and retain both day labels across midnight. Automatic label updates use the same formatter.
- Forecast cards align content from the top; multi-line age captions no longer shift neighboring titles. Browser measured identical title tops (280.5 px) across all three official cards at 390 × 844.
- JavaScript suite: 28 passed, including same-day and cross-day interval cases. Android debug build passed; refreshed `output/cyprus-weather-debug.apk`.
- Screenshot: `output/forecast-alignment-preview.jpg`. No commits or pushes.

### Weather card rows (2026-10-08)

- Temperature remains full width, followed by Wind / Pressure in two equal columns; next row contains Rain / Humidity / Sea with column ratios 1 : 1 : 1.4.
- Layout is scoped to Weather; existing card chart actions and displayed data are retained.
- Browser visually checked at width 390 and measured at width 320: row positions match, sea is wider, no card or page horizontal clipping.
- Android debug build passed; refreshed `output/cyprus-weather-debug.apk`. Screenshot: `output/weather-rows-preview.jpg`. No commits or pushes.

### Sea card without captions (2026-10-08)

- Sea card now displays only its heading and temperature.
- Browser verified card text is Море / 26°C. Android debug build passed; refreshed `output/cyprus-weather-debug.apk`.
- Screenshot: `output/sea-clean-preview.jpg`. No commits or pushes.

### Weather now heading and rain caption (2026-10-08)

- Page heading is Погода сейчас, with за последний час retained. Navigation tab remains Погода.
- Rain card no longer repeats the hourly caption.
- Browser verified rendered labels; Android debug build passed; refreshed `output/cyprus-weather-debug.apk`.
- Screenshot: `output/weather-now-preview.jpg`. No commits or pushes.

### Equal bottom weather cards (2026-10-08)

- Rain, Humidity and Sea now use three equal columns, superseding the wider Sea layout.
- Browser at 390 × 844 confirmed identical widths (108.66 px) and heights (140 px).
- Android debug build passed; refreshed `output/cyprus-weather-debug.apk`. Screenshot: `output/weather-equal-preview.jpg`. No commits or pushes.

### Compact Weather overview (2026-10-08)

- Bottom three cards reduced from 140 px to 70 px; shorter viewports also use denser temperature/feels and wind/pressure spacing. Common top-block geometry stays unchanged.
- Browser checked 390 × 844 and 375 × 667 with collapsed map/sources: document height equals viewport height, and footer remains above navigation. Expanding sources keeps card sizes and adds natural scrolling.
- At 320 × 568, the additional Weather information still requires natural scrolling; nothing is clipped or hidden to force a fit.
- Android debug build passed; refreshed `output/cyprus-weather-debug.apk`. Screenshot: `output/weather-compact-preview.jpg`. No commits or pushes.

### Inline pinch zoom for official images (2026-10-08)

- Tomorrow map and official district-table image now use the same inline image gesture handler. Removed the separate Leaflet image modal and zoom buttons.
- Two-finger pinch zooms (up to 5×) around the finger midpoint and allows two-finger translation. Releasing either finger resets scale/translation with a short transition. Single-finger vertical page scrolling is retained. Ctrl+wheel / trackpad pinch uses the same transient zoom.
- Browser confirmed both source images load inline and clicking them does not open a dialog. Screenshot: `output/inline-images-preview.jpg`.
- Gesture calculation test passed; JavaScript suite: 29 passed. Real multi-touch device gestures cannot be exercised by the current browser automation and remain unverified on hardware.
- Android debug build passed; refreshed `output/cyprus-weather-debug.apk`. No commits or pushes.

### Large scrollable source images and chart levels (2026-10-08)

- Replaced transient inline pinch with clicking either official image to open a full-screen viewer. The image exceeds the viewport in both dimensions; native scrolling works vertically/horizontally, with mouse dragging on desktop. Map starts centered; district table starts at its top-left. Close/Escape/Android Back use the existing modal close path.
- Browser at 390 × 844 measured map content 1326 × 915 in a 390 × 762 viewport, and table content 1170 × 2350 in a 390 × 780 viewport. Keyboard scrolling changed both scroll offsets. Hardware touch scrolling remains unverified.
- Charts now show shaded level bands, level names, a color key below, and level descriptions in tooltips for all six pollutants, Beaufort wind, UTCI, pressure, UV and solar phases. Source thresholds checked against aranet4 `static/weather.js` and `static/common.js`; pollutant thresholds use the existing mobile AIR_SCALE for all six cards.
- Pressure boundaries are reduced from sea level to target altitude using the standard atmosphere; the chart note states this. No UTCI classifications are applied to NET; raw temperature, humidity, hourly rain and sea temperature retain their original unclassified scales.
- Browser verified PM2.5, wind, pressure, shared shade/sun and UV charts. Tests cover threshold boundaries, missing data, pressure altitude and fitted band ranges; JavaScript suite: 31 passed. Final color-only adjustment followed by successful Android debug build.
- Refreshed `output/cyprus-weather-debug.apk`. Screenshots: `output/large-map-preview.jpg`, `output/air-chart-levels-preview.jpg`. No commits or pushes.

### Stronger chart-band contrast and copper sun (2026-10-08)

- Increased band opacity to 46% in dark theme and 25% in light theme, added visible boundaries and contrasting label backgrounds.
- Wind levels now progress through distinct blue, cyan, green, yellow, orange and red/purple colors instead of adjacent green tones.
- Light-theme sun icon uses copper #b87333; dark-theme moon color remains unchanged.
- Browser checked wind chart in both themes and at 390 × 844; computed light icon color is rgb(184, 115, 51).
- Android debug build passed; refreshed `output/cyprus-weather-debug.apk`. Screenshots: `output/wind-contrast-preview.jpg`, `output/copper-sun-preview.jpg`. No commits or pushes.

### Large-image shrink preview (2026-10-08)

- Both forecast map and district-table viewers accept a two-finger inward pinch, anchored at the finger midpoint. The image shrinks down to its viewport fit scale; releasing either finger restores the original large size with a 180 ms transition (disabled for reduced motion). Single-finger panning remains available.
- Trackpad Ctrl-wheel pinch also previews shrinking and resets after gesture inactivity.
- JavaScript suite: 33 tests passed, including scale bounds and gesture release preserving pan offsets. Android debug APK build succeeded and output APK was refreshed.
- Browser at 390 × 844: large map loaded at 1326 × 915 inside a 390 × 762 scrolling viewer; horizontal and vertical navigation remained available. Screenshot: `output/image-shrink-preview.jpg`.
- Physical two-finger gesture has not been tested on an Android device.

### Weather-card colors and tab taps (2026-10-08)

- Tab buttons disable native tap highlight and text selection; keyboard focus and persistent active-tab indication remain.
- Temperature overview no longer uses the featured green fill; it shares the ordinary card background in both themes.
- Dark-theme feels tiles use brighter green/yellow/orange/red/blue levels and dark text; NET uses a light neutral gray. Labels and units use explicit contrasting text colors.
- Browser checked at 390 × 844 in dark theme and temperature background checked in light theme (white). Screenshot: `output/feels-dark-colors-preview.jpg`.
- Android debug build succeeded; output APK updated.

### Kairo Android launcher (2026-10-08)

- Launcher and activity labels changed to Kairo; Capacitor appName also changed. Application id was later changed to io.github.darkpatrick.kairo for store publication (a fresh install is required).
- Verified Cyprus coastline artwork installed as the adaptive foreground vector, with ivory background and copper/teal mark. Legacy and round PNGs generated for all five densities. Authoritative artwork, extracted geographic polygon and provenance live under assets/branding; scripts/generate-launcher-icons.py reproducibly creates resources via rsvg-convert.
- All coastline vertices preserved. Artwork fits the adaptive 66dp safe circle in the 108dp foreground viewport: maximum radius 298.8 of 312.9 source pixels. Round-mask preview visually checked.
- Android debug build succeeded. aapt dump badging confirmed application-label Kairo and adaptive icon resources. Updated output/kairo-debug.apk and the existing output/cyprus-weather-debug.apk. Physical-device installation not performed.

### Kairo full-background icon and API cache (2026-10-08)

- Icon background changed to full-bleed petrol teal; verified coastline remains unchanged apart from a uniform upward translation and uses ivory fill. Copper sun and a turquoise wave complete the mark. Background is a separate solid adaptive layer; Android chooses the launcher mask. No baked oval or internal white background.
- Vector and all legacy/round densities regenerated. Safe-circle maximum radius including wave control points: 283.3px < 312.9px. Round preview visually verified. Android build succeeded and application label remains Kairo. Both output APK paths refreshed. Preview: output/icon-concepts/kairo-wave-round-preview.png.
- API cache and backlog deployed and checked; details and measured limits in API_CACHE.md. All 69 backend tests passed. No commit or push performed.

### Broader wave on launcher icon (2026-10-08)

- Increased wave width and body thickness for small-size readability. Verified coastline and palette retained.
- Regenerated all Android icon densities and checked round-mask preview. All artwork remains inside the adaptive safe circle: 288.2px < 312.9px.
- Android debug build succeeded; both output APK paths updated. Preview: output/icon-concepts/kairo-wide-wave-preview.png.

### Original third-concept wave restored (2026-10-08)

- Replaced the improvised wave with a boundary trace of the actual cyan wave in the third original concept (sun-cloud.png). Uniform scaling preserves its broad body and open curl; maximum contour simplification tolerance is 0.75 source pixels. Extraction script and provenance saved under scripts/trace-icon-wave.py and assets/branding/wave-source.json. Verified Cyprus contour unchanged.
- Round-mask preview visually inspected. Maximum artwork radius 306.9px fits the adaptive safe radius 312.9px.
- Android debug build succeeded; both output APK files refreshed. Preview: output/icon-concepts/kairo-original-wave-preview.png.

### Original wave widened (2026-10-08)

- Original third-concept wave expanded horizontally by 20% with the original vertical thickness and open curl retained. Positioned 45 source pixels higher to keep the broader shape within the adaptive safe circle. Verified coastline unchanged.
- Round-mask preview inspected; maximum radius 311.4px < safe radius 312.9px.
- Android debug build succeeded. Both APK output files refreshed. Preview: output/icon-concepts/kairo-wider-original-wave-preview.png.

### Wave height correction (2026-10-08)

- Restored the previous 650 source-pixel wave width. Increased height by 25%, with an upward placement adjustment to fit the adaptive safe circle. Coastline unchanged.
- Round preview inspected; maximum artwork radius 311.5px < 312.9px. Android debug build succeeded and both APK outputs refreshed. Preview: output/icon-concepts/kairo-taller-wave-preview.png.
