// Nimbus: weather app using the free Open-Meteo APIs (no API key needed).

const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WX_URL = "https://api.open-meteo.com/v1/forecast";
const STORE = { unit: "nimbus.unit", recent: "nimbus.recent", last: "nimbus.last" };

const $ = (id) => document.getElementById(id);
const state = { unit: load(STORE.unit, "c"), place: null, data: null };

// ---------- storage helpers (safe in private mode) ----------
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

// ---------- weather codes ----------
// https://open-meteo.com/en/docs (WMO weather interpretation codes)
const CODES = {
  0: ["Clear sky", "sun"], 1: ["Mostly clear", "sun-cloud"], 2: ["Partly cloudy", "sun-cloud"], 3: ["Overcast", "cloud"],
  45: ["Fog", "fog"], 48: ["Icy fog", "fog"],
  51: ["Light drizzle", "drizzle"], 53: ["Drizzle", "drizzle"], 55: ["Heavy drizzle", "drizzle"],
  56: ["Freezing drizzle", "drizzle"], 57: ["Freezing drizzle", "drizzle"],
  61: ["Light rain", "rain"], 63: ["Rain", "rain"], 65: ["Heavy rain", "rain"],
  66: ["Freezing rain", "rain"], 67: ["Freezing rain", "rain"],
  71: ["Light snow", "snow"], 73: ["Snow", "snow"], 75: ["Heavy snow", "snow"], 77: ["Snow grains", "snow"],
  80: ["Rain showers", "rain"], 81: ["Rain showers", "rain"], 82: ["Violent showers", "rain"],
  85: ["Snow showers", "snow"], 86: ["Snow showers", "snow"],
  95: ["Thunderstorm", "storm"], 96: ["Thunderstorm, hail", "storm"], 99: ["Thunderstorm, hail", "storm"],
};
const codeInfo = (c) => CODES[c] || ["Unknown", "cloud"];

function skyFor(code, isDay) {
  const kind = codeInfo(code)[1];
  if (kind === "storm") return "storm";
  if (kind === "fog") return "fog";
  if (kind === "snow") return "snow";
  if (kind === "rain" || kind === "drizzle") return isDay ? "rain" : "rain-night";
  if (kind === "cloud") return isDay ? "clouds" : "clouds-night";
  return isDay ? "clear" : "clear-night";
}

// Small inline SVG icon set (no external images).
function icon(code, isDay = 1) {
  const kind = codeInfo(code)[1];
  const sun = isDay
    ? `<circle cx="24" cy="22" r="9" fill="#FFB547"/><g stroke="#FFB547" stroke-width="3" stroke-linecap="round"><path d="M24 5v4M24 35v4M7 22h4M37 22h4M12 10l3 3M33 31l3 3M12 34l3-3M33 13l3-3"/></g>`
    : `<path d="M30 10a12 12 0 1 0 8 19 10 10 0 0 1-8-19z" fill="#E7EEF8"/>`;
  const cloud = (fill = "#F2F6FA", y = 0) =>
    `<path transform="translate(0 ${y})" d="M16 42h22a8 8 0 0 0 0-16 11 11 0 0 0-21 2 7 7 0 0 0-1 14z" fill="${fill}"/>`;
  const drops = `<g stroke="#8FD3FF" stroke-width="3" stroke-linecap="round"><path d="M20 46l-2 5M28 46l-2 5M36 46l-2 5"/></g>`;
  const flakes = `<g fill="#FFFFFF"><circle cx="20" cy="49" r="2"/><circle cx="28" cy="52" r="2"/><circle cx="36" cy="49" r="2"/></g>`;
  const bolt = `<path d="M27 40l-5 9h5l-3 8 9-11h-5l3-6z" fill="#FFD23F"/>`;
  const fog = `<g stroke="#F2F6FA" stroke-width="3" stroke-linecap="round" opacity=".9"><path d="M10 30h34M14 37h30M10 44h28"/></g>`;
  const body = {
    "sun": sun,
    "sun-cloud": `<g transform="translate(-6 -4) scale(.85)">${sun}</g>${cloud("#F2F6FA", 2)}`,
    "cloud": `${cloud("#C9D4DF", -6)}${cloud("#F2F6FA", 2)}`,
    "fog": fog,
    "drizzle": `${cloud("#E2E9F0", -6)}${drops}`,
    "rain": `${cloud("#D0DAE4", -6)}${drops}`,
    "snow": `${cloud("#F2F6FA", -6)}${flakes}`,
    "storm": `${cloud("#B8C2CE", -8)}${bolt}`,
  }[kind];
  return `<svg viewBox="0 0 56 58" role="img" aria-label="${codeInfo(code)[0]}">${body}</svg>`;
}

// ---------- formatting ----------
const toUnit = (c) => (state.unit === "f" ? (c * 9) / 5 + 32 : c);
const t = (c) => `${Math.round(toUnit(c))}°`;
const windStr = (kmh) => (state.unit === "f" ? `${Math.round(kmh / 1.609)} mph` : `${Math.round(kmh)} km/h`);
function fmtTime(iso, tz, opts) {
  return new Intl.DateTimeFormat(undefined, { timeZone: tz, ...opts }).format(new Date(iso));
}

// ---------- data ----------
async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

async function searchCities(q) {
  const url = `${GEO_URL}?name=${encodeURIComponent(q)}&count=6&language=en&format=json`;
  const data = await getJSON(url);
  return (data.results || []).map((r) => ({
    name: r.name,
    region: [r.admin1, r.country].filter(Boolean).join(", "),
    lat: r.latitude, lon: r.longitude,
  }));
}

async function loadWeather(place) {
  setStatus("");
  setLoading(true);
  const params = new URLSearchParams({
    latitude: place.lat, longitude: place.lon, timezone: "auto", forecast_days: 7,
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day",
    hourly: "temperature_2m,weather_code,precipitation_probability,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_probability_max",
  });
  try {
    const data = await getJSON(`${WX_URL}?${params}`);
    state.place = place;
    state.data = data;
    save(STORE.last, place);
    addRecent(place);
    render();
  } catch (err) {
    setStatus("Couldn't load the weather. Check your connection and try again.");
    console.error(err);
  } finally {
    setLoading(false);
  }
}

// ---------- render ----------
function render() {
  const { data, place } = state;
  if (!data) return;
  const c = data.current;
  const tz = data.timezone;
  const [label] = codeInfo(c.weather_code);
  document.body.dataset.sky = skyFor(c.weather_code, c.is_day);

  $("place").textContent = place.region ? `${place.name}, ${place.region.split(", ").pop()}` : place.name;
  $("localTime").textContent = `${fmtTime(c.time, tz, { weekday: "long", hour: "numeric", minute: "2-digit" })} local time`;
  $("nowIcon").innerHTML = icon(c.weather_code, c.is_day);
  $("nowTemp").textContent = t(c.temperature_2m);
  $("nowDesc").textContent = label;
  $("nowHiLo").textContent = `H ${t(data.daily.temperature_2m_max[0])} · L ${t(data.daily.temperature_2m_min[0])}`;
  $("feels").textContent = t(c.apparent_temperature);
  $("hum").textContent = `${c.relative_humidity_2m}%`;
  $("wind").textContent = windStr(c.wind_speed_10m);
  $("uv").textContent = uvLabel(data.daily.uv_index_max[0]);
  document.title = `${t(c.temperature_2m)} ${place.name} · Nimbus`;

  // hourly: start from the current hour
  const h = data.hourly;
  const start = Math.max(0, h.time.findIndex((x) => x >= c.time.slice(0, 13)));
  const hourly = $("hourly");
  hourly.replaceChildren();
  for (let i = start; i < Math.min(start + 24, h.time.length); i++) {
    const el = document.createElement("div");
    el.className = "hour" + (i === start ? " now-h" : "");
    const p = h.precipitation_probability[i];
    el.innerHTML = `<small>${i === start ? "Now" : fmtTime(h.time[i], tz, { hour: "numeric" })}</small>${icon(h.weather_code[i], h.is_day[i])}<b>${t(h.temperature_2m[i])}</b><em>${p >= 20 ? p + "%" : ""}</em>`;
    hourly.append(el);
  }

  // daily with temperature range bars on a shared scale
  const d = data.daily;
  const lo = Math.min(...d.temperature_2m_min), hi = Math.max(...d.temperature_2m_max);
  const span = Math.max(1, hi - lo);
  const daily = $("daily");
  daily.replaceChildren();
  d.time.forEach((day, i) => {
    const li = document.createElement("li");
    const left = ((d.temperature_2m_min[i] - lo) / span) * 100;
    const width = ((d.temperature_2m_max[i] - d.temperature_2m_min[i]) / span) * 100;
    const name = i === 0 ? "Today" : fmtTime(day + "T12:00", tz, { weekday: "short" });
    li.innerHTML = `<span class="d">${name}</span>${icon(d.weather_code[i])}<div class="range"><span>${t(d.temperature_2m_min[i])}</span><div class="bar"><i style="left:${left}%;width:${Math.max(width, 4)}%"></i></div><span>${t(d.temperature_2m_max[i])}</span></div>`;
    li.setAttribute("aria-label", `${name}: ${codeInfo(d.weather_code[i])[0]}, low ${t(d.temperature_2m_min[i])}, high ${t(d.temperature_2m_max[i])}`);
    daily.append(li);
  });
}

function uvLabel(uv) {
  if (uv == null) return "--";
  const n = Math.round(uv);
  const word = n <= 2 ? "Low" : n <= 5 ? "Moderate" : n <= 7 ? "High" : n <= 10 ? "Very high" : "Extreme";
  return `${n} · ${word}`;
}

function setLoading(on) {
  ["place", "nowTemp", "nowDesc", "feels", "hum", "wind", "uv"].forEach((id) => $(id).classList.toggle("skel", on && !state.data));
}
function setStatus(msg) { $("status").textContent = msg; }

// ---------- recent searches ----------
function addRecent(place) {
  const list = load(STORE.recent, []).filter((p) => !(p.name === place.name && p.region === place.region));
  list.unshift(place);
  save(STORE.recent, list.slice(0, 6));
  renderRecent();
}
function renderRecent() {
  const wrap = $("recent");
  wrap.replaceChildren();
  load(STORE.recent, []).forEach((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = p.name;
    b.title = p.region;
    b.addEventListener("click", () => loadWeather(p));
    wrap.append(b);
  });
}

// ---------- search box with suggestions ----------
const input = $("q"), list = $("suggest");
let results = [], active = -1, timer;

input.addEventListener("input", () => {
  clearTimeout(timer);
  const q = input.value.trim();
  if (q.length < 2) return closeList();
  timer = setTimeout(async () => {
    try {
      results = await searchCities(q);
      renderList();
    } catch { setStatus("Search is unavailable right now."); }
  }, 250);
});
input.addEventListener("keydown", (e) => {
  if (list.hidden) return;
  if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
  else if (e.key === "Escape") closeList();
});
$("searchForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (active >= 0 && results[active]) return pick(results[active]);
  const q = input.value.trim();
  if (!q) return;
  try {
    const r = results.length ? results : await searchCities(q);
    if (r[0]) pick(r[0]); else setStatus(`No city found for "${q}".`);
  } catch { setStatus("Search is unavailable right now."); }
});
document.addEventListener("click", (e) => { if (!e.target.closest(".search")) closeList(); });

function renderList() {
  list.replaceChildren();
  active = -1;
  if (!results.length) {
    const li = document.createElement("li");
    li.textContent = "No matches";
    li.setAttribute("aria-disabled", "true");
    list.append(li);
  }
  results.forEach((r, i) => {
    const li = document.createElement("li");
    li.id = `opt-${i}`;
    li.setAttribute("role", "option");
    li.innerHTML = `<span></span><small></small>`;
    li.firstChild.textContent = r.name;
    li.lastChild.textContent = r.region;
    li.addEventListener("click", () => pick(r));
    list.append(li);
  });
  list.hidden = false;
  input.setAttribute("aria-expanded", "true");
}
function move(step) {
  if (!results.length) return;
  active = (active + step + results.length) % results.length;
  [...list.children].forEach((li, i) => li.setAttribute("aria-selected", String(i === active)));
  input.setAttribute("aria-activedescendant", `opt-${active}`);
}
function closeList() {
  list.hidden = true;
  input.setAttribute("aria-expanded", "false");
  input.removeAttribute("aria-activedescendant");
}
function pick(r) {
  closeList();
  input.value = "";
  input.blur();
  loadWeather(r);
}

// ---------- units ----------
document.querySelectorAll(".units button").forEach((b) => {
  b.setAttribute("aria-pressed", String(b.dataset.unit === state.unit));
  b.addEventListener("click", () => {
    state.unit = b.dataset.unit;
    save(STORE.unit, state.unit);
    document.querySelectorAll(".units button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    render();
  });
});

// ---------- geolocation ----------
$("locate").addEventListener("click", locate);
function locate() {
  if (!navigator.geolocation) return setStatus("Location isn't supported in this browser.");
  setStatus("Finding your location…");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      loadWeather({ name: "My location", region: "", lat, lon });
    },
    () => setStatus("Location permission was denied. Search for a city instead."),
    { timeout: 10000, maximumAge: 600000 }
  );
}

// ---------- start ----------
renderRecent();
loadWeather(load(STORE.last, { name: "Jaipur", region: "Rajasthan, India", lat: 26.9196, lon: 75.7878 }));
