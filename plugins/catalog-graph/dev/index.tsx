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
  GetEntitiesByRefsRequest,
  GetEntitiesByRefsResponse,
  GetEntitiesResponse,
  GetEntityFacetsRequest,
  GetEntityFacetsResponse,
} from '@backstage/catalog-client';
import {
  CompoundEntityRef,
  DEFAULT_NAMESPACE,
  Entity,
  RELATION_API_CONSUMED_BY,
  RELATION_API_PROVIDED_BY,
  RELATION_CONSUMES_API,
  RELATION_DEPENDENCY_OF,
  RELATION_DEPENDS_ON,
  RELATION_HAS_PART,
  RELATION_OWNED_BY,
  RELATION_OWNER_OF,
  RELATION_PART_OF,
  RELATION_PROVIDES_API,
  stringifyEntityRef,
} from '@backstage/catalog-model';
import { Content, Header, Page } from '@backstage/core-components';
import { createDevApp } from '@backstage/dev-utils';
import { CatalogEntityPage } from '@backstage/plugin-catalog';
import {
  CatalogApi,
  catalogApiRef,
  EntityProvider,
} from '@backstage/plugin-catalog-react';
import { JsonObject } from '@backstage/types';
import Grid from '@material-ui/core/Grid';
import _ from 'lodash';
import {
  CatalogGraphNodeOverlayProvider,
  CatalogGraphPage,
  catalogGraphApiRef,
  catalogGraphPlugin,
  DefaultCatalogGraphApi,
  EntityCatalogGraphCard,
  NodeOverlaySeries,
} from '../src';

type DataRelation = [string, string, string];

// Annotations that fake overlay providers use to decide if they apply
const annotations: Record<string, Record<string, string>> = {
  'component:wayback-archive': {
    'argocd/app-name': 'wayback-archive',
    'prometheus.io/rule': 'latency{app="wayback-archive"}',
  },
  'component:wayback-search': {
    'argocd/app-name': 'wayback-search',
    'prometheus.io/rule': 'latency{app="wayback-search"}',
  },
  'resource:wayback-search-db': {
    'prometheus.io/rule': 'latency{app="wayback-search-db"}',
  },
  'resource:wayback-archive-storage': {
    'prometheus.io/rule': 'latency{app="wayback-archive-storage"}',
  },
};

function randomWalk(base: number, spread: number): NodeOverlaySeries['points'] {
  let v = base;
  return Array.from({ length: 30 }, (_value, i) => {
    v = Math.max(0, v + (Math.random() - 0.5) * spread);
    return { t: Date.now() - (30 - i) * 60_000, v };
  });
}

const fakeArgoCdProvider: CatalogGraphNodeOverlayProvider = {
  id: 'argocd',
  title: 'Argo CD',
  isApplicable: entity => !!entity.metadata.annotations?.['argocd/app-name'],
  async getData(entity) {
    if (entity.metadata.name === 'wayback-search') {
      return { status: 'degraded', card: { summary: 'OutOfSync' } };
    }
    return { status: 'ok', card: { summary: 'Synced' } };
  },
};

const fakePrometheusProvider: CatalogGraphNodeOverlayProvider = {
  id: 'prometheus',
  title: 'Prometheus',
  isApplicable: entity => !!entity.metadata.annotations?.['prometheus.io/rule'],
  async getData(entity) {
    await new Promise(resolve => setTimeout(resolve, 300));
    const failing = entity.metadata.name === 'wayback-search-db';
    const p95: NodeOverlaySeries = {
      label: 'p95 latency',
      unit: 'ms',
      points: failing ? randomWalk(900, 300) : randomWalk(120, 40),
    };
    return {
      status: failing ? 'failing' : 'ok',
      card: { sparkline: p95 },
      chart: { series: [p95] },
      ring: failing ? { status: 'failing' } : undefined,
    };
  },
  Panel: ({ data }) => {
    const points = data.chart?.series?.[0]?.points ?? [];
    const max = Math.max(...points.map(p => p.v), 1);
    return (
      <svg width={320} height={100}>
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          points={points
            .map(
              (p, i) =>
                `${(i / (points.length - 1)) * 320},${100 - (p.v / max) * 95}`,
            )
            .join(' ')}
        />
      </svg>
    );
  },
};
type DataEntity = [string, string, DataRelation[], JsonObject?];

const entities = (
  [
    [
      'Domain',
      'wayback',
      [
        [RELATION_OWNED_BY, 'Group', 'team-a'],
        [RELATION_HAS_PART, 'System', 'wayback'],
      ],
    ],
    [
      'System',
      'wayback',
      [
        [RELATION_OWNED_BY, 'Group', 'team-a'],
        [RELATION_PART_OF, 'Domain', 'wayback'],
        [RELATION_HAS_PART, 'Component', 'wayback-archive'],
        [RELATION_HAS_PART, 'Component', 'wayback-search'],
        [RELATION_HAS_PART, 'API', 'wayback-api'],
      ],
    ],
    [
      'Component',
      'wayback-archive',
      [
        [RELATION_OWNED_BY, 'Group', 'team-a'],
        [RELATION_PART_OF, 'System', 'wayback'],
        [RELATION_PROVIDES_API, 'API', 'wayback-api'],
        [RELATION_DEPENDS_ON, 'Resource', 'wayback-archive-storage'],
      ],
    ],
    [
      'Resource',
      'wayback-archive-storage',
      [
        [RELATION_OWNED_BY, 'Group', 'team-a'],
        [RELATION_PART_OF, 'System', 'wayback'],
        [RELATION_DEPENDENCY_OF, 'Component', 'wayback-archive'],
      ],
      { type: 's3-bucket' },
    ],
    [
      'Component',
      'wayback-search',
      [
        [RELATION_OWNED_BY, 'Group', 'team-a'],
        [RELATION_PART_OF, 'System', 'wayback'],
        [RELATION_CONSUMES_API, 'API', 'wayback-api'],
        [RELATION_DEPENDS_ON, 'Resource', 'wayback-search-db'],
      ],
    ],
    [
      'Resource',
      'wayback-search-db',
      [
        [RELATION_OWNED_BY, 'Group', 'team-a'],
        [RELATION_PART_OF, 'System', 'wayback'],
        [RELATION_DEPENDENCY_OF, 'Component', 'wayback-search'],
      ],
      { type: 'database' },
    ],
    [
      'API',
      'wayback-api',
      [
        [RELATION_OWNED_BY, 'Group', 'team-a'],
        [RELATION_PART_OF, 'System', 'wayback'],
        [RELATION_API_PROVIDED_BY, 'Component', 'wayback-archive'],
        [RELATION_API_CONSUMED_BY, 'Component', 'wayback-search'],
      ],
    ],
    [
      'Group',
      'team-a',
      [
        [RELATION_OWNER_OF, 'Component', 'wayback-archive'],
        [RELATION_OWNER_OF, 'Resource', 'wayback-archive-storage'],
        [RELATION_OWNER_OF, 'Component', 'wayback-search'],
        [RELATION_OWNER_OF, 'Resource', 'wayback-search-db'],
        [RELATION_OWNER_OF, 'API', 'wayback-api'],
        [RELATION_OWNER_OF, 'Domain', 'wayback'],
        [RELATION_OWNER_OF, 'System', 'wayback'],
      ],
    ],
  ] as DataEntity[]
).reduce((o, d) => {
  const [kind, name, relations, spec] = d;

  const entity: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind,
    metadata: {
      name,
      annotations: annotations[`${kind}:${name}`.toLocaleLowerCase('en-US')],
    },
    spec: spec,
    relations: relations.map(([type, k, n]) => ({
      target: { kind: k, name: n, namespace: DEFAULT_NAMESPACE },
      targetRef: stringifyEntityRef({
        kind: k,
        namespace: DEFAULT_NAMESPACE,
        name: n,
      }),
      type,
    })),
  };
  const entityRef = stringifyEntityRef(entity);
  o[entityRef] = entity;
  return o;
}, {} as { [entityRef: string]: Entity });

createDevApp()
  .registerPlugin(catalogGraphPlugin)
  .registerApi({
    api: catalogGraphApiRef,
    deps: {},
    factory: () =>
      new DefaultCatalogGraphApi({
        nodeOverlayProviders: [fakeArgoCdProvider, fakePrometheusProvider],
      }),
  })
  .registerApi({
    api: catalogApiRef,
    deps: {},
    factory() {
      return {
        async getEntityByRef(
          ref: string | CompoundEntityRef,
        ): Promise<Entity | undefined> {
          return entities[
            typeof ref === 'string' ? ref : stringifyEntityRef(ref)
          ];
        },
        async getEntitiesByRefs(
          request: GetEntitiesByRefsRequest,
        ): Promise<GetEntitiesByRefsResponse> {
          return { items: request.entityRefs.map(ref => entities[ref]) };
        },
        async getEntities(): Promise<GetEntitiesResponse> {
          return { items: Object.values(entities) };
        },
        async getEntityFacets(
          request: GetEntityFacetsRequest,
        ): Promise<GetEntityFacetsResponse> {
          if (request.facets.includes('kind')) {
            const kinds: [string, number][] = _.chain(entities)
              .map(e => e.kind)
              .groupBy(k => k)
              .mapValues(v => v.length)
              .toPairs()
              .value();
            const kindFacet = kinds.map(([kind, count]) => ({
              value: kind,
              count: count,
            }));

            return { facets: { kind: kindFacet } };
          }
          return { facets: {} };
        },
      } as Partial<CatalogApi> as unknown as CatalogApi;
    },
  })
  .addPage({
    title: 'Graph Card',
    element: (
      <Page themeId="home">
        <Header title="Graph Card" />
        <Content>
          <Grid container>
            <Grid item xs={12}>
              <EntityProvider
                entity={entities['component:default/wayback-archive']}
              >
                <EntityCatalogGraphCard />
              </EntityProvider>
            </Grid>
          </Grid>
        </Content>
      </Page>
    ),
  })
  .addPage({
    path: '/catalog-graph',
    element: <CatalogGraphPage />,
  })
  .addPage({
    path: '/catalog/:kind/:namespace/:name',
    element: <CatalogEntityPage />,
    title: 'MockComponent',
  })
  .render();
