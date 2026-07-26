/**
 * Гидростатика и ЭЦП — быстрые скважинные расчёты давлений.
 * Работает полностью офлайн.
 */

export interface HydroInput {
  densityGcm3: number; // плотность жидкости, г/см³
  depthTVD: number; // глубина по вертикали, м
  frictionMPa: number; // потери давления в затрубье, МПа (для ЭЦП)
  formationPressureMPa: number; // пластовое давление, МПа (0 = не задано)
}

export interface HydroResult {
  hydrostaticMPa: number;
  gradientKPaM: number; // кПа/м
  ecdGcm3: number; // эквивалентная циркуляционная плотность
  balanceDensityGcm3: number; // плотность для равновесия с Pпл
  differentialMPa: number; // гидростатика − Pпл (репрессия/депрессия)
  overbalanced: boolean;
}

const G = 9.81;

/** Гидростатическое давление, МПа */
export function hydrostatic(densityGcm3: number, depthTVD: number): number {
  return (densityGcm3 * 1000 * G * depthTVD) / 1e6;
}

export function calculateHydro(input: HydroInput): HydroResult {
  const tvd = Math.max(1, input.depthTVD);
  const pHydro = hydrostatic(input.densityGcm3, tvd);
  const gradient = input.densityGcm3 * G; // кПа/м

  // ЭЦП = ρ + ΔPтр / (g·H)
  const ecd = input.densityGcm3 + (input.frictionMPa * 1e6) / (G * tvd) / 1000;

  const balance = input.formationPressureMPa > 0 ? (input.formationPressureMPa * 1e6) / (G * tvd) / 1000 : 0;
  const differential = input.formationPressureMPa > 0 ? pHydro - input.formationPressureMPa : 0;

  return {
    hydrostaticMPa: pHydro,
    gradientKPaM: gradient,
    ecdGcm3: ecd,
    balanceDensityGcm3: balance,
    differentialMPa: differential,
    overbalanced: differential >= 0,
  };
}
