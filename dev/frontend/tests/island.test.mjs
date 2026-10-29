import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScript } from './loadTypeScript.mjs';

const { INITIAL_ISLAND, islandReducer: reduce, islandView: view } = loadTypeScript('components/dynamic-island/state.ts');
const { usableBounds, dockPosition, expandedPosition, nearestDock, isPositionDrag } = loadTypeScript('components/dynamic-island/geometry.ts');
const activity = { id: 'download-a', status: 'active', label: 'Downloading', progress: null };
const context = (value, playing = false) => ({ type: 'context', playing, requests: false, activity: value });

test('enqueue closes search and holds confirmation until the owned dismissal', () => {
  let state = reduce(INITIAL_ISLAND, { type: 'open' });
  state = reduce(state, { type: 'submitted', id: 'enqueue-a' });
  assert.equal(view(state), 'extended');
  state = reduce(state, { type: 'dismiss', id: 'enqueue-a' });
  assert.equal(view(state), 'pill');
  state = reduce(state, context(null, true));
  assert.equal(view(state), 'extended');
});

test('new preparation invalidates an old completion dismissal', () => {
  let state = reduce(INITIAL_ISLAND, { type: 'submitted', id: 'old' });
  state = reduce(state, context(activity));
  state = reduce(state, { type: 'dismiss', id: 'old' });
  assert.equal(view(state), 'extended');
  assert.equal(state.activity.id, 'download-a');
  state = reduce(state, context(null));
  assert.equal(view(state), 'extended');
  state = reduce(state, { type: 'dismiss', id: state.notice.id });
  assert.equal(view(state), 'pill');
});

test('unrelated activity, failures and join requests preserve deliberate expansion', () => {
  let state = reduce(INITIAL_ISLAND, { type: 'open' });
  for (const status of ['active', 'complete', 'failed', 'cancelled']) {
    state = reduce(state, { ...context({ ...activity, status }), requests: true });
    assert.equal(view(state), 'expanded');
  }
  state = reduce(state, { type: 'dismiss', id: 'old' });
  assert.equal(view(state), 'expanded');
});

test('failure and cancellation settle without retaining a spinner', () => {
  for (const status of ['failed', 'cancelled']) {
    let state = reduce(INITIAL_ISLAND, context(activity));
    state = reduce(state, context({ ...activity, status }));
    assert.equal(view(state), 'extended');
    state = reduce(state, { type: 'dismiss', id: state.notice.id });
    assert.equal(view(state), 'pill');
  }
});

test('progress changes do not replace the completion timer identity; reset clears interaction', () => {
  let state = reduce(INITIAL_ISLAND, context({ ...activity, status: 'complete', progress: 100 }));
  const notice = state.notice;
  state = reduce(state, context({ ...activity, status: 'complete', progress: 100 }));
  assert.equal(state.notice, notice);
  state = reduce(state, { type: 'open' });
  assert.deepEqual(reduce(state, { type: 'reset' }), INITIAL_ISLAND);
});

function within(point, size, bounds) {
  assert.ok(point.x >= bounds.x - 0.001 && point.y >= bounds.y - 0.001);
  assert.ok(point.x + size.width <= bounds.x + bounds.width + 0.001);
  assert.ok(point.y + size.height <= bounds.y + bounds.height + 0.001);
}

test('every edge keeps the entire Island and prefetch indicator inside phone and landscape bounds', () => {
  for (const [width, height] of [[320, 568], [375, 667], [390, 844], [430, 932], [667, 320]]) {
    const bounds = usableBounds({ x: 0, y: 0, width, height }, { top: 44, right: 0, bottom: 34, left: 0 });
    for (const reserve of [0, 48]) for (const mainWidth of [86, 120, Math.min(360, bounds.width - reserve)]) {
      const size = { width: mainWidth + reserve, height: 62 };
      for (const edge of ['top', 'right', 'bottom', 'left']) for (const offset of [0, 0.15, 0.5, 1]) {
        const dock = { edge, offset };
        const point = dockPosition(dock, size, bounds);
        within(point, size, bounds);
        const snapped = nearestDock(point, size, bounds, edge);
        assert.equal(snapped.edge, edge);
        within(dockPosition(snapped, size, bounds), size, bounds);
      }
    }
  }
});

test('ten expansion cycles preserve a collapsed anchor and keyboard/rotation only reclamp it', () => {
  const bounds = usableBounds({ x: 0, y: 0, width: 390, height: 844 }, { top: 44, right: 0, bottom: 34, left: 0 });
  const collapsed = { width: 168, height: 44 };
  const expanded = { width: bounds.width, height: 580 };
  for (const edge of ['top', 'right', 'bottom', 'left']) {
    const dock = { edge, offset: 0.63 };
    const saved = dockPosition(dock, collapsed, bounds);
    for (let cycle = 0; cycle < 10; cycle++) {
      within(expandedPosition(saved, collapsed, expanded, bounds), expanded, bounds);
      assert.deepEqual(dockPosition(dock, collapsed, bounds), saved);
    }
    const keyboard = usableBounds({ x: 5, y: 120, width: 380, height: 260 }, { top: 0, right: 0, bottom: 0, left: 0 });
    within(dockPosition(dock, collapsed, keyboard), collapsed, keyboard);
    assert.deepEqual(dockPosition(dock, collapsed, bounds), saved);
  }
});

test('center/corner releases have a stable tie-break and a drag requires meaningful movement', () => {
  const bounds = { x: 0, y: 0, width: 400, height: 400 };
  const size = { width: 100, height: 100 };
  assert.equal(nearestDock({ x: 150, y: 150 }, size, bounds, 'bottom').edge, 'bottom');
  assert.equal(nearestDock({ x: -50, y: -50 }, size, bounds).edge, 'top');
  assert.equal(nearestDock({ x: 900, y: 100 }, size, bounds).edge, 'right');
  assert.ok(!isPositionDrag({ x: 0, y: 0 }, { x: 3, y: 4 }));
  assert.ok(isPositionDrag({ x: 0, y: 0 }, { x: 8, y: 0 }));
});
