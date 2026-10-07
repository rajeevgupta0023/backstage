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

import {
  Entity,
  RELATION_API_PROVIDED_BY,
  RELATION_CONSUMES_API,
  RELATION_DEPENDS_ON,
  RELATION_HAS_PART,
} from '@backstage/catalog-model';

/**
 * Relations where the source entity is affected when the target fails, e.g.
 * a component that `dependsOn` a failing database.
 */
export const IMPACT_RELATIONS = [
  RELATION_DEPENDS_ON,
  RELATION_CONSUMES_API,
  RELATION_API_PROVIDED_BY,
  RELATION_HAS_PART,
];

/**
 * Finds all entities that transitively depend on a failing entity.
 *
 * @returns a map from impacted entity ref to the failing entity refs that
 * cause the impact. Failing entities themselves are not included.
 */
export function computeImpact(
  entities: Record<string, Entity>,
  failingRefs: Iterable<string>,
  impactRelations: string[] = IMPACT_RELATIONS,
): Map<string, string[]> {
  const dependents = new Map<string, string[]>();
  for (const [ref, entity] of Object.entries(entities)) {
    for (const relation of entity.relations ?? []) {
      if (
        impactRelations.includes(relation.type) &&
        entities[relation.targetRef]
      ) {
        const list = dependents.get(relation.targetRef) ?? [];
        list.push(ref);
        dependents.set(relation.targetRef, list);
      }
    }
  }

  const failing = new Set(failingRefs);
  const impact = new Map<string, string[]>();
  for (const root of failing) {
    const visited = new Set([root]);
    const queue = [root];
    while (queue.length) {
      const current = queue.shift()!;
      for (const dependent of dependents.get(current) ?? []) {
        if (visited.has(dependent)) {
          continue;
        }
        visited.add(dependent);
        queue.push(dependent);
        if (!failing.has(dependent)) {
          impact.set(dependent, [...(impact.get(dependent) ?? []), root]);
        }
      }
    }
  }
  return impact;
}
