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
import { useMemo } from 'react';
import useAsync from 'react-use/esm/useAsync';
import { computeImpact } from '../../lib/graph';
import {
  CatalogGraphNodeOverlayProvider,
  EntityNode,
  NodeOverlay,
  NodeOverlayDisplay,
} from '../../lib/types';

/**
 * Fetches overlay data for the given nodes from all applicable providers and
 * returns the nodes decorated with `overlays` and `impactedBy`.
 */
export function useNodeOverlays(
  nodes: EntityNode[] | undefined,
  providers: CatalogGraphNodeOverlayProvider[],
  overlayDisplay?: NodeOverlayDisplay,
): EntityNode[] | undefined {
  // Only refetch when the set of entities changes, not on every re-layout
  const nodeKey = nodes?.map(n => n.id).join(',');
  const entities = useMemo(
    () =>
      Object.fromEntries(
        (nodes ?? []).map(n => [n.id, n.entity] as [string, Entity]),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodeKey],
  );

  const { value: overlays } = useAsync(async () => {
    const result = new Map<string, NodeOverlay[]>();
    if (!providers.length) {
      return result;
    }
    await Promise.all(
      Object.entries(entities).map(async ([ref, entity]) => {
        const entityOverlays = await Promise.all(
          providers
            .filter(provider => provider.isApplicable(entity))
            .map(async (provider): Promise<NodeOverlay | undefined> => {
              try {
                const data = await provider.getData(entity);
                return data
                  ? {
                      ...data,
                      providerId: provider.id,
                      title: provider.title,
                      Panel: provider.Panel,
                    }
                  : undefined;
              } catch {
                // A broken provider must never break the graph itself
                return undefined;
              }
            }),
        );
        const present = entityOverlays.filter(
          (o): o is NodeOverlay => o !== undefined,
        );
        if (present.length) {
          result.set(ref, present);
        }
      }),
    );
    return result;
  }, [entities, providers]);

  return useMemo(() => {
    if (!nodes || !overlays?.size) {
      return nodes;
    }
    const failingRefs = [...overlays.entries()]
      .filter(([, list]) => list.some(o => o.status === 'failing'))
      .map(([ref]) => ref);
    const impact = computeImpact(entities, failingRefs);

    return nodes.map(node => {
      const nodeOverlays = overlays.get(node.id);
      const impactedBy = impact.get(node.id);
      if (!nodeOverlays && !impactedBy) {
        return node;
      }
      return { ...node, overlays: nodeOverlays, overlayDisplay, impactedBy };
    });
  }, [nodes, overlays, entities, overlayDisplay]);
}
