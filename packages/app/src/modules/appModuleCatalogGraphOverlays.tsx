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
import {
  ApiBlueprint,
  createFrontendModule,
} from '@backstage/frontend-plugin-api';
import {
  catalogGraphApiRef,
  CatalogGraphNodeOverlayProvider,
  DefaultCatalogGraphApi,
  NodeOverlayRing,
  NodeOverlaySeries,
  NodeOverlayStatus,
} from '@backstage/plugin-catalog-graph';

/*
 * Demo overlay providers for the catalog graph. Real providers would live in
 * the Argo CD and Prometheus plugins and query those systems; these fake the
 * data from `catalog-graph.demo/*` annotations, see
 * plugins/catalog-graph/examples/order-pipeline.yaml.
 */

function demoHealth(entity: Entity): NodeOverlayStatus {
  const health = entity.metadata.annotations?.['catalog-graph.demo/health'];
  return health === 'failing' || health === 'degraded' ? health : 'ok';
}

function demoLatency(entity: Entity) {
  return Number(
    entity.metadata.annotations?.['catalog-graph.demo/latency-ms'] ?? 100,
  );
}

function randomWalk(base: number, spread = 0.3): NodeOverlaySeries['points'] {
  let v = base;
  return Array.from({ length: 30 }, (_value, i) => {
    // Noise that is pulled back towards the base value
    v = Math.max(
      1,
      base + (v - base) * 0.7 + (Math.random() - 0.5) * base * spread,
    );
    return { t: Date.now() - (30 - i) * 60_000, v };
  });
}

// Health rings use a higher priority than informational rings (rollouts), so
// a failure is never hidden by a deployment in progress
function healthRing(status: NodeOverlayStatus): NodeOverlayRing | undefined {
  return status === 'failing' || status === 'degraded'
    ? { status, priority: 10 }
    : undefined;
}

// Card only: summary and a small table
const demoArgoCdProvider: CatalogGraphNodeOverlayProvider = {
  id: 'argocd',
  title: 'Argo CD',
  isApplicable: entity => !!entity.metadata.annotations?.['argocd/app-name'],
  async getData(entity) {
    const sync = entity.metadata.annotations?.['catalog-graph.demo/sync'];
    const revision = Math.abs(
      [...entity.metadata.name].reduce((h, c) => h * 31 + c.charCodeAt(0), 7),
    )
      .toString(16)
      .slice(0, 7);
    return {
      status: sync ? 'degraded' : 'ok',
      card: {
        summary: sync ?? 'Synced',
        table: [
          { label: 'Revision', value: revision },
          {
            label: 'Last sync',
            value: sync ? '3h ago' : '4m ago',
            status: sync ? 'degraded' : undefined,
          },
        ],
      },
    };
  },
};

// Card sparkline, floating chart with two series and thresholds, health ring
const demoPrometheusProvider: CatalogGraphNodeOverlayProvider = {
  id: 'prometheus',
  title: 'Latency',
  isApplicable: entity => !!entity.metadata.annotations?.['prometheus.io/rule'],
  async getData(entity) {
    // Simulate a network round trip
    await new Promise(resolve => setTimeout(resolve, 300));
    const status = demoHealth(entity);
    const base = demoLatency(entity);
    const p95: NodeOverlaySeries = {
      label: 'p95',
      unit: 'ms',
      points: randomWalk(base),
      thresholds: [
        { value: 1000, status: 'degraded' as const, label: 'SLO' },
        { value: 3000, status: 'failing' as const },
      ].filter(t => t.value < base * 3),
    };
    return {
      status,
      card: { sparkline: p95 },
      chart: {
        series: [
          p95,
          { label: 'p50', unit: 'ms', points: randomWalk(base * 0.4) },
        ],
      },
      ring: healthRing(status),
    };
  },
};

// Floating chart only: bars plus a categorical breakdown
const demoTrafficProvider: CatalogGraphNodeOverlayProvider = {
  id: 'traffic',
  title: 'Traffic',
  isApplicable: entity =>
    entity.kind === 'Component' &&
    !!entity.metadata.annotations?.['prometheus.io/rule'],
  async getData(entity) {
    const status = demoHealth(entity);
    const errorRate = { ok: 0.005, degraded: 0.04, failing: 0.3, unknown: 0 }[
      status
    ];
    const total = 12_000;
    return {
      status: errorRate > 0.02 ? 'degraded' : 'ok',
      chart: {
        series: [
          { label: 'requests/min', type: 'bar', points: randomWalk(400, 0.2) },
        ],
        breakdown: {
          label: 'Responses (last hour)',
          values: [
            {
              label: '2xx',
              value: Math.round(total * (0.97 - errorRate)),
              status: 'ok',
            },
            {
              label: '4xx',
              value: Math.round(total * 0.03),
              status: 'degraded',
            },
            {
              label: '5xx',
              value: Math.round(total * errorRate),
              status: 'failing',
            },
          ],
        },
      },
    };
  },
};

// Floating area chart and a health ring, no card line
const demoKafkaProvider: CatalogGraphNodeOverlayProvider = {
  id: 'kafka',
  title: 'Consumer lag',
  isApplicable: entity => (entity.spec as any)?.type === 'kafka-topic',
  async getData(entity) {
    const status = demoHealth(entity) === 'failing' ? 'failing' : 'ok';
    let lag = status === 'failing' ? 2_000 : 50;
    return {
      status,
      chart: {
        series: [
          {
            label: 'lag',
            unit: ' msg',
            type: 'area',
            points: Array.from({ length: 30 }, (_value, i) => {
              lag =
                status === 'failing'
                  ? lag * 1.12
                  : Math.max(0, lag + (Math.random() - 0.5) * 40);
              return { t: Date.now() - (30 - i) * 60_000, v: lag };
            }),
            thresholds: [
              { value: 10_000, status: 'failing', label: 'max lag' },
            ],
          },
        ],
      },
      ring: healthRing(status),
    };
  },
};

// Card only, shows up on unhealthy entities
const demoPagerDutyProvider: CatalogGraphNodeOverlayProvider = {
  id: 'pagerduty',
  title: 'PagerDuty',
  isApplicable: entity => demoHealth(entity) !== 'ok',
  async getData(entity) {
    const failing = demoHealth(entity) === 'failing';
    return {
      status: failing ? 'failing' : 'degraded',
      card: { summary: failing ? '2 open incidents' : '1 open incident' },
    };
  },
};

// Ring only: no card line, no chart
const demoRolloutProvider: CatalogGraphNodeOverlayProvider = {
  id: 'rollout',
  title: 'Rollout',
  isApplicable: entity =>
    !!entity.metadata.annotations?.['catalog-graph.demo/ring'],
  async getData(entity) {
    const state = entity.metadata.annotations?.['catalog-graph.demo/ring'];
    return {
      ring:
        state === 'deploying'
          ? { color: '#1e88e5', style: 'dashed', label: 'Deploying v2.4.0' }
          : { color: '#8e24aa', label: 'Maintenance window until 18:00' },
    };
  },
};

export const appModuleCatalogGraphOverlays = createFrontendModule({
  pluginId: 'catalog-graph',
  extensions: [
    ApiBlueprint.make({
      params: defineParams =>
        defineParams({
          api: catalogGraphApiRef,
          deps: {},
          factory: () =>
            new DefaultCatalogGraphApi({
              nodeOverlayProviders: [
                demoArgoCdProvider,
                demoPrometheusProvider,
                demoTrafficProvider,
                demoKafkaProvider,
                demoPagerDutyProvider,
                demoRolloutProvider,
              ],
            }),
        }),
    }),
  ],
});
