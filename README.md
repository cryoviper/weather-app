# Nimbus · Weather App

A fast, clean weather app. Search any city or use your location to see current conditions, the next 24 hours and a 7-day forecast. The background changes with the weather and time of day.

**Live:** https://cryoviper.github.io/weather-app/

## Features

- City search with live suggestions and keyboard navigation (↑ ↓ Enter Esc)
- "My location" using the browser Geolocation API
- Current temperature, feels like, humidity, wind and UV index
- 24-hour strip with rain chance, and a 7-day forecast with range bars on a shared scale
- °C / °F toggle, remembered between visits
- Recent searches saved in `localStorage`
- Background colour reacts to the weather (clear, clouds, rain, snow, storm, fog) and day/night
- Loading skeletons and friendly error messages
- Responsive from 360px phones to desktop; accessible labels and focus states

## Tech

- Vanilla JavaScript (ES modules), HTML, CSS. No framework, no build step.
- [Open-Meteo](https://open-meteo.com) forecast and geocoding APIs (free, **no API key**)
- `Intl.DateTimeFormat` to show times in the city's own timezone

## Run locally

```bash
git clone https://github.com/cryoviper/weather-app.git
cd weather-app
npx serve .      # or: python -m http.server 8000
```

Then open the URL it prints. (Opening `index.html` directly also works in most browsers.)

## What I learned

- Working with real REST APIs, query params and error handling
- Debouncing search input and building an accessible autocomplete (ARIA combobox pattern)
- Mapping WMO weather codes to labels and drawing my own SVG icons
- Handling timezones correctly with `Intl`

---

Built by [Praveen Sinwar](https://github.com/cryoviper).
