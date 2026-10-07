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
  RELATION_DEPENDS_ON,
  RELATION_HAS_PART,
  RELATION_OWNED_BY,
} from '@backstage/catalog-model';
import { computeImpact } from './compute-impact';

function entity(ref: string, relations: [string, string][] = []): Entity {
  const [kind, name] = ref.split(':');
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind,
    metadata: { name },
    relations: relations.map(([type, targetRef]) => ({ type, targetRef })),
  };
}

describe('computeImpact', () => {
  const entities = {
    'resource:db': entity('resource:db'),
    'component:api': entity('component:api', [
      [RELATION_DEPENDS_ON, 'resource:db'],
      [RELATION_OWNED_BY, 'group:team'],
    ]),
    'component:web': entity('component:web', [
      [RELATION_DEPENDS_ON, 'component:api'],
    ]),
    'system:shop': entity('system:shop', [
      [RELATION_HAS_PART, 'component:web'],
    ]),
    'group:team': entity('group:team'),
    'component:unrelated': entity('component:unrelated'),
  };

  it('propagates failures transitively to dependents', () => {
    const impact = computeImpact(entities, ['resource:db']);
    expect(Object.fromEntries(impact)).toEqual({
      'component:api': ['resource:db'],
      'component:web': ['resource:db'],
      'system:shop': ['resource:db'],
    });
  });

  it('ignores non-impact relations', () => {
    const impact = computeImpact(entities, ['group:team']);
    expect(impact.size).toBe(0);
  });

  it('does not mark failing entities as impacted and collects all causes', () => {
    const impact = computeImpact(entities, ['resource:db', 'component:api']);
    expect(impact.has('component:api')).toBe(false);
    expect(impact.get('component:web')).toEqual([
      'resource:db',
      'component:api',
    ]);
  });

  it('handles cycles', () => {
    const cyclic = {
      'component:a': entity('component:a', [
        [RELATION_DEPENDS_ON, 'component:b'],
      ]),
      'component:b': entity('component:b', [
        [RELATION_DEPENDS_ON, 'component:a'],
      ]),
    };
    expect(Object.fromEntries(computeImpact(cyclic, ['component:a']))).toEqual({
      'component:b': ['component:a'],
    });
  });
});
