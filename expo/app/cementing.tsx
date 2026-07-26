import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Plus, Trash2 } from "lucide-react-native";
import React, { useEffect, useMemo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import ActionsBar, { type ImportResult } from "@/components/ActionsBar";
import CalcScreen from "@/components/CalcScreen";
import Collapsible from "@/components/Collapsible";
import NumField from "@/components/NumField";
import { PressureChart, PumpScheduleChart, WellSchematic } from "@/components/ProfileChart";
import { Banner, Card, HeroResult, ResultRow, SectionTitle } from "@/components/Results";
import SaveableView from "@/components/SaveableView";
import type { Palette } from "@/constants/colors";
import { useSavedCalcs } from "@/lib/savedCalcs";
import { useTheme } from "@/lib/theme";
import {
  calculateCementing,
  simulatePumpSchedule,
  type CementStageInput,
  type CementingInput,
  type FlowRateStep,
  type SpacerInput,
} from "@/lib/formulas/cementing";
import { fmt, parseNum } from "@/lib/num";
import { usePersistedState } from "@/lib/persist";
import { buildHeader, field, kv, maxIndex, parseKV, section } from "@/lib/textCodec";

type Mode = "standard" | "advanced";

/** Строковые версии стадии/буфера для полей ввода */
interface StageForm {
  id: string;
  label: string;
  densityGcm3: string;
  waterRatio: string;
  yieldPerTon: string;
  bottomMD: string;
}
interface SpacerForm {
  id: string;
  label: string;
  volumeM3: string;
  densityGcm3: string;
}
interface FlowRateStepForm {
  id: string;
  rateLps: string;
  volumeM3: string;
}

type FieldKey =
  | "casingDepthMD"
  | "casingDepthTVD"
  | "wellTotalDepthMD"
  | "holeDiameter"
  | "cavernCoeff"
  | "casingOD"
  | "casingWall"
  | "prevCasingDepth"
  | "prevCasingID"
  | "ckodDepth"
  | "cementTopMD"
  | "mudDensity"
  | "dispDensity"
  | "compressionCoeff"
  | "fracGradientGcm3";

// Первый запуск — пустые поля; последний расчёт восстанавливается из памяти устройства (офлайн)
const defaults: Record<FieldKey, string> = {
  casingDepthMD: "",
  casingDepthTVD: "",
  wellTotalDepthMD: "",
  holeDiameter: "",
  cavernCoeff: "",
  casingOD: "",
  casingWall: "",
  prevCasingDepth: "",
  prevCasingID: "",
  ckodDepth: "",
  cementTopMD: "",
  mudDensity: "",
  dispDensity: "",
  compressionCoeff: "",
  fracGradientGcm3: "",
};

type ScheduleFieldKey = "mudPV" | "mudYP" | "bufferPV" | "bufferYP" | "cementPV" | "cementYP" | "dispPV" | "dispYP";
const scheduleDefaults: Record<ScheduleFieldKey, string> = {
  mudPV: "",
  mudYP: "",
  bufferPV: "",
  bufferYP: "",
  cementPV: "",
  cementYP: "",
  dispPV: "",
  dispYP: "",
};

/**
 * Распределение расчётного объёма по режимам закачки:
 * объёмы первых режимов берутся из ввода (ограничены остатком),
 * последний режим всегда получает остаток — сумма точно равна расчётному объёму.
 */
function resolveSteps(forms: FlowRateStepForm[], totalVol: number): FlowRateStep[] {
  const total = Math.max(0, totalVol);
  let used = 0;
  return forms.map((s, i) => {
    const isLast = i === forms.length - 1;
    let vol: number;
    if (isLast) {
      vol = Math.max(0, total - used);
    } else {
      vol = Math.min(Math.max(0, parseNum(s.volumeM3)), Math.max(0, total - used));
      used += vol;
    }
    return { id: s.id, rateLps: parseNum(s.rateLps), volumeM3: vol };
  });
}

let idCounter = 0;
const nextId = () => `s${idCounter++}_${Date.now()}`;

const defaultStages: StageForm[] = [
  { id: "stage_default_1", label: "Облегчённый (голова)", densityGcm3: "", waterRatio: "", yieldPerTon: "", bottomMD: "" },
  { id: "stage_default_2", label: "Цементный раствор нормальной плотности (низ)", densityGcm3: "", waterRatio: "", yieldPerTon: "", bottomMD: "" },
];
const defaultSpacers: SpacerForm[] = [{ id: "spacer_default_1", label: "Буфер", volumeM3: "", densityGcm3: "" }];

const defaultBufferSteps: FlowRateStepForm[] = [{ id: "buf_default_1", rateLps: "", volumeM3: "" }];
const defaultDisplacementSteps: FlowRateStepForm[] = [
  { id: "disp_default_1", rateLps: "", volumeM3: "" },
];

export default function CementingScreen() {
  const { colors: Colors } = useTheme();
  const styles = useMemo(() => createStyles(Colors), [Colors]);
  const [mode, setMode] = usePersistedState<Mode>("calc:cementing:mode", "standard");
  const [f, setF] = usePersistedState<Record<FieldKey, string>>("calc:cementing:fields", defaults);
  const [stages, setStages] = usePersistedState<StageForm[]>("calc:cementing:stages", defaultStages);
  const [spacers, setSpacers] = usePersistedState<SpacerForm[]>("calc:cementing:spacers", defaultSpacers);
  const [sf, setSf] = usePersistedState<Record<ScheduleFieldKey, string>>("calc:cementing:schedule", scheduleDefaults);
  const [bufferSteps, setBufferSteps] = usePersistedState<FlowRateStepForm[]>("calc:cementing:bufferSteps", defaultBufferSteps);
  const [stageRates, setStageRates] = usePersistedState<Record<string, string>>("calc:cementing:stageRates", {});
  const [displacementSteps, setDisplacementSteps] = usePersistedState<FlowRateStepForm[]>("calc:cementing:dispSteps", defaultDisplacementSteps);
  const [stagePV, setStagePV] = usePersistedState<Record<string, string>>("calc:cementing:stagePV", {});
  const [stageYP, setStageYP] = usePersistedState<Record<string, string>>("calc:cementing:stageYP", {});
  const set = (k: FieldKey) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const setSchedule = (k: ScheduleFieldKey) => (v: string) => setSf((p) => ({ ...p, [k]: v }));
  const isAdvanced = mode === "advanced";

  const haptic = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const updateStage = (id: string, patch: Partial<StageForm>) =>
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const addStage = () => {
    haptic();
    setStages((prev) => [...prev, { id: nextId(), label: `Раствор ${prev.length + 1}`, densityGcm3: "", waterRatio: "", yieldPerTon: "", bottomMD: f.casingDepthMD }]);
  };
  const removeStage = (id: string) => {
    haptic();
    setStages((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev));
  };

  const updateSpacer = (id: string, patch: Partial<SpacerForm>) =>
    setSpacers((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const addSpacer = () => {
    haptic();
    setSpacers((prev) => [...prev, { id: nextId(), label: `Буфер ${prev.length + 1}`, volumeM3: "", densityGcm3: "" }]);
  };
  const removeSpacer = (id: string) => {
    haptic();
    setSpacers((prev) => (prev.length > 0 ? prev.filter((s) => s.id !== id) : prev));
  };

  const makeStepHandlers = (setter: React.Dispatch<React.SetStateAction<FlowRateStepForm[]>>) => ({
    update: (id: string, patch: Partial<FlowRateStepForm>) => setter((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s))),
    add: () => {
      haptic();
      setter((prev) => [...prev, { id: nextId(), rateLps: "", volumeM3: "" }]);
    },
    remove: (id: string) => {
      haptic();
      setter((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev));
    },
  });
  const bufferStepH = makeStepHandlers(setBufferSteps);
  const displacementStepH = makeStepHandlers(setDisplacementSteps);

  const baseInput = useMemo<CementingInput>(() => {
    const stageInputs: CementStageInput[] = stages.map((s) => ({
      id: s.id,
      label: s.label,
      densityGcm3: parseNum(s.densityGcm3),
      waterRatio: parseNum(s.waterRatio),
      yieldPerTon: parseNum(s.yieldPerTon),
      bottomMD: parseNum(s.bottomMD),
    }));
    const spacerInputs: SpacerInput[] = spacers.map((s) => ({
      id: s.id,
      label: s.label,
      volumeM3: parseNum(s.volumeM3),
      densityGcm3: parseNum(s.densityGcm3),
    }));
    // В стандартном режиме поле TVD скрыто — скважина считается вертикальной (TVD = MD).
    // Иначе старое значение TVD искажает все давления при изменении глубины.
    const md = parseNum(f.casingDepthMD);
    const tvd = isAdvanced ? Math.min(parseNum(f.casingDepthTVD) || md, md) : md;
    return {
      casingDepthMD: md,
      casingDepthTVD: tvd,
      wellTotalDepthMD: parseNum(f.wellTotalDepthMD),
      holeDiameter: parseNum(f.holeDiameter),
      cavernCoeff: parseNum(f.cavernCoeff) || 1,
      casingOD: parseNum(f.casingOD),
      casingWall: parseNum(f.casingWall),
      prevCasingDepth: parseNum(f.prevCasingDepth),
      prevCasingID: parseNum(f.prevCasingID),
      ckodDepth: parseNum(f.ckodDepth),
      cementTopMD: parseNum(f.cementTopMD),
      mudDensity: parseNum(f.mudDensity) || 1,
      displacementDensity: parseNum(f.dispDensity) || parseNum(f.mudDensity) || 1,
      compressionCoeff: parseNum(f.compressionCoeff) || 1,
      frictionMPa: 0,
      fracGradientGcm3: parseNum(f.fracGradientGcm3),
      stages: stageInputs,
      spacers: spacerInputs,
    };
  }, [f, stages, spacers, isAdvanced]);

  const baseResult = useMemo(() => calculateCementing(baseInput), [baseInput]);

  // Объёмы режимов берутся автоматически из основного расчёта
  const bufferResolved = useMemo(() => resolveSteps(bufferSteps, baseResult.totalSpacerVolume), [bufferSteps, baseResult.totalSpacerVolume]);
  const dispResolved = useMemo(() => resolveSteps(displacementSteps, baseResult.displacementVolume), [displacementSteps, baseResult.displacementVolume]);

  // Каждая стадия цемента — отдельный этап закачки со своим расходом;
  // объём и плотность берутся из расчёта стадии автоматически.
  const cementStageSteps = useMemo<FlowRateStep[]>(
    () =>
      baseResult.stages.map((st) => ({
        id: st.id,
        rateLps: parseNum(stageRates[st.id] ?? ""),
        volumeM3: st.volumeM3,
        label: st.label,
        densityGcm3: parseNum(stages.find((s) => s.id === st.id)?.densityGcm3 ?? "") || undefined,
        pvCp: parseNum(stagePV[st.id] ?? "") || undefined,
        ypPa: parseNum(stageYP[st.id] ?? "") || undefined,
      })),
    [baseResult.stages, stageRates, stages, stagePV, stageYP],
  );

  const pumpSchedule = useMemo(() => {
    if (!isAdvanced) return null;
    return simulatePumpSchedule(baseInput, {
      bufferSteps: bufferResolved,
      cementSteps: cementStageSteps,
      displacementSteps: dispResolved,
      mudPV: parseNum(sf.mudPV),
      mudYP: parseNum(sf.mudYP),
      bufferPV: parseNum(sf.bufferPV),
      bufferYP: parseNum(sf.bufferYP),
      cementPV: parseNum(sf.cementPV),
      cementYP: parseNum(sf.cementYP),
      dispPV: parseNum(sf.dispPV),
      dispYP: parseNum(sf.dispYP),
    });
  }, [isAdvanced, baseInput, bufferResolved, cementStageSteps, dispResolved, sf]);

  // В углублённом режиме трение в затрубье берётся из гидравлики режимов закачки —
  // один источник трения, проверка на ГРП и «Давления при закачке» всегда согласованы.
  const result = useMemo(() => {
    if (isAdvanced && pumpSchedule) {
      return calculateCementing({ ...baseInput, frictionMPa: pumpSchedule.annularFrictionAtEndMPa });
    }
    return baseResult;
  }, [isAdvanced, pumpSchedule, baseInput, baseResult]);

  const pressurePoints = useMemo(() => {
    const depth = parseNum(f.casingDepthMD);
    if (depth <= 0) return [];
    const steps = 24;
    const tvdRatio = result.tvdRatio;
    const pts: { depthMD: number; hydrostaticMPa: number; fracMPa: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const d = (depth * i) / steps;
      let p = 0;
      for (const seg of result.profile) {
        const top = Math.min(seg.topMD, d);
        const bottom = Math.min(seg.bottomMD, d);
        if (bottom > top) p += seg.densityGcm3 * (bottom - top) * tvdRatio * 0.00981;
      }
      const fracP = (parseNum(f.fracGradientGcm3) || 0) * d * tvdRatio * 0.00981;
      pts.push({ depthMD: d, hydrostaticMPa: p, fracMPa: fracP });
    }
    return pts;
  }, [f.casingDepthMD, f.fracGradientGcm3, result.profile, result.tvdRatio]);

  const buildExportText = (): string => {
    const lines: string[] = [buildHeader("Цементирование ОК", "cementing")];
    lines.push(section("Режим расчёта (standard / advanced)"));
    lines.push(field("Режим", "mode", mode));

    lines.push(section("Скважина и колонна"));
    lines.push(field("Глубина спуска ОК (башмак), MD", "casingDepthMD", f.casingDepthMD, "м"));
    lines.push(field("Забой скважины (0 — равен башмаку)", "wellTotalDepthMD", f.wellTotalDepthMD, "м"));
    lines.push(field("Глубина башмака по вертикали, TVD", "casingDepthTVD", f.casingDepthTVD, "м"));
    lines.push(field("Диаметр долота", "holeDiameter", f.holeDiameter, "мм"));
    lines.push(field("Коэффициент кавернозности", "cavernCoeff", f.cavernCoeff));
    lines.push(field("Наружный диаметр ОК", "casingOD", f.casingOD, "мм"));
    lines.push(field("Толщина стенки ОК", "casingWall", f.casingWall, "мм"));
    lines.push(field("Башмак предыдущей колонны", "prevCasingDepth", f.prevCasingDepth, "м"));
    lines.push(field("Внутр. диаметр пред. колонны", "prevCasingID", f.prevCasingID, "мм"));
    lines.push(field("Глубина установки ЦКОД", "ckodDepth", f.ckodDepth, "м"));
    lines.push(field("Плотность бурового раствора", "mudDensity", f.mudDensity, "г/см3"));

    lines.push(section("Цементные растворы"));
    lines.push(field("Уровень подъёма цемента (кровля верхней стадии)", "cementTopMD", f.cementTopMD, "м"));
    stages.forEach((s, i) => {
      const n = i + 1;
      lines.push(field(`Стадия ${n} — название`, `stage${n}.label`, s.label));
      lines.push(field(`Стадия ${n} — подошва`, `stage${n}.bottomMD`, s.bottomMD, "м"));
      lines.push(field(`Стадия ${n} — плотность раствора`, `stage${n}.densityGcm3`, s.densityGcm3, "г/см3"));
      lines.push(field(`Стадия ${n} — выход раствора (0 — авто)`, `stage${n}.yieldPerTon`, s.yieldPerTon, "м3/т"));
      lines.push(field(`Стадия ${n} — В/Ц (0 — авто)`, `stage${n}.waterRatio`, s.waterRatio));
      lines.push(field(`Стадия ${n} — расход при закачке`, `stage${n}.rateLps`, stageRates[s.id] ?? "", "л/с"));
    });

    lines.push(section("Буферные жидкости"));
    spacers.forEach((s, i) => {
      const n = i + 1;
      lines.push(field(`Буфер ${n} — название`, `spacer${n}.label`, s.label));
      lines.push(field(`Буфер ${n} — объём`, `spacer${n}.volumeM3`, s.volumeM3, "м3"));
      lines.push(field(`Буфер ${n} — плотность`, `spacer${n}.densityGcm3`, s.densityGcm3, "г/см3"));
    });

    lines.push(section("Продавка"));
    lines.push(field("Плотность продавочной жидкости", "dispDensity", f.dispDensity, "г/см3"));
    lines.push(field("Коэффициент сжатия продавки", "compressionCoeff", f.compressionCoeff));

    lines.push(section("Проверка на ГРП"));
    lines.push(field("Градиент ГРП (эквивалент плотности)", "fracGradientGcm3", f.fracGradientGcm3, "г/см3"));

    if (isAdvanced) {
      lines.push(section("Режимы закачки буфера"));
      bufferSteps.forEach((s, i) => {
        const n = i + 1;
        lines.push(field(`Буфер, режим ${n} — расход`, `bufferStep${n}.rateLps`, s.rateLps, "л/с"));
        lines.push(field(`Буфер, режим ${n} — объём (для не последнего режима)`, `bufferStep${n}.volumeM3`, s.volumeM3, "м3"));
      });
      lines.push(section("Режимы закачки продавки"));
      displacementSteps.forEach((s, i) => {
        const n = i + 1;
        lines.push(field(`Продавка, режим ${n} — расход`, `dispStep${n}.rateLps`, s.rateLps, "л/с"));
        lines.push(field(`Продавка, режим ${n} — объём (для не последнего режима)`, `dispStep${n}.volumeM3`, s.volumeM3, "м3"));
      });
      lines.push(section("Реология жидкостей"));
      lines.push(field("Бур. раствор — ПВ", "mudPV", sf.mudPV, "сП"));
      lines.push(field("Бур. раствор — ДНС", "mudYP", sf.mudYP, "Па"));
      lines.push(field("Буфер — ПВ", "bufferPV", sf.bufferPV, "сП"));
      lines.push(field("Буфер — ДНС", "bufferYP", sf.bufferYP, "Па"));
      lines.push(field("Цемент — ПВ", "cementPV", sf.cementPV, "сП"));
      lines.push(field("Цемент — ДНС", "cementYP", sf.cementYP, "Па"));
      lines.push(field("Продавка — ПВ", "dispPV", sf.dispPV, "сП"));
      lines.push(field("Продавка — ДНС", "dispYP", sf.dispYP, "Па"));
      stages.forEach((s, i) => {
        const n = i + 1;
        lines.push(field(`Цемент ${n} — ПВ (0 — общая реология)`, `stage${n}.pvCp`, stagePV[s.id] ?? "", "сП"));
        lines.push(field(`Цемент ${n} — ДНС (0 — общая реология)`, `stage${n}.ypPa`, stageYP[s.id] ?? "", "Па"));
      });
    }

    lines.push(section("Результаты (справочно, при вставке обратно не считываются)"));
    lines.push(`Объём цементного раствора всего: ${fmt(result.totalSlurryVolume, 1)} м3`);
    lines.push(`Расчётное давление на башмаке: ${fmt(result.pressureAtCheckDepthMPa, 2)} МПа`);
    lines.push(`Давление ГРП на башмаке: ${fmt(result.fracturePressureMPa, 2)} МПа`);
    lines.push(`Риск ГРП: ${result.isFracRisk ? "ЕСТЬ" : "нет"}`);
    return lines.join("\n");
  };

  const applyImportText = (text: string): ImportResult => {
    const map = parseKV(text);
    if (Object.keys(map).length === 0) {
      return { ok: false, message: "В тексте не найдено ни одного поля вида [ключ]: значение. Убедитесь, что скопирован весь текст расчёта, включая строки в квадратных скобках." };
    }
    const foundModule = map.module;
    if (foundModule && foundModule !== "cementing") {
      return { ok: false, message: `Это данные другого расчёта (${foundModule}), а не «Цементирование ОК».` };
    }

    if (map.mode === "standard" || map.mode === "advanced") setMode(map.mode);

    setF((prev) => ({
      ...prev,
      casingDepthMD: kv(map, "casingDepthMD", prev.casingDepthMD),
      wellTotalDepthMD: kv(map, "wellTotalDepthMD", prev.wellTotalDepthMD),
      casingDepthTVD: kv(map, "casingDepthTVD", prev.casingDepthTVD),
      holeDiameter: kv(map, "holeDiameter", prev.holeDiameter),
      cavernCoeff: kv(map, "cavernCoeff", prev.cavernCoeff),
      casingOD: kv(map, "casingOD", prev.casingOD),
      casingWall: kv(map, "casingWall", prev.casingWall),
      prevCasingDepth: kv(map, "prevCasingDepth", prev.prevCasingDepth),
      prevCasingID: kv(map, "prevCasingID", prev.prevCasingID),
      ckodDepth: kv(map, "ckodDepth", prev.ckodDepth),
      cementTopMD: kv(map, "cementTopMD", prev.cementTopMD),
      mudDensity: kv(map, "mudDensity", prev.mudDensity),
      dispDensity: kv(map, "dispDensity", prev.dispDensity),
      compressionCoeff: kv(map, "compressionCoeff", prev.compressionCoeff),
      fracGradientGcm3: kv(map, "fracGradientGcm3", prev.fracGradientGcm3),
    }));

    const stageCount = Math.max(maxIndex(map, "stage", "bottomMD"), maxIndex(map, "stage", "densityGcm3"));
    if (stageCount > 0) {
      const stamp = Date.now();
      const newStages: StageForm[] = [];
      const newRates: Record<string, string> = {};
      const newStagePV: Record<string, string> = {};
      const newStageYP: Record<string, string> = {};
      for (let i = 1; i <= stageCount; i++) {
        const id = `stage_imp_${i}_${stamp}`;
        newStages.push({
          id,
          label: kv(map, `stage${i}.label`, `Раствор ${i}`),
          densityGcm3: kv(map, `stage${i}.densityGcm3`),
          waterRatio: kv(map, `stage${i}.waterRatio`),
          yieldPerTon: kv(map, `stage${i}.yieldPerTon`),
          bottomMD: kv(map, `stage${i}.bottomMD`),
        });
        const rate = kv(map, `stage${i}.rateLps`);
        if (rate) newRates[id] = rate;
        const pv = kv(map, `stage${i}.pvCp`);
        if (pv) newStagePV[id] = pv;
        const yp = kv(map, `stage${i}.ypPa`);
        if (yp) newStageYP[id] = yp;
      }
      setStages(newStages);
      setStageRates(newRates);
      setStagePV(newStagePV);
      setStageYP(newStageYP);
    }

    const spacerCount = Math.max(maxIndex(map, "spacer", "volumeM3"), maxIndex(map, "spacer", "densityGcm3"));
    if (spacerCount > 0) {
      const stamp = Date.now();
      const newSpacers: SpacerForm[] = [];
      for (let i = 1; i <= spacerCount; i++) {
        newSpacers.push({
          id: `spacer_imp_${i}_${stamp}`,
          label: kv(map, `spacer${i}.label`, `Буфер ${i}`),
          volumeM3: kv(map, `spacer${i}.volumeM3`),
          densityGcm3: kv(map, `spacer${i}.densityGcm3`),
        });
      }
      setSpacers(newSpacers);
    }

    const bufCount = maxIndex(map, "bufferStep", "rateLps");
    if (bufCount > 0) {
      const stamp = Date.now();
      const steps: FlowRateStepForm[] = [];
      for (let i = 1; i <= bufCount; i++) {
        steps.push({ id: `buf_imp_${i}_${stamp}`, rateLps: kv(map, `bufferStep${i}.rateLps`), volumeM3: kv(map, `bufferStep${i}.volumeM3`) });
      }
      setBufferSteps(steps);
    }

    const dispCount = maxIndex(map, "dispStep", "rateLps");
    if (dispCount > 0) {
      const stamp = Date.now();
      const steps: FlowRateStepForm[] = [];
      for (let i = 1; i <= dispCount; i++) {
        steps.push({ id: `disp_imp_${i}_${stamp}`, rateLps: kv(map, `dispStep${i}.rateLps`), volumeM3: kv(map, `dispStep${i}.volumeM3`) });
      }
      setDisplacementSteps(steps);
    }

    setSf((prev) => ({
      ...prev,
      mudPV: kv(map, "mudPV", prev.mudPV),
      mudYP: kv(map, "mudYP", prev.mudYP),
      bufferPV: kv(map, "bufferPV", prev.bufferPV),
      bufferYP: kv(map, "bufferYP", prev.bufferYP),
      cementPV: kv(map, "cementPV", prev.cementPV),
      cementYP: kv(map, "cementYP", prev.cementYP),
      dispPV: kv(map, "dispPV", prev.dispPV),
      dispYP: kv(map, "dispYP", prev.dispYP),
    }));

    return { ok: true, message: "Данные расчёта загружены. Проверьте результаты ниже." };
  };

  const params = useLocalSearchParams<{ loadId?: string }>();
  const router = useRouter();
  const { getById } = useSavedCalcs();
  useEffect(() => {
    if (!params.loadId) return;
    const entry = getById(params.loadId);
    if (entry) applyImportText(entry.text);
    router.setParams({ loadId: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.loadId]);

  const handleReset = () => {
    setMode("standard");
    setF(defaults);
    setStages(defaultStages);
    setSpacers(defaultSpacers);
    setSf(scheduleDefaults);
    setBufferSteps(defaultBufferSteps);
    setStageRates({});
    setDisplacementSteps(defaultDisplacementSteps);
    setStagePV({});
    setStageYP({});
  };

  return (
    <CalcScreen title="Цементирование ОК">
      <ActionsBar
        moduleKey="cementing"
        moduleTitle="Цементирование ОК"
        buildText={buildExportText}
        onImportText={applyImportText}
        onReset={handleReset}
        mode={mode}
        onModeChange={setMode}
      />

      <Collapsible title="Скважина и колонна" subtitle={f.casingDepthMD ? `Башмак ${f.casingDepthMD} м` : "Не заполнено"}>
        <NumField label="Глубина спуска ОК (башмак), MD" unit="м" value={f.casingDepthMD} onChangeText={set("casingDepthMD")} />
        <NumField label="Забой скважины (0 — равен башмаку, без запаса)" unit="м" value={f.wellTotalDepthMD} onChangeText={set("wellTotalDepthMD")} />
        {isAdvanced ? (
          <NumField label="Глубина башмака по вертикали, TVD (≤ MD)" unit="м" value={f.casingDepthTVD} onChangeText={set("casingDepthTVD")} />
        ) : null}
        <NumField label="Диаметр долота" unit="мм" value={f.holeDiameter} onChangeText={set("holeDiameter")} />
        <NumField label="Коэффициент кавернозности" unit="—" value={f.cavernCoeff} onChangeText={set("cavernCoeff")} />
        <NumField label="Наружный диаметр ОК" unit="мм" value={f.casingOD} onChangeText={set("casingOD")} />
        <NumField label="Толщина стенки ОК" unit="мм" value={f.casingWall} onChangeText={set("casingWall")} />
        <NumField label="Башмак предыдущей колонны" unit="м" value={f.prevCasingDepth} onChangeText={set("prevCasingDepth")} />
        <NumField label="Внутр. диаметр пред. колонны" unit="мм" value={f.prevCasingID} onChangeText={set("prevCasingID")} />
        <NumField label="Глубина установки ЦКОД" unit="м" value={f.ckodDepth} onChangeText={set("ckodDepth")} />
        <NumField label="Плотность бурового раствора" unit="г/см³" value={f.mudDensity} onChangeText={set("mudDensity")} />
      </Collapsible>

      <Collapsible title="Цементные растворы" subtitle={`${stages.length} ст.`}>
        <View style={styles.rowHead}>
          <Text style={styles.emptyText}>Стадии сверху вниз</Text>
          <Pressable style={styles.addBtn} onPress={addStage} testID="add-stage">
            <Plus size={16} color={Colors.text} />
            <Text style={styles.addBtnText}>Раствор</Text>
          </Pressable>
        </View>
        <NumField label="Уровень подъёма цемента (кровля верхней стадии)" unit="м" value={f.cementTopMD} onChangeText={set("cementTopMD")} />
        {stages.map((s, i) => (
          <View key={s.id} style={styles.stageBlock}>
            <View style={styles.rowHead}>
              <Text style={styles.stageTitle}>
                {i + 1}. {s.label}
              </Text>
              {stages.length > 1 ? (
                <Pressable onPress={() => removeStage(s.id)} testID={`remove-stage-${i}`}>
                  <Trash2 size={16} color={Colors.error} />
                </Pressable>
              ) : null}
            </View>
            <NumField
              label={i === stages.length - 1 ? "Подошва (= башмак ОК)" : "Подошва стадии"}
              unit="м"
              value={i === stages.length - 1 ? f.casingDepthMD : s.bottomMD}
              onChangeText={(v) => updateStage(s.id, { bottomMD: v })}
            />
            <NumField label="Плотность раствора" unit="г/см³" value={s.densityGcm3} onChangeText={(v) => updateStage(s.id, { densityGcm3: v })} />
            <NumField label="Выход раствора с 1 т цемента (0 — авто)" unit="м³/т" value={s.yieldPerTon} onChangeText={(v) => updateStage(s.id, { yieldPerTon: v })} />
            <NumField label="В/Ц (0 — авто)" unit="—" value={s.waterRatio} onChangeText={(v) => updateStage(s.id, { waterRatio: v })} />
            <ResultRow label="Объём стадии (авто)" value={fmt(result.stages.find((r) => r.id === s.id)?.volumeM3 ?? 0, 2)} unit="м³" accent />
            <ResultRow label="Вода затворения (авто)" value={fmt(result.stages.find((r) => r.id === s.id)?.waterVolumeM3 ?? 0, 2)} unit="м³" accent />
            <ResultRow label="В/Ц (расчётное)" value={fmt(result.stages.find((r) => r.id === s.id)?.waterCementRatio ?? 0, 3)} />
          </View>
        ))}
      </Collapsible>

      <Collapsible title="Буферные жидкости" subtitle={`${spacers.length} шт.`}>
        <View style={styles.rowHead}>
          <Text style={styles.emptyText}>От цемента к устью</Text>
          <Pressable style={styles.addBtn} onPress={addSpacer} testID="add-spacer">
            <Plus size={16} color={Colors.text} />
            <Text style={styles.addBtnText}>Буфер</Text>
          </Pressable>
        </View>
        {spacers.length === 0 ? <Text style={styles.emptyText}>Буферы не заданы</Text> : null}
        {spacers.map((s, i) => (
          <View key={s.id} style={styles.stageBlock}>
            <View style={styles.rowHead}>
              <Text style={styles.stageTitle}>{s.label}</Text>
              <Pressable onPress={() => removeSpacer(s.id)} testID={`remove-spacer-${i}`}>
                <Trash2 size={16} color={Colors.error} />
              </Pressable>
            </View>
            <NumField label="Объём" unit="м³" value={s.volumeM3} onChangeText={(v) => updateSpacer(s.id, { volumeM3: v })} />
            <NumField label="Плотность" unit="г/см³" value={s.densityGcm3} onChangeText={(v) => updateSpacer(s.id, { densityGcm3: v })} />
          </View>
        ))}
      </Collapsible>

      <Collapsible title="Продавка" subtitle={f.dispDensity ? `${f.dispDensity} г/см³` : undefined}>
        <NumField label="Плотность продавочной жидкости" unit="г/см³" value={f.dispDensity} onChangeText={set("dispDensity")} />
        <NumField label="Коэффициент сжатия продавки" unit="—" value={f.compressionCoeff} onChangeText={set("compressionCoeff")} />
        {isAdvanced ? (
          <Text style={styles.emptyText}>
            Потери на трение в затрубье считаются автоматически по реологии и режимам закачки (карточка ниже): {pumpSchedule ? `${fmt(pumpSchedule.annularFrictionAtEndMPa, 2)} МПа в конце продавки` : "задайте режимы закачки"}.
          </Text>
        ) : null}
      </Collapsible>

      <Card>
        <SectionTitle>Результаты по стадиям</SectionTitle>
        <HeroResult label="Объём цементного раствора (всего)" value={fmt(result.totalSlurryVolume, 1)} unit="м³" />
        {result.stages.map((s) => (
          <View key={s.id} style={styles.stageResult}>
            <Text style={styles.stageResultTitle}>{s.label}</Text>
            <ResultRow label="Интервал" value={`${fmt(s.topMD, 0)}–${fmt(s.bottomMD, 0)}`} unit="м" />
            <ResultRow label="Объём раствора" value={fmt(s.volumeM3, 2)} unit="м³" accent />
            <ResultRow label="Сухой цемент" value={fmt(s.dryMassTons, 2)} unit="т" />
            <ResultRow label="Выход раствора" value={fmt(s.yieldPerTon, 2)} unit="м³/т" />
            <ResultRow label="Вода затворения" value={fmt(s.waterVolumeM3, 2)} unit="м³" />
            <ResultRow label="В/Ц (расчётное)" value={fmt(s.waterCementRatio, 3)} />
          </View>
        ))}
        <View style={styles.totalsBlock}>
          <Text style={styles.totalsTitle}>Итого по всем растворам</Text>
          <ResultRow label="Объём раствора (всего)" value={fmt(result.totalSlurryVolume, 1)} unit="м³" accent />
          <ResultRow label="Сухой цемент (всего)" value={fmt(result.totalDryMassTons, 1)} unit="т" accent />
          <ResultRow label="Вода затворения (всего)" value={fmt(result.totalWaterVolumeM3, 1)} unit="м³" accent />
          <ResultRow label="Объём затрубного пространства" value={fmt(result.totalAnnularVolume, 1)} unit="м³" />
          <ResultRow label="Цементный стакан (ЦКОД→башмак)" value={fmt(result.plugVolume, 2)} unit="м³" />
          {result.ratholeLengthM > 0 ? (
            <>
              <ResultRow label="Запас (башмак→забой)" value={fmt(result.ratholeLengthM, 1)} unit="м" />
              <ResultRow label="Объём цемента в запасе (включён в последнюю стадию)" value={fmt(result.ratholeVolumeM3, 2)} unit="м³" accent />
            </>
          ) : null}
        </View>
        {result.warnings.map((w, i) => (
          <Banner key={i} kind={w.type} text={w.message} />
        ))}
      </Card>

      <Card>
        <SectionTitle>Буферы и продавка</SectionTitle>
        {result.spacers.map((s) => (
          <ResultRow key={s.id} label={`${s.label} (${fmt(s.topMD, 0)}–${fmt(s.bottomMD, 0)} м)`} value={fmt(s.volumeM3, 2)} unit="м³" />
        ))}
        <ResultRow label="Продавочная жидкость" value={fmt(result.displacementVolume, 1)} unit="м³" />
        <ResultRow label="Продавка с коэф. сжатия" value={fmt(result.displacementVolumeWithCompression, 1)} unit="м³" accent />
      </Card>

      {isAdvanced ? (
        <Card>
          <Text style={styles.emptyText}>
            Производительность закачки. Объёмы всех этапов берутся автоматически из расчёта: буфер {fmt(result.totalSpacerVolume, 1)} м³, цементы {fmt(result.totalSlurryVolume, 1)} м³ (по стадиям), продавка {fmt(result.displacementVolume, 1)} м³. Задавайте только расходы.
          </Text>
          <View style={styles.rowHead}>
            <SectionTitle>Производительность — буфер</SectionTitle>
            <Pressable style={styles.addBtn} onPress={bufferStepH.add} testID="add-buffer-regime">
              <Plus size={16} color={Colors.text} />
              <Text style={styles.addBtnText}>Режим</Text>
            </Pressable>
          </View>
          {bufferSteps.map((s, i) => (
            <View key={s.id} style={styles.stageBlock}>
              <View style={styles.rowHead}>
                <Text style={styles.stageTitle}>Режим {i + 1}</Text>
                {bufferSteps.length > 1 ? (
                  <Pressable onPress={() => bufferStepH.remove(s.id)} testID={`remove-buffer-regime-${i}`}>
                    <Trash2 size={16} color={Colors.error} />
                  </Pressable>
                ) : null}
              </View>
              <NumField label="Расход" unit="л/с" value={s.rateLps} onChangeText={(v) => bufferStepH.update(s.id, { rateLps: v })} />
              {i < bufferSteps.length - 1 ? (
                <NumField label="Объём на этом расходе" unit="м³" value={s.volumeM3} onChangeText={(v) => bufferStepH.update(s.id, { volumeM3: v })} />
              ) : (
                <ResultRow label={bufferSteps.length > 1 ? "Объём (авто — остаток)" : "Объём (авто — весь буфер)"} value={fmt(bufferResolved[i]?.volumeM3 ?? 0, 2)} unit="м³" accent />
              )}
            </View>
          ))}

          <View style={[styles.rowHead, styles.stageBlock]}>
            <SectionTitle>Производительность — цементы (по стадиям)</SectionTitle>
          </View>
          {baseResult.stages.map((st, i) => (
            <View key={st.id} style={styles.stageBlock}>
              <Text style={styles.stageTitle}>
                {i + 1}-й цемент — {st.label}
              </Text>
              <NumField
                label="Расход"
                unit="л/с"
                value={stageRates[st.id] ?? ""}
                onChangeText={(v) => setStageRates((p) => ({ ...p, [st.id]: v }))}
                testID={`stage-rate-${i}`}
              />
              <ResultRow label="Объём (авто, из расчёта стадии)" value={fmt(st.volumeM3, 2)} unit="м³" accent />
            </View>
          ))}

          <View style={[styles.rowHead, styles.stageBlock]}>
            <SectionTitle>Производительность — продавка</SectionTitle>
            <Pressable style={styles.addBtn} onPress={displacementStepH.add} testID="add-disp-regime">
              <Plus size={16} color={Colors.text} />
              <Text style={styles.addBtnText}>Режим</Text>
            </Pressable>
          </View>
          {displacementSteps.map((s, i) => (
            <View key={s.id} style={styles.stageBlock}>
              <View style={styles.rowHead}>
                <Text style={styles.stageTitle}>Режим {i + 1}</Text>
                {displacementSteps.length > 1 ? (
                  <Pressable onPress={() => displacementStepH.remove(s.id)} testID={`remove-disp-regime-${i}`}>
                    <Trash2 size={16} color={Colors.error} />
                  </Pressable>
                ) : null}
              </View>
              <NumField label="Расход" unit="л/с" value={s.rateLps} onChangeText={(v) => displacementStepH.update(s.id, { rateLps: v })} />
              {i < displacementSteps.length - 1 ? (
                <NumField label="Объём на этом расходе" unit="м³" value={s.volumeM3} onChangeText={(v) => displacementStepH.update(s.id, { volumeM3: v })} />
              ) : (
                <ResultRow label={displacementSteps.length > 1 ? "Объём (авто — остаток)" : "Объём (авто — вся продавка)"} value={fmt(dispResolved[i]?.volumeM3 ?? 0, 2)} unit="м³" accent />
              )}
            </View>
          ))}

          <View style={styles.stageBlock}>
            <SectionTitle>Реология жидкостей</SectionTitle>
            <NumField label="Бур. раствор — ПВ" unit="сП" value={sf.mudPV} onChangeText={setSchedule("mudPV")} />
            <NumField label="Бур. раствор — ДНС" unit="Па" value={sf.mudYP} onChangeText={setSchedule("mudYP")} />
            <NumField label="Буфер — ПВ" unit="сП" value={sf.bufferPV} onChangeText={setSchedule("bufferPV")} />
            <NumField label="Буфер — ДНС" unit="Па" value={sf.bufferYP} onChangeText={setSchedule("bufferYP")} />
            <NumField label="Цемент (общая) — ПВ" unit="сП" value={sf.cementPV} onChangeText={setSchedule("cementPV")} />
            <NumField label="Цемент (общая) — ДНС" unit="Па" value={sf.cementYP} onChangeText={setSchedule("cementYP")} />
            <Text style={styles.emptyText}>Если у какой-то стадии цемента своя реология отличается от общей — укажите её ниже (0 — берётся общая).</Text>
            {baseResult.stages.map((st, i) => (
              <View key={st.id} style={styles.stageBlock}>
                <Text style={styles.stageTitle}>
                  {i + 1}-й цемент — {st.label}
                </Text>
                <NumField label="ПВ (0 — общая)" unit="сП" value={stagePV[st.id] ?? ""} onChangeText={(v) => setStagePV((p) => ({ ...p, [st.id]: v }))} testID={`stage-pv-${i}`} />
                <NumField label="ДНС (0 — общая)" unit="Па" value={stageYP[st.id] ?? ""} onChangeText={(v) => setStageYP((p) => ({ ...p, [st.id]: v }))} testID={`stage-yp-${i}`} />
              </View>
            ))}
            <NumField label="Продавка — ПВ" unit="сП" value={sf.dispPV} onChangeText={setSchedule("dispPV")} />
            <NumField label="Продавка — ДНС" unit="Па" value={sf.dispYP} onChangeText={setSchedule("dispYP")} />
          </View>
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Проверка на ГРП / поглощение</SectionTitle>
        <NumField label="Градиент ГРП (эквивалент плотности)" unit="г/см³" value={f.fracGradientGcm3} onChangeText={set("fracGradientGcm3")} />
        <ResultRow label="Давление ГРП на башмаке спущенной ОК" value={fmt(result.fracturePressureMPa, 2)} unit="МПа" />
        <ResultRow label="Расчётное давление на башмаке" value={fmt(result.pressureAtCheckDepthMPa, 2)} unit="МПа" accent />
        {isAdvanced ? (
          <>
            <ResultRow label="Гидростатика на башмаке" value={fmt(result.hydrostaticAtShoeMPa, 2)} unit="МПа" />
            <ResultRow label="Трение в затрубье (авто, по гидравлике)" value={fmt(pumpSchedule?.annularFrictionAtEndMPa ?? 0, 2)} unit="МПа" />
            <ResultRow label="ЭЦП макс. при закачке (динамика)" value={fmt(pumpSchedule?.ecdMaxDynamicGcm3 ?? result.ecdAtCheckDepthGcm3, 3)} unit="г/см³" accent />
            <ResultRow label="ЭЦП в конце цементирования (статика)" value={fmt(pumpSchedule?.ecdFinalStaticGcm3 ?? 0, 3)} unit="г/см³" />
          </>
        ) : null}
        {!isAdvanced ? (
          <>
            <ResultRow label="Давление перед СТОП (конец продавки)" value={fmt(result.pressureBeforeStopMPa, 2)} unit="МПа" accent />
            <ResultRow label="СТОП: посадка пробки на ЦКОД" value={fmt(result.stopPressureMPa, 2)} unit="МПа" />
            <ResultRow label="Нагнетание на пробку (фиксировано)" value={`+${fmt(result.testBumpMPa, 2)}`} unit="МПа (30 атм)" />
            <ResultRow label="Давление опрессовки (выдержка 15 мин)" value={fmt(result.testHoldPressureMPa, 2)} unit="МПа" accent />
            <ResultRow label="Давление на забое в конце продавки" value={fmt(result.bottomholeAtStopMPa, 2)} unit="МПа" />
          </>
        ) : (
          <Text style={styles.emptyText}>
            Давления СТОП и опрессовки — в карточке «Давления при закачке» ниже: они считаются по гидравлике режимов закачки и согласованы с этой проверкой на ГРП.
          </Text>
        )}
        <Banner
          kind={result.isFracRisk ? "error" : "success"}
          text={
            result.isFracRisk
              ? "ГРП ЕСТЬ: расчётное давление на башмаке спущенной ОК превышает давление ГРП — риск поглощения!"
              : "ГРП нет: расчётное давление на башмаке ниже давления ГРП."
          }
        />
      </Card>

      {isAdvanced && pumpSchedule ? (
        <Card>
          <SectionTitle>Давления при закачке</SectionTitle>
          <HeroResult label="Давление перед СТОП (конец продавки)" value={fmt(pumpSchedule.pressureBeforeStopMPa, 2)} unit="МПа" />
          <ResultRow label="СТОП: посадка пробки на ЦКОД (скачок)" value={fmt(pumpSchedule.finalPumpPressureMPa, 2)} unit="МПа" />
          <ResultRow label="Нагнетание на пробку (фиксировано)" value={`+${fmt(pumpSchedule.testBumpMPa, 2)}`} unit="МПа (30 атм)" />
          <ResultRow label="Давление опрессовки (выдержка 15 мин)" value={fmt(pumpSchedule.testHoldPressureMPa, 2)} unit="МПа" accent />
          <ResultRow label="Давление удержания после остановки насоса" value={fmt(pumpSchedule.holdPressureMPa, 2)} unit="МПа" />
          <ResultRow label="Давление на забое в конце цементирования" value={fmt(pumpSchedule.finalBottomholePressureMPa, 2)} unit="МПа" accent />
          <ResultRow label="Давление ГРП на башмаке ОК" value={fmt(pumpSchedule.fracturePressureAtBottomMPa, 2)} unit="МПа" />
          <ResultRow label="Макс. давление на забое за закачку" value={fmt(pumpSchedule.maxBottomholePressureMPa, 2)} unit="МПа" />
          <ResultRow label="Макс. давление на насосе за закачку" value={fmt(pumpSchedule.maxPumpPressureMPa, 2)} unit="МПа" />
          <ResultRow label="Время закачки" value={fmt(pumpSchedule.totalTimeMin, 0)} unit="мин" />
          <ResultRow label="Плотность буфера (осредн.)" value={fmt(pumpSchedule.bufferDensityGcm3, 2)} unit="г/см³" />
          <ResultRow label="Плотность цемента (осредн.)" value={fmt(pumpSchedule.cementDensityGcm3, 2)} unit="г/см³" />
          <ResultRow label="Плотность продавки" value={fmt(pumpSchedule.displacementDensityGcm3, 2)} unit="г/см³" />
          <Banner
            kind={pumpSchedule.isFracRiskAtBottom ? "error" : "success"}
            text={
              pumpSchedule.isFracRiskAtBottom
                ? "Внимание: давление на забое в процессе закачки превышает давление ГРП — риск поглощения у башмака!"
                : "Давление на забое в течение закачки ниже давления ГРП — риск поглощения не выявлен."
            }
          />
        </Card>
      ) : null}

      {isAdvanced && pumpSchedule ? (
        <Card>
          <SectionTitle>Порядок работ по времени</SectionTitle>
          {pumpSchedule.scheduleRows.map((r, i) => (
            <View key={`${r.label}-${i}`} style={styles.stageResult}>
              <Text style={styles.stageResultTitle}>
                {i + 1}. {r.label}
              </Text>
              <ResultRow label="Расход / плотность" value={`${fmt(r.rateLps, 1)} л/с · ${fmt(r.densityGcm3, 2)}`} unit="г/см³" />
              <ResultRow label="Объём этапа" value={fmt(r.volumeM3, 2)} unit="м³" />
              <ResultRow label="Время этапа" value={fmt(r.timeMin, 0)} unit="мин" />
              <ResultRow label="Накоплено: объём · время" value={`${fmt(r.cumVolumeM3, 1)} м³ · ${fmt(r.cumTimeMin, 0)} мин`} accent />
            </View>
          ))}
          <ResultRow label="СТОП: посадка пробки + опрессовка" value="≈5" unit="мин" />
          <ResultRow label="Итого: объём закачки" value={fmt(pumpSchedule.totalVolumeM3, 1)} unit="м³" accent />
          <ResultRow label="Итого: время операции" value={fmt(pumpSchedule.totalTimeMin, 0)} unit="мин" accent />
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Геометрия</SectionTitle>
        <ResultRow label="Внутренний диаметр ОК" value={fmt(result.casingID, 1)} unit="мм" />
        <ResultRow label="V 1 м трубного пространства" value={fmt(result.pipeVolumePerMeter, 4)} unit="м³/м" />
        <ResultRow label="V 1 м затруба (откр. ствол)" value={fmt(result.annularVolumePerMeterOpenHole, 4)} unit="м³/м" />
        <ResultRow label="V 1 м затруба (в пред. ОК)" value={fmt(result.annularVolumePerMeterInterCasing, 4)} unit="м³/м" />
      </Card>

      <Card>
        <SectionTitle>Схема скважины (продольный разрез)</SectionTitle>
        <SaveableView>
          <WellSchematic
            profile={result.profile}
            totalDepthMD={parseNum(f.casingDepthMD)}
            wellTotalDepthMD={result.wellTotalDepthMD}
            prevCasingDepth={parseNum(f.prevCasingDepth)}
            ckodDepth={parseNum(f.ckodDepth)}
            holeDiameter={parseNum(f.holeDiameter)}
            casingOD={parseNum(f.casingOD)}
            casingID={result.casingID}
            prevCasingID={parseNum(f.prevCasingID)}
          />
        </SaveableView>
      </Card>

      <Card>
        <SectionTitle>Давление по глубине (забойное и ГРП)</SectionTitle>
        <Text style={styles.emptyText}>
          Гидростатика в затрубье (по стадиям растворов и буферов) в сравнении с давлением ГРП по глубине — так видно запас до поглощения на любом интервале.
        </Text>
        <SaveableView>
          <PressureChart points={pressurePoints} />
        </SaveableView>
      </Card>

      {isAdvanced && pumpSchedule ? (
        <Card>
          <SectionTitle>Совмещённый график цементирования</SectionTitle>
          <Text style={styles.emptyText}>Пунктирная линия — давление опрессовки ({fmt(pumpSchedule.testHoldPressureMPa, 1)} МПа, выдержка 15 мин).</Text>
          <SaveableView>
            <PumpScheduleChart points={pumpSchedule.points} testPressureMPa={pumpSchedule.testHoldPressureMPa} />
          </SaveableView>
        </Card>
      ) : null}
    </CalcScreen>
  );
}

const createStyles = (Colors: Palette) =>
  StyleSheet.create({
  rowHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: Colors.primarySoft,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: Colors.text,
  },
  stageBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    marginTop: 8,
    paddingTop: 8,
  },
  stageTitle: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: Colors.text,
  },
  emptyText: {
    fontSize: 13.5,
    color: Colors.muted,
    paddingVertical: 6,
    lineHeight: 18,
  },
  stageResult: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    marginTop: 8,
    paddingTop: 6,
  },
  stageResultTitle: {
    fontSize: 15,
    fontWeight: "800" as const,
    color: Colors.accent,
    marginBottom: 2,
  },
  totalsBlock: {
    backgroundColor: Colors.primarySoft,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 14,
  },
  totalsTitle: {
    fontSize: 14,
    fontWeight: "800" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    color: Colors.text,
    marginBottom: 4,
    marginTop: 4,
  },
  });
