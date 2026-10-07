/*
 * Copyright 2021 The Backstage Authors
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
import { DependencyGraphTypes } from '@backstage/core-components';
import { IconComponent } from '@backstage/core-plugin-api';
import { useEntityPresentation } from '@backstage/plugin-catalog-react';
import { makeStyles, useTheme } from '@material-ui/core/styles';
import classNames from 'classnames';
import { useLayoutEffect, useRef, useState } from 'react';
import { EntityIcon } from './EntityIcon';
import { EntityNodeData } from '../../lib/types';
import { DEFAULT_NAMESPACE } from '@backstage/catalog-model';
import {
  cardBodyHeight,
  COMPACT_DOT_WIDTH,
  CompactStatusDots,
  cardOverlays,
  NodeCardBody,
  OVERLAY_MIN_WIDTH,
  statusColor,
  useOverlayDetails,
} from './NodeOverlays';
import { resolveRing } from '../../lib/graph';

/** @public */
export type CustomNodeClassKey = 'node' | 'text' | 'clickable';

const useStyles = makeStyles(
  theme => ({
    node: {
      fill: theme.palette.grey[300],
      stroke: theme.palette.grey[300],

      '&.primary': {
        fill: theme.palette.primary.light,
        stroke: theme.palette.primary.light,
      },
      '&.secondary': {
        fill: theme.palette.secondary.light,
        stroke: theme.palette.secondary.light,
      },
    },
    text: {
      fill: theme.palette.getContrastText(theme.palette.grey[300]),

      '&.primary': {
        fill: theme.palette.primary.contrastText,
      },
      '&.secondary': {
        fill: theme.palette.secondary.contrastText,
      },
      '&.focused': {
        fontWeight: 'bold',
      },
    },
    clickable: {
      cursor: 'pointer',
    },
    outline: {
      fill: 'none',
      strokeWidth: 3,
    },
    impacted: {
      strokeDasharray: '6 3',
    },
    body: {
      fill: theme.palette.background.paper,
    },
  }),
  { name: 'PluginCatalogGraphCustomNode' },
);

export function DefaultRenderNode({
  node: {
    id,
    entity,
    color = 'default',
    focused,
    onClick,
    overlays,
    overlayDisplay = { details: true, charts: true },
    impactedBy,
  },
}: DependencyGraphTypes.RenderNodeProps<EntityNodeData>) {
  const classes = useStyles();
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const idRef = useRef<SVGTextElement | null>(null);
  const entityRefPresentationSnapshot = useEntityPresentation(entity, {
    defaultNamespace: DEFAULT_NAMESPACE,
  });

  useLayoutEffect(() => {
    // set the width to the length of the ID
    if (idRef.current) {
      let { height: renderedHeight, width: renderedWidth } =
        idRef.current.getBBox();
      renderedHeight = Math.round(renderedHeight);
      renderedWidth = Math.round(renderedWidth);

      if (renderedHeight !== height || renderedWidth !== width) {
        setWidth(renderedWidth);
        setHeight(renderedHeight);
      }
    }
  }, [width, height]);

  const hasKindIcon = !!entityRefPresentationSnapshot.Icon;
  const padding = 10;
  const iconSize = height;
  const paddedIconWidth = hasKindIcon ? iconSize + padding : 0;
  const paddedWidth = paddedIconWidth + width + padding * 2;
  const paddedHeight = height + padding * 2;

  const displayTitle = entityRefPresentationSnapshot.primaryTitle ?? id;

  // With overlay details the node becomes a card: the title is the header and
  // the body lists compact facts. Without, status dots follow the title.
  // Charts are drawn separately in a floating panel, see
  // DefaultRenderNodeOverlay. The ring is shown regardless of these settings.
  const cards = cardOverlays(overlays);
  const showCard = cards.length > 0 && overlayDisplay.details;
  const showDots = cards.length > 0 && !overlayDisplay.details;
  const dotsWidth = showDots
    ? cards.length * COMPACT_DOT_WIDTH + padding / 2
    : 0;
  const cardWidth = showCard
    ? Math.max(paddedWidth, OVERLAY_MIN_WIDTH)
    : paddedWidth + dotsWidth;
  const headerOffsetX = showCard ? (cardWidth - paddedWidth) / 2 : 0;
  const bodyPadding = 3;
  const bodyHeight = showCard ? cardBodyHeight(overlays!) + bodyPadding * 2 : 0;
  const cardHeight = paddedHeight + bodyHeight;
  const { openDetails, details } = useOverlayDetails(entity, overlays);

  const ring = resolveRing(overlays, impactedBy);
  let ringColor: string | undefined;
  if (ring?.color) {
    ringColor = ring.color;
  } else if (ring?.status === 'impacted') {
    ringColor = theme.palette.warning.main;
  } else if (ring) {
    ringColor = statusColor(theme, ring.status);
  }

  const textClassName = classNames(
    classes.text,
    focused && 'focused',
    color === 'primary' && 'primary',
    color === 'secondary' && 'secondary',
  );

  return (
    <g onClick={onClick} className={classNames(onClick && classes.clickable)}>
      <rect
        className={classNames(
          classes.node,
          color === 'primary' && 'primary',
          color === 'secondary' && 'secondary',
        )}
        width={cardWidth}
        height={cardHeight}
        rx={10}
      />
      {showCard && (
        <>
          <rect
            className={classes.body}
            x={1.5}
            y={paddedHeight}
            width={cardWidth - 3}
            height={bodyHeight - 1.5}
            rx={8}
          />
          {/* square off the top corners of the body */}
          <rect
            className={classes.body}
            x={1.5}
            y={paddedHeight}
            width={cardWidth - 3}
            height={8}
          />
        </>
      )}
      <g transform={`translate(${headerOffsetX},0)`}>
        {hasKindIcon && (
          <EntityIcon
            icon={entityRefPresentationSnapshot.Icon as IconComponent}
            y={padding}
            x={padding}
            width={iconSize}
            height={iconSize}
            className={textClassName}
          />
        )}
        <text
          ref={idRef}
          className={textClassName}
          y={paddedHeight / 2}
          x={paddedIconWidth + (width + padding * 2) / 2}
          textAnchor="middle"
          alignmentBaseline="middle"
        >
          {displayTitle}
        </text>
      </g>
      {showDots && (
        <CompactStatusDots
          overlays={cards}
          x={paddedWidth - padding / 2}
          y={paddedHeight / 2}
          onOpen={openDetails}
        />
      )}
      {showCard && (
        <g transform={`translate(0,${paddedHeight + bodyPadding})`}>
          <NodeCardBody
            overlays={overlays!}
            width={cardWidth}
            onOpen={openDetails}
          />
        </g>
      )}
      {ringColor && (
        <rect
          className={classNames(
            classes.outline,
            ring?.dashed && classes.impacted,
          )}
          stroke={ringColor}
          data-testid="node-ring"
          width={cardWidth}
          height={cardHeight}
          rx={10}
        />
      )}
      {details}
      <title>
        {entityRefPresentationSnapshot.entityRef}
        {ring?.label ? `\n${ring.label}` : ''}
      </title>
    </g>
  );
}
