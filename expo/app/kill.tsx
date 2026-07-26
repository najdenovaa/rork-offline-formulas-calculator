import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Line, Polyline, Text as SvgText } from "react-native-svg";

import ActionsBar, { type ImportResult } from "@/components/ActionsBar";
import CalcScreen from "@/components/CalcScreen";
import Chips from "@/components/Chips";
import Collapsible from "@/components/Collapsible";
import NumField from "@/components/NumField";
import { Banner, Card, HeroResult, ResultRow, SectionTitle } from "@/components/Results";
import SaveableView from "@/components/SaveableView";
import { useSavedCalcs } from "@/lib/savedCalcs";
import { useTheme } from "@/lib/theme";
import {
  calculateBrineRecipe,
  calculateKill,
  KILL_METHOD_LABELS,
  type KillInput,
  type KillMethod,
  type KillResult,
} from "@/lib/formulas/kill";
import { fmt, parseNum } from "@/lib/num";
import { usePersistedState } from "@/lib/persist";
import { buildHeader, field, kv, parseKV, section } from "@/lib/textCodec";

type FieldKey =
  | "formationPressureMPa"
  | "reservoirDepthTVD"
  | "fracturePressureMPa"
  | "currentMudDensity"
  | "wellDepthMD"
  | "casingID_mm"
  | "tubingOD_mm"
  | "tubingID_mm"
  | "safetyMarginPct"
  | "pumpRateLs"
  | "killFluidPV_cP"
  | "killFluidYP_Pa"
  | "brineVolumeM3";

// Первый запуск — пустые поля; последний расчёт восстанавливается из памяти устройства (офлайн)
const defaults: Record<FieldKey, string> = {
  formationPressureMPa: "",
  reservoirDepthTVD: "",
  fracturePressureMPa: "",
  currentMudDensity: "",
  wellDepthMD: "",
  casingID_mm: "",
  tubingOD_mm: "",
  tubingID_mm: "",
  safetyMarginPct: "",
  pumpRateLs: "",
  killFluidPV_cP: "",
  killFluidYP_Pa: "",
  brineVolumeM3: "",
};

const methodOptions = (Object.keys(KILL_METHOD_LABELS) as KillMethod[]).map((m) => ({
  value: m,
  label: KILL_METHOD_LABELS[m],
}));

/** График давления циркуляции: линейный переход ICP → FCP по мере прокачки НКТ */
function CircPressureChart({ result }: { result: KillResult }) {
  const { colors: Colors } = useTheme();
  const w = 320;
  const h = 190;
  const padL = 36;
  const padR = 10;
  const padT = 12;
  const padB = 26;
  const maxV = Math.max(0.1, result.tubingCapacityM3);
  const maxP = Math.max(result.initialCircPressureMPa, result.finalCircPressureMPa, 1) * 1.15;

  const x = (v: number) => padL + (v / maxV) * (w - padL - padR);
  const y = (p: number) => padT + (1 - Math.min(p, maxP) / maxP) * (h - padT - padB);

  const pts: string[] = [];
  for (let i = 0; i <= 20; i++) {
    const frac = i / 20;
    const v = maxV * frac;
    const p = result.initialCircPressureMPa + (result.finalCircPressureMPa - result.initialCircPressureMPa) * frac;
    pts.push(`${x(v)},${y(p)}`);
  }

  const pTicks = 4;
  const vTicks = 4;

  return (
    <View>
      <Svg width={w} height={h}>
        {Array.from({ length: pTicks + 1 }).map((_, i) => {
          const p = (maxP / pTicks) * i;
          return (
            <React.Fragment key={`p-${i}`}>
              <Line x1={padL} x2={w - padR} y1={y(p)} y2={y(p)} stroke={Colors.border} strokeWidth={0.5} />
              <SvgText x={padL - 4} y={y(p) + 3} fontSize={8} fill={Colors.muted} textAnchor="end">
                {fmt(p, 1)}
              </SvgText>
            </React.Fragment>
          );
        })}
        {Array.from({ length: vTicks + 1 }).map((_, i) => {
          const v = (maxV / vTicks) * i;
          return (
            <React.Fragment key={`v-${i}`}>
              <Line x1={x(v)} x2={x(v)} y1={padT} y2={h - padB} stroke={Colors.border} strokeWidth={0.5} />
              <SvgText x={x(v)} y={h - padB + 12} fontSize={8} fill={Colors.muted} textAnchor="middle">
                {fmt(v, 1)}
              </SvgText>
            </React.Fragment>
          );
        })}
        <Polyline points={pts.join(" ")} fill="none" stroke={Colors.primary} strokeWidth={2} />
        <SvgText x={x(0) + 4} y={y(result.initialCircPressureMPa) - 5} fontSize={9} fill={Colors.primary} fontWeight="bold">
          НДЦ {fmt(result.initialCircPressureMPa, 1)}
        </SvgText>
        <SvgText x={w - padR - 4} y={y(result.finalCircPressureMPa) - 5} fontSize={9} fill={Colors.primary} fontWeight="bold" textAnchor="end">
          КДЦ {fmt(result.finalCircPressureMPa, 1)}
        </SvgText>
        <SvgText x={w / 2} y={h - 2} fontSize={9} fill={Colors.muted} textAnchor="middle">
          Прокачано в НКТ, м³
        </SvgText>
      </Svg>
      <Text style={[styles.chartHint, { color: Colors.muted }]}>Давление на насосе, МПа: от начального (НДЦ) к конечному (КДЦ) по мере заполнения НКТ жидкостью глушения.</Text>
    </View>
  );
}

export default function KillScreen() {
  const { colors } = useTheme();
  const [method, setMethod] = usePersistedState<KillMethod>("calc:kill:method", "wait_weight");
  const [f, setF] = usePersistedState<Record<FieldKey, string>>("calc:kill:fields", defaults);
  const set = (k: FieldKey) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const result = useMemo(() => {
    const input: KillInput = {
      method,
      formationPressureMPa: parseNum(f.formationPressureMPa),
      reservoirDepthTVD: parseNum(f.reservoirDepthTVD),
      fracturePressureMPa: parseNum(f.fracturePressureMPa),
      currentMudDensity: parseNum(f.currentMudDensity) || 1,
      wellDepthMD: parseNum(f.wellDepthMD),
      casingID_mm: parseNum(f.casingID_mm),
      tubingOD_mm: parseNum(f.tubingOD_mm),
      tubingID_mm: parseNum(f.tubingID_mm),
      killFluidPV_cP: parseNum(f.killFluidPV_cP),
      killFluidYP_Pa: parseNum(f.killFluidYP_Pa),
      pumpRateLs: parseNum(f.pumpRateLs),
      safetyMarginPct: parseNum(f.safetyMarginPct),
    };
    return calculateKill(input);
  }, [f, method]);

  const brine = useMemo(() => {
    const vol = parseNum(f.brineVolumeM3) || result.killVolumeM3;
    return calculateBrineRecipe(result.killDensity, vol, "auto");
  }, [f.brineVolumeM3, result.killDensity, result.killVolumeM3]);

  const isCirculation = method === "driller" || method === "wait_weight";

  const buildExportText = (): string => {
    const lines: string[] = [buildHeader("Глушение скважины", "kill")];
    lines.push(section("Метод глушения"));
    lines.push(field("Метод", "method", method));
    lines.push(section("Пласт и скважина"));
    lines.push(field("Пластовое давление", "formationPressureMPa", f.formationPressureMPa, "МПа"));
    lines.push(field("Глубина пласта (TVD)", "reservoirDepthTVD", f.reservoirDepthTVD, "м"));
    lines.push(field("Давление ГРП", "fracturePressureMPa", f.fracturePressureMPa, "МПа"));
    lines.push(field("Текущая плотность в скважине", "currentMudDensity", f.currentMudDensity, "г/см3"));
    lines.push(field("Глубина скважины (MD)", "wellDepthMD", f.wellDepthMD, "м"));
    lines.push(field("Внутр. диаметр ЭК", "casingID_mm", f.casingID_mm, "мм"));
    lines.push(field("Наружный диаметр НКТ", "tubingOD_mm", f.tubingOD_mm, "мм"));
    lines.push(field("Внутренний диаметр НКТ", "tubingID_mm", f.tubingID_mm, "мм"));
    lines.push(section("Параметры глушения"));
    lines.push(field("Запас плотности", "safetyMarginPct", f.safetyMarginPct, "%"));
    lines.push(field("Подача насоса", "pumpRateLs", f.pumpRateLs, "л/с"));
    lines.push(field("ПВ жидкости глушения", "killFluidPV_cP", f.killFluidPV_cP, "сПз"));
    lines.push(field("ДНС жидкости глушения", "killFluidYP_Pa", f.killFluidYP_Pa, "Па"));
    lines.push(section("Рецептура солевого раствора"));
    lines.push(field("Объём приготовления (0 — весь объём глушения)", "brineVolumeM3", f.brineVolumeM3, "м3"));
    lines.push(section("Результаты (справочно)"));
    lines.push(`Плотность жидкости глушения: ${fmt(result.killDensity, 2)} г/см3`);
    lines.push(`Объём жидкости глушения: ${fmt(result.killVolumeM3, 1)} м3`);
    return lines.join("\n");
  };

  const applyImportText = (text: string): ImportResult => {
    const map = parseKV(text);
    if (Object.keys(map).length === 0) {
      return { ok: false, message: "В тексте не найдено ни одного поля вида [ключ]: значение." };
    }
    const foundModule = map.module;
    if (foundModule && foundModule !== "kill") {
      return { ok: false, message: `Это данные другого расчёта (${foundModule}), а не «Глушение скважины».` };
    }
    if (map.method && (Object.keys(KILL_METHOD_LABELS) as string[]).includes(map.method)) {
      setMethod(map.method as KillMethod);
    }
    setF((prev) => ({
      ...prev,
      formationPressureMPa: kv(map, "formationPressureMPa", prev.formationPressureMPa),
      reservoirDepthTVD: kv(map, "reservoirDepthTVD", prev.reservoirDepthTVD),
      fracturePressureMPa: kv(map, "fracturePressureMPa", prev.fracturePressureMPa),
      currentMudDensity: kv(map, "currentMudDensity", prev.currentMudDensity),
      wellDepthMD: kv(map, "wellDepthMD", prev.wellDepthMD),
      casingID_mm: kv(map, "casingID_mm", prev.casingID_mm),
      tubingOD_mm: kv(map, "tubingOD_mm", prev.tubingOD_mm),
      tubingID_mm: kv(map, "tubingID_mm", prev.tubingID_mm),
      safetyMarginPct: kv(map, "safetyMarginPct", prev.safetyMarginPct),
      pumpRateLs: kv(map, "pumpRateLs", prev.pumpRateLs),
      killFluidPV_cP: kv(map, "killFluidPV_cP", prev.killFluidPV_cP),
      killFluidYP_Pa: kv(map, "killFluidYP_Pa", prev.killFluidYP_Pa),
      brineVolumeM3: kv(map, "brineVolumeM3", prev.brineVolumeM3),
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
    setMethod("wait_weight");
    setF(defaults);
  };

  return (
    <CalcScreen title="Глушение скважины">
      <ActionsBar
        moduleKey="kill"
        moduleTitle="Глушение скважины"
        buildText={buildExportText}
        onImportText={applyImportText}
        onReset={handleReset}
      />

      <Card>
        <SectionTitle>Метод глушения</SectionTitle>
        <Chips options={methodOptions} value={method} onChange={setMethod} />
      </Card>

      <Collapsible title="Пласт и скважина" defaultOpen>
        <NumField label="Пластовое давление" unit="МПа" value={f.formationPressureMPa} onChangeText={set("formationPressureMPa")} />
        <NumField label="Глубина пласта (TVD)" unit="м" value={f.reservoirDepthTVD} onChangeText={set("reservoirDepthTVD")} />
        <NumField label="Давление ГРП" unit="МПа" value={f.fracturePressureMPa} onChangeText={set("fracturePressureMPa")} />
        <NumField label="Текущая плотность в скважине" unit="г/см³" value={f.currentMudDensity} onChangeText={set("currentMudDensity")} />
        <NumField label="Глубина скважины (MD)" unit="м" value={f.wellDepthMD} onChangeText={set("wellDepthMD")} />
        <NumField label="Внутр. диаметр ЭК" unit="мм" value={f.casingID_mm} onChangeText={set("casingID_mm")} />
        <NumField label="Наружный диаметр НКТ" unit="мм" value={f.tubingOD_mm} onChangeText={set("tubingOD_mm")} />
        <NumField label="Внутренний диаметр НКТ" unit="мм" value={f.tubingID_mm} onChangeText={set("tubingID_mm")} />
      </Collapsible>

      <Collapsible title="Параметры глушения">
        <NumField label="Запас плотности (обычно 3–5%)" unit="%" value={f.safetyMarginPct} onChangeText={set("safetyMarginPct")} />
        <NumField label="Подача насоса" unit="л/с" value={f.pumpRateLs} onChangeText={set("pumpRateLs")} />
        <NumField label="ПВ жидкости глушения" unit="сПз" value={f.killFluidPV_cP} onChangeText={set("killFluidPV_cP")} />
        <NumField label="ДНС жидкости глушения" unit="Па" value={f.killFluidYP_Pa} onChangeText={set("killFluidYP_Pa")} />
      </Collapsible>

      <Card>
        <SectionTitle>Результаты</SectionTitle>
        <HeroResult label="Плотность жидкости глушения" value={fmt(result.killDensity, 2)} unit="г/см³" />
        <ResultRow label="Балансовая плотность (Pпл / g·H)" value={fmt(result.balanceDensity, 3)} unit="г/см³" />
        <ResultRow label="Забойное давление при глушении" value={fmt(result.bottomholePressureMPa, 1)} unit="МПа" accent />
        <ResultRow label="Давление ГРП" value={fmt(parseNum(f.fracturePressureMPa), 1)} unit="МПа" />
        <ResultRow label="Объём жидкости глушения" value={fmt(result.killVolumeM3, 1)} unit="м³" accent />
        <ResultRow label="— в НКТ" value={fmt(result.tubingCapacityM3, 1)} unit="м³" />
        <ResultRow label="— в затрубье" value={fmt(result.annulusCapacityM3, 1)} unit="м³" />
        <ResultRow label="Потери на трение (затрубье)" value={fmt(result.frictionLossMPa, 2)} unit="МПа" />
        {isCirculation ? (
          <>
            <ResultRow label="Начальное давление циркуляции (НДЦ)" value={fmt(result.initialCircPressureMPa, 2)} unit="МПа" />
            <ResultRow label="Конечное давление циркуляции (КДЦ)" value={fmt(result.finalCircPressureMPa, 2)} unit="МПа" />
          </>
        ) : null}
        {method === "bullhead" ? (
          <ResultRow label="Устьевое давление задавки" value={fmt(result.bullheadSurfacePressureMPa, 1)} unit="МПа" accent />
        ) : null}
        <Banner kind={result.exceedsFracture ? "error" : "success"} text={result.exceedsFracture ? "Превышение давления ГРП — риск поглощения!" : "Забойное давление ниже давления ГРП — в безопасном окне."} />
        {result.warnings.map((w, i) => (
          <Banner key={i} kind="warning" text={w} />
        ))}
        <Banner kind="info" text={result.recommendation} />
      </Card>

      {isCirculation ? (
        <Card>
          <SectionTitle>График давления циркуляции</SectionTitle>
          <SaveableView>
            <CircPressureChart result={result} />
          </SaveableView>
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Подбор жидкости глушения</SectionTitle>
        {result.fluidSuitability.map((fl) => (
          <View key={fl.name} style={[styles.fluidRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.fluidName, { color: colors.text }]}>{fl.name}</Text>
            <Text style={[styles.fluidDensity, { color: colors.muted }]}>до {fmt(fl.maxDensity, 1)} г/см³</Text>
            <View style={[styles.fluidBadge, { backgroundColor: fl.suitable ? colors.successBg : colors.errorBg }]}>
              <Text style={[styles.fluidBadgeText, { color: fl.suitable ? colors.success : colors.error }]}>
                {fl.suitable ? "Подходит" : "Нет"}
              </Text>
            </View>
          </View>
        ))}
        <Banner kind="info" text={`Рекомендуемая жидкость: ${result.selectedFluid}`} />
      </Card>

      <Collapsible title="Рецептура солевого раствора">
        <NumField label="Объём приготовления (0 — весь объём глушения)" unit="м³" value={f.brineVolumeM3} onChangeText={set("brineVolumeM3")} />
        <ResultRow label="Соль" value={brine.saltName} />
        <ResultRow label="Концентрация чистой соли" value={fmt(brine.wtPctClean, 1)} unit="% масс." />
        <ResultRow label="Насыщение" value={fmt(brine.saturationPct, 0)} unit="%" />
        <ResultRow label="Товарная соль (с уч. чистоты)" value={fmt(brine.productMassKg / 1000, 2)} unit="т" accent />
        <ResultRow label="Вода" value={fmt(brine.waterMassKg / 1000, 2)} unit="м³" accent />
        {brine.warnings.map((w, i) => (
          <Banner key={i} kind={brine.feasible ? "warning" : "error"} text={w} />
        ))}
      </Collapsible>
    </CalcScreen>
  );
}

const styles = StyleSheet.create({
  chartHint: {
    fontSize: 12.5,
    marginTop: 6,
    lineHeight: 17,
  },
  fluidRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  fluidName: {
    flex: 1,
    fontSize: 15,
  },
  fluidDensity: {
    fontSize: 13,
  },
  fluidBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  fluidBadgeText: {
    fontSize: 12,
    fontWeight: "700" as const,
  },
});
