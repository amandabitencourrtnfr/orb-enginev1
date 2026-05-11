// ============================================================================
// THE ORB ENGINE — timezone.js (v0.3)
// ----------------------------------------------------------------------------
// Resolução de timezone via Luxon + IANA tz database + geo-tz para lookup
// geográfico por lat/lon.
//
// Cobertura GLOBAL: todos os países, todas as mudanças históricas de DST
// (incluindo: Brasil 1985-2019 com regras regionais, EUA por estado,
// Europa, Ásia, Oceania, casos exóticos tipo Samoa pulando um dia, etc).
//
// API:
//   resolveTimezoneOffset(year, month, day, hour, minute, latitude, longitude)
//     → retorna { offsetHours, ianaName, isDST } no momento exato
//
//   localToUT(year, month, day, hour, minute, latitude, longitude)
//     → converte data/hora local pra UT respeitando o timezone do local
// ============================================================================

import { DateTime } from "luxon";
import { find as findTimezone } from "geo-tz";

// ----------------------------------------------------------------------------
// resolveIANA — descobre o nome IANA do timezone pra um lat/lon
// ----------------------------------------------------------------------------
// Retorna string tipo "America/Sao_Paulo", "America/Los_Angeles", "Asia/Tokyo".
// geo-tz pode retornar múltiplos timezones em fronteiras; pegamos o primeiro
// (o mais relevante populacionalmente).
// ----------------------------------------------------------------------------
export function resolveIANA(latitude, longitude) {
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    throw new Error(`resolveIANA: lat/lon devem ser números (recebido: ${latitude}, ${longitude})`);
  }
  const zones = findTimezone(latitude, longitude);
  if (!zones || zones.length === 0) {
    throw new Error(`Não foi possível resolver timezone para ${latitude}, ${longitude}`);
  }
  return zones[0];
}

// ----------------------------------------------------------------------------
// resolveTimezoneOffset — resolve offset histórico no momento exato
// ----------------------------------------------------------------------------
// Inputs:
//   year, month (1-12), day (1-31): data local
//   hour, minute: hora local
//   latitude, longitude: coordenadas (graus)
//   ianaOverride: (opcional) força um nome IANA específico
//
// Retorna:
//   {
//     offsetHours: -8,             // offset em horas (negativo = oeste de UTC)
//     ianaName: "America/Los_Angeles",
//     isDST: false,                // se está em horário de verão
//     offsetName: "PST",           // nome curto (ex: "PST", "BRT", "CEST")
//   }
// ----------------------------------------------------------------------------
export function resolveTimezoneOffset(year, month, day, hour, minute, latitude, longitude, ianaOverride = null) {
  const iana = ianaOverride || resolveIANA(latitude, longitude);

  // Cria um DateTime no fuso resolvido
  const dt = DateTime.fromObject(
    { year, month, day, hour, minute },
    { zone: iana }
  );

  if (!dt.isValid) {
    throw new Error(`Data inválida em ${iana}: ${dt.invalidReason} — ${dt.invalidExplanation}`);
  }

  return {
    offsetHours: dt.offset / 60,  // luxon dá em minutos; convertemos pra horas
    ianaName: iana,
    isDST: dt.isInDST,
    offsetName: dt.offsetNameShort,
  };
}

// ----------------------------------------------------------------------------
// localToUT — converte data/hora locais para UT (Universal Time)
// ----------------------------------------------------------------------------
// Inputs:
//   year, month, day, hour, minute: data/hora locais
//   latitude, longitude: coordenadas do local
//   ianaOverride: (opcional) força um nome IANA específico
//
// Retorna:
//   {
//     year, month, day, hour, minute,  // todos em UT
//     offsetUsed,                       // offset que foi usado pra conversão
//     ianaName,                         // nome do timezone usado
//   }
// ----------------------------------------------------------------------------
export function localToUT(year, month, day, hour, minute, latitude, longitude, ianaOverride = null) {
  const iana = ianaOverride || resolveIANA(latitude, longitude);

  // Cria um DateTime no fuso local correto
  const localDT = DateTime.fromObject(
    { year, month, day, hour, minute },
    { zone: iana }
  );

  if (!localDT.isValid) {
    throw new Error(`Data inválida em ${iana}: ${localDT.invalidReason}`);
  }

  // Converte pra UTC
  const utcDT = localDT.toUTC();

  return {
    year: utcDT.year,
    month: utcDT.month,
    day: utcDT.day,
    hour: utcDT.hour,
    minute: utcDT.minute,
    offsetUsed: localDT.offset / 60,
    ianaName: iana,
    isDST: localDT.isInDST,
  };
}

// ----------------------------------------------------------------------------
// localToUTWithOffset — variante quando o offset é passado explicitamente
// ----------------------------------------------------------------------------
// Útil pra retro-compatibilidade ou casos onde o usuário fornece TZ manual.
// ----------------------------------------------------------------------------
export function localToUTWithOffset(year, month, day, hour, minute, offsetHours) {
  // Subtrair offset converte local pra UT (se offset = -3, UT = local - (-3) = local + 3)
  let h = hour - offsetHours;
  let m = minute;
  let d = day, mo = month, y = year;

  // Normalizar horas/dias
  while (h < 0) { h += 24; d -= 1; }
  while (h >= 24) { h -= 24; d += 1; }

  while (d < 1) {
    mo -= 1;
    if (mo < 1) { mo = 12; y -= 1; }
    d += daysInMonth(y, mo);
  }
  while (d > daysInMonth(y, mo)) {
    d -= daysInMonth(y, mo);
    mo += 1;
    if (mo > 12) { mo = 1; y += 1; }
  }

  return { year: y, month: mo, day: d, hour: h, minute: m };
}

function daysInMonth(year, month) {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [31,28,31,30,31,30,31,31,30,31,30,31][month - 1];
}
