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

import { Entity } from '@backstage/catalog-model';
import Popover from '@material-ui/core/Popover';
import Typography from '@material-ui/core/Typography';
import { makeStyles, useTheme } from '@material-ui/core/styles';
import { MouseEvent, ReactElement, useState } from 'react';
import {
  EntityNode,
  NodeOverlay,
  NodeOverlayData,
  NodeOverlayTableRow,
} from '../../lib/types';
import {
  BreakdownBar,
  BreakdownChart,
  formatValue,
  lastValue,
  OverlayChart,
  Sparkline,
  statusColor,
} from './overlayCharts';

export { statusColor } from './overlayCharts';

/*
 * Overlays are shown in two places:
 *
 * - the node card body: `card` content, i.e. summary, sparkline and
 *   key/value tables, one line each
 * - a floating panel above the node: `chart` content, i.e. series and
 *   breakdowns
 *
 * Each slot is drawn only for overlays that set it. The ring is resolved
 * separately, see resolveRing.
 *
 * Both open the same details popover when clicked.
 */

/** Height of one line in the node card body. */
export const OVERLAY_ROW_HEIGHT = 20;
/** Minimum width of a node with overlays, so lines have room for a chart. */
export const OVERLAY_MIN_WIDTH = 230;
/** Lines shown in the card before collapsing the rest into "+N more". */
export const CARD_MAX_LINES = 5;
/** Charts shown in the floating panel before collapsing the rest. */
export const PANEL_MAX_CHARTS = 2;
/** Space between the floating panel and the node card. */
export const PANEL_GAP = 10;
/** Width of the floating panel when it is placed beside the node. */
export const PANEL_SIDE_WIDTH = 230;
/** Horizontal space taken by one compact status dot. */
export const COMPACT_DOT_WIDTH = 10;

const SPARKLINE_WIDTH = 56;
const SPARKLINE_HEIGHT = 12;
const CHAR_WIDTH = 6.5;
const PANEL_PADDING = 8;
const CHART_TITLE_HEIGHT = 16;
const CHART_HEIGHT = 30;
const BREAKDOWN_HEIGHT = 24;
const MORE_HEIGHT = 16;

function truncate(text: string | undefined, maxWidth: number) {
  if (!text) {
    return '';
  }
  const maxChars = Math.max(3, Math.floor(maxWidth / CHAR_WIDTH));
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

const useStyles = makeStyles(
  theme => ({
    clickable: {
      cursor: 'pointer',
      '&:hover [data-hover-background]': {
        fill: theme.palette.action.hover,
      },
    },
    label: {
      fill: theme.palette.text.primary,
      fontSize: 11,
    },
    value: {
      fill: theme.palette.text.secondary,
      fontSize: 11,
    },
    small: {
      fill: theme.palette.text.secondary,
      fontSize: 10,
    },
    panel: {
      fill: theme.palette.background.paper,
      stroke: theme.palette.divider,
      filter: `drop-shadow(0 1px 2px ${theme.palette.action.disabled})`,
    },
    popover: {
      padding: theme.spacing(2),
      maxWidth: 440,
    },
    section: {
      '& + &': {
        marginTop: theme.spacing(2),
        paddingTop: theme.spacing(2),
        borderTop: `1px solid ${theme.palette.divider}`,
      },
    },
    heading: {
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(1),
      marginBottom: theme.spacing(1),
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: '50%',
      display: 'inline-block',
    },
    table: {
      borderCollapse: 'collapse',
      marginBottom: theme.spacing(1),
      '& td': {
        padding: theme.spacing(0.25, 2, 0.25, 0),
        fontSize: 13,
      },
    },
  }),
  { name: 'PluginCatalogGraphNodeOverlays' },
);

// ---------------------------------------------------------------------------
// Details popover

/** Chart series if any, otherwise the card sparkline as a full chart. */
function detailSeries(data: NodeOverlayData) {
  if (data.chart?.series?.length) {
    return data.chart.series;
  }
  return data.card?.sparkline ? [data.card.sparkline] : [];
}

function OverlayDetails(props: { entity: Entity; overlays: NodeOverlay[] }) {
  const { entity, overlays } = props;
  const classes = useStyles();
  const theme = useTheme();
  return (
    <div className={classes.popover}>
      {overlays.map(({ Panel, providerId, title, ...data }) => (
        <div key={providerId} className={classes.section}>
          <div className={classes.heading}>
            <span
              className={classes.dot}
              style={{ background: statusColor(theme, data.status) }}
            />
            <Typography variant="subtitle2">{title}</Typography>
            {data.status && (
              <Typography variant="caption" color="textSecondary">
                {data.status}
              </Typography>
            )}
          </div>
          {data.ring?.label && (
            <Typography variant="body2" gutterBottom>
              {data.ring.label}
            </Typography>
          )}
          {data.card?.summary && (
            <Typography variant="body2" gutterBottom>
              {data.card.summary}
            </Typography>
          )}
          {data.card?.table?.length ? (
            <table className={classes.table}>
              <tbody>
                {data.card.table.map(row => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td
                      style={{
                        color: row.status && statusColor(theme, row.status),
                      }}
                    >
                      {row.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {Panel ? (
            <Panel entity={entity} data={data} />
          ) : (
            <>
              {detailSeries(data).length ? (
                <OverlayChart series={detailSeries(data)} />
              ) : null}
              {data.chart?.breakdown && (
                <>
                  <Typography variant="caption" color="textSecondary">
                    {data.chart.breakdown.label}
                  </Typography>
                  <BreakdownChart breakdown={data.chart.breakdown} />
                </>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Popover with all overlay details of a node. Returns a click handler to open
 * it and the popover element to render next to the node.
 */
export function useOverlayDetails(
  entity: Entity,
  overlays: NodeOverlay[] | undefined,
): {
  openDetails: (event: MouseEvent<SVGGElement>) => void;
  details: ReactElement | null;
} {
  const [anchor, setAnchor] = useState<SVGGElement | null>(null);
  const openDetails = (event: MouseEvent<SVGGElement>) => {
    // Opening the details must not trigger the node click (navigation)
    event.stopPropagation();
    setAnchor(event.currentTarget);
  };
  const details = overlays?.length ? (
    <Popover
      open={!!anchor}
      anchorEl={anchor}
      onClose={() => setAnchor(null)}
      // Render inside the fullscreen element, otherwise it is invisible
      container={() => document.fullscreenElement ?? document.body}
      // Open beside the node so it does not cover the node itself
      anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
      transformOrigin={{ vertical: 'center', horizontal: 'left' }}
    >
      <OverlayDetails entity={entity} overlays={overlays} />
    </Popover>
  ) : null;
  return { openDetails, details };
}

// ---------------------------------------------------------------------------
// Card body

type CardLine =
  | { kind: 'overlay'; key: string; overlay: NodeOverlay }
  | { kind: 'table'; key: string; row: NodeOverlayTableRow };

/** Overlays that set `card` content. */
export function cardOverlays(overlays: NodeOverlay[] | undefined) {
  return (overlays ?? []).filter(o => o.card);
}

function cardLines(overlays: NodeOverlay[]): CardLine[] {
  return cardOverlays(overlays).flatMap(overlay => [
    { kind: 'overlay' as const, key: overlay.providerId, overlay },
    ...(overlay.card?.table ?? []).map(row => ({
      kind: 'table' as const,
      key: `${overlay.providerId}-${row.label}`,
      row,
    })),
  ]);
}

/** Height of the card body for the given overlays. */
export function cardBodyHeight(overlays: NodeOverlay[]) {
  const lines = cardLines(overlays).length;
  const shown = Math.min(lines, CARD_MAX_LINES);
  return (shown + (lines > CARD_MAX_LINES ? 1 : 0)) * OVERLAY_ROW_HEIGHT;
}

function OverlayLine(props: { overlay: NodeOverlay; width: number }) {
  const { overlay, width } = props;
  const classes = useStyles();
  const theme = useTheme();
  const sparkline = overlay.card?.sparkline;
  const middle = OVERLAY_ROW_HEIGHT / 2;
  const sparklineX = width - SPARKLINE_WIDTH - 8;
  const valueRight = sparkline ? sparklineX - 6 : width - 8;
  const value =
    overlay.card?.summary ?? (sparkline ? lastValue(sparkline) : undefined);
  const valueText = truncate(value, sparkline ? 60 : width / 2 - 20);
  const titleWidth = valueRight - 20 - valueText.length * CHAR_WIDTH - 6;

  return (
    <g>
      <circle
        cx={10}
        cy={middle}
        r={4}
        fill={statusColor(theme, overlay.status)}
      />
      <text
        className={classes.label}
        x={20}
        y={middle}
        alignmentBaseline="middle"
      >
        {truncate(overlay.title, titleWidth)}
      </text>
      <text
        className={classes.value}
        x={valueRight}
        y={middle}
        textAnchor="end"
        alignmentBaseline="middle"
      >
        {valueText}
      </text>
      {sparkline && (
        <g
          transform={`translate(${sparklineX},${
            middle - SPARKLINE_HEIGHT / 2
          })`}
        >
          <Sparkline
            series={sparkline}
            width={SPARKLINE_WIDTH}
            height={SPARKLINE_HEIGHT}
          />
        </g>
      )}
    </g>
  );
}

function TableLine(props: { row: NodeOverlayTableRow; width: number }) {
  const { row, width } = props;
  const classes = useStyles();
  const theme = useTheme();
  const middle = OVERLAY_ROW_HEIGHT / 2;
  const value = truncate(row.value, width / 2 - 8);
  return (
    <g>
      <text
        className={classes.small}
        x={20}
        y={middle}
        alignmentBaseline="middle"
      >
        {truncate(row.label, width - 40 - value.length * CHAR_WIDTH)}
      </text>
      <text
        className={classes.small}
        style={
          row.status ? { fill: statusColor(theme, row.status) } : undefined
        }
        x={width - 8}
        y={middle}
        textAnchor="end"
        alignmentBaseline="middle"
      >
        {value}
      </text>
    </g>
  );
}

/** Compact facts of all overlays, drawn in the body of the node card. */
export function NodeCardBody(props: {
  overlays: NodeOverlay[];
  width: number;
  onOpen: (event: MouseEvent<SVGGElement>) => void;
}) {
  const { overlays, width, onOpen } = props;
  const classes = useStyles();
  const lines = cardLines(overlays);
  const visible = lines.slice(0, CARD_MAX_LINES);
  const hiddenCount = lines.length - visible.length;

  return (
    <g
      className={classes.clickable}
      onClick={onOpen}
      data-testid="node-overlay-card"
    >
      <rect
        data-hover-background
        width={width}
        height={cardBodyHeight(overlays)}
        fill="transparent"
      />
      {visible.map((line, index) => (
        <g
          key={line.key}
          transform={`translate(0,${index * OVERLAY_ROW_HEIGHT})`}
        >
          {line.kind === 'overlay' ? (
            <OverlayLine overlay={line.overlay} width={width} />
          ) : (
            <TableLine row={line.row} width={width} />
          )}
        </g>
      ))}
      {hiddenCount > 0 && (
        <text
          className={classes.small}
          x={width / 2}
          y={visible.length * OVERLAY_ROW_HEIGHT + OVERLAY_ROW_HEIGHT / 2}
          textAnchor="middle"
          alignmentBaseline="middle"
        >
          +{hiddenCount} more
        </text>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Floating chart panel

/** Overlays that set `chart` content. */
function chartOverlays(overlays: NodeOverlay[]) {
  return overlays.filter(o => o.chart?.series?.length || o.chart?.breakdown);
}

function chartBlockHeight(overlay: NodeOverlay) {
  return (
    CHART_TITLE_HEIGHT +
    (overlay.chart?.series?.length ? CHART_HEIGHT : 0) +
    (overlay.chart?.breakdown ? BREAKDOWN_HEIGHT : 0) +
    PANEL_PADDING
  );
}

/** Height of the floating chart panel, 0 if no overlay has charts. */
export function chartPanelHeight(overlays: NodeOverlay[]) {
  const charts = chartOverlays(overlays);
  if (!charts.length) {
    return 0;
  }
  const visible = charts.slice(0, PANEL_MAX_CHARTS);
  return (
    PANEL_PADDING +
    visible.reduce((sum, o) => sum + chartBlockHeight(o), 0) +
    (charts.length > visible.length ? MORE_HEIGHT : 0)
  );
}

function ChartBlock(props: { overlay: NodeOverlay; width: number }) {
  const { overlay, width } = props;
  const classes = useStyles();
  const theme = useTheme();
  const series = overlay.chart?.series?.[0];
  const breakdown = overlay.chart?.breakdown;
  const chartWidth = width - PANEL_PADDING * 2;
  const title =
    series && overlay.chart!.series!.length > 1
      ? `${overlay.title} · ${series.label}`
      : overlay.title;
  const total = breakdown?.values.reduce((sum, v) => sum + v.value, 0) || 1;

  return (
    <g>
      <circle cx={4} cy={7} r={3.5} fill={statusColor(theme, overlay.status)} />
      <text className={classes.label} x={12} y={7} alignmentBaseline="middle">
        {truncate(title, chartWidth - 70)}
      </text>
      {series && (
        <text
          className={classes.value}
          x={chartWidth}
          y={7}
          textAnchor="end"
          alignmentBaseline="middle"
        >
          {lastValue(series)}
        </text>
      )}
      {series && (
        <g transform={`translate(0,${CHART_TITLE_HEIGHT})`}>
          <Sparkline
            series={series}
            width={chartWidth}
            height={CHART_HEIGHT - 4}
          />
        </g>
      )}
      {breakdown && (
        <g
          transform={`translate(0,${
            CHART_TITLE_HEIGHT + (series ? CHART_HEIGHT : 0)
          })`}
        >
          <BreakdownBar breakdown={breakdown} width={chartWidth} height={8} />
          <text className={classes.small} x={0} y={19}>
            {truncate(
              breakdown.values
                .map(v => `${v.label} ${formatValue((v.value / total) * 100)}%`)
                .join(' · '),
              chartWidth,
            )}
          </text>
        </g>
      )}
    </g>
  );
}

/** Rounded rectangle with a small pointer towards the node. */
function panelPath(width: number, height: number, pointer: 'bottom' | 'left') {
  const r = 6;
  const p = 6;
  const bottom =
    pointer === 'bottom'
      ? `H${width / 2 + p} L${width / 2},${height + p} L${
          width / 2 - p
        },${height} `
      : '';
  const left =
    pointer === 'left'
      ? `V${height / 2 + p} L${-p},${height / 2} L0,${height / 2 - p} `
      : '';
  return [
    `M${r},0 H${width - r} Q${width},0 ${width},${r}`,
    `V${height - r} Q${width},${height} ${width - r},${height}`,
    `${bottom}H${r} Q0,${height} 0,${height - r}`,
    `${left}V${r} Q0,0 ${r},0 Z`,
  ].join(' ');
}

/**
 * Charts of all overlays with series or breakdowns, drawn in a panel that
 * floats above the node card with a pointer towards it.
 */
export function FloatingChartPanel(props: {
  overlays: NodeOverlay[];
  width: number;
  /** Side of the panel that points towards the node. */
  pointer: 'bottom' | 'left';
  onOpen: (event: MouseEvent<SVGGElement>) => void;
}) {
  const { overlays, width, pointer, onOpen } = props;
  const classes = useStyles();
  const charts = chartOverlays(overlays);
  const visible = charts.slice(0, PANEL_MAX_CHARTS);
  const hiddenCount = charts.length - visible.length;
  const height = chartPanelHeight(overlays);
  let offset = PANEL_PADDING;

  return (
    <g
      className={classes.clickable}
      onClick={onOpen}
      data-testid="node-overlay-panel"
    >
      <path className={classes.panel} d={panelPath(width, height, pointer)} />
      <rect
        data-hover-background
        x={1}
        y={1}
        width={width - 2}
        height={height - 2}
        rx={6}
        fill="transparent"
      />
      {visible.map(overlay => {
        const y = offset;
        offset += chartBlockHeight(overlay);
        return (
          <g
            key={overlay.providerId}
            transform={`translate(${PANEL_PADDING},${y})`}
          >
            <ChartBlock overlay={overlay} width={width} />
          </g>
        );
      })}
      {hiddenCount > 0 && (
        <text
          className={classes.small}
          x={width / 2}
          y={height - MORE_HEIGHT / 2 - 2}
          textAnchor="middle"
          alignmentBaseline="middle"
        >
          +{hiddenCount} more {hiddenCount === 1 ? 'chart' : 'charts'}
        </text>
      )}
    </g>
  );
}

/**
 * Draws the floating chart panel of a node, rendered by the dependency graph
 * in a layer above all nodes and edges so it does not affect the layout.
 * The panel is placed above the node, or beside it for vertical graphs where
 * edges enter nodes from the top.
 */
export function DefaultRenderNodeOverlay(props: {
  node: EntityNode;
  width: number;
  height: number;
  placement: 'top' | 'right';
}) {
  const { node, width, height, placement } = props;
  const overlays =
    node.overlayDisplay?.charts === false ? undefined : node.overlays;
  const { openDetails, details } = useOverlayDetails(node.entity, overlays);
  const panelHeight = overlays ? chartPanelHeight(overlays) : 0;
  if (!overlays || !panelHeight) {
    return null;
  }
  // Above plain nodes without a card the panel can be wider than the node
  const panelWidth =
    placement === 'top' ? Math.max(width, OVERLAY_MIN_WIDTH) : PANEL_SIDE_WIDTH;
  const transform =
    placement === 'top'
      ? `translate(${(width - panelWidth) / 2},${-panelHeight - PANEL_GAP})`
      : `translate(${width + PANEL_GAP},${(height - panelHeight) / 2})`;
  return (
    <g transform={transform}>
      <FloatingChartPanel
        overlays={overlays}
        width={panelWidth}
        pointer={placement === 'top' ? 'bottom' : 'left'}
        onOpen={openDetails}
      />
      {details}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Compact mode

/** Status dots shown next to the node title in compact mode. */
export function CompactStatusDots(props: {
  overlays: NodeOverlay[];
  x: number;
  y: number;
  onOpen: (event: MouseEvent<SVGGElement>) => void;
}) {
  const { overlays, x, y, onOpen } = props;
  const classes = useStyles();
  const theme = useTheme();
  return (
    <g
      className={classes.clickable}
      onClick={onOpen}
      data-testid="node-overlay-dots"
    >
      {/* Click target for the whole strip, the dots alone are tiny */}
      <rect
        x={x - 2}
        y={y - 8}
        width={overlays.length * COMPACT_DOT_WIDTH + 4}
        height={16}
        fill="transparent"
      />
      {overlays.map((overlay, index) => (
        <circle
          key={overlay.providerId}
          cx={x + index * COMPACT_DOT_WIDTH + 4}
          cy={y}
          r={4}
          fill={statusColor(theme, overlay.status)}
          stroke={theme.palette.background.paper}
          strokeWidth={1}
        >
          <title>
            {`${overlay.title}: ${
              overlay.card?.summary ?? overlay.status ?? ''
            }`}
          </title>
        </circle>
      ))}
    </g>
  );
}
