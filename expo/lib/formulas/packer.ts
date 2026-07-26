/**
 * Пакер (КРС): посадка/удержание и срыв.
 * Портировано из инженерного веб-модуля — работает полностью офлайн.
 * Блок 1 — несущая способность и герметичность (F = μ·P·π·D·L).
 * Блок 2 — усилие срыва с учётом адгезии, отложений и предела колонны.
 */

export type PackerType = "mechanical" | "hydraulic" | "hydrostatic" | "permanent" | "retrievable";
export type ReleaseMechanism = "tension" | "rotation" | "pressure_release" | "mill_out";

export const PACKER_TYPE_LABELS: Record<PackerType, string> = {
  mechanical: "Механический",
  hydraulic: "Гидравлический",
  hydrostatic: "Гидростатический",
  permanent: "Постоянный",
  retrievable: "Извлекаемый",
};

export const RELEASE_MECHANISM_LABELS: Record<ReleaseMechanism, string> = {
  tension: "Натяжка",
  rotation: "Срыв вращением",
  pressure_release: "Сброс давления + натяжка",
  mill_out: "Разбуривание / фрезерование",
};

export const STEEL_GRADES: Record<string, number> = {
  J55: 379,
  N80: 552,
  L80: 552,
  P110: 758,
};

/* ── Блок 1: посадка и удержание ── */

export interface PackerHoldInput {
  packerOD_mm: number; // диаметр уплотнительного элемента
  elementLength_mm: number; // длина уплотнительного элемента
  rubberFrictionCoeff: number; // μ резина-металл (0.30–0.50)
  setPressureMPa: number; // контактное давление посадки
  differentialPressureMPa: number; // рабочий перепад на пакере
}

export interface PackerHoldResult {
  contactAreaM2: number;
  holdCapacityKN: number; // F = μ·P·π·D·L
  releaseForceEstimateKN: number; // +20% адгезия (оценка)
  sealIntegrityMPa: number; // 0.85·P_set
  isSecure: boolean; // ΔP ≤ герметичность
  warnings: string[];
}

export function calculatePackerHold(input: PackerHoldInput): PackerHoldResult {
  const D = input.packerOD_mm / 1000;
  const L = input.elementLength_mm / 1000;
  const setPressPa = input.setPressureMPa * 1e6;

  // Площадь контакта элемента с колонной
  const contactArea = Math.PI * D * L;
  // Несущая способность: сила трения по контакту
  const holdCapacity = (input.rubberFrictionCoeff * setPressPa * contactArea) / 1000;
  const releaseForceEstimate = holdCapacity * 1.2; // коэффициент адгезии
  const sealIntegrity = input.setPressureMPa * 0.85;
  const isSecure = input.differentialPressureMPa <= sealIntegrity;

  const warnings: string[] = [];
  if (input.rubberFrictionCoeff < 0.25 || input.rubberFrictionCoeff > 0.55) {
    warnings.push("Коэффициент трения резина-металл вне типичного диапазона 0.25–0.55 — проверьте паспорт пакера.");
  }
  if (!isSecure) {
    warnings.push(
      `Перепад ${input.differentialPressureMPa.toFixed(1)} МПа > герметичности ${sealIntegrity.toFixed(1)} МПа — риск пропуска через уплотнение.`,
    );
  }

  return {
    contactAreaM2: contactArea,
    holdCapacityKN: holdCapacity,
    releaseForceEstimateKN: releaseForceEstimate,
    sealIntegrityMPa: sealIntegrity,
    isSecure,
    warnings,
  };
}

/* ── Блок 2: срыв пакера ── */

export interface PackerReleaseInput {
  packerType: PackerType;
  holdCapacityKN: number;
  monthsInService: number;
  h2sPresent: boolean;
  scaleDepositRate: number; // кН/мес (3–15)
  pipeWeightAboveKN: number;
  pipeYieldMPa: number;
  pipeOD_mm: number;
  pipeID_mm: number;
}

export interface PackerReleaseResult {
  releaseForceKN: number;
  breakdown: { baseHold: number; adhesion: number; scaleStick: number };
  totalPullRequiredKN: number;
  pipeTensileLimitKN: number;
  canReleaseByTension: boolean;
  recommendedMechanism: ReleaseMechanism;
  warnings: string[];
}

export function calculatePackerRelease(input: PackerReleaseInput): PackerReleaseResult {
  // Адгезия резины: +15% базово и +1%/мес (максимум 24 мес)
  const adhesion = input.holdCapacityKN * (0.15 + 0.01 * Math.min(input.monthsInService, 24));
  // Отложения: скорость × срок; H₂S ускоряет прихват в 1.5×
  const scaleStick = input.scaleDepositRate * input.monthsInService * (input.h2sPresent ? 1.5 : 1.0);
  const releaseForce = input.holdCapacityKN + adhesion + scaleStick;
  const totalPull = releaseForce + input.pipeWeightAboveKN;

  // Предел колонны на растяжение: σт·A / SF(1.25)
  const A = (Math.PI / 4) * ((input.pipeOD_mm / 1000) ** 2 - (input.pipeID_mm / 1000) ** 2);
  const tensileLimit = (input.pipeYieldMPa * 1e6 * A) / 1000 / 1.25;
  const canRelease = totalPull < tensileLimit;

  let mechanism: ReleaseMechanism;
  const warnings: string[] = [];
  if (input.packerType === "permanent") {
    mechanism = "mill_out";
    warnings.push("Постоянный пакер — срыв невозможен. Только разбуривание/фрезерование.");
  } else if (!canRelease) {
    mechanism = input.packerType === "mechanical" ? "rotation" : "mill_out";
    warnings.push(
      `Усилие срыва ${totalPull.toFixed(0)} кН > предела колонны ${tensileLimit.toFixed(0)} кН. Натяжкой НЕ сорвать — труба порвётся. Применить: ${RELEASE_MECHANISM_LABELS[mechanism].toLowerCase()}.`,
    );
  } else if (input.packerType === "mechanical") {
    mechanism = "rotation";
  } else if (input.packerType === "hydraulic" || input.packerType === "hydrostatic") {
    mechanism = "pressure_release";
    warnings.push("Гидравлический/гидростатический пакер: сначала сбросить давление, затем натяжка.");
  } else {
    mechanism = "tension";
  }

  if (input.monthsInService > 24) {
    warnings.push(
      `Срок эксплуатации ${input.monthsInService} мес — пакер сильно прикипел (адгезия +${((adhesion / Math.max(1e-6, input.holdCapacityKN)) * 100).toFixed(0)}%, отложения ${scaleStick.toFixed(0)} кН).`,
    );
  }
  if (input.h2sPresent) {
    warnings.push("H₂S-среда — продукты коррозии увеличивают прихват плашек в 1.5×.");
  }

  return {
    releaseForceKN: releaseForce,
    breakdown: { baseHold: input.holdCapacityKN, adhesion, scaleStick },
    totalPullRequiredKN: totalPull,
    pipeTensileLimitKN: tensileLimit,
    canReleaseByTension: canRelease,
    recommendedMechanism: mechanism,
    warnings,
  };
}
