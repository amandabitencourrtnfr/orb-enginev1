// ============================================================================
// THE ORB ENGINE — client.js
// ----------------------------------------------------------------------------
// Cliente JavaScript leve pra chamar o motor remotamente (do app front-end).
// Funciona em browser ou Node (usando fetch nativo).
//
// Uso no front:
//   import { OrbClient } from "./client.js";
//   const orb = new OrbClient("https://api.the-orb.example.com");
//
//   // 1. Pessoa digita "Curit" no campo de cidade
//   const cities = await orb.geocode("Curit");
//   // → [{ name, city, state, stateCode, country, countryCode, lat, lon }, ...]
//
//   // 2. Pessoa escolhe a cidade certa, motor calcula
//   const chart = await orb.chart({
//     year: 2002, month: 6, day: 25,
//     hour: 15, minute: 45,
//     latitude: cities[0].latitude,
//     longitude: cities[0].longitude,
//     country: cities[0].countryCode,
//     state: cities[0].stateCode,
//   });
//
//   // 3. Render
//   console.log(chart.points.sun.formatted);  // "Cancer 3°59'31""
//   console.log(chart.points.sun.house);       // 8
// ============================================================================

export class OrbClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async _post(path, body) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Unknown" }));
      throw new Error(`${response.status}: ${err.error}`);
    }
    return response.json();
  }

  async _get(path) {
    const response = await fetch(`${this.baseUrl}${path}`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Unknown" }));
      throw new Error(`${response.status}: ${err.error}`);
    }
    return response.json();
  }

  // ----- Endpoints -----

  /**
   * Calcula mapa natal.
   * @param input { year, month, day, hour, minute, latitude, longitude, country, state, timezone? }
   * @returns { points, houses, timing, input }
   */
  async chart(input) {
    return this._post("/chart", input);
  }

  /**
   * Calcula sinastria entre dois mapas.
   * @param personA input do mapa A
   * @param personB input do mapa B
   * @param options { includeMinors?, majorOrb?, minorOrb?, ... }
   * @returns { chartA, chartB, aspects, overlays }
   */
  async synastry(personA, personB, options = {}) {
    return this._post("/synastry", { personA, personB, options });
  }

  /**
   * Calcula trânsitos sobre mapa natal.
   * @param natal input do mapa natal
   * @param transit input pra data/local do trânsito
   * @param options { majorOrb?, minorOrb?, ... }
   * @returns { natal, transit, aspects, housesActivated }
   */
  async transits(natal, transit, options = {}) {
    return this._post("/transits", { natal, transit, options });
  }

  /**
   * Busca cidades por nome (autocomplete).
   * @param query string da busca (mínimo 2 chars)
   * @param limit max de resultados (default 5)
   * @returns { query, results: [{ name, city, state, stateCode, country, countryCode, latitude, longitude }] }
   */
  async geocode(query, limit = 5) {
    return this._get(`/geocode?q=${encodeURIComponent(query)}&limit=${limit}`);
  }

  /**
   * Health check do servidor.
   */
  async health() {
    return this._get("/health");
  }
}

// ----------------------------------------------------------------------------
// Helpers úteis pro front-end consumir o output do motor
// ----------------------------------------------------------------------------

/**
 * Dado o output de chart(), retorna lista compacta de pontos pra renderização.
 */
export function flatPoints(chart) {
  return Object.entries(chart.points).map(([name, p]) => ({
    name,
    formatted: p.formatted,
    sign: p.sign,
    signPt: p.signPt,
    house: p.house,
    retrograde: p.retrograde,
    longitude: p.longitude,
  }));
}

/**
 * Filtra aspectos por tipo (ex: "major", ou ["trine", "square"]).
 */
export function filterAspects(aspects, filter) {
  if (typeof filter === "string") {
    return aspects.filter(a => a.aspect === filter);
  }
  if (Array.isArray(filter)) {
    return aspects.filter(a => filter.includes(a.aspect));
  }
  return aspects;
}

/**
 * Agrupa aspectos por ponto (útil pra montar "todos os aspectos do Sol").
 */
export function aspectsByPoint(aspects, pointName, side = "any") {
  return aspects.filter(a => {
    const isFrom = (a.from === pointName) || (a.fromA === pointName) || (a.transit === pointName);
    const isTo = (a.to === pointName) || (a.toB === pointName) || (a.natal === pointName);
    if (side === "from") return isFrom;
    if (side === "to") return isTo;
    return isFrom || isTo;
  });
}
