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

import { NodeOverlay, NodeOverlayStatus } from '../types';

/**
 * The ring to draw around a node. `color` is an explicit CSS color, otherwise
 * the renderer derives a theme color from `status`.
 */
export type ResolvedRing = {
  color?: string;
  status: NodeOverlayStatus | 'impacted';
  dashed: boolean;
  label?: string;
};

const STATUS_RANK: Record<NodeOverlayStatus, number> = {
  unknown: 0,
  ok: 1,
  degraded: 2,
  failing: 3,
};

/**
 * Decides the ring around a node. Rings are never derived from other data,
 * only from:
 *
 * 1. A `ring` set by a provider, highest `priority` first, then the most
 *    severe status
 * 2. Impact of a failing dependency (from the providers' `status`), drawn
 *    dashed
 */
export function resolveRing(
  overlays: NodeOverlay[] | undefined,
  impactedBy: string[] | undefined,
): ResolvedRing | undefined {
  const ring = (overlays ?? [])
    .filter(o => o.ring)
    .map(o => o.ring!)
    .sort(
      (a, b) =>
        (b.priority ?? 0) - (a.priority ?? 0) ||
        STATUS_RANK[b.status ?? 'unknown'] - STATUS_RANK[a.status ?? 'unknown'],
    )[0];
  if (ring) {
    return {
      color: ring.color,
      status: ring.status ?? 'unknown',
      dashed: ring.style === 'dashed',
      label: ring.label,
    };
  }

  if (impactedBy?.length) {
    return {
      status: 'impacted',
      dashed: true,
      label: `Impacted by: ${impactedBy.join(', ')}`,
    };
  }
  return undefined;
}
