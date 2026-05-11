// ============================================================================
// THE ORB ENGINE — synastry.js
// ----------------------------------------------------------------------------
// API de cálculo de sinastria (aspectos entre dois mapas) e trânsitos
// (aspectos entre planetas atuais e mapa natal).
// ============================================================================

import { computeNatalChart } from "./chart.js";
import {
  findAllAspects,
  findSynastryAspects,
  findTransitAspects,
} from "./aspects.js";
import { houseOf } from "./houses.js";
import { norm360 } from "./astronomy.js";

// Extrai dicionário { name → longitude } a partir do output de computeNatalChart
function extractPoints(chart, options = {}) {
  const includeAngles = options.includeAngles ?? true;
  const points = {};
  for (const [name, p] of Object.entries(chart.points)) {
    points[name] = p.longitude;
  }
  if (includeAngles && chart.houses.asc) {
    points.asc = chart.houses.asc.longitude;
    points.mc = chart.houses.mc.longitude;
  }
  return points;
}

// ----------------------------------------------------------------------------
// computeSynastry — sinastria completa entre dois mapas natais
// ----------------------------------------------------------------------------
// Inputs:
//   personA: input de computeNatalChart pra primeira pessoa
//   personB: input de computeNatalChart pra segunda pessoa
//   options: passa pra findSynastryAspects (orbes etc)
// Output:
//   {
//     chartA, chartB,
//     aspects: [ { fromA: "sun", toB: "mars", aspect: "trine", ... } ],
//     overlays: {
//       AinB: { sun: house_in_B, moon: ..., ... },
//       BinA: { sun: house_in_A, ... },
//     },
//   }
// ----------------------------------------------------------------------------
export function computeSynastry(personA, personB, options = {}) {
  const chartA = computeNatalChart(personA);
  const chartB = computeNatalChart(personB);

  const pointsA = extractPoints(chartA);
  const pointsB = extractPoints(chartB);

  const aspects = findSynastryAspects(pointsA, pointsB, options);

  // Casas: em qual casa de B caem os planetas de A, e vice-versa
  const overlays = { AinB: {}, BinA: {} };
  if (chartB.houses.cusps[1] !== null) {
    for (const [name, p] of Object.entries(chartA.points)) {
      overlays.AinB[name] = houseOf(p.longitude, chartB.houses.cusps);
    }
  }
  if (chartA.houses.cusps[1] !== null) {
    for (const [name, p] of Object.entries(chartB.points)) {
      overlays.BinA[name] = houseOf(p.longitude, chartA.houses.cusps);
    }
  }

  return { chartA, chartB, aspects, overlays };
}

// ----------------------------------------------------------------------------
// computeTransits — aspectos entre planetas em uma data atual e mapa natal
// ----------------------------------------------------------------------------
// Inputs:
//   natalInput: input de computeNatalChart pra mapa natal
//   transitInput: input de computeNatalChart pra data/local do trânsito
//   options: passa pra findTransitAspects (orbes geralmente menores)
// Output:
//   {
//     natal: mapa natal completo,
//     transit: mapa dos trânsitos (apenas posições, geralmente sem casas),
//     aspects: [ { transit, natal, aspect, applying, orb, ... } ],
//     housesActivated: { transit_planet: natal_house, ... }
//   }
// ----------------------------------------------------------------------------
export function computeTransits(natalInput, transitInput, options = {}) {
  const natal = computeNatalChart(natalInput);
  const transit = computeNatalChart(transitInput);

  const natalPoints = extractPoints(natal);
  // Trânsito: incluir ASC/MC pra detectar quando essas posições angulares
  // do MOMENTO atual formam aspectos com o mapa natal (típico do Astro-Seek)
  const transitPoints = extractPoints(transit, { includeAngles: true });

  // Velocidades de cada planeta (em °/dia) — pra detectar applying/separating
  const transitSpeeds = {};
  for (const [name, p] of Object.entries(transit.points)) {
    transitSpeeds[name] = p.speed;
  }

  const aspects = findTransitAspects(transitPoints, natalPoints, transitSpeeds, options);

  // Em qual casa natal cada planeta de trânsito se encontra
  const housesActivated = {};
  if (natal.houses.cusps[1] !== null) {
    for (const [name, p] of Object.entries(transit.points)) {
      housesActivated[name] = houseOf(p.longitude, natal.houses.cusps);
    }
  }

  return { natal, transit, aspects, housesActivated };
}
