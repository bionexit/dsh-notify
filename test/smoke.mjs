/**
 * Headless smoke test for the attention-alert Client half: loads client.js in a
 * VM sandbox with stubbed Cordis services, drives every trigger path, and runs
 * one render pass over each component. Not a browser/visual test.
 *
 * Run: node attention-alert/test/smoke.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert';

const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8');

function store(initial) {
  let value = initial;
  const listeners = new Set();
  return {
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      value = next;
      for (const listener of [...listeners]) listener();
    },
    fire() {
      for (const listener of [...listeners]) listener();
    },
  };
}

const sounds = { oscillators: 0, buffers: 0 };
class FakeAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = {};
  }
  createOscillator() {
    sounds.oscillators += 1;
    return { type: '', frequency: { setValueAtTime() {} }, connect() {}, start() {}, stop() {} };
  }
  createGain() {
    return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 1 }, connect() {} };
  }
  createBufferSource() {
    sounds.buffers += 1;
    return { buffer: null, connect() {}, start() {} };
  }
  decodeAudioData() {
    return Promise.resolve({ duration: 1 });
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  Promise,
  Map,
  Set,
  Symbol,
  Object,
  Array,
  JSON,
  String,
  Number,
  Boolean,
  Math,
  Date,
  Error,
  URL: { createObjectURL: () => 'blob:stub', revokeObjectURL: () => {} },
  fetch: () => Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
  localStorage: {
    values: new Map(),
    getItem(key) {
      return this.values.has(key) ? this.values.get(key) : null;
    },
    setItem(key, value) {
      this.values.set(key, value);
    },
  },
  document: { addEventListener() {}, removeEventListener() {} },
  AudioContext: FakeAudioContext,
  __registrations: [],
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.__ModuleLoader__ = {
  load(definition) {
    sandbox.__definition = definition;
  },
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'client.js' });

const definition = sandbox.__definition;
assert.ok(definition, 'module loader captured a definition');
assert.equal(definition.id, '@local/attention-alert');
assert.ok(typeof definition.factory === 'function');

const React = {
  Fragment: Symbol('Fragment'),
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children };
  },
  useState: (initial) => [initial, () => {}],
  useRef: (value) => ({ current: value }),
};
const plugin = definition.factory((name) => {
  if (name === 'react') return React;
  throw new Error('unexpected require: ' + name);
});
assert.ok(Array.isArray(plugin.inject));
assert.ok(typeof plugin.apply === 'function');

// ---- stubs ---------------------------------------------------------------
const dictionaries = new Map();
const registrations = [];
const sessionId = 'session-1';
const status = store(new Map());
const list = store({
  ids: [sessionId],
  byId: { [sessionId]: { title: 'Test conversation', retainedBy: { mainView: 1 } } },
  phase: 'ready',
});
const feed = store({ entries: [], hasMore: false, revision: 0, change: { kind: 'replace', entries: [] } });
const retainInfo = store({ referenceCount: 1, retainedBy: { mainView: 1 } });

const ctx = {
  effect(run) {
    const dispose = run();
    return () => {
      if (typeof dispose === 'function') dispose();
    };
  },
  locale: {
    register(ns, dicts) {
      dictionaries.set(ns, dicts);
      return () => {};
    },
    bind(ns) {
      return (key, ...args) => {
        const dicts = dictionaries.get(ns) ?? {};
        const dict = dicts.en ?? {};
        const text = dict[key];
        assert.ok(typeof text === 'string', `missing en copy for ${key}`);
        return args.length === 0 ? text : text;
      };
    },
  },
  slots: {
    inject(name, run) {
      const dispose = run();
      registrations.push({ name, dispose });
      return () => {};
    },
    register(options, component) {
      registrations.push({ name: options.name, options, component });
      return () => {};
    },
  },
  sessions: {
    list,
    retainInfo: () => retainInfo,
    binding: () => ({ sessionId, session: {}, eventSource: feed, ctx: {} }),
  },
  uiSession: { sessionStatus: status },
  get(name) {
    return name === 'uiWorkspace' ? workspaceUi : undefined;
  },
};
const opened = [];
const workspaceUi = {
  openSession(id) {
    opened.push(id);
  },
};

plugin.apply(ctx);

// Required languages and every key present in both.
assert.deepEqual([...dictionaries.keys()], ['attentionAlert']);
assert.ok(dictionaries.get('attentionAlert').zh, 'zh dictionary registered');
assert.ok(dictionaries.get('attentionAlert').en, 'en dictionary registered');
const zhKeys = Object.keys(dictionaries.get('attentionAlert').zh).sort();
const enKeys = Object.keys(dictionaries.get('attentionAlert').en).sort();
assert.deepEqual(zhKeys, enKeys, 'zh and en dictionaries declare the same keys');

// ---- registrations -------------------------------------------------------
const byName = (name) => registrations.filter((entry) => entry.name === name);
const settings = byName('settings.section').filter((entry) => entry.options);
const overlay = byName('shell.overlay').filter((entry) => entry.options);
const frame = byName('conversation.hero.frame').filter((entry) => entry.options);
assert.equal(settings.length, 1, 'one settings section');
assert.equal(settings[0].options.id, 'attention-alert');
assert.equal(typeof settings[0].options.label, 'function');
assert.equal(overlay.length, 1, 'one overlay entry');
assert.equal(overlay[0].options.id, 'attention-alert-toast');
assert.equal(frame.length, 1, 'one conversation frame layer');
assert.equal(frame[0].options.id, 'attention-alert-flash', 'hoc layer carries its required id');
const sidebarRows = registrations.filter((entry) => entry.name === 'sidebar.session.row.trailing' && entry.options);
assert.equal(sidebarRows.length, 1, 'one sidebar row marker');
assert.equal(sidebarRows[0].options.id, 'attention-alert-row');

const settingsFace = () => settings[0].options.inject();
const overlayFace = () => overlay[0].options.inject();
const frameFace = () => frame[0].options.inject();
assert.equal(typeof settingsFace().update, 'function');
assert.equal(typeof overlayFace().dismiss, 'function');

const attention = overlayFace().hooks.attention;
assert.equal(attention, frameFace().hooks.attention, 'toast and frame share one store');
const config = settingsFace().hooks.config;
const attentionOf = () => attention.getSnapshot();
assert.equal(attentionOf().alert, null);
assert.equal(attentionOf().flash, false);
assert.equal(config.getSnapshot().enabled, true);
assert.equal(config.getSnapshot().onCompleted, false);

// ---- 1. pending interaction ---------------------------------------------
const interaction = {
  kind: 'approval',
  key: 'approval-1',
  sessionId,
  toolName: 'bash',
};
const pending = new Map([[sessionId, { running: true, pendingInteraction: interaction, completionUnread: false }]]);
status.set(pending);

let state = attentionOf();
assert.ok(state.alert, 'pending interaction raised an alert');
assert.equal(state.alert.kind, 'interaction');
assert.equal(state.alert.title, 'Your confirmation is needed');
assert.equal(state.alert.detail, 'Tool call: bash');
assert.equal(state.flash, true, 'flash followed the alert');
assert.equal(state.sidebar, true, 'the sidebar row is highlighted too');
assert.equal(state.sessionId, sessionId, 'the highlight names its session');
assert.ok(sounds.oscillators > 0, 'chime oscillators were scheduled');

// The same interaction republished does not re-alert.
const beforeSeq = state.alert.id;
status.set(new Map([[sessionId, { running: true, pendingInteraction: interaction, completionUnread: false }]]));
assert.equal(attentionOf().alert.id, beforeSeq, 'same interaction does not alert twice');

// Dismiss clears both channels.
overlayFace().dismiss();
state = attentionOf();
assert.equal(state.alert, null);
assert.equal(state.flash, false);
assert.equal(settingsFace().preview(), true, 'sound preview reports audio started');

// ---- 1b. a background session's request does not flash this reader -------
const backgroundId = 'session-2';
status.set(new Map([[
  backgroundId,
  { running: true, pendingInteraction: { kind: 'question', key: 'question-1', sessionId: backgroundId }, completionUnread: false },
]]));
state = attentionOf();
assert.ok(state.alert, 'background interaction still raises a notice');
assert.equal(state.alert.title, 'Your answer is needed');
assert.equal(state.flash, false, 'a background interaction does not flash the visible conversation');
assert.equal(state.sidebar, true, 'a background interaction still highlights its own sidebar row');
assert.equal(state.sessionId, backgroundId);
overlayFace().dismiss();

// ---- 1c. two at once: one alert names the others ------------------------
status.set(new Map());
status.set(new Map([
  [sessionId, { running: true, pendingInteraction: { kind: 'approval', key: 'approval-2', sessionId, toolName: 'read' }, completionUnread: false }],
  [backgroundId, { running: true, pendingInteraction: { kind: 'question', key: 'question-2', sessionId: backgroundId }, completionUnread: false }],
]));
state = attentionOf();
assert.equal(state.alert.title, 'Your confirmation is needed');
assert.equal(state.alert.detail, 'Tool call: read · 1 more waiting for you');
assert.equal(state.flash, true, 'the visible session keeps the flash');
overlayFace().dismiss();
status.set(new Map());

// ---- 2. interrupted turn -------------------------------------------------
feed.set({
  entries: [],
  hasMore: false,
  revision: 1,
  change: {
    kind: 'append',
    entries: [{
      type: 'event',
      event: { type: 'turn/end', seq: 2, time: 0, data: { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } } },
    }],
  },
});
state = attentionOf();
assert.ok(state.alert, 'aborted turn raised an alert');
assert.equal(state.alert.kind, 'interrupted');
assert.equal(state.alert.title, 'The conversation was interrupted');
assert.equal(state.alert.detail, 'The turn was stopped');

// ---- 3. completed turn is off by default --------------------------------
overlayFace().dismiss();
feed.set({
  entries: [],
  hasMore: false,
  revision: 2,
  change: {
    kind: 'append',
    entries: [{ type: 'event', event: { type: 'turn/end', seq: 3, time: 0, data: { turn: 2, reason: { kind: 'completed' } } } }],
  },
});
assert.equal(attentionOf().alert, null, 'completed turn stays silent by default');

// Opt in through the settings face.
settingsFace().update({ onCompleted: true });
assert.equal(config.getSnapshot().onCompleted, true);
assert.equal(JSON.parse(sandbox.localStorage.getItem('attention-alert.v1')).onCompleted, true, 'setting persisted');
feed.set({
  entries: [],
  hasMore: false,
  revision: 3,
  change: {
    kind: 'append',
    entries: [{ type: 'event', event: { type: 'turn/end', seq: 4, time: 0, data: { turn: 3, reason: { kind: 'completed' } } } }],
  },
});
state = attentionOf();
assert.ok(state.alert, 'opt-in completion raised an alert');
assert.equal(state.alert.kind, 'completed');
assert.equal(state.alert.title, 'The reply is ready');

// ---- 4. errors and master switch ---------------------------------------
overlayFace().dismiss();
feed.set({
  entries: [],
  hasMore: false,
  revision: 4,
  change: {
    kind: 'append',
    entries: [{
      type: 'event',
      event: { type: 'turn/end', seq: 5, time: 0, data: { turn: 4, reason: { kind: 'error', error: { message: 'upstream exploded' } } } },
    }],
  },
});
assert.equal(attentionOf().alert.title, 'The conversation failed');
assert.equal(attentionOf().alert.detail, 'upstream exploded');

overlayFace().dismiss();
settingsFace().update({ enabled: false });
feed.set({
  entries: [],
  hasMore: false,
  revision: 5,
  change: {
    kind: 'append',
    entries: [{
      type: 'event',
      event: { type: 'turn/end', seq: 6, time: 0, data: { turn: 5, reason: { kind: 'aborted', reason: { kind: 'user' } } } },
    }],
  },
});
assert.equal(attentionOf().alert, null, 'disabled master switch silences alerts');

// ---- 5. teardown cancel stays silent -----------------------------------
settingsFace().update({ enabled: true });
feed.set({
  entries: [],
  hasMore: false,
  revision: 6,
  change: {
    kind: 'append',
    entries: [{
      type: 'event',
      event: { type: 'turn/end', seq: 7, time: 0, data: { turn: 6, reason: { kind: 'aborted', reason: { kind: 'disposed' } } } },
    }],
  },
});
assert.equal(attentionOf().alert, null, 'teardown cancel stays silent');

// ---- 6. full alert preview (works even with the master switch off) -------
settingsFace().update({ enabled: false });
settingsFace().showPreview();
state = attentionOf();
assert.ok(state.alert, 'preview shows an alert while disabled');
assert.equal(state.alert.title, 'Alert preview');
assert.equal(state.flash, true, 'preview flashes');
overlayFace().dismiss();
assert.equal(attentionOf().alert, null);
settingsFace().update({ enabled: true });

// ---- 7. one render pass over every component -----------------------------
// A tiny renderer: function components run with the injected props, host
// elements become plain objects. Hooks are single-pass stubs (no updates).
function renderTree(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return null;
  if (typeof node === 'string' || typeof node === 'number') return node;
  if (Array.isArray(node)) return node.map(renderTree);
  const { type, props, children } = node;
  if (typeof type === 'function') {
    const merged = { ...props };
    if (children !== undefined && children.length > 0) merged.children = children.length === 1 ? children[0] : children;
    return renderTree(type(merged));
  }
  return { tag: type, props: props ?? {}, children: (children ?? []).map(renderTree) };
}
const hookOf = (source) => (selector) => (typeof selector === 'function' ? selector(source.getSnapshot()) : source.getSnapshot());
const dict = dictionaries.get('attentionAlert').en;
const t = (key) => dict[key];
const flatten = (tree) => {
  if (tree === null || tree === undefined) return '';
  if (typeof tree === 'string') return tree;
  if (Array.isArray(tree)) return tree.map(flatten).join(' ');
  return flatten(tree.children);
};

// Settings section renders with its full injected face.
const settingsFaceValue = settingsFace();
const settingsRender = renderTree(React.createElement(settings[0].component, {
  ...settingsFaceValue,
  hooks: undefined,
  useConfig: hookOf(config),
  t,
}));
assert.ok(settingsRender, 'settings section renders');
const settingsText = flatten(settingsRender);
for (const expected of ['Enable alerts', 'When to alert', 'Sound', 'Volume', 'Visual alerts', 'Preview an alert']) {
  assert.ok(settingsText.includes(expected), 'settings renders: ' + expected);
}

// Toast renders the live alert with its tone class and dismiss control.
status.set(new Map([[sessionId, {
  running: true,
  pendingInteraction: { kind: 'approval', key: 'render-1', sessionId, toolName: 'bash' },
  completionUnread: false,
}]]));
const toastFaceValue = overlayFace();
const toastRender = renderTree(React.createElement(overlay[0].component, {
  ...toastFaceValue,
  hooks: undefined,
  useAttention: hookOf(attention),
  t,
}));
const toastJson = JSON.stringify(toastRender);
assert.ok(toastJson.includes('aa-tone-interaction'), 'toast carries its tone');
assert.ok(toastJson.includes('Your confirmation is needed'), 'toast shows the title');
assert.ok(toastJson.includes('Tool call: bash'), 'toast shows the detail');

// Frame layer keeps the wrapped content and adds the glow only while flashing.
const frameFaceValue = frameFace();
const frameRender = renderTree(React.createElement(frame[0].component, {
  ...frameFaceValue,
  hooks: undefined,
  useAttention: hookOf(attention),
  children: React.createElement('div', { id: 'content' }),
}));
const frameJson = JSON.stringify(frameRender);
assert.ok(frameJson.includes('"id":"content"'), 'frame keeps its wrapped content');
assert.ok(frameJson.includes('"className":"aa-glow aa-tone-interaction"'), 'frame renders the glow while flashing');
overlayFace().dismiss();
const frameIdle = JSON.stringify(renderTree(React.createElement(frame[0].component, {
  ...frameFaceValue,
  hooks: undefined,
  useAttention: hookOf(attention),
  children: React.createElement('div', { id: 'content' }),
})));
assert.ok(!frameIdle.includes('"className":"aa-glow'), 'frame drops the glow once acknowledged');

// Clicking the notice reveals the waiting conversation and dismisses itself.
status.set(new Map([[sessionId, {
  running: true,
  pendingInteraction: { kind: 'approval', key: 'click-1', sessionId, toolName: 'bash' },
  completionUnread: false,
}]]));
const clickToast = renderTree(React.createElement(overlay[0].component, {
  ...overlayFace(),
  hooks: undefined,
  useAttention: hookOf(attention),
  t,
}));
const findRoleButton = (tree) => {
  if (tree === null || typeof tree !== 'object') return null;
  if (Array.isArray(tree)) {
    for (const item of tree) {
      const found = findRoleButton(item);
      if (found !== null) return found;
    }
    return null;
  }
  if (tree.props && tree.props.role === 'button' && typeof tree.props.onClick === 'function') return tree;
  const nested = findRoleButton(tree.children);
  return nested;
};
const openButton = findRoleButton(clickToast);
assert.ok(openButton, 'the notice is clickable');
openButton.props.onClick();
assert.deepEqual(opened, [sessionId], 'clicking the notice opens its session');
assert.equal(attentionOf().alert, null, 'clicking the notice dismisses it');

// A preview alert has no session, so it must not invite a jump.
settingsFace().showPreview();
const previewRender = renderTree(React.createElement(overlay[0].component, {
  ...overlayFace(),
  hooks: undefined,
  useAttention: hookOf(attention),
  t,
}));
assert.equal(findRoleButton(previewRender), null, 'a preview notice is not a navigation target');
overlayFace().dismiss();


// ---- 8. sidebar row marker ----------------------------------------------
const sidebarComponent = sidebarRows[0].component;
status.set(new Map());
status.set(new Map([[backgroundId, {
  running: true,
  pendingInteraction: { kind: 'question', key: 'sidebar-1', sessionId: backgroundId },
  completionUnread: false,
}]]));
const quietRow = renderTree(React.createElement(sidebarComponent, {
  sessionId: 'some-other-session',
  useAttention: hookOf(attention),
  t,
}));
assert.equal(quietRow, null, 'rows of other sessions stay untouched');

const markedRow = renderTree(React.createElement(sidebarComponent, {
  sessionId: backgroundId,
  useAttention: hookOf(attention),
  t,
}));
const markedJson = JSON.stringify(markedRow);
assert.ok(markedJson.includes('aa-row-dot'), 'the alerting row gets a pulsing marker');
assert.ok(markedJson.includes('aa-tone-interaction'), 'the marker carries its tone');

// The toast owns the row-scoped CSS rule while that channel is open.
const toastWithRow = renderTree(React.createElement(overlay[0].component, {
  ...overlayFace(),
  hooks: undefined,
  useAttention: hookOf(attention),
  t,
}));
const toastWithRowJson = JSON.stringify(toastWithRow);
assert.ok(toastWithRowJson.includes('data-row-key='), 'the row rule is emitted');
assert.ok(toastWithRowJson.includes('session:session-2'), 'the row rule names the alerting session');

// ---- 9. the sidebar channel obeys its own switch ------------------------
overlayFace().dismiss();
settingsFace().update({ sidebar: false });
status.set(new Map());
status.set(new Map([[sessionId, {
  running: true,
  pendingInteraction: { kind: 'approval', key: 'no-sidebar', sessionId, toolName: 'bash' },
  completionUnread: false,
}]]));
assert.equal(attentionOf().flash, true, 'the conversation flash stays independent');
assert.equal(attentionOf().sidebar, false, 'the sidebar channel obeys its switch');
overlayFace().dismiss();
settingsFace().update({ sidebar: true });

console.log('smoke: all assertions passed');
console.log('registrations:', registrations.filter((r) => r.options).map((r) => r.name).join(', '));
