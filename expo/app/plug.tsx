import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo } from "react";
import { Platform, StyleSheet, Switch, Text, View } from "react-native";
import Svg, { Line, Rect, Text as SvgText } from "react-native-svg";

import ActionsBar, { type ImportResult } from "@/components/ActionsBar";
import CalcScreen from "@/components/CalcScreen";
import Chips from "@/components/Chips";
import Collapsible from "@/components/Collapsible";
import NumField from "@/components/NumField";
import PlugSchematic from "@/components/PlugSchematic";
import { Banner, Card, HeroResult, ResultRow, SectionTitle } from "@/components/Results";
import SaveableView from "@/components/SaveableView";
import { useSavedCalcs } from "@/lib/savedCalcs";
import { useTheme } from "@/lib/theme";
import { calculateBalancedPlug, type PlugInput, type PlugResult, type WashType } from "@/lib/formulas/plug";
import { fmt, parseNum } from "@/lib/num";
import { usePersistedState } from "@/lib/persist";
import { buildHeader, field, kv, parseKV, section } from "@/lib/textCodec";

function niceStep(range: number, targetTicks: number): number {
  const raw = range / Math.max(1, targetTicks);
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, raw))));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

/** Цвет этапа по жидкости/типу операции */
function stageColor(name: string, fluid: string): string {
  const n = `${name} ${fluid}`.toLowerCase();
  if (n.includes("цемент")) return "#78909C";
  if (n.includes("пачк")) return "#AB47BC";
  if (n.includes("буфер")) return "#4FC3F7";
  if (n.includes("промыв") || n.includes("срезк")) return "#29A37A";
  if (n.includes("подъём") || n.includes("спуск")) return "#8B7355";
  return "#4A90D9";
}

/** Таймлайн операции: этапы по времени + лимит 75% загустевания */
function StageTimelineChart({ result }: { result: PlugResult }) {
  const { colors: Colors } = useTheme();
  const w = 320;
  const barH = 26;
  const padL = 10;
  const padR = 12;
  const barY = 22;
  const axisY = barY + barH + 6;
  const h = axisY + 30;

  const total = Math.max(1, result.totalOperationTimeMin);
  const showLimit = result.safeTime75Min > 0 && result.safeTime75Min <= total * 1.05;
  const maxT = Math.max(total, showLimit ? result.safeTime75Min : 0) * 1.05;
  const x = (t: number) => padL + (t / maxT) * (w - padL - padR);

  const step = niceStep(maxT, 5);
  const ticks: number[] = [];
  for (let t = 0; t <= maxT + 1e-9; t += step) ticks.push(t);

  let cursor = 0;

  return (
    <View style={timelineStyles.wrap}>
      <Svg width={w} height={h}>
        {ticks.map((t) => (
          <React.Fragment key={t}>
            <Line x1={x(t)} x2={x(t)} y1={barY - 4} y2={axisY} stroke={Colors.border} strokeWidth={0.6} />
            <SvgText x={x(t)} y={axisY + 12} fontSize={8} fill={Colors.muted} textAnchor="middle">
              {fmt(t, 0)}
            </SvgText>
          </React.Fragment>
        ))}

        {result.pumpingStages.map((s, i) => {
          const x0 = x(cursor);
          cursor += s.timeMin;
          const x1 = x(cursor);
          return (
            <Rect
              key={`${s.name}-${i}`}
              x={x0}
              y={barY}
              width={Math.max(1, x1 - x0)}
              height={barH}
              fill={stageColor(s.name, s.fluid)}
              stroke="#FFFFFF"
              strokeWidth={0.5}
            />
          );
        })}

        <SvgText x={x(total)} y={barY - 8} fontSize={9} fill={Colors.text} fontWeight="bold" textAnchor="end">
          Всего {fmt(total, 0)} мин
        </SvgText>

        {showLimit ? (
          <>
            <Line
              x1={x(result.safeTime75Min)}
              x2={x(result.safeTime75Min)}
              y1={barY - 4}
              y2={axisY}
              stroke={result.isTimeSafe ? Colors.success : Colors.error}
              strokeWidth={2}
              strokeDasharray="5,3"
            />
            <SvgText
              x={x(result.safeTime75Min)}
              y={h - 4}
              fontSize={8.5}
              fill={result.isTimeSafe ? Colors.success : Colors.error}
              fontWeight="bold"
              textAnchor={result.safeTime75Min / maxT > 0.7 ? "end" : "middle"}
            >
              75% загуст. {fmt(result.safeTime75Min, 0)} мин
            </SvgText>
          </>
        ) : (
          <SvgText x={(padL + w - padR) / 2} y={h - 4} fontSize={9} fill={Colors.muted} textAnchor="middle">
            Время, мин
          </SvgText>
        )}
      </Svg>
      <View style={timelineStyles.legend}>
        {result.pumpingStages.map((s, i) => (
          <View key={`${s.name}-${i}`} style={timelineStyles.legendRow}>
            <View style={[timelineStyles.legendDot, { backgroundColor: stageColor(s.name, s.fluid) }]} />
            <Text style={[timelineStyles.legendText, { color: Colors.muted }]} numberOfLines={1}>
              {s.name} — {fmt(s.timeMin, 0)} мин
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const timelineStyles = StyleSheet.create({
  wrap: {
    paddingTop: 4,
  },
  legend: {
    gap: 4,
    marginTop: 6,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12.5,
    flexShrink: 1,
  },
});

const washOptions = [
  { value: "direct" as const, label: "Прямая" },
  { value: "reverse" as const, label: "Обратная" },
];

type FieldKey =
  | "plugTopMD"
  | "plugBottomMD"
  | "boreDiameter"
  | "cavernCoeff"
  | "pipeOD"
  | "pipeID"
  | "cementDensity"
  | "wcRatio"
  | "slurryYield"
  | "spacerDensity"
  | "wellFluidDensity"
  | "dispDensity"
  | "spacerAboveM3"
  | "padVolumeM3"
  | "padDensity"
  | "padPullUpAboveM"
  | "pullOutAbovePlugM"
  | "washCycles"
  | "tripSpeedMs"
  | "pumpRateCementLs"
  | "pumpRateSpacerLs"
  | "pumpRateDisplacementLs"
  | "pumpRateWashLs"
  | "thickeningTimeMin";

// Первый запуск — пустые поля; последний расчёт восстанавливается из памяти устройства (офлайн)
const defaults: Record<FieldKey, string> = {
  plugTopMD: "",
  plugBottomMD: "",
  boreDiameter: "",
  cavernCoeff: "",
  pipeOD: "",
  pipeID: "",
  cementDensity: "",
  wcRatio: "",
  slurryYield: "",
  spacerDensity: "",
  wellFluidDensity: "",
  dispDensity: "",
  spacerAboveM3: "",
  padVolumeM3: "",
  padDensity: "",
  padPullUpAboveM: "",
  pullOutAbovePlugM: "",
  washCycles: "",
  tripSpeedMs: "",
  pumpRateCementLs: "",
  pumpRateSpacerLs: "",
  pumpRateDisplacementLs: "",
  pumpRateWashLs: "",
  thickeningTimeMin: "",
};

export default function PlugScreen() {
  const { colors } = useTheme();
  const [f, setF] = usePersistedState<Record<FieldKey, string>>("calc:plug:fields", defaults);
  const [washType, setWashType] = usePersistedState<WashType>("calc:plug:washType", "direct");
  const [useViscousPad, setUseViscousPad] = usePersistedState<boolean>("calc:plug:viscousPad", false);
  const set = (k: FieldKey) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const togglePad = (v: boolean) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setUseViscousPad(v);
  };

  const result = useMemo(() => {
    const input: PlugInput = {
      plugTopMD: parseNum(f.plugTopMD),
      plugBottomMD: parseNum(f.plugBottomMD),
      boreDiameter: parseNum(f.boreDiameter),
      cavernCoeff: parseNum(f.cavernCoeff) || 1,
      pipeOD: parseNum(f.pipeOD),
      pipeID: parseNum(f.pipeID),
      cementDensity: parseNum(f.cementDensity) || 1.85,
      wcRatio: parseNum(f.wcRatio),
      slurryYield: parseNum(f.slurryYield),
      spacerDensity: parseNum(f.spacerDensity) || 1.1,
      wellFluidDensity: parseNum(f.wellFluidDensity) || 1.1,
      displacementDensity: parseNum(f.dispDensity) || parseNum(f.wellFluidDensity) || 1.1,
      spacerAboveM3: parseNum(f.spacerAboveM3),
      useViscousPad,
      padVolumeM3: parseNum(f.padVolumeM3),
      padDensity: parseNum(f.padDensity) || 1.15,
      padPullUpAboveM: parseNum(f.padPullUpAboveM) || 5,
      pullOutAbovePlugM: parseNum(f.pullOutAbovePlugM),
      washType,
      washCycles: parseNum(f.washCycles) || 1,
      tripSpeedMs: parseNum(f.tripSpeedMs) || 0.3,
      pumpRateCementLs: parseNum(f.pumpRateCementLs),
      pumpRateSpacerLs: parseNum(f.pumpRateSpacerLs),
      pumpRateDisplacementLs: parseNum(f.pumpRateDisplacementLs),
      pumpRateWashLs: parseNum(f.pumpRateWashLs),
      thickeningTimeMin: parseNum(f.thickeningTimeMin),
    };
    return calculateBalancedPlug(input);
  }, [f, washType, useViscousPad]);

  const buildExportText = (): string => {
    const lines: string[] = [buildHeader("Цементный мост", "plug")];
    lines.push(section("Интервал моста"));
    lines.push(field("Кровля моста", "plugTopMD", f.plugTopMD, "м"));
    lines.push(field("Подошва моста", "plugBottomMD", f.plugBottomMD, "м"));
    lines.push(field("Диаметр ствола / ID ЭК", "boreDiameter", f.boreDiameter, "мм"));
    lines.push(field("Коэф. кавернозности", "cavernCoeff", f.cavernCoeff));
    lines.push(section("Заливочная колонна"));
    lines.push(field("Наружный диаметр НКТ/БТ", "pipeOD", f.pipeOD, "мм"));
    lines.push(field("Внутренний диаметр НКТ/БТ", "pipeID", f.pipeID, "мм"));
    lines.push(field("Скорость СПО", "tripSpeedMs", f.tripSpeedMs, "м/с"));
    lines.push(section("Рецептура ЦР"));
    lines.push(field("Плотность ЦР", "cementDensity", f.cementDensity, "г/см3"));
    lines.push(field("Выход раствора с 1 т цемента", "slurryYield", f.slurryYield, "м3/т"));
    lines.push(field("В/Ц", "wcRatio", f.wcRatio));
    lines.push(field("Время загустевания ЦР", "thickeningTimeMin", f.thickeningTimeMin, "мин"));
    lines.push(section("Жидкости"));
    lines.push(field("Плотность буфера", "spacerDensity", f.spacerDensity, "г/см3"));
    lines.push(field("Плотность скважинной жидкости (затрубье)", "wellFluidDensity", f.wellFluidDensity, "г/см3"));
    lines.push(field("Плотность продавочной жидкости", "dispDensity", f.dispDensity, "г/см3"));
    lines.push(field("Буферная жидкость над цементом", "spacerAboveM3", f.spacerAboveM3, "м3"));
    lines.push(section("Нижняя вязкая пачка"));
    lines.push(field("Использовать пачку (true/false)", "useViscousPad", useViscousPad ? "true" : "false"));
    lines.push(field("Объём вязкой пачки", "padVolumeM3", f.padVolumeM3, "м3"));
    lines.push(field("Плотность пачки", "padDensity", f.padDensity, "г/см3"));
    lines.push(field("Подъём над пачкой", "padPullUpAboveM", f.padPullUpAboveM, "м"));
    lines.push(section("Подъём и срезка"));
    lines.push(field("Подъём над кровлей моста", "pullOutAbovePlugM", f.pullOutAbovePlugM, "м"));
    lines.push(field("Тип промывки (direct/reverse)", "washType", washType));
    lines.push(field("Количество циклов промывки", "washCycles", f.washCycles));
    lines.push(section("Производительности"));
    lines.push(field("Закачка ЦР", "pumpRateCementLs", f.pumpRateCementLs, "л/с"));
    lines.push(field("Закачка буфера / пачки", "pumpRateSpacerLs", f.pumpRateSpacerLs, "л/с"));
    lines.push(field("Продавка", "pumpRateDisplacementLs", f.pumpRateDisplacementLs, "л/с"));
    lines.push(field("Промывка", "pumpRateWashLs", f.pumpRateWashLs, "л/с"));
    lines.push(section("Результаты (справочно)"));
    lines.push(`Объём цементного раствора: ${fmt(result.cementVolumeTotal, 2)} м3`);
    lines.push(`Разбаланс труба − затрубье: ${fmt(result.imbalanceMPa, 2)} МПа`);
    return lines.join("\n");
  };

  const applyImportText = (text: string): ImportResult => {
    const map = parseKV(text);
    if (Object.keys(map).length === 0) {
      return { ok: false, message: "В тексте не найдено ни одного поля вида [ключ]: значение." };
    }
    const foundModule = map.module;
    if (foundModule && foundModule !== "plug") {
      return { ok: false, message: `Это данные другого расчёта (${foundModule}), а не «Цементный мост».` };
    }
    if (map.washType === "direct" || map.washType === "reverse") setWashType(map.washType);
    if (map.useViscousPad === "true" || map.useViscousPad === "false") setUseViscousPad(map.useViscousPad === "true");
    setF((prev) => ({
      ...prev,
      plugTopMD: kv(map, "plugTopMD", prev.plugTopMD),
      plugBottomMD: kv(map, "plugBottomMD", prev.plugBottomMD),
      boreDiameter: kv(map, "boreDiameter", prev.boreDiameter),
      cavernCoeff: kv(map, "cavernCoeff", prev.cavernCoeff),
      pipeOD: kv(map, "pipeOD", prev.pipeOD),
      pipeID: kv(map, "pipeID", prev.pipeID),
      cementDensity: kv(map, "cementDensity", prev.cementDensity),
      wcRatio: kv(map, "wcRatio", prev.wcRatio),
      slurryYield: kv(map, "slurryYield", prev.slurryYield),
      spacerDensity: kv(map, "spacerDensity", prev.spacerDensity),
      wellFluidDensity: kv(map, "wellFluidDensity", prev.wellFluidDensity),
      dispDensity: kv(map, "dispDensity", prev.dispDensity),
      spacerAboveM3: kv(map, "spacerAboveM3", prev.spacerAboveM3),
      padVolumeM3: kv(map, "padVolumeM3", prev.padVolumeM3),
      padDensity: kv(map, "padDensity", prev.padDensity),
      padPullUpAboveM: kv(map, "padPullUpAboveM", prev.padPullUpAboveM),
      pullOutAbovePlugM: kv(map, "pullOutAbovePlugM", prev.pullOutAbovePlugM),
      washCycles: kv(map, "washCycles", prev.washCycles),
      tripSpeedMs: kv(map, "tripSpeedMs", prev.tripSpeedMs),
      pumpRateCementLs: kv(map, "pumpRateCementLs", prev.pumpRateCementLs),
      pumpRateSpacerLs: kv(map, "pumpRateSpacerLs", prev.pumpRateSpacerLs),
      pumpRateDisplacementLs: kv(map, "pumpRateDisplacementLs", prev.pumpRateDisplacementLs),
      pumpRateWashLs: kv(map, "pumpRateWashLs", prev.pumpRateWashLs),
      thickeningTimeMin: kv(map, "thickeningTimeMin", prev.thickeningTimeMin),
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
    setF(defaults);
    setWashType("direct");
    setUseViscousPad(false);
  };

  return (
    <CalcScreen title="Цементный мост">
      <ActionsBar
        moduleKey="plug"
        moduleTitle="Цементный мост"
        buildText={buildExportText}
        onImportText={applyImportText}
        onReset={handleReset}
      />

      <Collapsible title="Интервал моста" subtitle={f.plugTopMD && f.plugBottomMD ? `${f.plugTopMD}–${f.plugBottomMD} м` : undefined} defaultOpen>
        <NumField label="Кровля моста" unit="м" value={f.plugTopMD} onChangeText={set("plugTopMD")} />
        <NumField label="Подошва моста" unit="м" value={f.plugBottomMD} onChangeText={set("plugBottomMD")} />
        <NumField label="Диаметр ствола / ID ЭК" unit="мм" value={f.boreDiameter} onChangeText={set("boreDiameter")} />
        <NumField label="Коэф. кавернозности (1 — в колонне)" unit="—" value={f.cavernCoeff} onChangeText={set("cavernCoeff")} />
      </Collapsible>

      <Collapsible title="Заливочная колонна">
        <NumField label="Наружный диаметр НКТ/БТ" unit="мм" value={f.pipeOD} onChangeText={set("pipeOD")} />
        <NumField label="Внутренний диаметр НКТ/БТ" unit="мм" value={f.pipeID} onChangeText={set("pipeID")} />
        <NumField label="Скорость СПО" unit="м/с" value={f.tripSpeedMs} onChangeText={set("tripSpeedMs")} />
      </Collapsible>

      <Collapsible title="Рецептура цементного раствора">
        <NumField label="Плотность ЦР" unit="г/см³" value={f.cementDensity} onChangeText={set("cementDensity")} />
        <NumField label="Выход раствора с 1 т цемента (0 — авто)" unit="м³/т" value={f.slurryYield} onChangeText={set("slurryYield")} />
        <NumField label="В/Ц (0 — авто по плотности)" unit="—" value={f.wcRatio} onChangeText={set("wcRatio")} />
        <NumField label="Время загустевания ЦР" unit="мин" value={f.thickeningTimeMin} onChangeText={set("thickeningTimeMin")} />
        <ResultRow label="Сухой цемент (авто)" value={fmt(result.dryCementTons, 2)} unit="т" accent />
        <ResultRow label="Вода затворения (авто)" value={fmt(result.waterVolumeM3, 2)} unit="м³" accent />
      </Collapsible>

      <Collapsible title="Жидкости">
        <NumField label="Плотность буфера" unit="г/см³" value={f.spacerDensity} onChangeText={set("spacerDensity")} />
        <NumField label="Плотность скважинной жидкости (затрубье)" unit="г/см³" value={f.wellFluidDensity} onChangeText={set("wellFluidDensity")} />
        <NumField label="Плотность продавочной жидкости" unit="г/см³" value={f.dispDensity} onChangeText={set("dispDensity")} />
        <NumField label="Буферная жидкость над цементом" unit="м³" value={f.spacerAboveM3} onChangeText={set("spacerAboveM3")} />
      </Collapsible>

      <Card>
        <View style={styles.switchRow}>
          <SectionTitle>Нижняя вязкая пачка</SectionTitle>
          <Switch
            value={useViscousPad}
            onValueChange={togglePad}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#FFFFFF"
            testID="toggle-viscous-pad"
          />
        </View>
        {useViscousPad ? (
          <>
            <NumField label="Объём вязкой пачки" unit="м³" value={f.padVolumeM3} onChangeText={set("padVolumeM3")} />
            <NumField label="Плотность пачки" unit="г/см³" value={f.padDensity} onChangeText={set("padDensity")} />
            <NumField label="Подъём над пачкой" unit="м" value={f.padPullUpAboveM} onChangeText={set("padPullUpAboveM")} />
            <Banner kind="warning" text="Вязкая пачка устанавливается отдельной стадией: закачка → продавка → подъём → обратная промывка → спуск на кровлю пачки." />
          </>
        ) : (
          <Text style={[styles.hint, { color: colors.muted }]}>Основание под мост из вязкого раствора — включите, если ниже моста нет забоя/опоры.</Text>
        )}
      </Card>

      <Collapsible title="Подъём и срезка (промывка)">
        <NumField label="Подъём над кровлей моста" unit="м" value={f.pullOutAbovePlugM} onChangeText={set("pullOutAbovePlugM")} />
        <Text style={[styles.chipLabel, { color: colors.text }]}>Тип промывки</Text>
        <Chips options={washOptions} value={washType} onChange={setWashType} />
        <Text style={[styles.hint, { color: colors.muted }]}>
          {washType === "direct"
            ? "Прямая: закачка в трубы, объём цикла = объём затрубья до инструмента."
            : "Обратная: закачка в затрубье, объём цикла = внутренний объём труб."}
        </Text>
        <NumField label="Количество циклов промывки" unit="—" value={f.washCycles} onChangeText={set("washCycles")} />
      </Collapsible>

      <Collapsible title="Производительности">
        <NumField label="Закачка ЦР" unit="л/с" value={f.pumpRateCementLs} onChangeText={set("pumpRateCementLs")} />
        <NumField label="Закачка буфера / пачки" unit="л/с" value={f.pumpRateSpacerLs} onChangeText={set("pumpRateSpacerLs")} />
        <NumField label="Продавка" unit="л/с" value={f.pumpRateDisplacementLs} onChangeText={set("pumpRateDisplacementLs")} />
        <NumField label="Промывка" unit="л/с" value={f.pumpRateWashLs} onChangeText={set("pumpRateWashLs")} />
      </Collapsible>

      <Card>
        <SectionTitle>Объёмы и материалы</SectionTitle>
        <HeroResult label="Объём цементного раствора" value={fmt(result.cementVolumeTotal, 2)} unit="м³" />
        <ResultRow label="Сухой цемент (V / выход)" value={fmt(result.dryCementTons, 2)} unit="т" accent />
        <ResultRow label="Вода затворения (масса × В/Ц)" value={fmt(result.waterVolumeM3, 2)} unit="м³" />
        <ResultRow label="Длина моста (проект)" value={fmt(result.plugLengthM, 0)} unit="м" />
        <ResultRow label="Высота ЦР при установке" value={fmt(result.placementHeightM, 1)} unit="м" accent />
        <ResultRow label="Верх ЦР при установке" value={fmt(result.cementTopPlacementMD, 1)} unit="м" />
        <ResultRow label="ЦР в затрубье / в трубе" value={`${fmt(result.cementVolumeAnnulus, 2)} / ${fmt(result.cementVolumePipe, 2)}`} unit="м³" />
        <ResultRow label="Высота буфера над цементом" value={fmt(result.spacerAboveHeightM, 1)} unit="м" />
        {useViscousPad ? <ResultRow label="Высота вязкой пачки" value={fmt(result.padHeightM, 1)} unit="м" /> : null}
        <ResultRow label="Объём продавки" value={fmt(result.displacementVolume, 2)} unit="м³" accent />
        <ResultRow label="Промывка: 1 цикл / всего" value={`${fmt(result.washOneCycleVolume, 2)} / ${fmt(result.washVolumeM3, 2)}`} unit="м³" />
        <ResultRow label="Гидростатика на подошве: затрубье" value={fmt(result.balancePressureMPa, 2)} unit="МПа" />
        <ResultRow label="Гидростатика на подошве: труба (с продавкой)" value={fmt(result.pipeSidePressureMPa, 2)} unit="МПа" />
        <ResultRow label="Разбаланс труба − затрубье" value={`${result.imbalanceMPa > 0 ? "+" : ""}${fmt(result.imbalanceMPa, 2)}`} unit="МПа" accent />
        {result.warnings.map((w, i) => (
          <Banner key={i} kind={w.type} text={w.message} />
        ))}
      </Card>

      <Card>
        <SectionTitle>Порядок работ</SectionTitle>
        {result.pumpingStages.map((s, i) => (
          <View key={i} style={[styles.stageRow, { borderTopColor: colors.border }]}>
            <View style={[styles.stageNum, { backgroundColor: colors.primarySoft }]}>
              <Text style={[styles.stageNumText, { color: colors.text }]}>{i + 1}</Text>
            </View>
            <View style={styles.stageBody}>
              <View style={styles.stageHead}>
                <Text style={[styles.stageName, { color: colors.text }]}>{s.name}</Text>
                <Text style={[styles.stageTime, { color: colors.accent }]}>{fmt(s.timeMin, 0)} мин</Text>
              </View>
              <Text style={[styles.stageFluid, { color: colors.text }]}>
                {s.fluid}
                {s.volumeM3 > 0 ? ` · ${fmt(s.volumeM3, 2)} м³` : ""}
              </Text>
              <Text style={[styles.stageDesc, { color: colors.muted }]}>{s.description}</Text>
            </View>
          </View>
        ))}
        <SaveableView>
          <StageTimelineChart result={result} />
        </SaveableView>
        <ResultRow label="Общее время операции" value={fmt(result.totalOperationTimeMin, 0)} unit="мин" accent />
        <ResultRow label="Контакт с цементом (ЦР+буфер+продавка)" value={fmt(result.cementContactTimeMin, 0)} unit="мин" />
        <ResultRow label="Безопасный лимит (75% загуст.)" value={fmt(result.safeTime75Min, 0)} unit="мин" />
        {result.isTimeSafe && result.cementContactTimeMin > 0 ? (
          <Banner kind="success" text="Время контакта с цементом в безопасных пределах (≤75% времени загустевания)." />
        ) : null}
      </Card>

      <Card>
        <SectionTitle>Схема установки моста</SectionTitle>
        <SaveableView>
          <PlugSchematic result={result} washType={washType} useViscousPad={useViscousPad} />
        </SaveableView>
      </Card>
    </CalcScreen>
  );
}

const styles = StyleSheet.create({
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  hint: {
    fontSize: 13.5,
    paddingVertical: 6,
    lineHeight: 18,
  },
  chipLabel: {
    fontSize: 15,
    fontWeight: "700" as const,
    marginTop: 8,
    marginBottom: 6,
  },
  stageRow: {
    flexDirection: "row",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 9,
  },
  stageNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  stageNumText: {
    fontSize: 13,
    fontWeight: "800" as const,
  },
  stageBody: {
    flex: 1,
  },
  stageHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stageName: {
    fontSize: 15,
    fontWeight: "700" as const,
    flexShrink: 1,
  },
  stageTime: {
    fontSize: 14,
    fontWeight: "700" as const,
  },
  stageFluid: {
    fontSize: 13.5,
    marginTop: 2,
  },
  stageDesc: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 17,
  },
});
