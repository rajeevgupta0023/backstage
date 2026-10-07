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

import { renderInTestApp } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import { DefaultRenderNode } from './DefaultRenderNode';
import { DefaultRenderNodeOverlay } from './NodeOverlays';
import { EntityNode, NodeOverlay, NodeOverlayDisplay } from '../../lib/types';

const series = {
  label: 'p95',
  unit: 'ms',
  points: [
    { t: 1, v: 10 },
    { t: 2, v: 20 },
  ],
};

function node(
  overlays: Partial<NodeOverlay>[],
  overlayDisplay: NodeOverlayDisplay = { details: true, charts: true },
  impactedBy?: string[],
): EntityNode {
  return {
    id: 'component:default/svc',
    entity: {
      kind: 'Component',
      apiVersion: 'v1',
      metadata: { name: 'svc', namespace: 'default' },
    },
    name: 'svc',
    namespace: 'default',
    overlays: overlays.map((o, i) => ({
      providerId: `p${i}`,
      title: `Provider ${i}`,
      ...o,
    })),
    overlayDisplay,
    impactedBy,
  };
}

async function renderNode(n: EntityNode) {
  await renderInTestApp(
    <svg xmlns="http://www.w3.org/2000/svg">
      <DefaultRenderNode node={n} />
      <DefaultRenderNodeOverlay
        node={n}
        width={200}
        height={40}
        placement="top"
      />
    </svg>,
  );
}

const visible = (testId: string) => screen.queryAllByTestId(testId).length > 0;

describe('node overlay slots are independent', () => {
  it('ring only draws just the ring', async () => {
    await renderNode(node([{ ring: { color: '#8e24aa' } }]));
    expect(visible('node-ring')).toBe(true);
    expect(visible('node-overlay-card')).toBe(false);
    expect(visible('node-overlay-dots')).toBe(false);
    expect(visible('node-overlay-panel')).toBe(false);
  });

  it('card only draws just the card, even when failing', async () => {
    await renderNode(
      node([{ status: 'failing', card: { summary: '2 open' } }]),
    );
    expect(visible('node-overlay-card')).toBe(true);
    expect(screen.getByText('2 open')).toBeInTheDocument();
    expect(visible('node-ring')).toBe(false);
    expect(visible('node-overlay-panel')).toBe(false);
  });

  it('chart only draws just the floating panel', async () => {
    await renderNode(node([{ status: 'ok', chart: { series: [series] } }]));
    expect(visible('node-overlay-panel')).toBe(true);
    expect(visible('node-overlay-card')).toBe(false);
    expect(visible('node-overlay-dots')).toBe(false);
    expect(visible('node-ring')).toBe(false);
  });

  it('switching details off shows status dots instead of the card', async () => {
    await renderNode(
      node([{ card: { summary: 'Synced' } }], { details: false, charts: true }),
    );
    expect(visible('node-overlay-dots')).toBe(true);
    expect(visible('node-overlay-card')).toBe(false);
  });

  it('switching charts off hides the panel', async () => {
    await renderNode(
      node([{ chart: { series: [series] } }], { details: true, charts: false }),
    );
    expect(visible('node-overlay-panel')).toBe(false);
  });

  it('keeps the ring when details and charts are switched off', async () => {
    await renderNode(
      node(
        [{ card: { summary: 'x' }, chart: { series: [series] } }],
        { details: false, charts: false },
        ['resource:default/db'],
      ),
    );
    expect(visible('node-ring')).toBe(true);
    expect(visible('node-overlay-panel')).toBe(false);
    expect(visible('node-overlay-card')).toBe(false);
  });
});
