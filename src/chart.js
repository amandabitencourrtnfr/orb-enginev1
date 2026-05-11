// ============================================================================
// THE ORB ENGINE — chart.js
// ----------------------------------------------------------------------------
// API principal de cálculo de mapa natal. Unifica:
//   - timezone (resolução automática de DST histórico)
//   - astronomy (posições planetárias)
//   - houses (casas Placidus)
//   - aspects (próxima fase)
// ============================================================================

import {
  julianDay,
  julianCenturies,
  trueObliquity,
  greenwichApparentSiderealTime,
  localSiderealTime,
  sunGeocentric,
  moonGeocentric,
  planetGeocentric,
  plutoGeocentric,
  trueNodeLongitude,
  lilithLongitude,
  chironLongitude,
  norm360,
} from "./astronomy.js";
import { placidusHouses, ascendant, midheaven, houseOf } from "./houses.js";
import { resolveTimezoneOffset, localToUT } from "./timezone.js";

const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

const PT_SIGNS = [
  "Áries", "Touro", "Gêmeos", "Câncer", "Leão", "Virgem",
  "Libra", "Escorpião", "Sagitário", "Capricórnio", "Aquário", "Peixes",
];

const PLANETS = [
  "sun", "moon", "mercury", "venus", "mars",
  "jupiter", "saturn", "uranus", "neptune", "pluto",
  "node", "lilith", "chiron",
];

// Helper: converte longitude eclíptica em sign/degree/minute legível
export function describeLongitude(lon) {
  const l = norm360(lon);
  const signIdx = Math.floor(l / 30);
  const inSign = l - signIdx * 30;
  const deg = Math.floor(inSign);
  const minFrac = (inSign - deg) * 60;
  const min = Math.floor(minFrac);
  const sec = Math.round((minFrac - min) * 60);
  return {
    longitude: l,
    sign: SIGNS[signIdx],
    signPt: PT_SIGNS[signIdx],
    signIndex: signIdx,
    degInSign: deg,
    minInSign: min,
    secInSign: sec,
    formatted: `${SIGNS[signIdx]} ${deg}°${String(min).padStart(2, "0")}'${String(sec).padStart(2, "0")}"`,
  };
}

// ----------------------------------------------------------------------------
// computeNatalChart — função principal
// ----------------------------------------------------------------------------
// Input:
//   {
//     year, month, day,           // data local de nascimento
//     hour, minute,               // hora local (opcional; default 12:00 — meio-dia)
//     latitude, longitude,        // coordenadas do local de nascimento (graus, leste/norte positivos)
//     country: "BR",              // código ISO do país (pra resolver DST)
//     state: "PR",                // sigla do estado (pra Brasil; afeta DST regional)
//     timezone: -3,               // (opcional) override manual; se passado, ignora detecção automática
//     unknownTime: false,         // se true, usa 12:00 e marca isso no output
//   }
//
// Output:
//   {
//     input: { ... },             // echo do input com timezone resolvido
//     timing: { julianDay, T, LST, GAST, eps, ut: {...} },
//     points: {                   // longitude eclíptica + descrição de cada ponto
//       sun: { longitude, sign, degInSign, ..., house, retrograde },
//       moon: { ... },
//       ...
//     },
//     houses: {                   // 12 cúspides Placidus + ASC + MC
//       system: "Placidus",
//       cusps: [null, h1, h2, ..., h12],
//       asc: { ... },
//       mc: { ... },
//       ic: { ... },
//       dsc: { ... },
//     },
//   }
// ----------------------------------------------------------------------------
export function computeNatalChart(input) {
  // 1. Resolver timezone
  let offset = input.timezone;
  if (offset === undefined || offset === null) {
    const auto = resolveTimezoneOffset(
      input.year, input.month, input.day,
      input.country, input.state
    );
    if (auto === null) {
      throw new Error(`Não foi possível resolver timezone automaticamente para ${input.country}/${input.state}. Passe timezone explícito.`);
    }
    offset = auto;
  }

  // 2. Resolver hora desconhecida
  let hour = input.hour, minute = input.minute;
  let unknownTime = !!input.unknownTime;
  if (hour === undefined || hour === null) {
    hour = 12; minute = 0; unknownTime = true;
  }

  // 3. Converter pra UT
  const ut = localToUT(input.year, input.month, input.day, hour, minute, offset);

  // 4. Julian Day
  const JD = julianDay(ut.year, ut.month, ut.day, ut.hour, ut.minute, 0);
  const T = julianCenturies(JD);
  const eps = trueObliquity(T);
  const GAST = greenwichApparentSiderealTime(JD);
  const LST = localSiderealTime(JD, input.longitude);

  // 5. Casas (se hora conhecida)
  let houses;
  if (!unknownTime) {
    houses = placidusHouses(LST, input.latitude, eps);
  } else {
    // Sem hora: ainda calculamos longitudes planetárias, mas casas são indefinidas.
    houses = {
      cusps: new Array(13).fill(null),
      system: "Unknown (no birth time)",
      asc: null,
      mc: null,
    };
  }

  // 6. Posições planetárias
  const points = {};
  const rawLongitudes = {
    sun: sunGeocentric(JD).longitude,
    moon: moonGeocentric(JD).longitude,
    mercury: planetGeocentric("mercury", JD).longitude,
    venus: planetGeocentric("venus", JD).longitude,
    mars: planetGeocentric("mars", JD).longitude,
    jupiter: planetGeocentric("jupiter", JD).longitude,
    saturn: planetGeocentric("saturn", JD).longitude,
    uranus: planetGeocentric("uranus", JD).longitude,
    neptune: planetGeocentric("neptune", JD).longitude,
    pluto: plutoGeocentric(JD).longitude,
    node: trueNodeLongitude(JD),
    lilith: lilithLongitude(JD),
    chiron: chironLongitude(JD),
  };

  // Determinar retrogradação: comparar longitude em JD e JD+1
  const dtRetro = 1.0; // dias
  const futureLongitudes = {
    sun: sunGeocentric(JD + dtRetro).longitude,
    moon: moonGeocentric(JD + dtRetro).longitude,
    mercury: planetGeocentric("mercury", JD + dtRetro).longitude,
    venus: planetGeocentric("venus", JD + dtRetro).longitude,
    mars: planetGeocentric("mars", JD + dtRetro).longitude,
    jupiter: planetGeocentric("jupiter", JD + dtRetro).longitude,
    saturn: planetGeocentric("saturn", JD + dtRetro).longitude,
    uranus: planetGeocentric("uranus", JD + dtRetro).longitude,
    neptune: planetGeocentric("neptune", JD + dtRetro).longitude,
    pluto: plutoGeocentric(JD + dtRetro).longitude,
    node: trueNodeLongitude(JD + dtRetro),
    lilith: lilithLongitude(JD + dtRetro),
    chiron: chironLongitude(JD + dtRetro),
  };

  for (const p of PLANETS) {
    const lon = rawLongitudes[p];
    const lonFuture = futureLongitudes[p];
    // Movimento diário (em graus, com sinal); se negativo, retrógrado
    let speed = lonFuture - lon;
    if (speed > 180) speed -= 360;
    if (speed < -180) speed += 360;
    const retrograde = speed < 0;
    const desc = describeLongitude(lon);
    points[p] = {
      ...desc,
      house: houses.cusps[1] !== null ? houseOf(lon, houses.cusps) : null,
      retrograde,
      speed,
    };
  }

  // ASC, MC, IC, DSC
  if (!unknownTime) {
    const ascDesc = describeLongitude(houses.asc);
    const mcDesc = describeLongitude(houses.mc);
    houses = {
      ...houses,
      asc: ascDesc,
      mc: mcDesc,
      ic: describeLongitude(norm360(houses.mc + 180)),
      dsc: describeLongitude(norm360(houses.asc + 180)),
    };
  }

  return {
    input: {
      ...input,
      timezone: offset,
      unknownTime,
    },
    timing: {
      julianDay: JD,
      julianCenturiesJ2000: T,
      obliquity: eps,
      siderealTime: { gast: GAST, lst: LST },
      ut: { ...ut },
    },
    points,
    houses,
  };
}
