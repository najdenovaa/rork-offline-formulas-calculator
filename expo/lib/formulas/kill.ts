/**
 * Глушение скважины — расчёт плотности, объёмов и давлений.
 * Портировано из инженерного веб-модуля (КРС) — работает полностью офлайн.
 * Включает подбор жидкости глушения и рецептуру солевого раствора.
 */

export type KillMethod = "driller" | "wait_weight" | "volumetric" | "bullhead";

export const KILL_METHOD_LABELS: Record<KillMethod, string> = {
  driller: "Бурильщика",
  wait_weight: "Ожидания",
  volumetric: "Объёмный",
  bullhead: "Задавка",
};

export const KILL_FLUIDS = [
  { name: "Техническая вода", maxDensity: 1.0 },
  { name: "Раствор NaCl", maxDensity: 1.2 },
  { name: "Раствор CaCl₂", maxDensity: 1.4 },
  { name: "Раствор CaBr₂", maxDensity: 1.7 },
  { name: "Раствор ZnBr₂/CaBr₂", maxDensity: 2.3 },
  { name: "Глинистый р-р с баритом", maxDensity: 2.5 },
] as const;

/** Соли для рецептуры рассола: ρ = 1.0 + k · wt% (чистой соли) */
export const BRINE_SALTS = [
  { id: "nacl", name: "NaCl (галит)", k: 0.00758, maxDensity: 1.2, purity: 97 },
  { id: "kcl", name: "KCl", k: 0.00667, maxDensity: 1.16, purity: 95 },
  { id: "cacl2", name: "CaCl₂", k: 0.01, maxDensity: 1.4, purity: 94 },
] as const;

export type BrineSaltId = (typeof BRINE_SALTS)[number]["id"];

export interface BrineRecipe {
  saltName: string;
  feasible: boolean;
  wtPctClean: number; // концентрация чистой соли, % масс.
  saturationPct: number; // % от предельной концентрации
  totalMassKg: number;
  productMassKg: number; // товарная соль с учётом чистоты
  waterMassKg: number; // ≈ литры воды
  warnings: string[];
}

/**
 * Рецептура солевого раствора: сколько соли и воды на заданный объём.
 * ρ = 1.0 + k · wt%  →  wt% = (ρ − 1.0) / k
 */
export function calculateBrineRecipe(targetDensity: number, volumeM3: number, saltId: BrineSaltId | "auto"): BrineRecipe {
  const salt =
    saltId === "auto"
      ? BRINE_SALTS.find((s) => s.maxDensity >= targetDensity) ?? BRINE_SALTS[BRINE_SALTS.length - 1]
      : BRINE_SALTS.find((s) => s.id === saltId) ?? BRINE_SALTS[0];

  const warnings: string[] = [];
  const feasible = targetDensity <= salt.maxDensity + 1e-9;
  const wtPctClean = salt.k > 0 ? Math.max(0, (targetDensity - 1.0) / salt.k) : 0;
  const wtPctMax = salt.k > 0 ? (salt.maxDensity - 1.0) / salt.k : 0;
  const saturationPct = wtPctMax > 0 ? (wtPctClean / wtPctMax) * 100 : 0;

  const totalMassKg = targetDensity * 1000 * Math.max(0, volumeM3);
  const pureSaltKg = (wtPctClean / 100) * totalMassKg;
  const productMassKg = salt.purity > 0 ? pureSaltKg / (salt.purity / 100) : 0;
  const waterMassKg = Math.max(0, totalMassKg - productMassKg);

  if (!feasible) {
    warnings.push(
      `${salt.name} даёт максимум ${salt.maxDensity.toFixed(2)} г/см³ — для ${targetDensity.toFixed(2)} г/см³ нужна другая соль (CaCl₂, CaBr₂) или утяжелитель.`,
    );
  } else if (saturationPct > 90) {
    warnings.push(`Концентрация ${wtPctClean.toFixed(1)}% — более 90% от насыщения. Риск выпадения соли при охлаждении.`);
  }
  if (salt.purity < 90) {
    warnings.push(`Чистота товарной соли ${salt.purity}% — увеличен расход продукта.`);
  }

  return {
    saltName: salt.name,
    feasible,
    wtPctClean,
    saturationPct,
    totalMassKg,
    productMassKg,
    waterMassKg,
    warnings,
  };
}

export interface KillInput {
  method: KillMethod;
  formationPressureMPa: number;
  reservoirDepthTVD: number; // м
  fracturePressureMPa: number;
  currentMudDensity: number; // г/см³
  wellDepthMD: number; // м
  casingID_mm: number;
  tubingOD_mm: number;
  tubingID_mm: number;
  killFluidPV_cP: number;
  killFluidYP_Pa: number;
  pumpRateLs: number;
  safetyMarginPct: number;
}

export interface KillResult {
  killDensity: number; // г/см³
  balanceDensity: number; // г/см³
  bottomholePressureMPa: number;
  killVolumeM3: number;
  tubingCapacityM3: number;
  annulusCapacityM3: number;
  initialCircPressureMPa: number;
  finalCircPressureMPa: number;
  bullheadSurfacePressureMPa: number;
  exceedsFracture: boolean;
  frictionLossMPa: number;
  selectedFluid: string;
  fluidSuitability: { name: string; maxDensity: number; suitable: boolean }[];
  warnings: string[];
  recommendation: string;
}

export function calculateKill(input: KillInput): KillResult {
  const G = 9.81;
  const tvd = Math.max(1, input.reservoirDepthTVD);

  // Балансовая плотность: ρ = Pпл / (g·H)
  const balanceDensity = (input.formationPressureMPa * 1e6) / (G * tvd) / 1000;
  const killDensity = balanceDensity * (1 + input.safetyMarginPct / 100);
  const bhp = (killDensity * 1000 * G * tvd) / 1e6;
  const exceedsFracture = bhp > input.fracturePressureMPa;

  const tubingCapacity = (Math.PI / 4) * (input.tubingID_mm / 1000) ** 2 * input.wellDepthMD;
  const annulusCapacity =
    (Math.PI / 4) * ((input.casingID_mm / 1000) ** 2 - (input.tubingOD_mm / 1000) ** 2) * input.wellDepthMD;
  const killVolume = tubingCapacity + annulusCapacity;

  // Потери на трение в затрубье (Бингам, односекционная модель)
  const dhAnn = Math.max(0.005, (input.casingID_mm - input.tubingOD_mm) / 1000);
  const annArea = (Math.PI / 4) * ((input.casingID_mm / 1000) ** 2 - (input.tubingOD_mm / 1000) ** 2);
  const vAnn = input.pumpRateLs / 1000 / Math.max(1e-6, annArea);
  const dpdlAnn =
    input.killFluidYP_Pa / (0.2 * dhAnn) + ((input.killFluidPV_cP / 1000) * vAnn) / (1.5 * dhAnn * dhAnn);
  const frictionLoss = (dpdlAnn * input.wellDepthMD) / 1e6;

  // ICP = потери + недостаток гидростатики; FCP = потери, пересчитанные на плотность глушения
  const ICP = frictionLoss + ((killDensity - input.currentMudDensity) * 1000 * G * tvd) / 1e6;
  const FCP = frictionLoss * (killDensity / Math.max(0.01, input.currentMudDensity));

  const killHydro = (killDensity * 1000 * G * tvd) / 1e6;
  const bullheadSurface = Math.max(0, input.formationPressureMPa - killHydro + frictionLoss);

  const fluid = KILL_FLUIDS.find((f) => f.maxDensity >= killDensity) ?? KILL_FLUIDS[KILL_FLUIDS.length - 1];
  const fluidSuitability = KILL_FLUIDS.map((f) => ({
    name: f.name,
    maxDensity: f.maxDensity,
    suitable: f.maxDensity >= killDensity,
  }));

  const warnings: string[] = [];
  if (exceedsFracture) {
    warnings.push(
      `Забойное давление глушения ${bhp.toFixed(1)} МПа > давления ГРП ${input.fracturePressureMPa.toFixed(1)} МПа. Риск поглощения! Снизить плотность или применить поэтапное глушение.`,
    );
  }
  if (input.method === "bullhead" && bullheadSurface * 1.5 > input.fracturePressureMPa - killHydro) {
    warnings.push("Bullheading: давление задавки близко к ГРП. Контролировать устьевое давление.");
  }
  if (killDensity > 2.3) {
    warnings.push(
      `Требуется плотность ${killDensity.toFixed(2)} г/см³ — нужны утяжелители (барит/гематит) или тяжёлые соли (CaBr₂, ZnBr₂).`,
    );
  }

  let recommendation = "";
  switch (input.method) {
    case "driller":
      recommendation =
        "Метод бурильщика: 1-я циркуляция вымывает приток текущей жидкостью, 2-я — закачка утяжелённой. Проще, но дольше (2 цикла).";
      break;
    case "wait_weight":
      recommendation =
        "Метод ожидания: сразу закачка утяжелённой жидкости за 1 циркуляцию. Быстрее, ниже давления, но требует точного расчёта.";
      break;
    case "volumetric":
      recommendation =
        "Объёмный метод: без циркуляции (нет доступа к забою). Стравливание газа порциями с поддержанием давления.";
      break;
    case "bullhead":
      recommendation = `Прямая задавка в пласт: устьевое давление ${bullheadSurface.toFixed(1)} МПа. Применять, когда циркуляция невозможна. Обязательно проверить ГРП.`;
      break;
  }

  return {
    killDensity,
    balanceDensity,
    bottomholePressureMPa: bhp,
    killVolumeM3: killVolume,
    tubingCapacityM3: tubingCapacity,
    annulusCapacityM3: annulusCapacity,
    initialCircPressureMPa: ICP,
    finalCircPressureMPa: FCP,
    bullheadSurfacePressureMPa: bullheadSurface,
    exceedsFracture,
    frictionLossMPa: frictionLoss,
    selectedFluid: fluid.name,
    fluidSuitability,
    warnings,
    recommendation,
  };
}
