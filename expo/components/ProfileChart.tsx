import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Polyline, Rect, Text as SvgText } from "react-native-svg";

import { useTheme } from "@/lib/theme";
import { fmt } from "@/lib/num";
import type { ProfileSegment } from "@/lib/formulas/cementing";

/** Палитры как в исходном веб-модуле */
const CEMENT_COLORS = ["#C4793A", "#9E5C2F", "#D4955A", "#B86B3A"];
const BUFFER_COLORS = ["#E8A838", "#9C6BB1"];
const MUD_COLOR = "#2E7D4F";
const DISP_COLOR = "#4A90D9";
const ROCK_COLOR = "#6B5B4F";
const ROCK_DARK = "#5C4A3A";
const STEEL = "#8B95A1";
const STEEL_DARK = "#5F6B78";

/** «Красивый» шаг сетки для оси */
function niceStep(max: number, targetTicks: number): number {
  if (max <= 0) return 1;
  const raw = max / targetTicks;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / pow;
  const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return mult * pow;
}

function buildTicks(max: number, targetTicks: number): number[] {
  const step = niceStep(max, targetTicks);
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  return out;
}

function shorten(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// ---------------------------------------------------------------------------
// Схема скважины (продольный разрез): порода, колонны, жидкости в затрубье и трубе
// ---------------------------------------------------------------------------

interface WellSchematicProps {
  profile: ProfileSegment[];
  totalDepthMD: number;
  wellTotalDepthMD?: number; // забой (≥ башмака) — если больше башмака, показывается запас (хвостовик)
  prevCasingDepth: number;
  ckodDepth: number;
  holeDiameter: number; // мм
  casingOD: number; // мм
  casingID: number; // мм
  prevCasingID: number; // мм
}

/** Продольный разрез скважины: порода, предыдущая колонна, ОК, жидкости затрубья и трубы */
export function WellSchematic({
  profile,
  totalDepthMD,
  wellTotalDepthMD,
  prevCasingDepth,
  ckodDepth,
  holeDiameter,
  casingOD,
  casingID,
  prevCasingID,
}: WellSchematicProps) {
  const { colors: Colors } = useTheme();
  const width = 320;
  const height = 480;
  const marginTop = 20;
  const marginBottom = 20;
  const axisLeft = 40;
  const labelRight = 96;
  const plotW = width - axisLeft - labelRight;
  const cx = axisLeft + plotW / 2;
  const plotH = height - marginTop - marginBottom;
  const shoeMD = totalDepthMD > 0 ? totalDepthMD : 1;
  // Забой может быть глубже башмака — тогда ниже колонны рисуется открытый запас (хвостовик)
  const depth = Math.max(shoeMD, wellTotalDepthMD ?? 0);
  const hasRathole = depth > shoeMD + 0.01;
  const prevShoe = Math.min(Math.max(0, prevCasingDepth), shoeMD);
  const ckod = Math.min(Math.max(0, ckodDepth), shoeMD);

  const maxDiam = Math.max(holeDiameter, prevCasingID + 12, casingOD + 12, 1);
  const maxHalf = plotW / 2 - 4;
  const halfFor = (mm: number) => Math.max(2, (mm / maxDiam) * maxHalf);

  const holeHW = halfFor(holeDiameter);
  const casOHW = halfFor(casingOD);
  const casIHW = halfFor(casingID);
  const prevIHW = halfFor(prevCasingID);
  const prevOHW = Math.min(maxHalf, prevIHW + 5);

  const mdToY = (md: number) => marginTop + (Math.min(Math.max(md, 0), depth) / depth) * plotH;

  let spacerIdx = 0;
  let stageIdx = 0;
  const segColor = (seg: ProfileSegment): string => {
    if (seg.kind === "mud") return MUD_COLOR;
    if (seg.kind === "spacer") {
      const c = BUFFER_COLORS[spacerIdx % BUFFER_COLORS.length];
      spacerIdx += 1;
      return c;
    }
    const c = CEMENT_COLORS[stageIdx % CEMENT_COLORS.length];
    stageIdx += 1;
    return c;
  };
  const coloredSegs = profile.map((seg) => ({ seg, color: segColor(seg) }));
  const lastCementColor = coloredSegs.filter((c) => c.seg.kind === "stage").slice(-1)[0]?.color ?? CEMENT_COLORS[0];

  /** Пары прямоугольников затрубья слева/справа с разбивкой по башмаку пред. колонны */
  const annulusRects = (topMD: number, bottomMD: number, color: string) => {
    const rects: { x: number; y: number; w: number; h: number }[] = [];
    const addBand = (t: number, b: number, innerHW: number, outerHW: number) => {
      if (b <= t || outerHW <= innerHW) return;
      const y = mdToY(t);
      const h = Math.max(1, mdToY(b) - y);
      rects.push({ x: cx - outerHW, y, w: outerHW - innerHW, h });
      rects.push({ x: cx + innerHW, y, w: outerHW - innerHW, h });
    };
    // Межтрубное пространство (внутри пред. колонны)
    addBand(Math.min(topMD, prevShoe), Math.min(bottomMD, prevShoe), casOHW, prevIHW);
    // Открытый ствол
    addBand(Math.max(topMD, prevShoe), Math.max(bottomMD, prevShoe), casOHW, holeHW);
    return rects.map((r, i) => <Rect key={`${topMD}-${bottomMD}-${i}`} x={r.x} y={r.y} width={r.w} height={r.h} fill={color} opacity={0.92} />);
  };

  // Метки справа с раздвижкой при пересечении
  const labels: { y: number; text: string; sub: string; color: string }[] = coloredSegs
    .filter((c) => c.seg.bottomMD > c.seg.topMD)
    .map((c) => ({
      y: mdToY((c.seg.topMD + c.seg.bottomMD) / 2),
      text: shorten(c.seg.label, 15),
      sub: `${fmt(c.seg.topMD, 0)}–${fmt(c.seg.bottomMD, 0)} м`,
      color: c.color,
    }));
  labels.sort((a, b) => a.y - b.y);
  const MIN_GAP = 26;
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].y - labels[i - 1].y < MIN_GAP) labels[i].y = labels[i - 1].y + MIN_GAP;
  }

  const depthTicks = buildTicks(depth, 6);
  const speckles: { x: number; y: number }[] = [];
  for (let i = 0; i < 36; i++) {
    speckles.push({
      x: axisLeft + ((i * 41 + 13) % plotW),
      y: marginTop + ((i * 71 + 29) % plotH),
    });
  }

  return (
    <View style={styles.schematicWrap}>
      <Svg width={width} height={height}>
        {/* Порода */}
        <Rect x={axisLeft} y={marginTop} width={plotW} height={plotH} fill={ROCK_COLOR} rx={4} />
        {speckles.map((s, i) => (
          <Circle key={`sp-${i}`} cx={s.x} cy={s.y} r={1.6} fill={ROCK_DARK} />
        ))}

        {/* Ствол: внутри пред. колонны сверху, открытый ствол ниже */}
        {prevShoe > 0 ? <Rect x={cx - prevIHW} y={mdToY(0)} width={prevIHW * 2} height={Math.max(1, mdToY(prevShoe) - mdToY(0))} fill={MUD_COLOR} /> : null}
        <Rect x={cx - holeHW} y={mdToY(prevShoe)} width={holeHW * 2} height={Math.max(1, mdToY(shoeMD) - mdToY(prevShoe))} fill={MUD_COLOR} />

        {/* Запас (хвостовик) ниже башмака до забоя — открытый ствол, заполняется цементом последней стадии */}
        {hasRathole ? (
          <Rect x={cx - holeHW} y={mdToY(shoeMD)} width={holeHW * 2} height={Math.max(1, mdToY(depth) - mdToY(shoeMD))} fill={lastCementColor} opacity={0.75} />
        ) : null}

        {/* Жидкости в затрубье */}
        {coloredSegs.map((c, i) => (
          <React.Fragment key={`ann-${i}`}>{annulusRects(c.seg.topMD, c.seg.bottomMD, c.color)}</React.Fragment>
        ))}

        {/* Предыдущая колонна */}
        {prevShoe > 0 ? (
          <>
            <Rect x={cx - prevOHW} y={mdToY(0)} width={prevOHW - prevIHW} height={mdToY(prevShoe) - mdToY(0)} fill={STEEL} stroke={STEEL_DARK} strokeWidth={0.5} />
            <Rect x={cx + prevIHW} y={mdToY(0)} width={prevOHW - prevIHW} height={mdToY(prevShoe) - mdToY(0)} fill={STEEL} stroke={STEEL_DARK} strokeWidth={0.5} />
            <Line x1={axisLeft} x2={axisLeft + plotW} y1={mdToY(prevShoe)} y2={mdToY(prevShoe)} stroke="#E7EBF0" strokeWidth={1} strokeDasharray="5,4" />
          </>
        ) : null}

        {/* Спущенная ОК (стенки) — от устья до башмака (не до забоя) */}
        <Rect x={cx - casOHW} y={mdToY(0)} width={casOHW - casIHW} height={mdToY(shoeMD) - mdToY(0)} fill={STEEL_DARK} />
        <Rect x={cx + casIHW} y={mdToY(0)} width={casOHW - casIHW} height={mdToY(shoeMD) - mdToY(0)} fill={STEEL_DARK} />

        {/* Внутри трубы: продавка до ЦКОД, цементный стакан ниже, до башмака */}
        <Rect x={cx - casIHW + 0.5} y={mdToY(0)} width={casIHW * 2 - 1} height={Math.max(1, mdToY(ckod > 0 ? ckod : shoeMD) - mdToY(0))} fill={DISP_COLOR} opacity={0.9} />
        {ckod > 0 && ckod < shoeMD ? (
          <Rect x={cx - casIHW + 0.5} y={mdToY(ckod)} width={casIHW * 2 - 1} height={Math.max(1, mdToY(shoeMD) - mdToY(ckod))} fill={lastCementColor} opacity={0.75} />
        ) : null}

        {/* ЦКОД */}
        {ckod > 0 && ckod < shoeMD ? <Rect x={cx - casIHW} y={mdToY(ckod) - 2} width={casIHW * 2} height={4} fill={Colors.error} /> : null}

        {/* Башмак ОК (на глубине спуска, не на забое) */}
        <Path
          d={`M ${cx - casOHW - 6} ${mdToY(shoeMD)} L ${cx - casOHW} ${mdToY(shoeMD) - 10} L ${cx - casOHW} ${mdToY(shoeMD)} Z`}
          fill="#E08900"
        />
        <Path
          d={`M ${cx + casOHW + 6} ${mdToY(shoeMD)} L ${cx + casOHW} ${mdToY(shoeMD) - 10} L ${cx + casOHW} ${mdToY(shoeMD)} Z`}
          fill="#E08900"
        />
        {hasRathole ? (
          <Line x1={axisLeft} x2={axisLeft + plotW} y1={mdToY(shoeMD)} y2={mdToY(shoeMD)} stroke="#E08900" strokeWidth={1} strokeDasharray="5,4" />
        ) : null}

        {/* Ось глубин */}
        {depthTicks.map((t) => (
          <React.Fragment key={`tick-${t}`}>
            <Line x1={axisLeft - 4} x2={axisLeft} y1={mdToY(t)} y2={mdToY(t)} stroke={Colors.muted} strokeWidth={1} />
            <SvgText x={axisLeft - 6} y={mdToY(t) + 3.5} fontSize={9} fill={Colors.muted} textAnchor="end">
              {fmt(t, 0)}
            </SvgText>
          </React.Fragment>
        ))}
        <SvgText x={axisLeft - 6} y={marginTop - 8} fontSize={9} fill={Colors.muted} textAnchor="end">
          м
        </SvgText>

        {/* Метки жидкостей справа */}
        {labels.map((l, i) => (
          <React.Fragment key={`lab-${i}`}>
            <Circle cx={axisLeft + plotW + 8} cy={l.y - 3} r={3.5} fill={l.color} />
            <SvgText x={axisLeft + plotW + 15} y={l.y} fontSize={9} fill={Colors.text}>
              {l.text}
            </SvgText>
            <SvgText x={axisLeft + plotW + 15} y={l.y + 10} fontSize={8} fill={Colors.muted}>
              {l.sub}
            </SvgText>
          </React.Fragment>
        ))}
        {prevShoe > 0 ? (
          <SvgText x={axisLeft + plotW + 8} y={mdToY(prevShoe) + 3} fontSize={8} fill={Colors.muted}>
            Башмак пред. ОК
          </SvgText>
        ) : null}
        {hasRathole ? (
          <SvgText x={axisLeft + plotW + 8} y={mdToY(shoeMD) + 3} fontSize={8} fill="#E08900">
            Башмак ОК
          </SvgText>
        ) : null}
      </Svg>
      <View style={styles.legend}>
        <LegendRow color={ROCK_COLOR} text="Порода" />
        <LegendRow color={STEEL} text="Предыдущая колонна" />
        <LegendRow color={STEEL_DARK} text="Спущенная ОК" />
        <LegendRow color={MUD_COLOR} text="Буровой раствор" />
        {hasRathole ? <LegendRow color={lastCementColor} text="Запас ниже башмака (до забоя)" /> : null}
        <LegendRow color={BUFFER_COLORS[0]} text="Буферная жидкость" />
        <LegendRow color={CEMENT_COLORS[0]} text="Цементный раствор" />
        <LegendRow color={DISP_COLOR} text="Продавка в трубе" />
        <LegendRow color={Colors.error} text="ЦКОД" />
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

// ---------------------------------------------------------------------------
// Давление по глубине
// ---------------------------------------------------------------------------

interface PressureChartProps {
  points: { depthMD: number; hydrostaticMPa: number; fracMPa: number }[];
}

/** График давления по глубине: гидростатика затрубья vs давление ГРП, с сеткой и осями */
export function PressureChart({ points }: PressureChartProps) {
  const { colors: Colors } = useTheme();
  if (points.length < 2) return null;
  const width = 320;
  const height = 250;
  const padLeft = 42;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 30;
  const maxDepth = Math.max(...points.map((p) => p.depthMD), 1);
  const maxPressure = Math.max(...points.map((p) => Math.max(p.hydrostaticMPa, p.fracMPa)), 1) * 1.08;

  const px = (v: number) => padLeft + (v / maxPressure) * (width - padLeft - padRight);
  const py = (d: number) => padTop + (d / maxDepth) * (height - padTop - padBottom);

  const hydroPts = points.map((p) => `${px(p.hydrostaticMPa)},${py(p.depthMD)}`).join(" ");
  const fracPts = points.map((p) => `${px(p.fracMPa)},${py(p.depthMD)}`).join(" ");
  const pTicks = buildTicks(maxPressure, 5);
  const dTicks = buildTicks(maxDepth, 6);

  return (
    <View style={styles.pressureChartWrap}>
      <Svg width={width} height={height}>
        <Rect x={0} y={0} width={width} height={height} fill={Colors.inputBg} rx={10} />
        {/* Сетка */}
        {pTicks.map((t) => (
          <React.Fragment key={`gv-${t}`}>
            <Line x1={px(t)} x2={px(t)} y1={padTop} y2={height - padBottom} stroke={Colors.border} strokeWidth={1} strokeDasharray="3,3" />
            <SvgText x={px(t)} y={height - padBottom + 13} fontSize={9} fill={Colors.muted} textAnchor="middle">
              {fmt(t, 0)}
            </SvgText>
          </React.Fragment>
        ))}
        {dTicks.map((t) => (
          <React.Fragment key={`gh-${t}`}>
            <Line x1={padLeft} x2={width - padRight} y1={py(t)} y2={py(t)} stroke={Colors.border} strokeWidth={1} strokeDasharray="3,3" />
            <SvgText x={padLeft - 5} y={py(t) + 3.5} fontSize={9} fill={Colors.muted} textAnchor="end">
              {fmt(t, 0)}
            </SvgText>
          </React.Fragment>
        ))}
        <SvgText x={width - padRight} y={height - 4} fontSize={9} fill={Colors.muted} textAnchor="end">
          МПа
        </SvgText>
        <SvgText x={padLeft - 5} y={padTop - 2} fontSize={9} fill={Colors.muted} textAnchor="end">
          м
        </SvgText>
        <Polyline points={fracPts} fill="none" stroke={Colors.error} strokeWidth={2} strokeDasharray="5,4" />
        <Polyline points={hydroPts} fill="none" stroke={Colors.primary} strokeWidth={2.5} />
      </Svg>
      <View style={styles.legend}>
        <LegendRow color={Colors.primary} text="Гидростатика в затрубье, МПа" />
        <LegendRow color={Colors.error} text="Давление ГРП (градиент), МПа" />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Совмещённый график цементирования
// ---------------------------------------------------------------------------

interface PumpChartPoint {
  timeMin: number;
  pumpPressureMPa: number;
  bottomholePressureMPa: number;
  fracturePressureMPa: number;
  rateLps: number;
  densityGcm3: number;
}

interface PumpScheduleChartProps {
  points: PumpChartPoint[];
  /** Давление опрессовки (30 атм, выдержка 15 мин) — горизонтальная отметка на графике */
  testPressureMPa?: number;
}

const C_FRAC = "#D93A2F";
const C_BHP = "#2264C3";
const C_PUMP = "#29A37A";
const C_RATE = "#9A50D0";
const C_DENS = "#A11244";

/** Ступенчатая полилиния (stepAfter) как в совмещённом графике исходного модуля */
function stepAfterPoints(points: PumpChartPoint[], get: (p: PumpChartPoint) => number, px: (t: number) => number, py: (v: number) => number): string {
  let out = `${px(points[0].timeMin)},${py(get(points[0]))}`;
  for (let i = 1; i < points.length; i++) {
    out += ` ${px(points[i].timeMin)},${py(get(points[i - 1]))} ${px(points[i].timeMin)},${py(get(points[i]))}`;
  }
  return out;
}

/**
 * Совмещённый график цементирования: давления (насос/забой/ГРП) по левой оси,
 * производительность по правой оси, плотность закачки — ступенчатой линией.
 */
export function PumpScheduleChart({ points, testPressureMPa }: PumpScheduleChartProps) {
  const { colors: Colors } = useTheme();
  if (points.length < 2) return null;
  const width = 320;
  const height = 270;
  const padLeft = 38;
  const padRight = 34;
  const padTop = 12;
  const padBottom = 34;
  const maxTime = Math.max(...points.map((p) => p.timeMin), 1);
  const maxPressure = Math.max(...points.map((p) => Math.max(p.pumpPressureMPa, p.bottomholePressureMPa, p.fracturePressureMPa)), testPressureMPa ?? 0, 1) * 1.15;
  const maxRate = Math.max(30, ...points.map((p) => p.rateLps));

  const px = (t: number) => padLeft + (t / maxTime) * (width - padLeft - padRight);
  const py = (p: number) => height - padBottom - (p / maxPressure) * (height - padTop - padBottom);
  const pyRate = (r: number) => height - padBottom - (r / maxRate) * (height - padTop - padBottom);
  const pyDens = (d: number) => height - padBottom - (d / 5) * (height - padTop - padBottom);

  const pumpPts = points.map((p) => `${px(p.timeMin)},${py(p.pumpPressureMPa)}`).join(" ");
  const bhpPts = points.map((p) => `${px(p.timeMin)},${py(p.bottomholePressureMPa)}`).join(" ");
  const fracPts = points.map((p) => `${px(p.timeMin)},${py(p.fracturePressureMPa)}`).join(" ");
  const ratePts = stepAfterPoints(points, (p) => p.rateLps, px, pyRate);
  const densPts = stepAfterPoints(points, (p) => p.densityGcm3, px, pyDens);

  // Шаг оси времени — как в исходном модуле
  const tickStep = maxTime <= 20 ? 2 : maxTime <= 50 ? 5 : maxTime <= 120 ? 10 : maxTime <= 300 ? 20 : 30;
  const tTicks: number[] = [];
  for (let t = 0; t <= maxTime + 0.001; t += tickStep) tTicks.push(t);
  const pTicks = buildTicks(maxPressure, 5);
  const rTicks = buildTicks(maxRate, 3);

  return (
    <View style={styles.pressureChartWrap}>
      <Svg width={width} height={height}>
        <Rect x={0} y={0} width={width} height={height} fill={Colors.inputBg} rx={10} />
        {/* Сетка + ось времени */}
        {tTicks.map((t) => (
          <React.Fragment key={`t-${t}`}>
            <Line x1={px(t)} x2={px(t)} y1={padTop} y2={height - padBottom} stroke={Colors.border} strokeWidth={1} strokeDasharray="3,3" />
            <SvgText x={px(t)} y={height - padBottom + 13} fontSize={9} fill={Colors.muted} textAnchor="middle">
              {fmt(t, 0)}
            </SvgText>
          </React.Fragment>
        ))}
        {/* Сетка + левая ось давления */}
        {pTicks.map((t) => (
          <React.Fragment key={`p-${t}`}>
            <Line x1={padLeft} x2={width - padRight} y1={py(t)} y2={py(t)} stroke={Colors.border} strokeWidth={1} strokeDasharray="3,3" />
            <SvgText x={padLeft - 5} y={py(t) + 3.5} fontSize={9} fill={Colors.muted} textAnchor="end">
              {fmt(t, 0)}
            </SvgText>
          </React.Fragment>
        ))}
        {/* Правая ось расхода */}
        {rTicks.map((t) => (
          <SvgText key={`r-${t}`} x={width - padRight + 5} y={pyRate(t) + 3.5} fontSize={9} fill={C_RATE}>
            {fmt(t, 0)}
          </SvgText>
        ))}
        <SvgText x={padLeft - 5} y={padTop - 2} fontSize={9} fill={Colors.muted} textAnchor="end">
          МПа
        </SvgText>
        <SvgText x={width - padRight + 5} y={padTop - 2} fontSize={9} fill={C_RATE}>
          л/с
        </SvgText>
        <SvgText x={width - padRight} y={height - 4} fontSize={9} fill={Colors.muted} textAnchor="end">
          Время, мин
        </SvgText>

        {/* Серии — как в совмещённом графике исходного модуля */}
        <Polyline points={fracPts} fill="none" stroke={C_FRAC} strokeWidth={2} strokeDasharray="5,5" />
        <Polyline points={bhpPts} fill="none" stroke={C_BHP} strokeWidth={2.25} />
        <Polyline points={pumpPts} fill="none" stroke={C_PUMP} strokeWidth={2} />
        <Polyline points={ratePts} fill="none" stroke={C_RATE} strokeWidth={1.75} />
        <Polyline points={densPts} fill="none" stroke={C_DENS} strokeWidth={2} />
        {testPressureMPa && testPressureMPa > 0 ? (
          <>
            <Line x1={padLeft} x2={width - padRight} y1={py(testPressureMPa)} y2={py(testPressureMPa)} stroke={Colors.warning} strokeWidth={1.5} strokeDasharray="6,4" />
            <SvgText x={width - padRight} y={py(testPressureMPa) - 4} fontSize={8.5} fill={Colors.warning} textAnchor="end" fontWeight="bold">
              Опрессовка {fmt(testPressureMPa, 1)}
            </SvgText>
          </>
        ) : null}
      </Svg>
      <View style={styles.legend}>
        {testPressureMPa && testPressureMPa > 0 ? <LegendRow color={Colors.warning} text={`Давление опрессовки, МПа (выдержка 15 мин)`} /> : null}
        <LegendRow color={C_PUMP} text="Давление на насосе, МПа" />
        <LegendRow color={C_BHP} text="Давление на забое, МПа" />
        <LegendRow color={C_FRAC} text="Давление ГРП на башмаке, МПа" />
        <LegendRow color={C_RATE} text="Производительность, л/с (правая ось)" />
        <LegendRow color={C_DENS} text="Плотность закачки, г/см³ (шкала 0–5)" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  schematicWrap: {
    paddingVertical: 8,
    gap: 10,
    alignItems: "center",
  },
  pressureChartWrap: {
    paddingVertical: 8,
    gap: 8,
    alignItems: "center",
  },
  legend: {
    alignSelf: "stretch",
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
    flexShrink: 1,
  },
});
