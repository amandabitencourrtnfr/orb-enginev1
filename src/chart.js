// ============================================================================
// THE ORB ENGINE — chart.js (v0.3)
// ----------------------------------------------------------------------------
// API principal de cálculo de mapa natal. Unifica:
//   - timezone (resolução via Luxon + geo-tz, cobertura global)
//   - astronomy (posições planetárias)
//   - houses (casas Placidus)
//   - aspects
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
import { localToUT, localToUTWithOffset, resolveIANA } from "./timezone.js";

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
//     hour, minute,               // hora local (opcional; default 12:00)
//     latitude, longitude,        // coordenadas (graus) — obrigatórios
//
//     // Opcionais (em ordem de prioridade pra resolver timezone):
//     timezone: -3,               // override manual, em horas (se passado, usa este)
//     iana: "America/Sao_Paulo",  // override do nome IANA do timezone
//
//     // Legado (ignorados na v0.3, mantidos pra retrocompatibilidade):
//     country: "BR",
//     state: "PR",
//
//     unknownTime: false,
//   }
//
// Resolução de timezone (em ordem):
//   1. Se `timezone` (offset numérico) for passado, usa direto
//   2. Se `iana` for passado, usa Luxon com esse IANA + lat/lon ignorados
//   3. Caso contrário, resolve via geo-tz a partir de lat/lon
// ----------------------------------------------------------------------------
export function computeNatalChart(input) {
  // Validação básica
  if (typeof input.latitude !== "number" || typeof input.longitude !== "number") {
    throw new Error("latitude e longitude são obrigatórios (números)");
  }

  // 1. Resolver hora desconhecida
  let hour = input.hour, minute = input.minute;
  let unknownTime = !!input.unknownTime;
  if (hour === undefined || hour === null) {
    hour = 12; minute = 0; unknownTime = true;
  }
  if (minute === undefined || minute === null) minute = 0;

  // 2. Resolver timezone e converter pra UT
  let ut;
  let resolvedOffset;
  let resolvedIana = null;

  if (input.timezone !== undefined && input.timezone !== null) {
    // Override manual — usa offset numérico direto
    resolvedOffset = input.timezone;
    ut = localToUTWithOffset(input.year, input.month, input.day, hour, minute, resolvedOffset);
  } else {
    // Resolver via geo-tz (com possível override de IANA)
    const result = localToUT(input.year, input.month, input.day, hour, minute, input.latitude, input.longitude, input.iana || null);
    ut = { year: result.year, month: result.month, day: result.day, hour: result.hour, minute: result.minute };
    resolvedOffset = result.offsetUsed;
    resolvedIana = result.ianaName;
  }

  // 3. Julian Day
  const JD = julianDay(ut.year, ut.month, ut.day, ut.hour, ut.minute, 0);
  const T = julianCenturies(JD);
  const eps = trueObliquity(T);
  const GAST = greenwichApparentSiderealTime(JD);
  const LST = localSiderealTime(JD, input.longitude);

  // 4. Casas (se hora conhecida)
  let houses;
  if (!unknownTime) {
    houses = placidusHouses(LST, input.latitude, eps);
  } else {
    houses = {
      cusps: new Array(13).fill(null),
      system: "Unknown (no birth time)",
      asc: null,
      mc: null,
    };
  }

  // 5. Posições planetárias
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

  const dtRetro = 1.0;
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
      timezone: resolvedOffset,
      iana: resolvedIana,
      unknownTime,
    },
    timing: {
      julianDay: JD,
      julianCenturiesJ2000: T,
      obliquity: eps,
      siderealTime: { gast: GAST, lst: LST },
      ut: { ...ut },
      timezone: {
        offsetHours: resolvedOffset,
        iana: resolvedIana,
      },
    },
    points,
    houses,
  };
}
