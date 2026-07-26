/**
 * Сбалансированный цементный мост — формулы установки.
 * Портированы из инженерного веб-модуля (движок cement-plug-calculations):
 * объёмы/массы через выход раствора и В/Ц, вязкая пачка отдельной стадией,
 * порядок работ с временами, прямая/обратная промывка после подъёма.
 */

import { calculateCement, type CalcWarning } from "@/lib/formulas/cementing";

export type WashType = "direct" | "reverse";

export interface PlugInput {
  plugTopMD: number; // кровля моста, м
  plugBottomMD: number; // подошва моста, м
  boreDiameter: number; // диаметр ствола / внутр. диаметр ЭК, мм
  cavernCoeff: number; // 1.0 в колонне; >1 в открытом стволе
  pipeOD: number; // наружный диаметр НКТ/БТ, мм
  pipeID: number; // внутренний диаметр НКТ/БТ, мм

  cementDensity: number; // плотность ЦР, г/см³
  wcRatio: number; // В/Ц (0 — авто по таблице плотностей, как в цементировании)
  slurryYield: number; // выход раствора, м³/т (0 — авто по В/Ц)
  spacerDensity: number; // плотность буфера, г/см³
  wellFluidDensity: number; // плотность скважинной жидкости (в затрубье), г/см³
  displacementDensity?: number; // плотность продавочной жидкости (в трубе), г/см³ (0/не задано → скважинная жидкость)

  spacerAboveM3: number; // буферная жидкость над цементом, м³

  useViscousPad: boolean; // нижняя вязкая пачка
  padVolumeM3: number; // объём вязкой пачки, м³
  padDensity: number; // плотность пачки, г/см³
  padPullUpAboveM: number; // подъём над пачкой перед обратной промывкой, м

  pullOutAbovePlugM: number; // подъём инструмента над кровлей моста, м
  washType: WashType; // прямая / обратная промывка (срезка)
  washCycles: number; // количество циклов промывки
  tripSpeedMs: number; // скорость СПО, м/с

  pumpRateCementLs: number; // подача при закачке ЦР, л/с
  pumpRateSpacerLs: number; // подача при закачке буфера, л/с
  pumpRateDisplacementLs: number; // подача при продавке, л/с
  pumpRateWashLs: number; // подача при промывке, л/с
  thickeningTimeMin: number; // время загустевания ЦР, мин
}

export interface PumpingStage {
  name: string;
  fluid: string;
  volumeM3: number;
  timeMin: number;
  description: string;
}

export interface PlugResult {
  boreDiamUsed: number; // мм (с учётом кавернозности)
  annAreaM2: number;
  pipeAreaM2: number;
  plugLengthM: number;

  cementVolumeTotal: number; // м³
  cementVolumeAnnulus: number; // м³
  cementVolumePipe: number; // м³
  dryCementTons: number; // т (V / выход)
  waterVolumeM3: number; // м³ (масса × В/Ц)
  placementHeightM: number; // высота столба ЦР при установке (труба в скважине)
  extraHeightM: number; // превышение над проектной длиной моста
  cementTopPlacementMD: number; // верх ЦР при установке, м

  spacerAboveHeightM: number;
  spacerAboveTopMD: number; // верх буфера при установке, м
  spacerWashHeightM: number; // высота буфера на мосту после подъёма (полное сечение), м

  padHeightM: number; // высота вязкой пачки, м
  padBottomMD: number; // подошва пачки, м
  padDisplacementVolume: number; // м³
  reverseFlushVolume: number; // м³ (очистка труб после пачки)

  displacementVolume: number; // м³

  pullOutDepthMD: number; // глубина инструмента после подъёма, м
  washOneCycleVolume: number; // м³
  washVolumeM3: number; // м³ (все циклы)
  washTimeMin: number;

  pumpingStages: PumpingStage[];
  totalOperationTimeMin: number;
  cementContactTimeMin: number; // закачка ЦР + буфер (труба) + продавка
  safeTime75Min: number; // 75% от времени загустевания
  isTimeSafe: boolean;
  balancePressureMPa: number; // гидростатика на подошве моста со стороны затрубья, МПа
  pipeSidePressureMPa: number; // гидростатика на подошве моста со стороны трубы (с продавкой), МПа
  imbalanceMPa: number; // разбаланс труба − затрубье из-за разных плотностей, МПа
  displacementDensityUsed: number; // плотность продавки, принятая в расчёте, г/см³
  warnings: CalcWarning[];
}

function area(diameterMm: number): number {
  const d = diameterMm / 1000;
  return (Math.PI / 4) * d * d;
}

const volToMin = (volM3: number, qLs: number) => (qLs > 0 ? (volM3 * 1000) / qLs / 60 : 0);

export function calculateBalancedPlug(input: PlugInput): PlugResult {
  const warnings: CalcWarning[] = [];

  const cavern = Math.max(1, input.cavernCoeff || 1);
  const boreDiam = input.boreDiameter * Math.sqrt(cavern);
  const boreArea = area(boreDiam);
  const annArea = Math.max(0, boreArea - area(input.pipeOD));
  const pipeArea = area(input.pipeID);
  const combinedArea = annArea + pipeArea;
  const plugLen = Math.max(0, input.plugBottomMD - input.plugTopMD);

  if (input.plugBottomMD <= input.plugTopMD) {
    warnings.push({ type: "error", message: "Подошва моста должна быть глубже кровли." });
  }
  if (input.pipeOD >= boreDiam) {
    warnings.push({ type: "error", message: "Наружный диаметр труб больше или равен диаметру ствола." });
  }
  if (input.pipeID >= input.pipeOD) {
    warnings.push({ type: "error", message: "Внутренний диаметр труб не может быть больше наружного." });
  }

  // Проектный объём моста после извлечения труб: Vцр = Sствола · Lмоста
  const cementVolTotal = boreArea * plugLen;

  // Высота при установке: цемент занимает затрубье и трубу одновременно —
  // стенки инструмента вытесняют цемент выше проектной кровли.
  const placementHeight = combinedArea > 0 ? cementVolTotal / combinedArea : 0;
  const extraHeight = placementHeight - plugLen;
  const cementVolAnn = annArea * placementHeight;
  const cementVolPipe = pipeArea * placementHeight;
  const cementTopPlacementMD = input.plugBottomMD - placementHeight;

  // Материалы: та же автоматика, что и в модуле «Цементирование ОК» — если выход раствора
  // задан, масса = V / выход; иначе В/Ц (заданное или авто по таблице плотностей).
  const cementCalc = calculateCement(cementVolTotal, input.cementDensity, input.wcRatio, input.slurryYield);
  const dryCementTons = cementCalc.dryMassTons;
  const waterVolumeM3 = cementCalc.waterVolumeM3;

  // Верхний буфер: одинаковая высота в трубе и затрубье (условие баланса)
  const spacerAboveHeight = combinedArea > 0 ? input.spacerAboveM3 / combinedArea : 0;
  const spacerAboveVolAnn = annArea * spacerAboveHeight;
  const spacerAboveVolPipe = pipeArea * spacerAboveHeight;
  const spacerAboveTopMD = cementTopPlacementMD - spacerAboveHeight;
  // После подъёма и срезки буфер ложится на мост полным сечением
  const spacerWashHeight = boreArea > 0 ? input.spacerAboveM3 / boreArea : 0;

  // Вязкая пачка: сбалансированный столб НИЖЕ подошвы моста, отдельная операция до цемента
  const usePad = input.useViscousPad && input.padVolumeM3 > 0;
  const padHeight = usePad && combinedArea > 0 ? input.padVolumeM3 / combinedArea : 0;
  const padBottomMD = input.plugBottomMD + padHeight;
  const padDisplacementVolume = usePad ? pipeArea * input.plugBottomMD : 0;
  const padPullUp = usePad ? Math.max(input.padPullUpAboveM || 5, 1) : 0;
  const padPullUpMD = usePad ? Math.max(0, input.plugBottomMD - padPullUp) : input.plugBottomMD;
  const reverseFlushVolume = usePad ? pipeArea * padPullUpMD : 0;

  // Продавка: внутренний объём труб от устья до верха буфера над цементом
  const displacementVolume = pipeArea * Math.max(0, spacerAboveTopMD);

  // Подъём и промывка (срезка)
  const pullOutDepthMD = Math.max(0, input.plugTopMD - Math.max(0, input.pullOutAbovePlugM));
  const tripDistance = Math.max(0, input.plugBottomMD - pullOutDepthMD);
  const tripSpeed = input.tripSpeedMs > 0 ? input.tripSpeedMs : 0.3;
  const tripTimeMin = tripDistance / tripSpeed / 60;

  const washCycles = Math.max(1, Math.round(input.washCycles || 1));
  // Прямая промывка — вытесняем затрубье; обратная — внутренний объём труб
  const washOneCycleVolume = input.washType === "direct" ? annArea * pullOutDepthMD : pipeArea * pullOutDepthMD;
  const washVolumeM3 = washOneCycleVolume * washCycles;
  const washTimeMin = volToMin(washVolumeM3, input.pumpRateWashLs);
  const washTypeText = input.washType === "direct" ? "прямая" : "обратная";

  // ── Порядок работ ──
  const stages: PumpingStage[] = [];
  const dispDensity = input.displacementDensity && input.displacementDensity > 0 ? input.displacementDensity : input.wellFluidDensity;
  const spacerFluid = `Буфер (${input.spacerDensity} г/см³)`;
  const cementFluid = `ЦР (${input.cementDensity} г/см³)`;
  const wellFluid = `Скваж. жидкость (${input.wellFluidDensity} г/см³)`;
  const dispFluid = `Продавка (${dispDensity} г/см³)`;

  if (usePad) {
    const padTripUpMin = padPullUp / tripSpeed / 60;
    stages.push({
      name: "Закачка вязкой пачки",
      fluid: `Вязкая пачка (${input.padDensity} г/см³)`,
      volumeM3: input.padVolumeM3,
      timeMin: volToMin(input.padVolumeM3, input.pumpRateSpacerLs),
      description: `Столб ${padHeight.toFixed(1)} м ниже подошвы моста (${input.plugBottomMD.toFixed(0)}–${padBottomMD.toFixed(0)} м)`,
    });
    stages.push({
      name: "Продавка вязкой пачки",
      fluid: dispFluid,
      volumeM3: padDisplacementVolume,
      timeMin: volToMin(padDisplacementVolume, input.pumpRateDisplacementLs),
      description: "До равновесия пачки в трубе и затрубье",
    });
    stages.push({
      name: "Подъём над пачкой",
      fluid: "—",
      volumeM3: 0,
      timeMin: padTripUpMin,
      description: `На ${padPullUp.toFixed(0)} м выше кровли пачки (до ${padPullUpMD.toFixed(0)} м)`,
    });
    stages.push({
      name: "Обратная промывка (очистка)",
      fluid: wellFluid,
      volumeM3: reverseFlushVolume,
      timeMin: volToMin(reverseFlushVolume, input.pumpRateWashLs),
      description: "Очистка труб от остатков пачки, 1 цикл",
    });
    stages.push({
      name: "Спуск на кровлю пачки",
      fluid: "—",
      volumeM3: 0,
      timeMin: padTripUpMin,
      description: `Спуск инструмента до ${input.plugBottomMD.toFixed(0)} м`,
    });
  }

  if (spacerAboveVolAnn > 0) {
    stages.push({
      name: "Верхний буфер (затрубье)",
      fluid: spacerFluid,
      volumeM3: spacerAboveVolAnn,
      timeMin: volToMin(spacerAboveVolAnn, input.pumpRateSpacerLs),
      description: `Буфер над цементом в затрубье. Высота: ${spacerAboveHeight.toFixed(1)} м`,
    });
  }
  const pumpTimeCementMin = volToMin(cementVolTotal, input.pumpRateCementLs);
  stages.push({
    name: "Цементный раствор",
    fluid: cementFluid,
    volumeM3: cementVolTotal,
    timeMin: pumpTimeCementMin,
    description: `Интервал моста ${input.plugTopMD.toFixed(0)}–${input.plugBottomMD.toFixed(0)} м. Столб при установке: ${placementHeight.toFixed(1)} м`,
  });
  const spacerPipeTimeMin = volToMin(spacerAboveVolPipe, input.pumpRateSpacerLs);
  if (spacerAboveVolPipe > 0) {
    stages.push({
      name: "Верхний буфер (трубное)",
      fluid: spacerFluid,
      volumeM3: spacerAboveVolPipe,
      timeMin: spacerPipeTimeMin,
      description: "Порция буфера в трубе для баланса столбов",
    });
  }
  const pumpTimeDisplacementMin = volToMin(displacementVolume, input.pumpRateDisplacementLs);
  stages.push({
    name: "Продавка",
    fluid: dispFluid,
    volumeM3: displacementVolume,
    timeMin: pumpTimeDisplacementMin,
    description: "Продавка до установления равновесия",
  });
  stages.push({
    name: "Подъём инструмента",
    fluid: "—",
    volumeM3: 0,
    timeMin: tripTimeMin,
    description: `До ${pullOutDepthMD.toFixed(0)} м (на ${Math.max(0, input.pullOutAbovePlugM).toFixed(0)} м выше кровли). V=${tripSpeed.toFixed(2)} м/с`,
  });
  stages.push({
    name: `Промывка (${washTypeText})`,
    fluid: wellFluid,
    volumeM3: washVolumeM3,
    timeMin: washTimeMin,
    description: `${washCycles} ц., 1 ц. = ${washOneCycleVolume.toFixed(2)} м³ (${input.washType === "direct" ? "объём затрубья" : "внутр. объём труб"})`,
  });

  const totalOperationTimeMin = stages.reduce((a, s) => a + s.timeMin, 0);

  // Безопасное время: только контакт цемента с потоком (ЦР + буфер в трубе + продавка)
  const cementContactTimeMin = pumpTimeCementMin + spacerPipeTimeMin + pumpTimeDisplacementMin;
  const safeTime75 = input.thickeningTimeMin * 0.75;
  const isTimeSafe = input.thickeningTimeMin <= 0 || cementContactTimeMin <= safeTime75;
  if (!isTimeSafe) {
    warnings.push({
      type: "error",
      message: `Время контакта с цементом ${cementContactTimeMin.toFixed(0)} мин превышает 75% времени загустевания (${safeTime75.toFixed(0)} мин). Риск схватывания цемента в трубах.`,
    });
  }
  if (extraHeight > 0 && plugLen > 0) {
    warnings.push({
      type: "warning",
      message: `Высота ЦР при установке ${placementHeight.toFixed(1)} м — на ${extraHeight.toFixed(1)} м выше проектной длины моста (стенки инструмента вытесняют цемент). После подъёма труб мост осядет до ${plugLen.toFixed(0)} м.`,
    });
  }

  // Гидростатика на подошве моста: затрубье — скважинная жидкость,
  // труба — ПРОДАВОЧНАЯ жидкость. Разные плотности дают разбаланс моста.
  const commonColumnMPa =
    input.spacerDensity * spacerAboveHeight * 0.00981 +
    input.cementDensity * placementHeight * 0.00981;
  const balancePressureMPa = input.wellFluidDensity * Math.max(0, spacerAboveTopMD) * 0.00981 + commonColumnMPa;
  const pipeSidePressureMPa = dispDensity * Math.max(0, spacerAboveTopMD) * 0.00981 + commonColumnMPa;
  const imbalanceMPa = pipeSidePressureMPa - balancePressureMPa;
  if (Math.abs(imbalanceMPa) > 0.1) {
    warnings.push({
      type: "warning",
      message: `Плотности продавки (${dispDensity} г/см³) и скважинной жидкости (${input.wellFluidDensity} г/см³) различаются — разбаланс на подошве моста ${imbalanceMPa > 0 ? "+" : ""}${imbalanceMPa.toFixed(2)} МПа. Цемент будет перетекать в сторону меньшего давления — скорректируйте объём продавки или выровняйте плотности.`,
    });
  }

  return {
    boreDiamUsed: boreDiam,
    annAreaM2: annArea,
    pipeAreaM2: pipeArea,
    plugLengthM: plugLen,
    cementVolumeTotal: cementVolTotal,
    cementVolumeAnnulus: cementVolAnn,
    cementVolumePipe: cementVolPipe,
    dryCementTons,
    waterVolumeM3,
    placementHeightM: placementHeight,
    extraHeightM: extraHeight,
    cementTopPlacementMD,
    spacerAboveHeightM: spacerAboveHeight,
    spacerAboveTopMD,
    spacerWashHeightM: spacerWashHeight,
    padHeightM: padHeight,
    padBottomMD,
    padDisplacementVolume,
    reverseFlushVolume,
    displacementVolume,
    pullOutDepthMD,
    washOneCycleVolume,
    washVolumeM3,
    washTimeMin,
    pumpingStages: stages,
    totalOperationTimeMin,
    cementContactTimeMin,
    safeTime75Min: safeTime75,
    isTimeSafe,
    balancePressureMPa,
    pipeSidePressureMPa,
    imbalanceMPa,
    displacementDensityUsed: dispDensity,
    warnings,
  };
}
