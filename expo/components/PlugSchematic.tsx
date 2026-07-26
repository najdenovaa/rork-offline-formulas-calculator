import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Line, Rect, Text as SvgText } from "react-native-svg";

import { useTheme } from "@/lib/theme";
import { fmt } from "@/lib/num";
import type { PlugResult, WashType } from "@/lib/formulas/plug";

/** Палитра как в исходном веб-модуле */
const CEMENT = "#78909C";
const SPACER = "#4FC3F7";
const MUD = "#8B7355";
const PAD = "#AB47BC";
const STEEL = "#9AA5B1";
const STEEL_DARK = "#5F6B78";
const MARK = "#E0A800";

interface Column {
  topMD: number;
  bottomMD: number;
  color: string;
}

interface PanelProps {
  title: string;
  viewTop: number;
  viewBottom: number;
  pipeDepthMD: number;
  annulusCols: Column[];
  pipeCols: Column[];
  plugTopMD: number;
  plugBottomMD: number;
  width: number;
  height: number;
  washDir?: WashType;
}

function Panel({ title, viewTop, viewBottom, pipeDepthMD, annulusCols, pipeCols, plugTopMD, plugBottomMD, width, height, washDir }: PanelProps) {
  const { colors: Colors } = useTheme();
  const axisLeft = 34;
  const padTop = 22;
  const padBottom = 14;
  const plotW = width - axisLeft - 8;
  const cx = axisLeft + plotW / 2;
  const boreHW = plotW * 0.32;
  const pipeOHW = boreHW * 0.42;
  const pipeIHW = boreHW * 0.32;
  const span = Math.max(1, viewBottom - viewTop);
  const y = (md: number) => padTop + ((Math.min(Math.max(md, viewTop), viewBottom) - viewTop) / span) * (height - padTop - padBottom);

  const ticks: number[] = [];
  const step = span > 400 ? 100 : span > 150 ? 50 : 20;
  for (let d = Math.ceil(viewTop / step) * step; d <= viewBottom; d += step) ticks.push(d);

  const pipeY = y(pipeDepthMD);

  return (
    <Svg width={width} height={height}>
      <SvgText x={axisLeft} y={12} fontSize={10} fill={Colors.text} fontWeight="bold">
        {title}
      </SvgText>

      {/* Стенки ствола */}
      <Rect x={cx - boreHW - 3} y={y(viewTop)} width={3} height={y(viewBottom) - y(viewTop)} fill={STEEL_DARK} />
      <Rect x={cx + boreHW} y={y(viewTop)} width={3} height={y(viewBottom) - y(viewTop)} fill={STEEL_DARK} />

      {/* Жидкости в стволе (затрубье / полное сечение) */}
      {annulusCols.map((c, i) => {
        const t = Math.max(c.topMD, viewTop);
        const b = Math.min(c.bottomMD, viewBottom);
        if (b <= t) return null;
        return <Rect key={`a-${i}`} x={cx - boreHW} y={y(t)} width={boreHW * 2} height={Math.max(1, y(b) - y(t))} fill={c.color} opacity={0.85} />;
      })}

      {/* Инструмент: стенки + жидкости внутри */}
      {pipeDepthMD > viewTop ? (
        <>
          <Rect x={cx - pipeOHW} y={y(viewTop)} width={pipeOHW - pipeIHW} height={Math.max(1, pipeY - y(viewTop))} fill={STEEL} />
          <Rect x={cx + pipeIHW} y={y(viewTop)} width={pipeOHW - pipeIHW} height={Math.max(1, pipeY - y(viewTop))} fill={STEEL} />
          {pipeCols.map((c, i) => {
            const t = Math.max(c.topMD, viewTop);
            const b = Math.min(c.bottomMD, Math.min(pipeDepthMD, viewBottom));
            if (b <= t) return null;
            return <Rect key={`p-${i}`} x={cx - pipeIHW} y={y(t)} width={pipeIHW * 2} height={Math.max(1, y(b) - y(t))} fill={c.color} opacity={0.95} />;
          })}
          {/* Башмак инструмента */}
          <Rect x={cx - pipeOHW - 2} y={pipeY - 2} width={pipeOHW * 2 + 4} height={4} fill={STEEL_DARK} />
        </>
      ) : null}

      {/* Кровля/подошва моста */}
      <Line x1={cx - boreHW - 6} x2={cx + boreHW + 6} y1={y(plugTopMD)} y2={y(plugTopMD)} stroke={MARK} strokeWidth={1.5} strokeDasharray="5,3" />
      <SvgText x={cx + boreHW + 4} y={y(plugTopMD) - 3} fontSize={8} fill={MARK} textAnchor="end">
        ▲ {fmt(plugTopMD, 0)} м
      </SvgText>
      <Line x1={cx - boreHW - 6} x2={cx + boreHW + 6} y1={y(plugBottomMD)} y2={y(plugBottomMD)} stroke={MARK} strokeWidth={1.5} strokeDasharray="5,3" />
      <SvgText x={cx + boreHW + 4} y={y(plugBottomMD) + 10} fontSize={8} fill={MARK} textAnchor="end">
        ▼ {fmt(plugBottomMD, 0)} м
      </SvgText>

      {/* Стрелки направления промывки */}
      {washDir ? (
        <>
          <SvgText x={cx} y={y(viewTop) + 16} fontSize={12} fill={Colors.text} textAnchor="middle" fontWeight="bold">
            {washDir === "direct" ? "↓" : "↑"}
          </SvgText>
          <SvgText x={cx - boreHW + 8} y={y(viewTop) + 16} fontSize={12} fill={Colors.text} fontWeight="bold">
            {washDir === "direct" ? "↑" : "↓"}
          </SvgText>
          <SvgText x={cx + boreHW - 8} y={y(viewTop) + 16} fontSize={12} fill={Colors.text} textAnchor="end" fontWeight="bold">
            {washDir === "direct" ? "↑" : "↓"}
          </SvgText>
        </>
      ) : null}

      {/* Ось глубин */}
      {ticks.map((t) => (
        <React.Fragment key={t}>
          <Line x1={axisLeft - 4} x2={axisLeft} y1={y(t)} y2={y(t)} stroke={Colors.muted} strokeWidth={1} />
          <SvgText x={axisLeft - 6} y={y(t) + 3} fontSize={8} fill={Colors.muted} textAnchor="end">
            {fmt(t, 0)}
          </SvgText>
        </React.Fragment>
      ))}
    </Svg>
  );
}

interface PlugSchematicProps {
  result: PlugResult;
  washType: WashType;
  useViscousPad: boolean;
}

/**
 * Две схемы моста, как в исходном модуле: равновесие в конце продавки
 * (инструмент на подошве) и после подъёма со срезкой (инструмент над мостом).
 */
export default function PlugSchematic({ result, washType, useViscousPad }: PlugSchematicProps) {
  const r = result;
  const plugBottom = r.cementTopPlacementMD + r.placementHeightM;
  const topOfInterest = Math.min(r.pullOutDepthMD, r.spacerAboveTopMD);
  const viewTop = Math.max(0, topOfInterest - Math.max(30, r.plugLengthM * 0.4));
  const viewBottom = (useViscousPad ? r.padBottomMD : plugBottom) + Math.max(20, r.plugLengthM * 0.3);

  // Равновесие: столбы зеркальны в трубе и затрубье
  const eqCols: Column[] = [
    { topMD: 0, bottomMD: r.spacerAboveTopMD, color: MUD },
    { topMD: r.spacerAboveTopMD, bottomMD: r.cementTopPlacementMD, color: SPACER },
    { topMD: r.cementTopPlacementMD, bottomMD: plugBottom, color: CEMENT },
  ];
  if (useViscousPad && r.padHeightM > 0) {
    eqCols.push({ topMD: plugBottom, bottomMD: r.padBottomMD, color: PAD });
  }
  eqCols.push({ topMD: useViscousPad ? r.padBottomMD : plugBottom, bottomMD: viewBottom, color: MUD });

  // После подъёма и срезки: цемент обрезан по проектному интервалу,
  // буфер ложится на мост полным сечением, труба заполнена скважинной жидкостью
  const plugTop = plugBottom - r.plugLengthM;
  const washAnnCols: Column[] = [
    { topMD: 0, bottomMD: plugTop - r.spacerWashHeightM, color: MUD },
    { topMD: plugTop - r.spacerWashHeightM, bottomMD: plugTop, color: SPACER },
    { topMD: plugTop, bottomMD: plugBottom, color: CEMENT },
  ];
  if (useViscousPad && r.padHeightM > 0) {
    washAnnCols.push({ topMD: plugBottom, bottomMD: r.padBottomMD, color: PAD });
  }
  washAnnCols.push({ topMD: useViscousPad ? r.padBottomMD : plugBottom, bottomMD: viewBottom, color: MUD });

  const panelW = 158;
  const panelH = 340;

  return (
    <View style={styles.wrap}>
      <View style={styles.panels}>
        <Panel
          title="Конец продавки"
          viewTop={viewTop}
          viewBottom={viewBottom}
          pipeDepthMD={plugBottom}
          annulusCols={eqCols}
          pipeCols={eqCols}
          plugTopMD={plugTop}
          plugBottomMD={plugBottom}
          width={panelW}
          height={panelH}
        />
        <Panel
          title={`После срезки (${fmt(r.pullOutDepthMD, 0)} м)`}
          viewTop={viewTop}
          viewBottom={viewBottom}
          pipeDepthMD={r.pullOutDepthMD}
          annulusCols={washAnnCols}
          pipeCols={[{ topMD: 0, bottomMD: r.pullOutDepthMD, color: MUD }]}
          plugTopMD={plugTop}
          plugBottomMD={plugBottom}
          width={panelW}
          height={panelH}
          washDir={washType}
        />
      </View>
      <View style={styles.legend}>
        <LegendRow color={CEMENT} text="Цементный раствор" />
        <LegendRow color={SPACER} text="Буферная жидкость" />
        {useViscousPad ? <LegendRow color={PAD} text="Вязкая пачка" /> : null}
        <LegendRow color={MUD} text="Скважинная жидкость" />
        <LegendRow color={STEEL} text="Заливочная колонна (НКТ/БТ)" />
        <LegendRow color={MARK} text="Проектные кровля/подошва моста" />
      </View>
    </View>
  );
}

function LegendRow({ color, text }: { color: string; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendText, { color: colors.muted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 8,
    gap: 10,
  },
  panels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  legend: {
    gap: 6,
    paddingTop: 4,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
