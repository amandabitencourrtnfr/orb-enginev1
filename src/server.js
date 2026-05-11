// ============================================================================
// THE ORB ENGINE — server.js
// ----------------------------------------------------------------------------
// Servidor HTTP minimalista expondo endpoints REST:
//
//   POST /chart       → calcula mapa natal
//   POST /synastry    → calcula sinastria entre dois mapas
//   POST /transits    → calcula trânsitos pra uma data
//   GET  /geocode?q=  → autocomplete de cidade via Nominatim
//   GET  /health      → status do servidor
//
// Implementação usa apenas `node:http` nativo, sem Express.
// Em produção, recomenda-se usar Express ou Fastify pra middleware/CORS/etc.
//
// Uso:
//   node src/server.js [port]
//   curl -X POST http://localhost:3000/chart -H "Content-Type: application/json" \
//        -d '{"year":2002,"month":6,"day":25,"hour":15,"minute":45,...}'
// ============================================================================

import { createServer } from "node:http";
import { computeNatalChart } from "./chart.js";
import { computeSynastry, computeTransits } from "./synastry.js";

// PORT: prioriza variável de ambiente (Railway, Fly.io, Render etc),
// depois argumento de linha de comando, depois 3000 como default local.
const PORT = Number.parseInt(process.env.PORT || process.argv[2] || "3000", 10);

// CORS headers — permite chamadas de qualquer origem (em produção, restringir)
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Helper: ler body de POST como JSON
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

// Helper: enviar resposta JSON
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...CORS_HEADERS,
  });
  res.end(body);
}

// Helper: enviar erro
function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

// Helper: parse de query string
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

function handleHealth(req, res) {
  sendJson(res, 200, {
    status: "ok",
    engine: "the-orb",
    version: "0.2.0",
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
      "User-Agent": "TheOrbEngine/0.2 (https://github.com/amanda/the-orb)",
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim returned ${response.status}`);
  }

  const data = await response.json();
  return data.map(item => ({
    name: item.display_name,
    city: item.address?.city || item.address?.town || item.address?.village || item.address?.municipality,
    state: item.address?.state,
    stateCode: stateAbbreviation(item.address?.state, item.address?.country_code),
    country: item.address?.country,
    countryCode: (item.address?.country_code || "").toUpperCase(),
    latitude: Number.parseFloat(item.lat),
    longitude: Number.parseFloat(item.lon),
    type: item.type,
    importance: item.importance,
  }));
}

function stateAbbreviation(stateName, countryCode) {
  if (!stateName || !countryCode) return null;
  if (countryCode.toLowerCase() === "br") {
    const map = {
      "Acre": "AC", "Alagoas": "AL", "Amapá": "AP", "Amazonas": "AM",
      "Bahia": "BA", "Ceará": "CE", "Distrito Federal": "DF",
      "Espírito Santo": "ES", "Goiás": "GO", "Maranhão": "MA",
      "Mato Grosso": "MT", "Mato Grosso do Sul": "MS", "Minas Gerais": "MG",
      "Pará": "PA", "Paraíba": "PB", "Paraná": "PR", "Pernambuco": "PE",
      "Piauí": "PI", "Rio de Janeiro": "RJ", "Rio Grande do Norte": "RN",
      "Rio Grande do Sul": "RS", "Rondônia": "RO", "Roraima": "RR",
      "Santa Catarina": "SC", "São Paulo": "SP", "Sergipe": "SE",
      "Tocantins": "TO",
    };
    return map[stateName] || null;
  }
  return null;
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

    sendError(res, 404, `No route: ${route}`);
  } catch (e) {
    console.error("Unhandled error:", e);
    sendError(res, 500, "Internal server error: " + e.message);
  }
});

// IMPORTANTE: bind em 0.0.0.0 (não localhost) pra funcionar em containers de deploy
server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🜨  THE ORB engine running on port ${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /health`);
  console.log(`  POST /chart        → mapa natal`);
  console.log(`  POST /synastry     → sinastria`);
  console.log(`  POST /transits     → trânsitos`);
  console.log(`  GET  /geocode?q=   → busca de cidade`);
  console.log("");
});
