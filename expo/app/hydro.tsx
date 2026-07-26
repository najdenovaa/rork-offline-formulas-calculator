import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";

import ActionsBar, { type ImportResult } from "@/components/ActionsBar";
import CalcScreen from "@/components/CalcScreen";
import Collapsible from "@/components/Collapsible";
import NumField from "@/components/NumField";
import { Banner, Card, HeroResult, ResultRow, SectionTitle } from "@/components/Results";
import SaveableView from "@/components/SaveableView";
import { useSavedCalcs } from "@/lib/savedCalcs";
import { useTheme } from "@/lib/theme";
import { calculateHydro, hydrostatic, type HydroInput, type HydroResult } from "@/lib/formulas/hydro";
import { fmt, parseNum } from "@/lib/num";
import { usePersistedState } from "@/lib/persist";
import { buildHeader, field, kv, parseKV, section } from "@/lib/textCodec";

type FieldKey = "densityGcm3" | "depthTVD" | "frictionMPa" | "formationPressureMPa";

// Первый запуск — пустые поля; последний расчёт восстанавливается из памяти устройства (офлайн)
const defaults: Record<FieldKey, string> = {
  densityGcm3: "",
  depthTVD: "",
  frictionMPa: "",
  formationPressureMPa: "",
};

function niceStep(range: number, targetTicks: number): number {
  const raw = range / Math.max(1, targetTicks);
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, raw))));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

/** Эпюра давлений: глубина по Y (вниз), давление по X. Гидростатика, ЭЦП, точка Pпл. */
function DepthPressureChart({ result, input }: { result: HydroResult; input: HydroInput }) {
  const { colors: Colors } = useTheme();
  const w = 320;
  const h = 260;
  const padL = 40;
  const padR = 12;
  const padT = 18;
  const padB = 30;

  const tvd = Math.max(1, input.depthTVD);
  const pHydroBottom = result.hydrostaticMPa;
  const pEcdBottom = hydrostatic(result.ecdGcm3, tvd);
  const maxP = Math.max(pHydroBottom, pEcdBottom, input.formationPressureMPa, 1) * 1.1;

  const x = (p: number) => padL + (p / maxP) * (w - padL - padR);
  const y = (d: number) => padT + (d / tvd) * (h - padT - padB);

  const pStep = niceStep(maxP, 5);
  const dStep = niceStep(tvd, 5);
  const pTicks: number[] = [];
  for (let p = 0; p <= maxP + 1e-9; p += pStep) pTicks.push(p);
  const dTicks: number[] = [];
  for (let d = 0; d <= tvd + 1e-9; d += dStep) dTicks.push(d);

  return (
    <View>
      <Svg width={w} height={h}>
        {pTicks.map((p) => (
          <React.Fragment key={`p-${p}`}>
            <Line x1={x(p)} x2={x(p)} y1={padT} y2={h - padB} stroke={Colors.border} strokeWidth={0.6} />
            <SvgText x={x(p)} y={h - padB + 12} fontSize={8} fill={Colors.muted} textAnchor="middle">
              {fmt(p, 0)}
            </SvgText>
          </React.Fragment>
        ))}
        {dTicks.map((d) => (
          <React.Fragment key={`d-${d}`}>
            <Line x1={padL} x2={w - padR} y1={y(d)} y2={y(d)} stroke={Colors.border} strokeWidth={0.6} />
            <SvgText x={padL - 4} y={y(d) + 3} fontSize={8} fill={Colors.muted} textAnchor="end">
              {fmt(d, 0)}
            </SvgText>
          </React.Fragment>
        ))}

        {/* Гидростатика */}
        <Polyline
          points={`${x(0)},${y(0)} ${x(pHydroBottom)},${y(tvd)}`}
          fill="none"
          stroke={Colors.primary}
          strokeWidth={2}
        />
        {/* ЭЦП */}
        <Polyline
          points={`${x(0)},${y(0)} ${x(pEcdBottom)},${y(tvd)}`}
          fill="none"
          stroke={Colors.accent}
          strokeWidth={2}
          strokeDasharray="6,3"
        />
        {/* Пластовое давление */}
        {input.formationPressureMPa > 0 ? (
          <>
            <Circle cx={x(input.formationPressureMPa)} cy={y(tvd)} r={4} fill={Colors.error} />
            <SvgText
              x={x(input.formationPressureMPa)}
              y={y(tvd) - 8}
              fontSize={9}
              fill={Colors.error}
              textAnchor="middle"
              fontWeight="bold"
            >
              Pпл {fmt(input.formationPressureMPa, 1)}
            </SvgText>
          </>
        ) : null}

        <SvgText x={(padL + w - padR) / 2} y={h - 3} fontSize={9} fill={Colors.muted} textAnchor="middle">
          Давление, МПа
        </SvgText>
        <SvgText x={10} y={padT - 6} fontSize={9} fill={Colors.muted}>
          Глубина TVD, м
        </SvgText>
      </Svg>
      <View style={styles.legend}>
        <LegendRow color={Colors.primary} text={`Гидростатика (${fmt(pHydroBottom, 1)} МПа на забое)`} />
        <LegendRow color={Colors.accent} text={`ЭЦП при циркуляции (${fmt(pEcdBottom, 1)} МПа на забое)`} dashed />
        {input.formationPressureMPa > 0 ? <LegendRow color={Colors.error} text="Пластовое давление" /> : null}
      </View>
    </View>
  );
}

function LegendRow({ color, text, dashed }: { color: string; text: string; dashed?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendLine, { backgroundColor: color }, dashed && styles.legendDashed]} />
      <Text style={[styles.legendText, { color: colors.muted }]}>{text}</Text>
    </View>
  );
}

export default function HydroScreen() {
  const [f, setF] = usePersistedState<Record<FieldKey, string>>("calc:hydro:fields", defaults);
  const set = (k: FieldKey) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const input = useMemo<HydroInput>(
    () => ({
      densityGcm3: parseNum(f.densityGcm3),
      depthTVD: parseNum(f.depthTVD),
      frictionMPa: parseNum(f.frictionMPa),
      formationPressureMPa: parseNum(f.formationPressureMPa),
    }),
    [f],
  );
  const result = useMemo(() => calculateHydro(input), [input]);

  const hasFormation = input.formationPressureMPa > 0;
  const ecdBottom = hydrostatic(result.ecdGcm3, Math.max(1, input.depthTVD));

  const buildExportText = (): string => {
    const lines: string[] = [buildHeader("Гидростатика и ЭЦП", "hydro")];
    lines.push(section("Исходные данные"));
    lines.push(field("Плотность жидкости", "densityGcm3", f.densityGcm3, "г/см3"));
    lines.push(field("Глубина по вертикали (TVD)", "depthTVD", f.depthTVD, "м"));
    lines.push(field("Потери давления в затрубье", "frictionMPa", f.frictionMPa, "МПа"));
    lines.push(field("Пластовое давление (0 — не задано)", "formationPressureMPa", f.formationPressureMPa, "МПа"));
    lines.push(section("Результаты (справочно)"));
    lines.push(`Гидростатическое давление: ${fmt(result.hydrostaticMPa, 2)} МПа`);
    lines.push(`ЭЦП: ${fmt(result.ecdGcm3, 3)} г/см3`);
    return lines.join("\n");
  };

  const applyImportText = (text: string): ImportResult => {
    const map = parseKV(text);
    if (Object.keys(map).length === 0) {
      return { ok: false, message: "В тексте не найдено ни одного поля вида [ключ]: значение." };
    }
    const foundModule = map.module;
    if (foundModule && foundModule !== "hydro") {
      return { ok: false, message: `Это данные другого расчёта (${foundModule}), а не «Гидростатика и ЭЦП».` };
    }
    setF((prev) => ({
      ...prev,
      densityGcm3: kv(map, "densityGcm3", prev.densityGcm3),
      depthTVD: kv(map, "depthTVD", prev.depthTVD),
      frictionMPa: kv(map, "frictionMPa", prev.frictionMPa),
      formationPressureMPa: kv(map, "formationPressureMPa", prev.formationPressureMPa),
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

  const handleReset = () => setF(defaults);

  return (
    <CalcScreen title="Гидростатика и ЭЦП">
      <ActionsBar
        moduleKey="hydro"
        moduleTitle="Гидростатика и ЭЦП"
        buildText={buildExportText}
        onImportText={applyImportText}
        onReset={handleReset}
      />

      <Collapsible title="Исходные данные" defaultOpen>
        <NumField label="Плотность жидкости" unit="г/см³" value={f.densityGcm3} onChangeText={set("densityGcm3")} />
        <NumField label="Глубина по вертикали (TVD)" unit="м" value={f.depthTVD} onChangeText={set("depthTVD")} />
        <NumField label="Потери давления в затрубье" unit="МПа" value={f.frictionMPa} onChangeText={set("frictionMPa")} />
        <NumField label="Пластовое давление (0 — не задано)" unit="МПа" value={f.formationPressureMPa} onChangeText={set("formationPressureMPa")} />
      </Collapsible>

      <Card>
        <SectionTitle>Результаты</SectionTitle>
        <HeroResult label="Гидростатическое давление" value={fmt(result.hydrostaticMPa, 2)} unit="МПа" />
        <ResultRow label="Градиент давления" value={fmt(result.gradientKPaM, 2)} unit="кПа/м" />
        <ResultRow label="ЭЦП (при циркуляции)" value={fmt(result.ecdGcm3, 3)} unit="г/см³" accent />
        <ResultRow label="Забойное при циркуляции (по ЭЦП)" value={fmt(ecdBottom, 2)} unit="МПа" />
        {hasFormation ? (
          <>
            <ResultRow label="Балансовая плотность (Pпл / g·H)" value={fmt(result.balanceDensityGcm3, 3)} unit="г/см³" accent />
            <ResultRow
              label={result.overbalanced ? "Репрессия на пласт" : "Депрессия на пласт"}
              value={fmt(Math.abs(result.differentialMPa), 2)}
              unit="МПа"
            />
            <Banner
              kind={result.overbalanced ? "success" : "error"}
              text={
                result.overbalanced
                  ? "Скважина в репрессии — гидростатика перекрывает пластовое давление."
                  : "Депрессия! Гидростатика ниже пластового давления — возможен приток. Увеличьте плотность."
              }
            />
          </>
        ) : (
          <Banner kind="info" text="Укажите пластовое давление, чтобы проверить репрессию/депрессию и балансовую плотность." />
        )}
      </Card>

      <Card>
        <SectionTitle>Эпюра давлений по глубине</SectionTitle>
        <SaveableView>
          <DepthPressureChart result={result} input={input} />
        </SaveableView>
      </Card>

      <Card>
        <SectionTitle>Формулы</SectionTitle>
        <ResultRow label="P = ρ·g·H" value="МПа" />
        <ResultRow label="ЭЦП = ρ + ΔPтр/(g·H)" value="г/см³" />
        <ResultRow label="ρбал = Pпл/(g·H)" value="г/см³" />
      </Card>
    </CalcScreen>
  );
}

const styles = StyleSheet.create({
  legend: {
    gap: 5,
    marginTop: 8,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  legendLine: {
    width: 18,
    height: 3,
    borderRadius: 2,
  },
  legendDashed: {
    opacity: 0.7,
  },
  legendText: {
    fontSize: 12.5,
  },
});
