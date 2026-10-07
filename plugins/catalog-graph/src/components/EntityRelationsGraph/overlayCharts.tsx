/*
 * Copyright 2026 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Theme, useTheme } from '@material-ui/core/styles';
import {
  NodeOverlayBreakdown,
  NodeOverlaySeries,
  NodeOverlayStatus,
} from '../../lib/types';

/*
 * Small dependency free SVG charts for node overlays. They are intentionally
 * simple: providers that need more can render their own Panel.
 */

export function statusColor(theme: Theme, status?: NodeOverlayStatus) {
  switch (status) {
    case 'ok':
      return theme.palette.success.main;
    case 'degraded':
      return theme.palette.warning.main;
    case 'failing':
      return theme.palette.error.main;
    default:
      return theme.palette.grey[500];
  }
}

function seriesColors(theme: Theme) {
  return [
    theme.palette.primary.main,
    theme.palette.secondary.main,
    theme.palette.info.main,
    theme.palette.success.dark,
  ];
}

export function formatValue(value: number, unit?: string) {
  if (unit === 'ms' && Math.abs(value) >= 1000) {
    return formatValue(value / 1000, 's');
  }
  let text: string;
  if (Math.abs(value) >= 10_000) {
    text = `${(value / 1000).toFixed(0)}k`;
  } else if (Math.abs(value) >= 1000) {
    text = `${(value / 1000).toFixed(1)}k`;
  } else if (Number.isInteger(value) || Math.abs(value) >= 100) {
    text = value.toFixed(0);
  } else {
    text = value.toFixed(1);
  }
  return `${text}${unit ?? ''}`;
}

export function lastValue(series: NodeOverlaySeries) {
  const last = series.points[series.points.length - 1];
  return last ? formatValue(last.v, series.unit) : '';
}

/** Value range including thresholds, so threshold lines stay visible. */
function valueRange(series: NodeOverlaySeries[], includeZero: boolean) {
  const values = series.flatMap(s => [
    ...s.points.map(p => p.v),
    ...(s.thresholds ?? []).map(t => t.value),
  ]);
  let min = Math.min(...values);
  const max = Math.max(...values);
  if (includeZero) {
    min = Math.min(0, min);
  }
  return { min, max: max === min ? min + 1 : max };
}

function linePath(
  points: NodeOverlaySeries['points'],
  x: (i: number) => number,
  y: (v: number) => number,
) {
  return points
    .map(
      (p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`,
    )
    .join(' ');
}

function SeriesMarks(props: {
  series: NodeOverlaySeries;
  color: string;
  width: number;
  height: number;
  y: (v: number) => number;
  strokeWidth: number;
}) {
  const { series, color, width, height, y, strokeWidth } = props;
  const { points } = series;
  if (!points.length) {
    return null;
  }
  if (series.type === 'bar') {
    const slot = width / points.length;
    const barWidth = Math.max(1, slot * 0.7);
    return (
      <g fill={color}>
        {points.map((p, i) => (
          <rect
            key={i}
            x={i * slot + (slot - barWidth) / 2}
            y={y(p.v)}
            width={barWidth}
            height={Math.max(0, height - y(p.v))}
          />
        ))}
      </g>
    );
  }
  const x = (i: number) =>
    points.length === 1 ? width / 2 : (i / (points.length - 1)) * width;
  const line = linePath(points, x, y);
  return (
    <g>
      {series.type === 'area' && (
        <path
          d={`${line} L${x(points.length - 1)},${height} L${x(0)},${height} Z`}
          fill={color}
          fillOpacity={0.2}
        />
      )}
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} />
    </g>
  );
}

function ThresholdLines(props: {
  series: NodeOverlaySeries[];
  width: number;
  y: (v: number) => number;
  theme: Theme;
  showLabels?: boolean;
}) {
  const { series, width, y, theme, showLabels } = props;
  return (
    <g>
      {series.flatMap(s =>
        (s.thresholds ?? []).map((t, i) => (
          <g key={`${s.label}-${i}`}>
            <line
              x1={0}
              x2={width}
              y1={y(t.value)}
              y2={y(t.value)}
              stroke={statusColor(theme, t.status)}
              strokeDasharray="3 2"
              strokeWidth={1}
            />
            {showLabels && t.label && (
              <text
                x={width - 2}
                y={y(t.value) - 3}
                textAnchor="end"
                fontSize={10}
                fill={statusColor(theme, t.status)}
              >
                {t.label}
              </text>
            )}
          </g>
        )),
      )}
    </g>
  );
}

/** Sparkline of a single series, used inside a node. */
export function Sparkline(props: {
  series: NodeOverlaySeries;
  width: number;
  height: number;
}) {
  const { series, width, height } = props;
  const theme = useTheme();
  const { min, max } = valueRange([series], series.type === 'bar');
  const y = (v: number) => height - ((v - min) / (max - min)) * height;
  return (
    <g>
      <ThresholdLines series={[series]} width={width} y={y} theme={theme} />
      <SeriesMarks
        series={series}
        color={theme.palette.primary.main}
        width={width}
        height={height}
        y={y}
        strokeWidth={1.5}
      />
    </g>
  );
}

function breakdownColor(
  theme: Theme,
  index: number,
  status?: NodeOverlayStatus,
) {
  if (status) {
    return statusColor(theme, status);
  }
  const colors = seriesColors(theme);
  return colors[index % colors.length];
}

/** Stacked horizontal bar of a breakdown, used inside a node. */
export function BreakdownBar(props: {
  breakdown: NodeOverlayBreakdown;
  width: number;
  height: number;
}) {
  const { breakdown, width, height } = props;
  const theme = useTheme();
  const total = breakdown.values.reduce((sum, v) => sum + v.value, 0) || 1;
  let offset = 0;
  return (
    <g>
      <rect
        width={width}
        height={height}
        fill={theme.palette.grey[200]}
        rx={2}
      />
      {breakdown.values.map((v, i) => {
        const w = (v.value / total) * width;
        const x = offset;
        offset += w;
        return (
          <rect
            key={v.label}
            x={x}
            width={w}
            height={height}
            fill={breakdownColor(theme, i, v.status)}
          >
            <title>{`${v.label}: ${formatValue(
              v.value,
              breakdown.unit,
            )}`}</title>
          </rect>
        );
      })}
    </g>
  );
}

const AXIS_WIDTH = 44;
const AXIS_HEIGHT = 18;
// Room for the top axis label, which is centered on the top grid line
const PLOT_TOP = 8;

function formatTime(t: number) {
  return new Date(t).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Full chart with axes, legend and thresholds, used in the details popover. */
export function OverlayChart(props: {
  series: NodeOverlaySeries[];
  width?: number;
  height?: number;
}) {
  const { series, width = 380, height = 150 } = props;
  const theme = useTheme();
  const colors = seriesColors(theme);
  const plotWidth = width - AXIS_WIDTH;
  const plotHeight = height - AXIS_HEIGHT - PLOT_TOP;
  const { min, max } = valueRange(
    series,
    series.some(s => s.type === 'bar' || s.type === 'area'),
  );
  const y = (v: number) => plotHeight - ((v - min) / (max - min)) * plotHeight;
  const allTimes = series.flatMap(s => s.points.map(p => p.t));
  const unit = series[0]?.unit;
  const textColor = theme.palette.text.secondary;

  return (
    <div>
      <svg width={width} height={height} role="img">
        <g transform={`translate(${AXIS_WIDTH},${PLOT_TOP})`}>
          {[0, 0.5, 1].map(f => {
            const value = min + (max - min) * f;
            return (
              <g key={f}>
                <line
                  x1={0}
                  x2={plotWidth}
                  y1={y(value)}
                  y2={y(value)}
                  stroke={theme.palette.divider}
                />
                <text
                  x={-6}
                  y={y(value)}
                  textAnchor="end"
                  alignmentBaseline="middle"
                  fontSize={10}
                  fill={textColor}
                >
                  {formatValue(value, unit)}
                </text>
              </g>
            );
          })}
          {series.map((s, i) => (
            <SeriesMarks
              key={s.label}
              series={s}
              color={colors[i % colors.length]}
              width={plotWidth}
              height={plotHeight}
              y={y}
              strokeWidth={2}
            />
          ))}
          <ThresholdLines
            series={series}
            width={plotWidth}
            y={y}
            theme={theme}
            showLabels
          />
          {allTimes.length > 0 && (
            <>
              <text
                x={0}
                y={height - PLOT_TOP - 4}
                fontSize={10}
                fill={textColor}
              >
                {formatTime(Math.min(...allTimes))}
              </text>
              <text
                x={plotWidth}
                y={height - PLOT_TOP - 4}
                fontSize={10}
                fill={textColor}
                textAnchor="end"
              >
                {formatTime(Math.max(...allTimes))}
              </text>
            </>
          )}
        </g>
      </svg>
      {series.length > 1 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {series.map((s, i) => (
            <span key={s.label} style={{ fontSize: 12, color: textColor }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  marginRight: 4,
                  background: colors[i % colors.length],
                }}
              />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Horizontal bar chart of a breakdown, used in the details popover. */
export function BreakdownChart(props: {
  breakdown: NodeOverlayBreakdown;
  width?: number;
}) {
  const { breakdown, width = 380 } = props;
  const theme = useTheme();
  const rowHeight = 20;
  const labelWidth = 90;
  const valueWidth = 50;
  const barArea = width - labelWidth - valueWidth;
  const max = Math.max(...breakdown.values.map(v => v.value), 1);
  return (
    <svg width={width} height={breakdown.values.length * rowHeight} role="img">
      {breakdown.values.map((v, i) => (
        <g key={v.label} transform={`translate(0,${i * rowHeight})`}>
          <text
            x={labelWidth - 6}
            y={rowHeight / 2}
            textAnchor="end"
            alignmentBaseline="middle"
            fontSize={11}
            fill={theme.palette.text.primary}
          >
            {v.label}
          </text>
          <rect
            x={labelWidth}
            y={3}
            width={(v.value / max) * barArea}
            height={rowHeight - 6}
            fill={breakdownColor(theme, i, v.status)}
            rx={2}
          />
          <text
            x={labelWidth + (v.value / max) * barArea + 4}
            y={rowHeight / 2}
            alignmentBaseline="middle"
            fontSize={11}
            fill={theme.palette.text.secondary}
          >
            {formatValue(v.value, breakdown.unit)}
          </text>
        </g>
      ))}
    </svg>
  );
}
