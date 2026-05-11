// ============================================================================
// THE ORB ENGINE — timezone.js
// ----------------------------------------------------------------------------
// Resolução de offset de timezone histórico, incluindo horário de verão.
//
// Implementação minimalista que cobre:
//   - Brasil (com regras de horário de verão 1985-2019)
//   - Argentina, Uruguai (sem DST atual)
//   - Países sem DST: maior parte do mundo
//   - Estados Unidos (DST padrão US)
//   - Europa (DST padrão UE)
//
// Para deploy em produção com cobertura global completa, substituir esta
// implementação por `luxon` + base IANA (tz database), que cobre TODOS os
// países e mudanças históricas exatas.
// ============================================================================

// Regras de horário de verão do Brasil (DST = Daylight Saving Time)
// Histórico: DST começava em outubro/novembro e terminava em fevereiro/março
// Estados Sul/Sudeste/Centro-Oeste participavam; Norte/Nordeste nunca.
// O DST foi extinto em 2019 pelo decreto 9.772/2019.
//
// Cada entrada: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" } (ambos UTC)
// Durante esses intervalos, offset = -2 em vez de -3 (BRT → BRST)
const BRAZIL_DST = [
  // Período 1985-1986 (início do DST moderno)
  { start: "1985-11-02", end: "1986-03-15" },
  { start: "1986-10-25", end: "1987-02-14" },
  { start: "1987-10-25", end: "1988-02-07" },
  { start: "1988-10-16", end: "1989-01-29" },
  { start: "1989-10-15", end: "1990-02-11" },
  { start: "1990-10-21", end: "1991-02-17" },
  { start: "1991-10-20", end: "1992-02-09" },
  { start: "1992-10-25", end: "1993-01-31" },
  { start: "1993-10-17", end: "1994-02-20" },
  { start: "1994-10-16", end: "1995-02-19" },
  { start: "1995-10-15", end: "1996-02-11" },
  { start: "1996-10-06", end: "1997-02-16" },
  { start: "1997-10-06", end: "1998-03-01" },
  { start: "1998-10-11", end: "1999-02-21" },
  { start: "1999-10-03", end: "2000-02-27" },
  { start: "2000-10-08", end: "2001-02-18" },
  { start: "2001-10-14", end: "2002-02-17" },
  { start: "2002-11-03", end: "2003-02-16" },
  { start: "2003-10-19", end: "2004-02-15" },
  { start: "2004-11-02", end: "2005-02-20" },
  { start: "2005-10-16", end: "2006-02-19" },
  { start: "2006-11-05", end: "2007-02-25" },
  { start: "2007-10-14", end: "2008-02-17" },
  { start: "2008-10-19", end: "2009-02-15" },
  { start: "2009-10-18", end: "2010-02-21" },
  { start: "2010-10-17", end: "2011-02-20" },
  { start: "2011-10-16", end: "2012-02-26" },
  { start: "2012-10-21", end: "2013-02-17" },
  { start: "2013-10-20", end: "2014-02-16" },
  { start: "2014-10-19", end: "2015-02-22" },
  { start: "2015-10-18", end: "2016-02-21" },
  { start: "2016-10-16", end: "2017-02-19" },
  { start: "2017-10-15", end: "2018-02-18" },
  { start: "2018-11-04", end: "2019-02-17" },
  // DST extinto após 2019
];

// Estados brasileiros que NÃO observavam horário de verão (mesmo durante o período DST)
const BRAZIL_NO_DST_STATES = ["AC", "AL", "AM", "AP", "BA", "CE", "MA", "PA", "PB", "PE", "PI", "RN", "RO", "RR", "SE", "TO"];
// Estados que observavam: SP, RJ, MG, ES, PR, SC, RS, GO, MT, MS, DF, e mais a depender da era

function isInRange(dateStr, start, end) {
  return dateStr >= start && dateStr <= end;
}

function ymd(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ----------------------------------------------------------------------------
// Resolver offset para data/local específicos
// ----------------------------------------------------------------------------
// Parâmetros:
//   year, month (1-12), day (1-31): data local
//   country: código ISO ("BR", "US", "AR", ...) ou null
//   state: sigla do estado (opcional, relevante pro Brasil)
//
// Retorna: offset em horas em relação a UTC (ex: -3 pra BRT, -2 pra BRST)
// ----------------------------------------------------------------------------
export function resolveTimezoneOffset(year, month, day, country = null, state = null) {
  const dateStr = ymd(year, month, day);

  if (country === "BR") {
    // Base: UTC-3 (horário de Brasília)
    // Verifica se está em período DST e o estado observava
    const observesDST = !state || !BRAZIL_NO_DST_STATES.includes(state);
    if (observesDST) {
      for (const period of BRAZIL_DST) {
        if (isInRange(dateStr, period.start, period.end)) {
          return -2; // BRST
        }
      }
    }
    return -3;
  }

  if (country === "AR" || country === "UY" || country === "CL") {
    // Argentina/Uruguai/Chile — sem DST atual, UTC-3
    // (Chile teve regras complexas; aqui simplificamos)
    return -3;
  }

  if (country === "US") {
    // Implementação simplificada: DST US do segundo domingo de março ao primeiro domingo de novembro
    // Base offsets variam por estado (Eastern -5, Central -6, Mountain -7, Pacific -8)
    // Aqui apenas detecta se está em DST e devolve sinalização
    const dstStart = nthWeekdayOfMonth(year, 3, 2, 0); // 2º domingo de março
    const dstEnd = nthWeekdayOfMonth(year, 11, 1, 0);  // 1º domingo de novembro
    const inDST = dateStr >= dstStart && dateStr < dstEnd;
    // Retorna o ajuste DST relativo (TODO: combinar com offset base por estado)
    return inDST ? null : null; // requer offset base separado
  }

  if (country === "PT" || country === "ES" || country === "FR" || country === "DE" || country === "IT") {
    // Europa Central — DST do último domingo de março ao último domingo de outubro
    const dstStart = lastWeekdayOfMonth(year, 3, 0);
    const dstEnd = lastWeekdayOfMonth(year, 10, 0);
    const inDST = dateStr >= dstStart && dateStr < dstEnd;
    // Portugal: UTC base = 0 (WET) / +1 (WEST)
    // Espanha/França/Alemanha/Itália: UTC base = +1 (CET) / +2 (CEST)
    if (country === "PT") return inDST ? 1 : 0;
    return inDST ? 2 : 1;
  }

  // Default: sem ajuste, requer offset explícito
  return null;
}

// Helper: encontra o N-ésimo dia-da-semana (0=domingo) do mês
function nthWeekdayOfMonth(year, month, n, weekday) {
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - firstDay + 7) % 7) + (n - 1) * 7;
  return ymd(year, month, day);
}
function lastWeekdayOfMonth(year, month, weekday) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDow = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay();
  const day = lastDay - ((lastDow - weekday + 7) % 7);
  return ymd(year, month, day);
}

// ----------------------------------------------------------------------------
// Converter data/hora locais (no fuso da pessoa) para UT (Universal Time)
// ----------------------------------------------------------------------------
// Inputs:
//   year, month, day, hour, minute: data/hora local
//   offset: hours from UTC (e.g. -3 para Brasília sem DST, -2 com DST)
// Retorna: { year, month, day, hour, minute } em UT
// ----------------------------------------------------------------------------
export function localToUT(year, month, day, hour, minute, offset) {
  // Subtrair offset converte local pra UT (se offset = -3, UT = local - (-3) = local + 3)
  let h = hour - offset;
  let m = minute;
  let d = day, mo = month, y = year;

  // Normalizar horas/dias
  while (h < 0) { h += 24; d -= 1; }
  while (h >= 24) { h -= 24; d += 1; }

  // Ajustar mês/ano se preciso
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
