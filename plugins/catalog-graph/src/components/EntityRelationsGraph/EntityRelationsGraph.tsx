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

import {
  CompoundEntityRef,
  Entity,
  stringifyEntityRef,
} from '@backstage/catalog-model';
import {
  DependencyGraph,
  DependencyGraphTypes,
} from '@backstage/core-components';
import { errorApiRef, useApi, useApiHolder } from '@backstage/core-plugin-api';
import CircularProgress from '@material-ui/core/CircularProgress';
import { makeStyles, useTheme } from '@material-ui/core/styles';
import classNames from 'classnames';
import { MouseEvent, useCallback, useEffect, useMemo } from 'react';
import { DefaultRenderLabel } from './DefaultRenderLabel';
import { DefaultRenderNode } from './DefaultRenderNode';
import { RelationPairs } from '../../lib/types';
import {
  CatalogGraphNodeOverlayProvider,
  Direction,
  NodeOverlayDisplay,
  EntityEdge,
  EntityNode,
} from '../../lib/types';
import { useEntityRelationNodesAndEdges } from './useEntityRelationNodesAndEdges';
import { useNodeOverlays } from './useNodeOverlays';
import {
  chartPanelHeight,
  DefaultRenderNodeOverlay,
  PANEL_GAP,
  PANEL_SIDE_WIDTH,
} from './NodeOverlays';
import { catalogGraphApiRef } from '../../api';

/** @public */
export type EntityRelationsGraphClassKey = 'progress' | 'container' | 'graph';

const useStyles = makeStyles(
  theme => ({
    progress: {
      position: 'absolute',
      left: '50%',
      top: '50%',
      marginLeft: '-20px',
      marginTop: '-20px',
    },
    container: {
      position: 'relative',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
    },
    graph: {
      width: '100%',
      flex: 1,
      // Right now there is no good way to style edges between nodes, we have to
      // fall back to these hacks:
      '& path[marker-end]': {
        transition: 'filter 0.1s ease-in-out',
      },
      '& path[marker-end]:hover': {
        filter: `drop-shadow(2px 2px 4px ${theme.palette.primary.dark});`,
      },
      '& g[data-testid=label]': {
        transition: 'transform 0s',
      },
    },
  }),
  { name: 'PluginCatalogGraphEntityRelationsGraph' },
);

/**
 * @public
 */
export type EntityRelationsGraphProps = {
  rootEntityNames: CompoundEntityRef | CompoundEntityRef[];
  maxDepth?: number;
  unidirectional?: boolean;
  mergeRelations?: boolean;
  kinds?: string[];
  relations?: string[];
  entityFilter?: (entity: Entity) => boolean;
  direction?: Direction;
  onNodeClick?: (value: EntityNode, event: MouseEvent<unknown>) => void;
  relationPairs?: RelationPairs;
  className?: string;
  zoom?: 'enabled' | 'disabled' | 'enable-on-click';
  renderNode?: DependencyGraphTypes.RenderNodeFunction<EntityNode>;
  renderLabel?: DependencyGraphTypes.RenderLabelFunction<EntityEdge>;
  /**
   * Custom renderer for content floating above nodes, defaults to the chart
   * panel of node overlays.
   */
  renderNodeOverlay?: DependencyGraphTypes.RenderNodeOverlayFunction<EntityNode>;
  renderEdge?: DependencyGraphTypes.RenderEdgeFunction<EntityEdge>;
  curve?: 'curveStepBefore' | 'curveMonotoneX';
  showArrowHeads?: boolean;
  allowFullscreen?: boolean;
  /**
   * Providers of live node data. Defaults to the providers registered in the
   * catalog graph API.
   */
  nodeOverlayProviders?: CatalogGraphNodeOverlayProvider[];
  /**
   * Show compact overlay facts in the node card, defaults to true. The ring
   * around nodes is shown either way.
   */
  showOverlayDetails?: boolean;
  /**
   * Show overlay charts in a panel floating above nodes, defaults to true.
   */
  showOverlayCharts?: boolean;
};

/**
 * Core building block for custom entity relations diagrams.
 *
 * @public
 */
export const EntityRelationsGraph = (props: EntityRelationsGraphProps) => {
  const {
    rootEntityNames,
    maxDepth = 2,
    unidirectional = true,
    mergeRelations = true,
    kinds,
    relations,
    entityFilter,
    direction = Direction.LEFT_RIGHT,
    onNodeClick,
    relationPairs,
    className,
    zoom = 'enabled',
    renderNode,
    renderLabel,
    renderNodeOverlay,
    renderEdge,
    curve,
    showArrowHeads,
    allowFullscreen,
    nodeOverlayProviders,
    showOverlayDetails = true,
    showOverlayCharts = true,
  } = props;

  const theme = useTheme();
  const classes = useStyles();
  const rootEntityRefs = useMemo(
    () =>
      (Array.isArray(rootEntityNames)
        ? rootEntityNames
        : [rootEntityNames]
      ).map(e => stringifyEntityRef(e)),
    [rootEntityNames],
  );
  const errorApi = useApi(errorApiRef);
  // Not every app registers the catalog graph API, e.g. in tests
  const catalogGraphApi = useApiHolder().get(catalogGraphApiRef);
  // Data is fetched even when details and charts are hidden, for the ring
  const providers = useMemo(
    () => nodeOverlayProviders ?? catalogGraphApi?.nodeOverlayProviders ?? [],
    [nodeOverlayProviders, catalogGraphApi],
  );
  const overlayDisplay = useMemo<NodeOverlayDisplay>(
    () => ({ details: showOverlayDetails, charts: showOverlayCharts }),
    [showOverlayDetails, showOverlayCharts],
  );
  const {
    loading,
    error,
    nodes: plainNodes,
    edges,
  } = useEntityRelationNodesAndEdges({
    rootEntityRefs,
    maxDepth,
    unidirectional,
    mergeRelations,
    kinds,
    relations,
    entityFilter,
    onNodeClick,
    relationPairs,
  });
  const nodes = useNodeOverlays(plainNodes, providers, overlayDisplay);

  // Floating chart panels are drawn above the nodes for horizontal graphs and
  // beside them for vertical ones, where edges enter nodes from the top.
  // Reserve space for the largest panel so panels never cover other nodes.
  const vertical =
    direction === Direction.TOP_BOTTOM || direction === Direction.BOTTOM_TOP;
  const maxPanelHeight = useMemo(
    () =>
      showOverlayCharts
        ? Math.max(
            0,
            ...(nodes ?? []).map(n => chartPanelHeight(n.overlays ?? [])),
          )
        : 0,
    [nodes, showOverlayCharts],
  );
  const panelSpace = maxPanelHeight ? maxPanelHeight + PANEL_GAP : 0;
  const panelSideSpace = maxPanelHeight ? PANEL_SIDE_WIDTH + PANEL_GAP : 0;
  const defaultRenderNodeOverlay = useCallback(
    (overlayProps: DependencyGraphTypes.RenderNodeOverlayProps<EntityNode>) => (
      <DefaultRenderNodeOverlay
        node={overlayProps.node}
        width={overlayProps.width}
        height={overlayProps.height}
        placement={vertical ? 'right' : 'top'}
      />
    ),
    [vertical],
  );
  const spacing = theme.spacing(4);

  useEffect(() => {
    if (error) {
      errorApi.post(error);
    }
  }, [errorApi, error]);

  return (
    <div className={classNames(classes.container, className)}>
      {loading && <CircularProgress className={classes.progress} />}
      {nodes && edges && (
        <DependencyGraph
          nodes={nodes}
          edges={edges}
          renderNode={renderNode || DefaultRenderNode}
          renderLabel={renderLabel || DefaultRenderLabel}
          renderNodeOverlay={
            renderNodeOverlay ??
            (maxPanelHeight ? defaultRenderNodeOverlay : undefined)
          }
          nodeMargin={50 + (vertical ? panelSideSpace : panelSpace)}
          renderEdge={renderEdge}
          direction={direction}
          className={classes.graph}
          fit="contain"
          paddingX={spacing + (vertical ? panelSideSpace : 0)}
          paddingY={spacing + (vertical ? 0 : panelSpace)}
          labelPosition={DependencyGraphTypes.LabelPosition.RIGHT}
          labelOffset={theme.spacing(1)}
          zoom={zoom}
          curve={curve}
          showArrowHeads={showArrowHeads}
          allowFullscreen={allowFullscreen}
        />
      )}
    </div>
  );
};
