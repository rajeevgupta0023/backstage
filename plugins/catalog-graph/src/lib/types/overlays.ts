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
import { ComponentType } from 'react';

/**
 * Health status reported by a node overlay provider.
 *
 * @public
 */
export type NodeOverlayStatus = 'ok' | 'degraded' | 'failing' | 'unknown';

/**
 * A threshold drawn as a dashed line on charts, e.g. an SLO.
 *
 * @public
 */
export type NodeOverlayThreshold = {
  value: number;
  status: 'degraded' | 'failing';
  label?: string;
};

/**
 * A time series, drawn as a sparkline on the node and as a full chart in the
 * details popover.
 *
 * @public
 */
export type NodeOverlaySeries = {
  label: string;
  unit?: string;
  /**
   * How to draw the series, defaults to `line`.
   */
  type?: 'line' | 'area' | 'bar';
  points: { t: number; v: number }[];
  thresholds?: NodeOverlayThreshold[];
};

/**
 * A categorical breakdown, e.g. requests by status code, drawn as a stacked
 * bar on the node and as a bar chart in the details popover.
 *
 * @public
 */
export type NodeOverlayBreakdown = {
  label: string;
  unit?: string;
  values: { label: string; value: number; status?: NodeOverlayStatus }[];
};

/**
 * A key/value row shown in the node card, e.g. the deployed revision.
 *
 * @public
 */
export type NodeOverlayTableRow = {
  label: string;
  value: string;
  status?: NodeOverlayStatus;
};

/**
 * Content for the node card body: one line with the provider title, a summary
 * and an optional sparkline, followed by optional table rows. When node
 * details are switched off, a status dot is shown instead.
 *
 * @public
 */
export type NodeOverlayCard = {
  /**
   * Short text on the line, e.g. "Synced". Defaults to the latest value of
   * the sparkline.
   */
  summary?: string;
  sparkline?: NodeOverlaySeries;
  table?: NodeOverlayTableRow[];
};

/**
 * Content for the panel floating above the node.
 *
 * @public
 */
export type NodeOverlayChart = {
  /**
   * The first series is drawn in the panel, all of them in the details.
   */
  series?: NodeOverlaySeries[];
  breakdown?: NodeOverlayBreakdown;
};

/**
 * Data returned by a {@link CatalogGraphNodeOverlayProvider} for one entity.
 *
 * The visual slots `card`, `chart` and `ring` are independent: each one is
 * only shown when it is set, and setting one never creates another.
 *
 * @public
 */
export type NodeOverlayData = {
  /**
   * Health of the entity as seen by this provider. Not drawn by itself: it
   * colors this provider's status dot and drives impact analysis, where
   * dependents of failing entities get a dashed ring.
   */
  status?: NodeOverlayStatus;
  card?: NodeOverlayCard;
  chart?: NodeOverlayChart;
  ring?: NodeOverlayRing;
};

/**
 * Ring drawn around a node, e.g. to flag a failure, a deployment in progress
 * or a maintenance window. Takes precedence over the dashed impact ring.
 *
 * @public
 */
export type NodeOverlayRing = {
  /**
   * Any CSS color. Defaults to the color of `status`.
   */
  color?: string;
  status?: NodeOverlayStatus;
  /**
   * Shown in the node tooltip, e.g. "Deploying v2.3".
   */
  label?: string;
  style?: 'solid' | 'dashed';
  /**
   * When several providers set a ring, the highest priority wins. Defaults
   * to 0.
   */
  priority?: number;
};

/**
 * Which parts of the node overlays are shown. The ring around the node is
 * always shown, independent of these settings.
 *
 * @public
 */
export type NodeOverlayDisplay = {
  /**
   * Compact facts in the node card body. When off, only status dots are
   * shown next to the node title.
   */
  details: boolean;
  /**
   * Charts in a panel floating above the node.
   */
  charts: boolean;
};

/**
 * Overlay data attached to a graph node, tagged with its provider.
 *
 * @public
 */
export type NodeOverlay = NodeOverlayData & {
  providerId: string;
  title: string;
  Panel?: CatalogGraphNodeOverlayProvider['Panel'];
};

/**
 * Contributes live data, such as health or metrics, to entity nodes in the
 * catalog graph. Providers are typically implemented by plugins that already
 * know how to talk to an external system (Argo CD, Prometheus, ...) and use an
 * entity annotation to decide whether they apply.
 *
 * @public
 */
export type CatalogGraphNodeOverlayProvider = {
  /**
   * Unique id of the provider, e.g. `prometheus`.
   */
  id: string;
  /**
   * Display title of the provider, e.g. `Prometheus`.
   */
  title: string;
  /**
   * Whether this provider has data for the given entity, usually decided by
   * the presence of an annotation.
   */
  isApplicable(entity: Entity): boolean;
  getData(entity: Entity): Promise<NodeOverlayData | undefined>;
  /**
   * Optional detailed view, shown when the overlay is opened from the node.
   */
  Panel?: ComponentType<{ entity: Entity; data: NodeOverlayData }>;
};
