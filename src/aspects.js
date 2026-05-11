// ============================================================================
// THE ORB ENGINE — aspects.js
// ----------------------------------------------------------------------------
// Cálculo de aspectos astrológicos entre pontos (planetas, ASC, MC etc.).
//
// Aspectos majores (Ptolomaicos) com seus ângulos exatos:
//   - Conjunção (conjunction):    0°
//   - Oposição (opposition):    180°
//   - Trígono (trine):          120°
//   - Quadratura (square):       90°
//   - Sextil (sextile):          60°
//
// Aspectos menores também suportados:
//   - Semi-sextil (semisextile):       30°
//   - Semi-quadratura (semisquare):    45°
//   - Quincunce/inconjunção (quincunx):150°
//   - Sesquiquadratura (sesquisquare): 135°
//   - Quintil:                          72°
//   - Bi-quintil:                      144°
//
// Orbes padrão usados pelo Astro-Seek:
//   - Aspectos majores: 6° para natal/sinastria, 1°-2° para trânsitos rápidos
//   - Aspectos menores: 2°
//   - Sol e Lua: orbe extra (+2°)
// ============================================================================

import { norm360 } from "./astronomy.js";

// Definição dos aspectos
export const ASPECTS = {
  conjunction:  { angle: 0,   abbr: "☌", category: "major", baseOrb: 8 },
  opposition:   { angle: 180, abbr: "☍", category: "major", baseOrb: 8 },
  trine:        { angle: 120, abbr: "△", category: "major", baseOrb: 8 },
  square:       { angle: 90,  abbr: "□", category: "major", baseOrb: 7 },
  sextile:      { angle: 60,  abbr: "⚹", category: "major", baseOrb: 6 },
  semisextile:  { angle: 30,  abbr: "⚺", category: "minor", baseOrb: 2 },
  semisquare:   { angle: 45,  abbr: "∠", category: "minor", baseOrb: 2 },
  quincunx:     { angle: 150, abbr: "⚻", category: "minor", baseOrb: 3 },
  sesquisquare: { angle: 135, abbr: "⚼", category: "minor", baseOrb: 2 },
  quintile:     { angle: 72,  abbr: "Q",  category: "minor", baseOrb: 2 },
  biquintile:   { angle: 144, abbr: "bQ", category: "minor", baseOrb: 2 },
};

// Pontos "luminares" recebem orbe extra
const LUMINARIES = new Set(["sun", "moon"]);

// Pontos angulares (ASC/MC) recebem orbe igual aos luminares
const ANGLES = new Set(["asc", "mc", "ic", "dsc"]);

// Calcular orbe efetivo dado os pontos envolvidos
function effectiveOrb(aspect, pointA, pointB) {
  let orb = ASPECTS[aspect].baseOrb;
  // Luminares e ângulos têm orbe maior
  if (LUMINARIES.has(pointA) || LUMINARIES.has(pointB)) orb += 2;
  if (ANGLES.has(pointA) || ANGLES.has(pointB)) orb += 1;
  return orb;
}

// Diferença angular entre duas longitudes em [0, 180]
function angularDistance(lonA, lonB) {
  let d = Math.abs(norm360(lonA) - norm360(lonB));
  if (d > 180) d = 360 - d;
  return d;
}

// ----------------------------------------------------------------------------
// findAspect — dado dois pontos, retorna o aspecto formado (ou null)
// ----------------------------------------------------------------------------
// Inputs:
//   pointAName, lonA: nome e longitude do primeiro ponto
//   pointBName, lonB: nome e longitude do segundo ponto
//   options: {
//     includeMinors: false, // se incluir aspectos menores
//     majorOrb: 8,          // orbe override pra aspectos majores
//     minorOrb: 2,          // orbe override pra aspectos menores
//     luminaryBonus: 2,     // orbe extra pra Sol/Lua
//     angleBonus: 1,        // orbe extra pra ASC/MC
//   }
// Retorna: { aspect, exactAngle, actualAngle, orb, orbDeg, orbMin } ou null
// ----------------------------------------------------------------------------
export function findAspect(pointAName, lonA, pointBName, lonB, options = {}) {
  const includeMinors = options.includeMinors ?? false;
  const dist = angularDistance(lonA, lonB);

  let best = null;
  for (const [name, def] of Object.entries(ASPECTS)) {
    if (!includeMinors && def.category === "minor") continue;
    let orb = def.baseOrb;
    if (options.majorOrb !== undefined && def.category === "major") orb = options.majorOrb;
    if (options.minorOrb !== undefined && def.category === "minor") orb = options.minorOrb;
    const lumBonus = options.luminaryBonus ?? 2;
    const angBonus = options.angleBonus ?? 1;
    if (LUMINARIES.has(pointAName) || LUMINARIES.has(pointBName)) orb += lumBonus;
    if (ANGLES.has(pointAName) || ANGLES.has(pointBName)) orb += angBonus;

    const delta = Math.abs(dist - def.angle);
    if (delta <= orb) {
      if (!best || delta < best.orb) {
        best = {
          aspect: name,
          symbol: def.abbr,
          exactAngle: def.angle,
          actualAngle: dist,
          orb: delta,
          orbDeg: Math.floor(delta),
          orbMin: Math.round((delta - Math.floor(delta)) * 60),
        };
      }
    }
  }
  return best;
}

// ----------------------------------------------------------------------------
// findAllAspects — encontra todos os aspectos entre os pontos dados
// ----------------------------------------------------------------------------
// Inputs:
//   points: { sun: lon, moon: lon, ... } — pontos do mesmo mapa
// Retorna: lista de aspectos { from, to, aspect, orb, ... }
// ----------------------------------------------------------------------------
export function findAllAspects(points, options = {}) {
  const names = Object.keys(points);
  const result = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = findAspect(names[i], points[names[i]], names[j], points[names[j]], options);
      if (a) {
        result.push({ from: names[i], to: names[j], ...a });
      }
    }
  }
  return result;
}

// ----------------------------------------------------------------------------
// findSynastryAspects — aspectos entre DOIS mapas diferentes (sinastria)
// ----------------------------------------------------------------------------
// Inputs:
//   pointsA: pontos do mapa A
//   pointsB: pontos do mapa B
//   options: idem findAspect
// Retorna: lista { fromA, toB, aspect, orb, ... }
// ----------------------------------------------------------------------------
export function findSynastryAspects(pointsA, pointsB, options = {}) {
  const result = [];
  for (const [nameA, lonA] of Object.entries(pointsA)) {
    for (const [nameB, lonB] of Object.entries(pointsB)) {
      const a = findAspect(nameA, lonA, nameB, lonB, options);
      if (a) {
        result.push({ fromA: nameA, toB: nameB, ...a });
      }
    }
  }
  return result;
}

// ----------------------------------------------------------------------------
// findTransitAspects — aspectos de TRÂNSITO sobre mapa natal
// ----------------------------------------------------------------------------
// Inputs:
//   transitPoints: pontos calculados pra data atual (com velocidades opcionais)
//   natalPoints: pontos natais
//   transitSpeeds: { sun: 1.02°/dia, moon: 13.2°/dia, ... } — opcional, pra applying/separating
//   options: idem findAspect (orbes geralmente menores em trânsitos: 1-2°)
// Retorna: lista { transit, natal, aspect, applying, orb, ... }
// ----------------------------------------------------------------------------
export function findTransitAspects(transitPoints, natalPoints, transitSpeeds = null, options = {}) {
  const opts = { majorOrb: 3, minorOrb: 1, luminaryBonus: 1, angleBonus: 0, ...options };
  const result = [];
  for (const [tName, tLon] of Object.entries(transitPoints)) {
    for (const [nName, nLon] of Object.entries(natalPoints)) {
      const a = findAspect(tName, tLon, nName, nLon, opts);
      if (a) {
        // applying vs separating: depende se o orbe está diminuindo ou aumentando.
        // Se transitSpeeds fornecido, simulamos avanço de 1 dia.
        let applying = null;
        if (transitSpeeds && transitSpeeds[tName] !== undefined) {
          const futureLon = norm360(tLon + transitSpeeds[tName]);
          const futureDist = angularDistance(futureLon, nLon);
          const futureDelta = Math.abs(futureDist - a.exactAngle);
          applying = futureDelta < a.orb;
        }
        result.push({ transit: tName, natal: nName, applying, ...a });
      }
    }
  }
  return result;
}
