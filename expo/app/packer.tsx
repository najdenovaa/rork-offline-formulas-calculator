import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Line, Rect, Text as SvgText } from "react-native-svg";

import ActionsBar, { type ImportResult } from "@/components/ActionsBar";
import CalcScreen from "@/components/CalcScreen";
import Chips from "@/components/Chips";
import Collapsible from "@/components/Collapsible";
import NumField from "@/components/NumField";
import { Banner, Card, HeroResult, ResultRow, SectionTitle } from "@/components/Results";
import SaveableView from "@/components/SaveableView";
import {
  calculatePackerHold,
  calculatePackerRelease,
  PACKER_TYPE_LABELS,
  RELEASE_MECHANISM_LABELS,
  STEEL_GRADES,
  type PackerHoldInput,
  type PackerReleaseInput,
  type PackerReleaseResult,
  type PackerType,
} from "@/lib/formulas/packer";
import { fmt, parseNum } from "@/lib/num";
import { usePersistedState } from "@/lib/persist";
import { useSavedCalcs } from "@/lib/savedCalcs";
import { buildHeader, field, kv, parseKV, section } from "@/lib/textCodec";
import { useTheme } from "@/lib/theme";

function niceStep(range: number, targetTicks: number): number {
  const raw = range / Math.max(1, targetTicks);
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, raw))));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

const BAR_COLORS = {
  base: "#3F51B5",
  adhesion: "#7986CB",
  scale: "#E08900",
  weight: "#8B7355",
} as const;

/** Диаграмма усилий: составная натяжка против предела колонны, ось в кН */
function ForceChart({ result }: { result: PackerReleaseResult }) {
  const { colors: Colors } = useTheme();
  const w = 320;
  const h = 150;
  const padL = 10;
  const padR = 12;
  const barY = 46;
  const barH = 30;
  const axisY = h - 34;

  const maxF = Math.max(result.totalPullRequiredKN, result.pipeTensileLimitKN, 1) * 1.12;
  const x = (fKN: number) => padL + (fKN / maxF) * (w - padL - padR);

  const weightSeg = Math.max(0, result.totalPullRequiredKN - result.releaseForceKN);
  const segs = [
    { label: "Базовое удержание", value: result.breakdown.baseHold, color: BAR_COLORS.base },
    { label: "Адгезия резины", value: result.breakdown.adhesion, color: BAR_COLORS.adhesion },
    { label: "Прихват отложениями", value: result.breakdown.scaleStick, color: BAR_COLORS.scale },
    { label: "Вес колонны", value: weightSeg, color: BAR_COLORS.weight },
  ];

  const step = niceStep(maxF, 5);
  const ticks: number[] = [];
  for (let t = 0; t <= maxF + 1e-9; t += step) ticks.push(t);

  let cursor = 0;
  const limitOver = result.totalPullRequiredKN >= result.pipeTensileLimitKN;
  const limitColor = limitOver ? Colors.error : Colors.success;

  return (
    <View>
      <Svg width={w} height={h}>
        {ticks.map((t) => (
          <React.Fragment key={t}>
            <Line x1={x(t)} x2={x(t)} y1={barY - 14} y2={axisY} stroke={Colors.border} strokeWidth={0.6} />
            <SvgText x={x(t)} y={axisY + 12} fontSize={8} fill={Colors.muted} textAnchor="middle">
              {fmt(t, 0)}
            </SvgText>
          </React.Fragment>
        ))}

        {segs.map((s) => {
          if (s.value <= 0) return null;
          const x0 = x(cursor);
          cursor += s.value;
          const x1 = x(cursor);
          return <Rect key={s.label} x={x0} y={barY} width={Math.max(1, x1 - x0)} height={barH} fill={s.color} />;
        })}
        <SvgText x={Math.min(x(result.totalPullRequiredKN), w - padR)} y={barY - 4} fontSize={9} fill={Colors.text} fontWeight="bold" textAnchor="end">
          Натяжка {fmt(result.totalPullRequiredKN, 0)} кН
        </SvgText>

        <Line
          x1={x(result.pipeTensileLimitKN)}
          x2={x(result.pipeTensileLimitKN)}
          y1={barY - 30}
          y2={axisY}
          stroke={limitColor}
          strokeWidth={2}
          strokeDasharray="5,3"
        />
        <SvgText
          x={x(result.pipeTensileLimitKN)}
          y={barY - 34}
          fontSize={9}
          fill={limitColor}
          fontWeight="bold"
          textAnchor={result.pipeTensileLimitKN / maxF > 0.7 ? "end" : "middle"}
        >
          Предел колонны {fmt(result.pipeTensileLimitKN, 0)} кН
        </SvgText>

        <SvgText x={(padL + w - padR) / 2} y={h - 4} fontSize={9} fill={Colors.muted} textAnchor="middle">
          Усилие, кН
        </SvgText>
      </Svg>
      <View style={styles.legend}>
        {segs.map((s) => (
          <View key={s.label} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: s.color }]} />
            <Text style={[styles.legendText, { color: Colors.muted }]}>
              {s.label}: {fmt(s.value, 0)} кН
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

type FieldKey =
  | "packerOD_mm"
  | "elementLength_mm"
  | "rubberFrictionCoeff"
  | "setPressureMPa"
  | "differentialPressureMPa"
  | "holdCapacityKN"
  | "monthsInService"
  | "scaleDepositRate"
  | "pipeWeightAboveKN"
  | "pipeOD_mm"
  | "pipeID_mm";

// Первый запуск — пустые поля; последний расчёт восстанавливается из памяти устройства (офлайн)
const defaults: Record<FieldKey, string> = {
  packerOD_mm: "",
  elementLength_mm: "",
  rubberFrictionCoeff: "",
  setPressureMPa: "",
  differentialPressureMPa: "",
  holdCapacityKN: "",
  monthsInService: "",
  scaleDepositRate: "",
  pipeWeightAboveKN: "",
  pipeOD_mm: "",
  pipeID_mm: "",
};

const packerOptions = (Object.keys(PACKER_TYPE_LABELS) as PackerType[]).map((t) => ({
  value: t,
  label: PACKER_TYPE_LABELS[t],
}));

type GradeKey = keyof typeof STEEL_GRADES;
const gradeOptions = (Object.keys(STEEL_GRADES) as GradeKey[]).map((g) => ({
  value: g as string,
  label: `${g} (${STEEL_GRADES[g]} МПа)`,
}));

type H2sKey = "no" | "yes";
const h2sOptions: { value: H2sKey; label: string }[] = [
  { value: "no", label: "H₂S нет" },
  { value: "yes", label: "H₂S есть" },
];

export default function PackerScreen() {
  const [packerType, setPackerType] = usePersistedState<PackerType>("calc:packer:type", "mechanical");
  const [grade, setGrade] = usePersistedState<string>("calc:packer:grade", "N80");
  const [h2s, setH2s] = usePersistedState<H2sKey>("calc:packer:h2s", "no");
  const [f, setF] = usePersistedState<Record<FieldKey, string>>("calc:packer:fields", defaults);
  const set = (k: FieldKey) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const hold = useMemo(() => {
    const input: PackerHoldInput = {
      packerOD_mm: parseNum(f.packerOD_mm),
      elementLength_mm: parseNum(f.elementLength_mm),
      rubberFrictionCoeff: parseNum(f.rubberFrictionCoeff) || 0.4,
      setPressureMPa: parseNum(f.setPressureMPa),
      differentialPressureMPa: parseNum(f.differentialPressureMPa),
    };
    return calculatePackerHold(input);
  }, [f]);

  const holdOverride = parseNum(f.holdCapacityKN);
  const effectiveHoldKN = holdOverride > 0 ? holdOverride : hold.holdCapacityKN;

  const result = useMemo(() => {
    const input: PackerReleaseInput = {
      packerType,
      holdCapacityKN: effectiveHoldKN,
      monthsInService: parseNum(f.monthsInService),
      h2sPresent: h2s === "yes",
      scaleDepositRate: parseNum(f.scaleDepositRate),
      pipeWeightAboveKN: parseNum(f.pipeWeightAboveKN),
      pipeYieldMPa: STEEL_GRADES[grade] ?? 552,
      pipeOD_mm: parseNum(f.pipeOD_mm),
      pipeID_mm: parseNum(f.pipeID_mm),
    };
    return calculatePackerRelease(input);
  }, [f, packerType, grade, h2s, effectiveHoldKN]);

  const buildExportText = (): string => {
    const lines: string[] = [buildHeader("Срыв пакера (КРС)", "packer")];
    lines.push(section("Пакер"));
    lines.push(field("Тип пакера", "packerType", packerType));
    lines.push(field("Диаметр уплотнит. элемента", "packerOD_mm", f.packerOD_mm, "мм"));
    lines.push(field("Длина уплотнит. элемента", "elementLength_mm", f.elementLength_mm, "мм"));
    lines.push(field("Коэф. трения резина-металл", "rubberFrictionCoeff", f.rubberFrictionCoeff));
    lines.push(field("Контактное давление посадки", "setPressureMPa", f.setPressureMPa, "МПа"));
    lines.push(field("Рабочий перепад на пакере", "differentialPressureMPa", f.differentialPressureMPa, "МПа"));
    lines.push(section("Условия срыва"));
    lines.push(field("Усилие удержания (0 — авто)", "holdCapacityKN", f.holdCapacityKN, "кН"));
    lines.push(field("Срок в скважине", "monthsInService", f.monthsInService, "мес"));
    lines.push(field("Скорость отложений", "scaleDepositRate", f.scaleDepositRate, "кН/мес"));
    lines.push(field("H2S (yes/no)", "h2s", h2s));
    lines.push(section("Колонна над пакером"));
    lines.push(field("Вес колонны над пакером", "pipeWeightAboveKN", f.pipeWeightAboveKN, "кН"));
    lines.push(field("Марка стали", "grade", grade));
    lines.push(field("Наружный диаметр трубы", "pipeOD_mm", f.pipeOD_mm, "мм"));
    lines.push(field("Внутренний диаметр трубы", "pipeID_mm", f.pipeID_mm, "мм"));
    lines.push(section("Результаты (справочно)"));
    lines.push(`Усилие срыва пакера: ${fmt(result.releaseForceKN, 0)} кН`);
    lines.push(`Общая натяжка: ${fmt(result.totalPullRequiredKN, 0)} кН`);
    return lines.join("\n");
  };

  const applyImportText = (text: string): ImportResult => {
    const map = parseKV(text);
    if (Object.keys(map).length === 0) {
      return { ok: false, message: "В тексте не найдено ни одного поля вида [ключ]: значение." };
    }
    const foundModule = map.module;
    if (foundModule && foundModule !== "packer") {
      return { ok: false, message: `Это данные другого расчёта (${foundModule}), а не «Срыв пакера».` };
    }
    if (map.packerType && (Object.keys(PACKER_TYPE_LABELS) as string[]).includes(map.packerType)) {
      setPackerType(map.packerType as PackerType);
    }
    if (map.grade && Object.prototype.hasOwnProperty.call(STEEL_GRADES, map.grade)) setGrade(map.grade);
    if (map.h2s === "yes" || map.h2s === "no") setH2s(map.h2s);
    setF((prev) => ({
      ...prev,
      packerOD_mm: kv(map, "packerOD_mm", prev.packerOD_mm),
      elementLength_mm: kv(map, "elementLength_mm", prev.elementLength_mm),
      rubberFrictionCoeff: kv(map, "rubberFrictionCoeff", prev.rubberFrictionCoeff),
      setPressureMPa: kv(map, "setPressureMPa", prev.setPressureMPa),
      differentialPressureMPa: kv(map, "differentialPressureMPa", prev.differentialPressureMPa),
      holdCapacityKN: kv(map, "holdCapacityKN", prev.holdCapacityKN),
      monthsInService: kv(map, "monthsInService", prev.monthsInService),
      scaleDepositRate: kv(map, "scaleDepositRate", prev.scaleDepositRate),
      pipeWeightAboveKN: kv(map, "pipeWeightAboveKN", prev.pipeWeightAboveKN),
      pipeOD_mm: kv(map, "pipeOD_mm", prev.pipeOD_mm),
      pipeID_mm: kv(map, "pipeID_mm", prev.pipeID_mm),
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
    setPackerType("mechanical");
    setGrade("N80");
    setH2s("no");
    setF(defaults);
  };

  return (
    <CalcScreen title="Срыв пакера (КРС)">
      <ActionsBar
        moduleKey="packer"
        moduleTitle="Срыв пакера"
        buildText={buildExportText}
        onImportText={applyImportText}
        onReset={handleReset}
      />

      <Collapsible title="Пакер" defaultOpen>
        <Chips options={packerOptions} value={packerType} onChange={setPackerType} />
        <NumField label="Диаметр уплотнит. элемента" unit="мм" value={f.packerOD_mm} onChangeText={set("packerOD_mm")} />
        <NumField label="Длина уплотнит. элемента" unit="мм" value={f.elementLength_mm} onChangeText={set("elementLength_mm")} />
        <NumField label="Коэф. трения резина-металл (0,30–0,50)" unit="—" value={f.rubberFrictionCoeff} onChangeText={set("rubberFrictionCoeff")} />
        <NumField label="Контактное давление посадки" unit="МПа" value={f.setPressureMPa} onChangeText={set("setPressureMPa")} />
        <NumField label="Рабочий перепад на пакере" unit="МПа" value={f.differentialPressureMPa} onChangeText={set("differentialPressureMPa")} />
      </Collapsible>

      <Card>
        <SectionTitle>Удержание и герметичность</SectionTitle>
        <ResultRow label="Площадь контакта (π·D·L)" value={fmt(hold.contactAreaM2 * 1e4, 0)} unit="см²" />
        <ResultRow label="Несущая способность (μ·P·A)" value={fmt(hold.holdCapacityKN, 0)} unit="кН" accent />
        <ResultRow label="Оценка усилия срыва (+20% адгезия)" value={fmt(hold.releaseForceEstimateKN, 0)} unit="кН" />
        <ResultRow label="Герметичность (0,85·Pпос)" value={fmt(hold.sealIntegrityMPa, 1)} unit="МПа" />
        <Banner
          kind={hold.isSecure ? "success" : "error"}
          text={hold.isSecure ? "Пакер держит рабочий перепад давления." : "Превышение ΔP над герметичностью — риск пропуска."}
        />
        {hold.warnings.map((w, i) => (
          <Banner key={i} kind="warning" text={w} />
        ))}
      </Card>

      <Collapsible title="Условия срыва">
        <NumField label="Усилие удержания (0 — авто из расчёта)" unit="кН" value={f.holdCapacityKN} onChangeText={set("holdCapacityKN")} />
        <NumField label="Срок в скважине" unit="мес" value={f.monthsInService} onChangeText={set("monthsInService")} />
        <NumField label="Скорость отложений (3–15)" unit="кН/мес" value={f.scaleDepositRate} onChangeText={set("scaleDepositRate")} />
        <Chips options={h2sOptions} value={h2s} onChange={setH2s} />
      </Collapsible>

      <Collapsible title="Колонна над пакером">
        <NumField label="Вес колонны над пакером" unit="кН" value={f.pipeWeightAboveKN} onChangeText={set("pipeWeightAboveKN")} />
        <Chips options={gradeOptions} value={grade} onChange={setGrade} />
        <NumField label="Наружный диаметр трубы" unit="мм" value={f.pipeOD_mm} onChangeText={set("pipeOD_mm")} />
        <NumField label="Внутренний диаметр трубы" unit="мм" value={f.pipeID_mm} onChangeText={set("pipeID_mm")} />
      </Collapsible>

      <Card>
        <SectionTitle>Срыв пакера</SectionTitle>
        <HeroResult label="Усилие срыва пакера" value={fmt(result.releaseForceKN, 0)} unit="кН" />
        <ResultRow label="— базовое удержание" value={fmt(result.breakdown.baseHold, 0)} unit="кН" />
        <ResultRow label="— адгезия резины (15% + 1%/мес)" value={fmt(result.breakdown.adhesion, 0)} unit="кН" />
        <ResultRow label="— прихват отложениями" value={fmt(result.breakdown.scaleStick, 0)} unit="кН" />
        <ResultRow label="Общая натяжка (с весом колонны)" value={fmt(result.totalPullRequiredKN, 0)} unit="кН" accent />
        <ResultRow label="Предел колонны (σт·A / 1,25)" value={fmt(result.pipeTensileLimitKN, 0)} unit="кН" accent />
        <Banner
          kind={result.canReleaseByTension ? "success" : "error"}
          text={
            result.canReleaseByTension
              ? "Срыв натяжкой возможен — усилие в пределах прочности колонны."
              : "Срыв натяжкой невозможен — усилие превышает предел колонны."
          }
        />
        <Banner kind="info" text={`Рекомендуемый механизм: ${RELEASE_MECHANISM_LABELS[result.recommendedMechanism]}`} />
        {result.warnings.map((w, i) => (
          <Banner key={i} kind="warning" text={w} />
        ))}
      </Card>

      <Card>
        <SectionTitle>Диаграмма усилий</SectionTitle>
        <SaveableView>
          <ForceChart result={result} />
        </SaveableView>
      </Card>
    </CalcScreen>
  );
}

const styles = StyleSheet.create({
  legend: {
    gap: 5,
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
  },
});
