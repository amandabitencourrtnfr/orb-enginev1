// ============================================================================
// THE ORB ENGINE — server.js (v0.3)
// ----------------------------------------------------------------------------
// Servidor HTTP minimalista expondo endpoints REST:
//
//   POST /chart       → calcula mapa natal
//   POST /synastry    → calcula sinastria entre dois mapas
//   POST /transits    → calcula trânsitos pra uma data
//   GET  /geocode?q=  → autocomplete de cidade via Nominatim
//   GET  /timezone    → debug: resolve timezone pra lat/lon/data
//   GET  /health      → status do servidor
// ============================================================================

import { createServer } from "node:http";
import { computeNatalChart } from "./chart.js";
import { computeSynastry, computeTransits } from "./synastry.js";
import { resolveIANA, resolveTimezoneOffset } from "./timezone.js";

const PORT = Number.parseInt(process.env.PORT || process.argv[2] || "3000", 10);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => data += chunk);
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(new Error("Invalid JSON: " + e.message));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...CORS_HEADERS,
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function parseQuery(url) {
  const qIdx = url.indexOf("?");
  if (qIdx === -1) return {};
  const params = {};
  for (const pair of url.slice(qIdx + 1).split("&")) {
    const [k, v] = pair.split("=");
    params[decodeURIComponent(k)] = decodeURIComponent(v || "");
  }
  return params;
}

// ----------------------------------------------------------------------------
// HANDLERS
// ----------------------------------------------------------------------------

async function handleChart(req, res) {
  try {
    const body = await readJsonBody(req);
    const chart = computeNatalChart(body);
    sendJson(res, 200, chart);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleSynastry(req, res) {
  try {
    const { personA, personB, options = {} } = await readJsonBody(req);
    if (!personA || !personB) {
      return sendError(res, 400, "Required: { personA, personB }");
    }
    const result = computeSynastry(personA, personB, options);
    sendJson(res, 200, result);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleTransits(req, res) {
  try {
    const { natal, transit, options = {} } = await readJsonBody(req);
    if (!natal || !transit) {
      return sendError(res, 400, "Required: { natal, transit }");
    }
    const result = computeTransits(natal, transit, options);
    sendJson(res, 200, result);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleGeocode(req, res) {
  const params = parseQuery(req.url);
  const query = params.q;
  if (!query || query.length < 2) {
    return sendError(res, 400, "Query parameter 'q' required (min 2 chars)");
  }
  try {
    const results = await geocodeNominatim(query, params.limit || 5);
    sendJson(res, 200, { query, results });
  } catch (e) {
    sendError(res, 500, "Geocoding failed: " + e.message);
  }
}

// Debug endpoint: resolve timezone for given lat/lon/date
function handleTimezone(req, res) {
  const params = parseQuery(req.url);
  const lat = parseFloat(params.lat);
  const lon = parseFloat(params.lon);
  const year = parseInt(params.year) || new Date().getFullYear();
  const month = parseInt(params.month) || 1;
  const day = parseInt(params.day) || 1;
  const hour = parseInt(params.hour) || 12;
  const minute = parseInt(params.minute) || 0;

  if (isNaN(lat) || isNaN(lon)) {
    return sendError(res, 400, "Required: lat, lon (numbers)");
  }
  try {
    const tz = resolveTimezoneOffset(year, month, day, hour, minute, lat, lon);
    sendJson(res, 200, {
      latitude: lat, longitude: lon,
      date: { year, month, day, hour, minute },
      timezone: tz,
    });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

function handleHealth(req, res) {
  sendJson(res, 200, {
    status: "ok",
    engine: "the-orb",
    version: "0.3.0",
    features: ["global-timezone", "iana-lookup", "luxon-dst"],
    timestamp: new Date().toISOString(),
  });
}

// ----------------------------------------------------------------------------
// GEOCODING (Nominatim / OpenStreetMap)
// ----------------------------------------------------------------------------
async function geocodeNominatim(query, limit = 5) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "pt-BR,en");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "TheOrbEngine/0.3 (https://github.com/amanda/the-orb)",
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim returned ${response.status}`);
  }

  const data = await response.json();
  return data.map(item => {
    const lat = Number.parseFloat(item.lat);
    const lon = Number.parseFloat(item.lon);
    // Resolve IANA timezone right here so the client can show it
    let iana = null;
    try {
      iana = resolveIANA(lat, lon);
    } catch (e) {
      iana = null;
    }
    return {
      name: item.display_name,
      city: item.address?.city || item.address?.town || item.address?.village || item.address?.municipality,
      state: item.address?.state,
      country: item.address?.country,
      countryCode: (item.address?.country_code || "").toUpperCase(),
      latitude: lat,
      longitude: lon,
      iana,                       // 🆕 timezone IANA resolvido aqui
      type: item.type,
      importance: item.importance,
    };
  });
}

// ----------------------------------------------------------------------------
// ROUTER
// ----------------------------------------------------------------------------
const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  const path = req.url.split("?")[0];
  const route = `${req.method} ${path}`;

  console.log(`[${new Date().toISOString()}] ${route}`);

  try {
    if (route === "GET /health") return handleHealth(req, res);
    if (route === "POST /chart") return await handleChart(req, res);
    if (route === "POST /synastry") return await handleSynastry(req, res);
    if (route === "POST /transits") return await handleTransits(req, res);
    if (route === "GET /geocode") return await handleGeocode(req, res);
    if (route === "GET /timezone") return handleTimezone(req, res);

    sendError(res, 404, `No route: ${route}`);
  } catch (e) {
    console.error("Unhandled error:", e);
    sendError(res, 500, "Internal server error: " + e.message);
  }
});

server.listen(PORT, () => {
  console.log(`\n🜨  THE ORB engine v0.3 running on port ${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /health`);
  console.log(`  POST /chart        → mapa natal`);
  console.log(`  POST /synastry     → sinastria`);
  console.log(`  POST /transits     → trânsitos`);
  console.log(`  GET  /geocode?q=   → busca de cidade (com IANA timezone)`);
  console.log(`  GET  /timezone     → resolve timezone pra lat/lon/data`);
  console.log("");
});
