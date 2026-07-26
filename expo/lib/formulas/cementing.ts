/**
 * Формулы цементирования обсадной колонны.
 * Портированы из инженерного веб-модуля — работают полностью офлайн.
 *
 * Поддерживает несколько цементных растворов (стадий) и несколько буферных
 * жидкостей, уровни скважины по вертикали (TVD) и проверку на ГРП/поглощение
 * по градиенту гидроразрыва с учётом гидростатики и потерь на трение.
 */

export interface CalcWarning {
  type: "error" | "warning";
  message: string;
}

/** Подъём давления при опрессовке после СТОП: 30 атм ≈ 2,94 МПа */
export const TEST_BUMP_MPA = 2.94;

/** Стадия цементного раствора. Порядок — сверху вниз (от устья цемента к башмаку). */
export interface CementStageInput {
  id: string;
  label: string;
  densityGcm3: number;
  waterRatio: number; // 0 → авто по таблице плотностей
  yieldPerTon: number; // выход раствора с 1 т цемента, м³/т (0 → авто по В/Ц)
  bottomMD: number; // подошва интервала стадии, м (последняя стадия — авто = башмак ОК)
}

/** Буферная (разделительная) жидкость. Порядок — от ближней к цементу к дальней (к устью). */
export interface SpacerInput {
  id: string;
  label: string;
  volumeM3: number;
  densityGcm3: number;
}

export interface CementingInput {
  casingDepthMD: number; // глубина спуска ОК (башмак) по стволу, м
  casingDepthTVD: number; // глубина башмака по вертикали (TVD), м
  wellTotalDepthMD: number; // забой скважины по стволу, м (0/не задано → = башмаку, запас отсутствует)
  holeDiameter: number; // диаметр долота, мм
  cavernCoeff: number; // коэффициент кавернозности
  casingOD: number; // наружный диаметр ОК, мм
  casingWall: number; // толщина стенки ОК, мм
  prevCasingDepth: number; // башмак предыдущей колонны, м
  prevCasingID: number; // внутренний диаметр предыдущей колонны, мм
  ckodDepth: number; // глубина установки ЦКОД, м
  cementTopMD: number; // уровень подъёма цемента (кровля верхней стадии), м
  mudDensity: number; // плотность бурового раствора (в затрубье выше буферов и исходно в трубе), г/см³
  displacementDensity?: number; // плотность продавочной жидкости, г/см³ (0/не задано → плотность бурового раствора)
  compressionCoeff: number; // коэффициент сжатия продавочной жидкости
  frictionMPa: number; // потери давления на трение в затрубье при циркуляции, МПа
  fracGradientGcm3: number; // градиент ГРП (эквивалент плотности), г/см³
  stages: CementStageInput[]; // сверху вниз
  spacers: SpacerInput[]; // от цемента к устью
}

export interface StageResult {
  id: string;
  label: string;
  topMD: number;
  bottomMD: number;
  volumeM3: number;
  dryMassTons: number;
  waterVolumeM3: number;
  waterCementRatio: number;
  yieldPerTon: number;
}

export interface SpacerResult {
  id: string;
  label: string;
  topMD: number;
  bottomMD: number;
  volumeM3: number;
  densityGcm3: number;
}

export interface ProfileSegment {
  topMD: number;
  bottomMD: number;
  densityGcm3: number;
  kind: "mud" | "spacer" | "stage";
  label: string;
}

export interface CementingResult {
  casingID: number; // мм
  pipeVolumePerMeter: number; // м³/м
  annularVolumePerMeterOpenHole: number; // м³/м
  annularVolumePerMeterInterCasing: number; // м³/м
  stages: StageResult[];
  spacers: SpacerResult[];
  totalAnnularVolume: number; // м³ (только цемент)
  plugVolume: number; // цементный стакан (ЦКОД → башмак), м³
  wellTotalDepthMD: number; // забой скважины (эффективный, ≥ башмака), м
  ratholeLengthM: number; // запас (башмак → забой), м
  ratholeVolumeM3: number; // объём открытого ствола ниже башмака (заполняется последней стадией цемента), м³
  totalSlurryVolume: number; // м³
  totalDryMassTons: number; // т
  totalWaterVolumeM3: number; // м³
  totalSpacerVolume: number; // м³
  displacementVolume: number; // м³
  displacementVolumeWithCompression: number; // м³
  profile: ProfileSegment[]; // затрубный столб сверху вниз, для графика и гидравлики
  tvdRatio: number; // TVD/MD (усреднённый по стволу)
  hydrostaticAtShoeMPa: number;
  hydrostaticAtCheckDepthMPa: number;
  pressureAtCheckDepthMPa: number; // гидростатика + трение на башмаке спущенной ОК
  fracturePressureMPa: number; // давление ГРП на башмаке спущенной ОК
  ecdAtCheckDepthGcm3: number;
  isFracRisk: boolean;
  stopPressureMPa: number; // давление на цементировочном агрегате в момент СТОП (с посадкой пробки), МПа
  bottomholeAtStopMPa: number; // давление на забое в конце продавки, МПа
  pressureBeforeStopMPa: number; // давление перед СТОП (динамика конца продавки, до посадки пробки), МПа
  testBumpMPa: number; // подъём давления для опрессовки (30 атм ≈ 2,94 МПа)
  testHoldPressureMPa: number; // давление выдержки при опрессовке (перед СТОП + 30 атм), МПа
  warnings: CalcWarning[];
}

/** Один шаг режима закачки: расход и объём, прокачиваемый на этом расходе. */
export interface FlowRateStep {
  id: string;
  rateLps: number; // л/с
  volumeM3: number; // м³
  label?: string; // название этапа (напр. имя стадии цемента)
  densityGcm3?: number; // плотность жидкости этапа (для цементов — плотность стадии)
  pvCp?: number; // пластическая вязкость этапа, сП (для цементов — своя реология на каждую стадию)
  ypPa?: number; // ДНС этапа, Па
}

/** Строка хронологии закачки: этап с объёмом, временем и накопленными итогами. */
export interface PumpStageRow {
  label: string;
  rateLps: number;
  volumeM3: number;
  densityGcm3: number;
  timeMin: number;
  cumVolumeM3: number;
  cumTimeMin: number;
}

/** Исходные данные режимов закачки (буфер / цементы / продавка) для расчёта давлений. */
export interface PumpScheduleInput {
  bufferSteps: FlowRateStep[];
  cementSteps: FlowRateStep[];
  displacementSteps: FlowRateStep[];
  mudPV: number;
  mudYP: number;
  bufferPV: number;
  bufferYP: number;
  cementPV: number; // реология цемента по умолчанию (если у стадии не задана своя pvCp/ypPa)
  cementYP: number;
  dispPV: number; // пластическая вязкость продавочной жидкости, сП
  dispYP: number; // ДНС продавочной жидкости, Па
}

export interface PumpSchedulePoint {
  volumeM3: number;
  timeMin: number;
  pumpPressureMPa: number;
  bottomholePressureMPa: number;
  fracturePressureMPa: number;
  rateLps: number; // текущая производительность закачки, л/с
  densityGcm3: number; // плотность закачиваемой жидкости, г/см³
  label: string;
}

export interface PumpScheduleResult {
  points: PumpSchedulePoint[];
  totalVolumeM3: number;
  totalTimeMin: number;
  finalPumpPressureMPa: number; // скачок СТОП (посадка пробки на ЦКОД)
  holdPressureMPa: number; // давление удержания после остановки насоса (U-tube + срез ЦКОД)
  pressureBeforeStopMPa: number; // давление на насосе перед СТОП (динамика последнего режима продавки)
  testBumpMPa: number; // подъём давления для опрессовки (30 атм ≈ 2,94 МПа)
  testHoldPressureMPa: number; // давление выдержки при опрессовке (перед СТОП + 30 атм)
  finalBottomholePressureMPa: number;
  fracturePressureAtBottomMPa: number;
  maxBottomholePressureMPa: number;
  maxPumpPressureMPa: number;
  isFracRiskAtBottom: boolean;
  bufferDensityGcm3: number;
  cementDensityGcm3: number;
  displacementDensityGcm3: number; // плотность продавочной жидкости, использованная в расчёте, г/см³
  annularFrictionAtEndMPa: number; // потери на трение в затрубье в конце продавки (для проверки на ГРП), МПа
  ecdMaxDynamicGcm3: number; // макс. ЭЦП на забое в процессе закачки (гидростатика + трение), г/см³
  ecdFinalStaticGcm3: number; // ЭЦП на забое в конце цементирования (статика после остановки насоса), г/см³
  scheduleRows: PumpStageRow[]; // хронология этапов закачки
}

interface FrictionResult {
  pressureMPa: number;
  reynolds: number;
}

/** Потери давления на трение (Бингамовская жидкость, ламинарный/переходный/турбулентный режим), МПа */
export function frictionLossBingham(
  rateLps: number,
  lengthM: number,
  dHydMm: number,
  pv: number,
  yp: number,
  densityGcm3: number,
  flowAreaM2?: number,
): FrictionResult {
  if (rateLps <= 0 || lengthM <= 0 || dHydMm <= 0) return { pressureMPa: 0, reynolds: 0 };
  const dHyd = dHydMm / 1000;
  const area = flowAreaM2 && flowAreaM2 > 0 ? flowAreaM2 : (Math.PI / 4) * dHyd * dHyd;
  const v = rateLps / 1000 / area;
  if (!(v > 0)) return { pressureMPa: 0, reynolds: 0 };
  const densityKgM3 = densityGcm3 * 1000;
  const pvPas = pv / 1000;
  const muEff = pvPas + (yp * dHyd) / (6 * v);
  const Re = muEff > 0 ? (densityKgM3 * v * dHyd) / muEff : 0;

  const frLam = (32 * pvPas * v * lengthM) / (dHyd * dHyd) / 1e6;
  const yieldTerm = (16 * yp * lengthM) / (3 * dHyd) / 1e6;
  const laminarLoss = frLam + yieldTerm;

  const f = 0.0791 / Math.pow(Math.max(Re, 100), 0.25);
  const turbulentLoss = (2 * f * densityKgM3 * v * v * lengthM) / dHyd / 1e6;

  if (Re < 2100) return { pressureMPa: laminarLoss, reynolds: Re };
  if (Re < 3000) {
    const blend = (Re - 2100) / 900;
    return { pressureMPa: laminarLoss * (1 - blend) + turbulentLoss * blend, reynolds: Re };
  }
  return { pressureMPa: turbulentLoss, reynolds: Re };
}

interface TrainItem {
  label: string;
  volumeM3: number;
  densityGcm3: number;
  pv: number;
  yp: number;
  rateLps: number;
}
interface CumTrainItem {
  item: TrainItem;
  cumStart: number;
  cumEnd: number;
}

function buildCumulative(items: TrainItem[]): CumTrainItem[] {
  let cum = 0;
  const out: CumTrainItem[] = [];
  for (const i of items) {
    if (i.volumeM3 <= 0) continue;
    const cumStart = cum;
    cum += i.volumeM3;
    out.push({ item: i, cumStart, cumEnd: cum });
  }
  return out;
}

function itemAt(cumItems: CumTrainItem[], level: number): TrainItem | null {
  if (cumItems.length === 0) return null;
  const l = Math.max(0, level);
  for (const c of cumItems) {
    if (l < c.cumEnd) return c.item;
  }
  return cumItems[cumItems.length - 1].item;
}

function avgDensityOverWindow(cumItems: CumTrainItem[], lo: number, hi: number): number {
  if (hi <= lo || cumItems.length === 0) return 0;
  let acc = 0;
  for (const c of cumItems) {
    const top = Math.max(c.cumStart, lo);
    const bottom = Math.min(c.cumEnd, hi);
    if (bottom > top) acc += c.item.densityGcm3 * (bottom - top);
  }
  return acc / (hi - lo);
}

/**
 * Расчёт давления на насосе и на забое по времени с учётом режимов закачки
 * (несколько ступеней расхода для буфера, цементов и продавки). Возвращает
 * временной профиль давлений плюс итоговые значения на момент окончания
 * цементирования (посадка пробки на ЦКОД).
 */
export function simulatePumpSchedule(input: CementingInput, sched: PumpScheduleInput): PumpScheduleResult | null {
  const bufferItems: TrainItem[] = sched.bufferSteps
    .filter((s) => s.volumeM3 > 0)
    .map((s) => ({ label: "Буфер", volumeM3: s.volumeM3, densityGcm3: 0, pv: sched.bufferPV, yp: sched.bufferYP, rateLps: s.rateLps }));
  // Каждая стадия цемента может иметь свою реологию (pvCp/ypPa); если не задана —
  // падает на общую реологию цемента (sched.cementPV/cementYP).
  const cementItems: TrainItem[] = sched.cementSteps
    .filter((s) => s.volumeM3 > 0)
    .map((s) => ({
      label: s.label ?? "Цемент",
      volumeM3: s.volumeM3,
      densityGcm3: s.densityGcm3 ?? 0,
      pv: s.pvCp ?? sched.cementPV,
      yp: s.ypPa ?? sched.cementYP,
      rateLps: s.rateLps,
    }));
  const dispDensity = input.displacementDensity && input.displacementDensity > 0 ? input.displacementDensity : input.mudDensity || 1;
  const dispItems: TrainItem[] = sched.displacementSteps
    .filter((s) => s.volumeM3 > 0)
    .map((s) => ({ label: "Продавка", volumeM3: s.volumeM3, densityGcm3: dispDensity, pv: sched.dispPV, yp: sched.dispYP, rateLps: s.rateLps }));

  if (bufferItems.length === 0 && cementItems.length === 0 && dispItems.length === 0) return null;

  // Согласование с основным расчётом: объёмы режимов приводятся к расчётным
  // объёмам буфера/цемента/продавки (пропорции ступеней сохраняются),
  // чтобы давления в конце продавки совпадали с проверкой на ГРП.
  const calc = calculateCementing(input);
  const scaleGroup = (items: TrainItem[], targetVol: number) => {
    const sum = items.reduce((a, i) => a + i.volumeM3, 0);
    if (sum <= 0 || targetVol <= 0) return;
    const k = targetVol / sum;
    for (const it of items) it.volumeM3 *= k;
  };
  scaleGroup(bufferItems, calc.totalSpacerVolume);
  scaleGroup(cementItems, calc.totalSlurryVolume);
  scaleGroup(dispItems, calc.displacementVolume);

  const totalSpacerVol = calc.totalSpacerVolume;
  const bufferDensityGcm3 = totalSpacerVol > 0
    ? input.spacers.reduce((a, s) => a + Math.max(0, s.volumeM3) * s.densityGcm3, 0) / totalSpacerVol
    : input.mudDensity || 1;
  const stageDensityById = new Map<string, number>(input.stages.map((s) => [s.id, s.densityGcm3]));
  const totalStageVol = calc.stages.reduce((a, s) => a + s.volumeM3, 0);
  const cementDensityGcm3 = totalStageVol > 0
    ? calc.stages.reduce((a, s) => a + s.volumeM3 * (stageDensityById.get(s.id) ?? 1.85), 0) / totalStageVol
    : 1.85;

  for (const it of bufferItems) it.densityGcm3 = bufferDensityGcm3;
  for (const it of cementItems) {
    if (!(it.densityGcm3 > 0)) it.densityGcm3 = cementDensityGcm3;
  }

  const trainItems: TrainItem[] = [...bufferItems, ...cementItems];
  const cumTrain = buildCumulative(trainItems);
  const trainTotal = cumTrain.length > 0 ? cumTrain[cumTrain.length - 1].cumEnd : 0;

  const allItems: TrainItem[] = [...trainItems, ...dispItems];
  const cumAll = buildCumulative(allItems);
  const totalVolumeM3 = cumAll.length > 0 ? cumAll[cumAll.length - 1].cumEnd : 0;
  if (totalVolumeM3 <= 0) return null;

  const casingID = getCasingID(input.casingOD, input.casingWall);
  const pipeVPM = pipeVolumePerMeter(casingID);
  const annVPM = annularVolumePerMeter(input.holeDiameter, input.casingOD, input.cavernCoeff);
  const interVPM = interCasingVolumePerMeter(input.prevCasingID, input.casingOD);
  const pipeCapacity = pipeVPM * input.casingDepthMD;
  // TVD не может превышать MD (длину ствола) — стухшее/ошибочное значение TVD зажимается,
  // иначе гидростатика завышается и перестаёт реагировать на изменение глубины.
  const effTVD = input.casingDepthTVD > 0 ? Math.min(input.casingDepthTVD, input.casingDepthMD) : input.casingDepthMD;
  const tvdRatio = input.casingDepthMD > 0 ? effTVD / input.casingDepthMD : 1;
  const tvdAt = (md: number) => Math.max(0, md) * tvdRatio;
  const mudDensity = input.mudDensity || 1;

  const annSegs: { topMD: number; bottomMD: number; densityGcm3: number }[] = [];
  let bottomCursor = input.casingDepthMD;
  for (let i = cumTrain.length - 1; i >= 0; i--) {
    const it = cumTrain[i].item;
    const top = topMDForVolume(bottomCursor, it.volumeM3, input.holeDiameter, input.casingOD, input.prevCasingID, input.prevCasingDepth, input.cavernCoeff);
    annSegs.push({ topMD: top, bottomMD: bottomCursor, densityGcm3: it.densityGcm3 });
    bottomCursor = top;
  }
  annSegs.reverse();

  const frontMDForExited = (exitedVol: number): number => {
    const e = Math.min(Math.max(0, exitedVol), trainTotal);
    if (e <= 0) return input.casingDepthMD;
    return topMDForVolume(input.casingDepthMD, e, input.holeDiameter, input.casingOD, input.prevCasingID, input.prevCasingDepth, input.cavernCoeff);
  };

  const annHydroAt = (exitedVol: number): number => {
    const front = frontMDForExited(exitedVol);
    let p = 0;
    for (const s of annSegs) {
      const top = Math.max(s.topMD, front);
      const bottom = Math.min(s.bottomMD, input.casingDepthMD);
      if (bottom > top) p += s.densityGcm3 * (tvdAt(bottom) - tvdAt(top)) * 0.00981;
    }
    p += mudDensity * tvdAt(front) * 0.00981;
    return p;
  };

  const pipeHydroAt = (v: number): number => {
    if (v <= 0) return mudDensity * effTVD * 0.00981;
    const lo = Math.max(0, v - pipeCapacity);
    const newAvg = avgDensityOverWindow(cumAll, lo, v);
    const avgDensity = v >= pipeCapacity ? newAvg : (newAvg * v + mudDensity * (pipeCapacity - v)) / pipeCapacity;
    return avgDensity * effTVD * 0.00981;
  };

  const openLen = Math.max(0, input.casingDepthMD - input.prevCasingDepth);
  const interLen = Math.max(0, Math.min(input.casingDepthMD, input.prevCasingDepth));
  const dHydOpen = Math.max(1, input.holeDiameter - input.casingOD);
  const dHydInter = Math.max(1, input.prevCasingID - input.casingOD);
  const ECCENTRICITY = 0.4;

  const frAnnAt = (exitedVol: number, rateLps: number): number => {
    const active = exitedVol <= 0
      ? { pv: sched.mudPV, yp: sched.mudYP, densityGcm3: mudDensity }
      : (itemAt(cumTrain, Math.min(exitedVol, trainTotal - 1e-9)) ?? { pv: sched.mudPV, yp: sched.mudYP, densityGcm3: mudDensity });
    const frOpen = frictionLossBingham(rateLps, openLen, dHydOpen, active.pv, active.yp, active.densityGcm3, annVPM);
    const frInter = frictionLossBingham(rateLps, interLen, dHydInter, active.pv, active.yp, active.densityGcm3, interVPM);
    return (frOpen.pressureMPa + frInter.pressureMPa) * ECCENTRICITY;
  };

  const frPipeAt = (v: number, rateLps: number): number => {
    const active = itemAt(cumAll, Math.min(v, totalVolumeM3 - 1e-9));
    const filledFraction = Math.min(1, v / (pipeCapacity || 1));
    const frNew = active ? frictionLossBingham(rateLps, input.casingDepthMD, casingID, active.pv, active.yp, active.densityGcm3) : { pressureMPa: 0, reynolds: 0 };
    const frMud = frictionLossBingham(rateLps, input.casingDepthMD, casingID, sched.mudPV, sched.mudYP, mudDensity);
    return frNew.pressureMPa * filledFraction + frMud.pressureMPa * (1 - filledFraction);
  };

  const fracturePressureAtBottomMPa = (input.fracGradientGcm3 || 0) * effTVD * 0.00981;

  const SUBSTEPS_PER_ITEM = 10;
  const points: PumpSchedulePoint[] = [];
  const scheduleRows: PumpStageRow[] = [];
  let cumV = 0;
  let cumTime = 0;
  let maxBHP = 0;
  let maxPump = 0;

  let lastSurfP = 0;

  points.push({ volumeM3: 0, timeMin: 0, pumpPressureMPa: 0, bottomholePressureMPa: annHydroAt(0), fracturePressureMPa: fracturePressureAtBottomMPa, rateLps: 0, densityGcm3: mudDensity, label: "Старт" });

  for (const c of cumAll) {
    const stepVol = c.cumEnd - c.cumStart;
    const rate = c.item.rateLps > 0 ? c.item.rateLps : 1;
    const dV = stepVol / SUBSTEPS_PER_ITEM;
    for (let k = 1; k <= SUBSTEPS_PER_ITEM; k++) {
      cumV = c.cumStart + dV * k;
      const exited = Math.max(0, cumV - pipeCapacity);
      const pipeHydro = pipeHydroAt(cumV);
      const annHydro = annHydroAt(exited);
      const frPipe = frPipeAt(cumV, rate);
      const frAnn = frAnnAt(exited, rate);
      const pumpP = Math.max(0, annHydro - pipeHydro + frPipe + frAnn);
      const bhp = annHydro + frAnn;
      cumTime += dV / (rate * 0.06);
      maxBHP = Math.max(maxBHP, bhp);
      maxPump = Math.max(maxPump, pumpP);
      lastSurfP = pumpP;
      points.push({ volumeM3: cumV, timeMin: cumTime, pumpPressureMPa: pumpP, bottomholePressureMPa: bhp, fracturePressureMPa: fracturePressureAtBottomMPa, rateLps: rate, densityGcm3: c.item.densityGcm3, label: c.item.label });
    }
    scheduleRows.push({
      label: c.item.label,
      rateLps: c.item.rateLps,
      volumeM3: stepVol,
      densityGcm3: c.item.densityGcm3,
      timeMin: stepVol / (rate * 0.06),
      cumVolumeM3: c.cumEnd,
      cumTimeMin: cumTime,
    });
  }

  // Макс. забойное давление в ПРОЦЕССЕ закачки (до СТОП) — для динамической ЭЦП
  const maxBHPDynamic = maxBHP;

  // Потери на трение в затрубье в конце продавки — для согласованной проверки на ГРП
  const lastRate = cumAll.length > 0 ? cumAll[cumAll.length - 1].item.rateLps : 0;
  const exitedFinal = Math.max(0, totalVolumeM3 - pipeCapacity);
  const annularFrictionAtEndMPa = frAnnAt(exitedFinal, lastRate > 0 ? lastRate : 1);

  // Статика после посадки пробки: скачок СТОП = max(динамика, U-tube) + срез ЦКОД;
  // удержание после остановки насоса = только U-tube + срез ЦКОД (как в исходном движке)
  const staticPipeHydro = pipeHydroAt(totalVolumeM3);
  const staticAnnHydro = annHydroAt(trainTotal);
  const uTubeDiff = Math.abs(staticAnnHydro - staticPipeHydro);
  // Давление нагнетания на пробку — всегда 30 атм (TEST_BUMP_MPA), это же давление
  // затем выдерживается при опрессовке (посадка пробки = опрессовка по величине).
  const stopSpikeMPa = Math.max(lastSurfP, uTubeDiff) + TEST_BUMP_MPA;
  const stopHoldMPa = stopSpikeMPa;
  const finalBottomholePressureMPa = staticAnnHydro;

  points.push({
    volumeM3: totalVolumeM3,
    timeMin: cumTime + 0.5,
    pumpPressureMPa: stopSpikeMPa,
    bottomholePressureMPa: finalBottomholePressureMPa,
    fracturePressureMPa: fracturePressureAtBottomMPa,
    rateLps: 0,
    densityGcm3: dispDensity,
    label: "СТОП (пробка в ЦКОД)",
  });
  points.push({
    volumeM3: totalVolumeM3,
    timeMin: cumTime + 5,
    pumpPressureMPa: stopHoldMPa,
    bottomholePressureMPa: finalBottomholePressureMPa,
    fracturePressureMPa: fracturePressureAtBottomMPa,
    rateLps: 0,
    densityGcm3: dispDensity,
    label: "СТОП (удержание)",
  });

  maxBHP = Math.max(maxBHP, finalBottomholePressureMPa);
  maxPump = Math.max(maxPump, stopSpikeMPa);

  // ЭЦП на забое: динамическая (макс. за закачку = гидростатика + трение) и
  // статическая в конце цементирования (насос остановлен, без трения — как в исходном движке).
  const bottomTVD = effTVD;
  const ecdMaxDynamicGcm3 = bottomTVD > 0 ? maxBHPDynamic / (0.00981 * bottomTVD) : 0;
  const ecdFinalStaticGcm3 = bottomTVD > 0 ? finalBottomholePressureMPa / (0.00981 * bottomTVD) : 0;

  return {
    points,
    totalVolumeM3,
    totalTimeMin: cumTime + 5,
    finalPumpPressureMPa: stopSpikeMPa,
    holdPressureMPa: stopHoldMPa,
    pressureBeforeStopMPa: lastSurfP,
    testBumpMPa: TEST_BUMP_MPA,
    testHoldPressureMPa: lastSurfP + TEST_BUMP_MPA,
    finalBottomholePressureMPa,
    fracturePressureAtBottomMPa,
    maxBottomholePressureMPa: maxBHP,
    maxPumpPressureMPa: maxPump,
    isFracRiskAtBottom: fracturePressureAtBottomMPa > 0 && maxBHP > fracturePressureAtBottomMPa,
    bufferDensityGcm3,
    cementDensityGcm3,
    displacementDensityGcm3: dispDensity,
    annularFrictionAtEndMPa,
    ecdMaxDynamicGcm3,
    ecdFinalStaticGcm3,
    scheduleRows,
  };
}

/** Внутренний диаметр ОК, мм */
export function getCasingID(casingOD: number, casingWall: number): number {
  return casingOD - 2 * casingWall;
}

/** Объём 1 м ствола по диаметру, м³/м */
export function wellVolumePerMeter(diameterMm: number): number {
  const d = diameterMm / 1000;
  return (Math.PI / 4) * d * d;
}

/** Объём 1 м кольцевого пространства в открытом стволе, м³/м: π/4·(Dскв²·Kк − Dок²) */
export function annularVolumePerMeter(holeDiamMm: number, casingODmm: number, cavCoeff: number): number {
  const dHole = holeDiamMm / 1000;
  const dCasing = casingODmm / 1000;
  return (Math.PI / 4) * (dHole * dHole * cavCoeff - dCasing * dCasing);
}

/** Объём 1 м открытого ствола ниже башмака ОК (без колонны), м³/м: π/4·Dскв²·Kк */
export function openHoleVolumePerMeter(holeDiamMm: number, cavCoeff: number): number {
  const dHole = holeDiamMm / 1000;
  return (Math.PI / 4) * dHole * dHole * cavCoeff;
}

/** Объём 1 м межтрубного пространства (пред. колонна × текущая ОК), м³/м */
export function interCasingVolumePerMeter(prevCasingIDmm: number, casingODmm: number): number {
  const d1 = prevCasingIDmm / 1000;
  const d2 = casingODmm / 1000;
  return (Math.PI / 4) * (d1 * d1 - d2 * d2);
}

/** Объём 1 м трубного пространства, м³/м */
export function pipeVolumePerMeter(casingIDmm: number): number {
  const d = casingIDmm / 1000;
  return (Math.PI / 4) * d * d;
}

/** Гидростатическое давление, МПа: ρ(г/см³)·H(м)·0.00981 */
export function hydrostaticPressure(densityGcm3: number, depthTVD: number): number {
  return densityGcm3 * depthTVD * 0.00981;
}

/** Таблица: плотность (кг/м³) → В/Ц (третья колонка) */
const DENSITY_TABLE: [number, number, number][] = [
  [1400, 1.706, 1.368], [1450, 1.517, 1.199], [1500, 1.365, 1.048],
  [1550, 1.241, 0.923], [1600, 1.138, 0.82], [1650, 1.05, 0.733],
  [1700, 0.975, 0.658], [1750, 0.91, 0.593], [1800, 0.853, 0.536],
  [1850, 0.803, 0.485], [1900, 0.758, 0.441], [1950, 0.718, 0.401],
  [2000, 0.683, 0.365],
];

/** В/Ц по плотности раствора (интерполяция по таблице) */
export function getWaterCementRatio(densityKgM3: number): number {
  for (let i = 0; i < DENSITY_TABLE.length - 1; i++) {
    if (densityKgM3 >= DENSITY_TABLE[i][0] && densityKgM3 <= DENSITY_TABLE[i + 1][0]) {
      const frac = (densityKgM3 - DENSITY_TABLE[i][0]) / (DENSITY_TABLE[i + 1][0] - DENSITY_TABLE[i][0]);
      return DENSITY_TABLE[i][2] + frac * (DENSITY_TABLE[i + 1][2] - DENSITY_TABLE[i][2]);
    }
  }
  if (densityKgM3 <= DENSITY_TABLE[0][0]) return DENSITY_TABLE[0][2];
  return DENSITY_TABLE[DENSITY_TABLE.length - 1][2];
}

export interface CementMassResult {
  dryMassTons: number;
  waterVolumeM3: number;
  waterCementRatio: number;
  yieldPerTon: number;
}

/**
 * Сухой цемент, вода и выход раствора.
 * Приоритет (как в исходном движке):
 * 1) задан выход раствора → масса = V / выход;
 * 2) задан В/Ц → масса = V·ρ / (1 + В/Ц);
 * 3) иначе — В/Ц из таблицы плотностей.
 */
export function calculateCement(slurryVolumeM3: number, densityGcm3: number, userWaterRatio?: number, userYieldPerTon?: number): CementMassResult {
  const densityKg = densityGcm3 * 1000;

  if (userYieldPerTon && userYieldPerTon > 0) {
    const dryMassTons = slurryVolumeM3 / userYieldPerTon;
    const wcr = userWaterRatio && userWaterRatio > 0 ? userWaterRatio : getWaterCementRatio(densityKg);
    const waterVolumeM3 = (dryMassTons * 1000 * wcr) / 1000;
    return { dryMassTons, waterVolumeM3, waterCementRatio: wcr, yieldPerTon: userYieldPerTon };
  }

  const wcr = userWaterRatio && userWaterRatio > 0 ? userWaterRatio : getWaterCementRatio(densityKg);
  const slurryMassKg = slurryVolumeM3 * densityKg;
  const dryMassKg = slurryMassKg / (1 + wcr);
  const dryMassTons = dryMassKg / 1000;
  const waterVolumeM3 = (dryMassKg * wcr) / 1000;
  const yieldPerTon = dryMassTons > 0 ? slurryVolumeM3 / dryMassTons : 0;
  return { dryMassTons, waterVolumeM3, waterCementRatio: wcr, yieldPerTon };
}

/**
 * Объём кольцевого пространства для интервала [mdTop, mdBottom]:
 * 0..prevCasingDepth — межтрубное, ниже — открытый ствол с кавернозностью.
 */
export function annularVolumeForInterval(
  mdTop: number,
  mdBottom: number,
  holeDiamMm: number,
  casingODmm: number,
  prevCasingIDmm: number,
  prevCasingDepth: number,
  cavernCoeff: number,
): number {
  const top = Math.max(mdTop, 0);
  const bot = Math.max(mdBottom, 0);
  if (bot <= top) return 0;
  const interVPM = interCasingVolumePerMeter(prevCasingIDmm, casingODmm);
  const prevLen = Math.max(0, Math.min(bot, prevCasingDepth) - top);
  const openLen = Math.max(0, bot - Math.max(top, prevCasingDepth));
  return interVPM * prevLen + annularVolumePerMeter(holeDiamMm, casingODmm, cavernCoeff) * openLen;
}

/**
 * Обратная задача: найти кровлю интервала (topMD) в затрубье по известному
 * объёму и подошве (используется для размещения буферов над цементом).
 */
export function topMDForVolume(
  bottomMD: number,
  volumeM3: number,
  holeDiamMm: number,
  casingODmm: number,
  prevCasingIDmm: number,
  prevCasingDepth: number,
  cavernCoeff: number,
): number {
  if (volumeM3 <= 0) return bottomMD;
  const annVPM = annularVolumePerMeter(holeDiamMm, casingODmm, cavernCoeff);
  const interVPM = interCasingVolumePerMeter(prevCasingIDmm, casingODmm);
  let remaining = volumeM3;
  let bottom = bottomMD;

  if (bottom > prevCasingDepth && annVPM > 0) {
    const openLen = bottom - prevCasingDepth;
    const openCapacity = openLen * annVPM;
    if (remaining <= openCapacity) {
      return bottom - remaining / annVPM;
    }
    remaining -= openCapacity;
    bottom = Math.max(0, prevCasingDepth);
  }

  if (interVPM > 0) {
    return Math.max(0, bottom - remaining / interVPM);
  }
  return Math.max(0, bottom - remaining / (annVPM || 1));
}

/** Полный расчёт объёмов, масс и гидравлики цементирования (многостадийное) */
export function calculateCementing(input: CementingInput): CementingResult {
  const warnings: CalcWarning[] = [];

  const casingID = getCasingID(input.casingOD, input.casingWall);
  const pipeVPM = pipeVolumePerMeter(casingID);
  const annVPM = annularVolumePerMeter(input.holeDiameter, input.casingOD, input.cavernCoeff);
  const interVPM = interCasingVolumePerMeter(input.prevCasingID, input.casingOD);

  if (input.casingOD >= input.holeDiameter) {
    warnings.push({ type: "error", message: "Наружный диаметр ОК больше или равен диаметру долота — проверьте исходные данные." });
  }
  if (input.prevCasingDepth > 0 && input.casingOD >= input.prevCasingID) {
    warnings.push({ type: "error", message: "ОК не проходит в предыдущую колонну: наружный диаметр ≥ внутреннего диаметра предыдущей ОК." });
  }
  if (input.cementTopMD >= input.casingDepthMD) {
    warnings.push({ type: "error", message: "Уровень подъёма цемента должен быть выше башмака ОК." });
  }
  if (input.ckodDepth > input.casingDepthMD) {
    warnings.push({ type: "warning", message: "ЦКОД ниже башмака ОК — глубина ЦКОД ограничена башмаком." });
  }
  if (input.prevCasingDepth > input.casingDepthMD) {
    warnings.push({ type: "warning", message: "Башмак предыдущей колонны ниже башмака текущей ОК — проверьте данные." });
  }
  if (input.casingDepthTVD > input.casingDepthMD + 0.001) {
    warnings.push({ type: "warning", message: "TVD больше глубины по стволу (MD) — физически невозможно. В расчёте принято TVD = MD." });
  }
  if (input.wellTotalDepthMD > 0 && input.wellTotalDepthMD < input.casingDepthMD - 0.001) {
    warnings.push({ type: "warning", message: "Забой выше башмака ОК — колонна не может быть спущена ниже забоя. В расчёте запас принят равным нулю." });
  }

  // --- Стадии цементного раствора: сверху вниз, последняя стадия жёстко у башмака ---
  const rawStages = input.stages.length > 0 ? input.stages : [];
  const stageBoundaries: number[] = [];
  let prevBottom = Math.min(Math.max(input.cementTopMD, 0), input.casingDepthMD);
  for (let i = 0; i < rawStages.length; i++) {
    const isLast = i === rawStages.length - 1;
    let bottom = isLast ? input.casingDepthMD : rawStages[i].bottomMD;
    bottom = Math.min(Math.max(bottom, prevBottom), input.casingDepthMD);
    if (bottom <= prevBottom && !isLast) {
      warnings.push({ type: "warning", message: `Граница стадии «${rawStages[i].label}» задана некорректно — интервалы стадий скорректированы.` });
      bottom = prevBottom;
    }
    stageBoundaries.push(bottom);
    prevBottom = bottom;
  }

  const ckod = Math.min(Math.max(0, input.ckodDepth), input.casingDepthMD);
  const plugVolume = ckod > 0 ? pipeVPM * (input.casingDepthMD - ckod) : 0;

  // --- Запас (хвостовик): ОК никогда не спускают до самого забоя — открытый
  // ствол ниже башмака (без колонны) тоже заполняется цементом последней стадии —
  // этот объём добавляется к последней стадии, чтобы объём цемента и схема скважины были верными.
  const wellTotalDepthMD = input.wellTotalDepthMD > 0 ? Math.max(input.wellTotalDepthMD, input.casingDepthMD) : input.casingDepthMD;
  const ratholeLengthM = Math.max(0, wellTotalDepthMD - input.casingDepthMD);
  const ratholeVolumeM3 = ratholeLengthM > 0 ? openHoleVolumePerMeter(input.holeDiameter, input.cavernCoeff) * ratholeLengthM : 0;

  const stageResults: StageResult[] = [];
  let topCursor = Math.min(Math.max(input.cementTopMD, 0), input.casingDepthMD);
  let totalDryMassTons = 0;
  let totalWaterVolumeM3 = 0;
  let totalAnnularVolume = 0;

  for (let i = 0; i < rawStages.length; i++) {
    const bottomMD = stageBoundaries[i];
    const isLastStage = i === rawStages.length - 1;
    const annVolume = annularVolumeForInterval(
      topCursor,
      bottomMD,
      input.holeDiameter,
      input.casingOD,
      input.prevCasingID,
      input.prevCasingDepth,
      input.cavernCoeff,
    );
    const extraPlug = isLastStage ? plugVolume : 0;
    const extraRathole = isLastStage ? ratholeVolumeM3 : 0;
    const stageVolume = annVolume + extraPlug + extraRathole;
    const cement = calculateCement(stageVolume, rawStages[i].densityGcm3, rawStages[i].waterRatio, rawStages[i].yieldPerTon);

    stageResults.push({
      id: rawStages[i].id,
      label: rawStages[i].label,
      topMD: topCursor,
      bottomMD,
      volumeM3: stageVolume,
      dryMassTons: cement.dryMassTons,
      waterVolumeM3: cement.waterVolumeM3,
      waterCementRatio: cement.waterCementRatio,
      yieldPerTon: cement.yieldPerTon,
    });

    totalAnnularVolume += annVolume;
    totalDryMassTons += cement.dryMassTons;
    totalWaterVolumeM3 += cement.waterVolumeM3;
    topCursor = bottomMD;
  }

  const totalSlurryVolume = totalAnnularVolume + plugVolume;

  // --- Буферные жидкости: располагаются над кровлей цемента, друг над другом ---
  const spacerResults: SpacerResult[] = [];
  let stackBottom = Math.min(Math.max(input.cementTopMD, 0), input.casingDepthMD);
  let totalSpacerVolume = 0;
  for (const sp of input.spacers) {
    const volume = Math.max(0, sp.volumeM3);
    const topMD = topMDForVolume(
      stackBottom,
      volume,
      input.holeDiameter,
      input.casingOD,
      input.prevCasingID,
      input.prevCasingDepth,
      input.cavernCoeff,
    );
    spacerResults.push({ id: sp.id, label: sp.label, topMD, bottomMD: stackBottom, volumeM3: volume, densityGcm3: sp.densityGcm3 });
    totalSpacerVolume += volume;
    stackBottom = topMD;
  }

  const displacementVolume = pipeVPM * (ckod > 0 ? ckod : input.casingDepthMD);
  const safeComp = Math.max(input.compressionCoeff || 1, 1);

  // --- Профиль затрубного столба (сверху вниз) для графика и гидравлики ---
  const profile: ProfileSegment[] = [];
  const topOfTrain = spacerResults.length > 0 ? spacerResults[spacerResults.length - 1].topMD : Math.min(Math.max(input.cementTopMD, 0), input.casingDepthMD);
  if (topOfTrain > 0) {
    profile.push({ topMD: 0, bottomMD: topOfTrain, densityGcm3: input.mudDensity || 1, kind: "mud", label: "Буровой раствор" });
  }
  for (let i = spacerResults.length - 1; i >= 0; i--) {
    const s = spacerResults[i];
    if (s.bottomMD > s.topMD) profile.push({ topMD: s.topMD, bottomMD: s.bottomMD, densityGcm3: s.densityGcm3, kind: "spacer", label: s.label });
  }
  for (const st of stageResults) {
    if (st.bottomMD > st.topMD) profile.push({ topMD: st.topMD, bottomMD: st.bottomMD, densityGcm3: rawStages.find((r) => r.id === st.id)?.densityGcm3 ?? input.mudDensity, kind: "stage", label: st.label });
  }

  // --- TVD и гидравлика: TVD зажимается сверху длиной ствола (TVD ≤ MD) ---
  const effTVD = input.casingDepthTVD > 0 ? Math.min(input.casingDepthTVD, input.casingDepthMD) : input.casingDepthMD;
  const tvdRatio = input.casingDepthMD > 0 ? effTVD / input.casingDepthMD : 1;
  const tvdAt = (md: number) => Math.max(0, md) * tvdRatio;

  const pressureAt = (depthMD: number): number => {
    const depth = Math.min(Math.max(depthMD, 0), input.casingDepthMD);
    let p = 0;
    for (const seg of profile) {
      const top = Math.min(seg.topMD, depth);
      const bottom = Math.min(seg.bottomMD, depth);
      if (bottom > top) {
        p += seg.densityGcm3 * (tvdAt(bottom) - tvdAt(top)) * 0.00981;
      }
    }
    return p;
  };

  // Проверка на ГРП — на башмаке СПУЩЕННОЙ колонны (как в исходном движке)
  const hydrostaticAtShoeMPa = pressureAt(input.casingDepthMD);
  const checkDepth = input.casingDepthMD;
  const hydrostaticAtCheckDepthMPa = hydrostaticAtShoeMPa;
  const pressureAtCheckDepthMPa = hydrostaticAtCheckDepthMPa + Math.max(0, input.frictionMPa || 0);
  const fracturePressureMPa = (input.fracGradientGcm3 || 0) * tvdAt(checkDepth) * 0.00981;
  const checkTVD = tvdAt(checkDepth);
  const ecdAtCheckDepthGcm3 = checkTVD > 0 ? pressureAtCheckDepthMPa / (0.00981 * checkTVD) : 0;
  const isFracRisk = input.fracGradientGcm3 > 0 && pressureAtCheckDepthMPa > fracturePressureMPa;

  if (isFracRisk) {
    warnings.push({ type: "error", message: "Расчётное давление на башмаке ОК превышает давление ГРП — риск поглощения/гидроразрыва пласта." });
  }

  // Давление в конце продавки (СТОП): U-tube дифференциал + трение.
  // Давление нагнетания на пробку (посадка на ЦКОД) всегда фиксировано — 30 атм
  // (TEST_BUMP_MPA). Это же самое давление затем выдерживают 15 минут при опрессовке
  // колонны — поэтому давление посадки пробки и давление опрессовки — одна и та же величина.
  const dispDensityCalc = input.displacementDensity && input.displacementDensity > 0 ? input.displacementDensity : input.mudDensity || 1;
  const lastStageDensity = rawStages.length > 0 ? rawStages[rawStages.length - 1].densityGcm3 : input.mudDensity || 1;
  const ckodForStop = ckod > 0 ? ckod : input.casingDepthMD;
  const staticPipeHydro =
    dispDensityCalc * tvdAt(ckodForStop) * 0.00981 +
    lastStageDensity * (tvdAt(input.casingDepthMD) - tvdAt(ckodForStop)) * 0.00981;
  const uTubeDiff = Math.abs(hydrostaticAtShoeMPa - staticPipeHydro);
  const pressureBeforeStopMPa = uTubeDiff + Math.max(0, input.frictionMPa || 0);
  const stopPressureMPa = pressureBeforeStopMPa + TEST_BUMP_MPA;
  const testHoldPressureMPa = stopPressureMPa;
  const bottomholeAtStopMPa = hydrostaticAtShoeMPa;

  return {
    casingID,
    pipeVolumePerMeter: pipeVPM,
    annularVolumePerMeterOpenHole: annVPM,
    annularVolumePerMeterInterCasing: interVPM,
    stages: stageResults,
    spacers: spacerResults,
    totalAnnularVolume,
    plugVolume,
    wellTotalDepthMD,
    ratholeLengthM,
    ratholeVolumeM3,
    totalSlurryVolume,
    totalDryMassTons,
    totalWaterVolumeM3,
    totalSpacerVolume,
    displacementVolume,
    displacementVolumeWithCompression: displacementVolume * safeComp,
    profile,
    tvdRatio,
    hydrostaticAtShoeMPa,
    hydrostaticAtCheckDepthMPa,
    pressureAtCheckDepthMPa,
    fracturePressureMPa,
    ecdAtCheckDepthGcm3,
    isFracRisk,
    stopPressureMPa,
    bottomholeAtStopMPa,
    pressureBeforeStopMPa,
    testBumpMPa: TEST_BUMP_MPA,
    testHoldPressureMPa,
    warnings,
  };
}
