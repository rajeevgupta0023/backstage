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

import { NodeOverlay } from '../types';
import { resolveRing } from './resolve-ring';

const overlay = (o: Partial<NodeOverlay>): NodeOverlay => ({
  providerId: 'p',
  title: 'P',
  ...o,
});

describe('resolveRing', () => {
  it('returns nothing without a ring or impact', () => {
    expect(resolveRing(undefined, [])).toBeUndefined();
    expect(resolveRing([overlay({ status: 'ok' })], undefined)).toBeUndefined();
  });

  it('does not derive a ring from status', () => {
    expect(
      resolveRing([overlay({ status: 'failing' })], undefined),
    ).toBeUndefined();
  });

  it('draws a ring set by a provider', () => {
    expect(
      resolveRing([overlay({ ring: { status: 'failing' } })], undefined),
    ).toEqual({ status: 'failing', dashed: false });
  });

  it('marks impacted nodes with a dashed ring', () => {
    expect(resolveRing([overlay({ status: 'ok' })], ['resource:db'])).toEqual({
      status: 'impacted',
      dashed: true,
      label: 'Impacted by: resource:db',
    });
  });

  it('prefers a ring set by a provider over impact', () => {
    expect(
      resolveRing(
        [
          overlay({ status: 'failing' }),
          overlay({ ring: { color: '#7e57c2', label: 'Maintenance' } }),
        ],
        ['resource:db'],
      ),
    ).toEqual({
      color: '#7e57c2',
      status: 'unknown',
      dashed: false,
      label: 'Maintenance',
    });
  });

  it('picks the explicit ring with the highest priority', () => {
    const ring = resolveRing(
      [
        overlay({ ring: { status: 'failing', label: 'a' } }),
        overlay({ ring: { status: 'ok', label: 'b', priority: 10 } }),
      ],
      undefined,
    );
    expect(ring?.label).toBe('b');
  });
});
