# Third-party data and software

Kairo shows public weather data from the providers below. The app's own code licence
(see `LICENSE`) does not cover this data; each provider's terms apply to its content.

## Data

| Provider | What the app uses | Terms and required attribution |
|---|---|---|
| Open-Meteo (api.open-meteo.com, air-quality-api.open-meteo.com) | Hourly weather model, CAMS UV and air-quality model values | Data under CC BY 4.0: credit "Weather data by Open-Meteo.com" with a link. The free API is for non-commercial use only (no ads, no subscriptions); a commercial plan is required otherwise. Requests are made by the backend, not by each app install. |
| Copernicus Atmosphere Monitoring Service (via Open-Meteo) | UV index, PM2.5, PM10, NO₂, O₃, SO₂, CO model values | Copernicus licence: "Contains modified Copernicus Atmosphere Monitoring Service information [year]"; neither the European Commission nor ECMWF is responsible for any use of the information. |
| Cyprus Department of Meteorology (dom.org.cy, agromet.dom.org.cy) | Station observations, sea forecasts and warnings, bulletins, regional forecast maps, monthly and seasonal reports | No published reuse licence found. Content is credited to CyDoM; written permission is advisable before a store release, especially for reproduced images and translated bulletins. |
| Department of Labour Inspection, Cyprus (airquality.dli.mlsi.gov.cy) | Measured air-quality concentrations | No published reuse licence found; credited as DLI. |
| EUMETSAT (Meteosat-12 / MTG Lightning Imager) | Lightning flashes over Cyprus | EUMETSAT data policy; credit "© EUMETSAT [year]". |
| MeteoAlarm (feeds.meteoalarm.org) | Official warnings for Cyprus | MeteoAlarm terms and conditions for redistributors apply. |
| OpenStreetMap (tile.openstreetmap.org) | Base map tiles | Map data © OpenStreetMap contributors (ODbL). Tile use must follow the OSMF Tile Usage Policy: visible attribution, an identifying User-Agent, no bulk or offline download. |

## Software

Bundled npm and Python dependencies keep their own licences, including Apache ECharts
(Apache-2.0), Leaflet (BSD-2-Clause) and Capacitor (MIT). The weather backend modules
originate from DarkPatrick/aranet4 (see `docs/UPSTREAM.md`).
