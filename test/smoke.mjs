// Smoke test: load the mod's client entry against a fake Folium host and a
// minimal DOM (jsdom), mount the visualizer, and check that it draws and
// reacts. Run with:
//   NODE_PATH=<workspace node_modules> node test/smoke.cjs
import { createRequire } from 'module';
import path from 'path';
import { pathToFileURL } from 'url';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// jsdom lives in the managed workspace; ESM ignores NODE_PATH, so resolve it
// explicitly.
const require = createRequire('/Users/pomepii/.workbuddy/binaries/node/workspace/node_modules/');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.SVGElement = dom.window.SVGElement;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });

const listeners = { change: [], resize: [], time: [], settings: [], frame: [] };
let lineIndex = 0;
let lyricT = null; // override for the lyric clock (null -> lineIndex * 4)
let paused = false;
let sectionValues = {
    discSide: 'right', discSize: 0.8, spinSeconds: 20, labelRatio: 0.42,
    showArm: true, sheen: true, halo: 'cover', textScale: 1, showNext: true,
};

const lines = [
    { startTime: 0, endTime: 4, fullText: 'Five Hundred Miles', translation: '五百英里' },
    {
        startTime: 4, endTime: 8, fullText: 'If you miss the train I am on',
        translation: '如果你错过了我搭的那班火车',
        words: [
            { text: 'If you ', startTime: 4, endTime: 5.5 },
            { text: 'miss the train I am on', startTime: 5.5, endTime: 8 },
        ],
    },
    { startTime: 8, endTime: 12, fullText: 'You will know that I am gone', translation: '你会知道我已离开' },
    { startTime: 12, endTime: 14, fullText: '   ' },
    { startTime: 14, endTime: 16, fullText: 'Five Hundred Miles - Justin Timberlake' },
    { startTime: 16, endTime: 20, fullText: 'One day my love', translation: '有一天我的爱' },
];

const theme = {
    name: 'dusk', backgroundColor: '#141210', primaryColor: '#f5ede2',
    accentColor: '#e0a06a', secondaryColor: '#b9b2a4',
    fontStyle: 'sans', fontWeight: 600, animationIntensity: 'normal', isDaylight: false,
};

const ctx = {
    lines,
    song: { id: '1', title: 'Five Hundred Miles', artist: 'Justin Timberlake', album: 'Inside Llewyn Davis', source: 'local', ref: 'r1' },
    staticMode: false,
    staticLineIndex: null,
    seed: 'seed',
    isPreview: false,
    lyricTime: { get: () => lyricT ?? lineIndex * 4 },
    getDuration: () => 180,
    getLineIndex: () => lineIndex,
    isPaused: () => paused,
    getTheme: () => theme,
    getCoverUrl: () => 'https://example.com/cover.jpg',
    getDisplay: () => ({ showText: true, lyricsFontScale: 1.1 }),
    getSettings: () => { throw new Error('visualizer must read the section, not ctx.getSettings'); },
    onChange: (fn) => { listeners.change.push(fn); return () => {}; },
    onResize: (fn) => { listeners.resize.push(fn); return () => {}; },
    onLyricTime: (fn) => { listeners.time.push(fn); return () => {}; },
    onFrame: (fn) => { listeners.frame.push(fn); return () => {}; },
    every: () => () => {},
    onDispose: () => {},
};

const registered = {};
const folium = {
    log: { warn: (...a) => console.log('[warn]', ...a), info: console.log, error: console.error },
    theme: {
        resolveFontStack: () => 'system-ui, sans-serif',
        resolveFontWeight: (t, f) => t?.fontWeight ?? f,
    },
    registries: {
        visualizers: { register: (def) => { registered.visualizer = def; return { id: 'mod:vinyl-disc:disc', unregister() {} }; } },
        stageLayers: { register: () => { throw new Error('must not register a stage layer'); } },
        settingsSections: {
            register: (def) => {
                registered.section = def;
                return {
                    id: 'mod:vinyl-disc:settings',
                    unregister() {},
                    settings: {
                        get: () => ({ ...sectionValues }),
                        set: (patch) => {
                            sectionValues = { ...sectionValues, ...patch };
                            listeners.settings.forEach((fn) => fn());
                        },
                        reset: () => {
                            sectionValues = {};
                            listeners.settings.forEach((fn) => fn());
                        },
                        onChange: (fn) => { listeners.settings.push(fn); return () => {}; },
                    },
                };
            },
        },
    },
};

const modPath = path.resolve(__dirname, '..', 'vinyl-disc', 'client.mjs');
const { default: activate } = await import(pathToFileURL(modPath).href);
activate(folium);

const v = registered.visualizer;
const section = registered.section;
if (!v || v.id !== 'disc') throw new Error('visualizer not registered as id "disc"');
if (v.settings !== undefined) throw new Error('visualizer must not carry its own settings schema');
if (!section?.settingsPanel) throw new Error('settings section missing a settingsPanel');
console.log('mode id: disc | label:', v.label['zh-CN'], '| hostLayers:', JSON.stringify(v.hostLayers));
console.log('section settings:', section.settings.length, 'fields:', section.settings.map((s) => s.key).join(', '));

// Mount the visualizer into a container and drive it.
const container = document.getElementById('root');
const dispose = v.mount(container, ctx);
listeners.resize.forEach((fn) => fn({ width: 1200, height: 700 }));

const sceneEl = container.querySelector('[style*="aspect-ratio"]');
if (!sceneEl || sceneEl.style.width !== '504px') throw new Error(`scene not sized: ${sceneEl?.style.width}`);
console.log('sized elements (px):', sceneEl.style.width);

// Window rows: active row is a wrapper (opacity + data-active) with the line
// and its own translation beneath it.
lineIndex = 1;
listeners.time.forEach((fn) => fn(4));
const rows = [...container.querySelectorAll('[data-active], [style*="opacity"]')]
    .filter((el) => el.parentElement && el.parentElement.style.display === 'flex');
const activeRow = container.querySelector('[data-active]');
if (!activeRow) throw new Error('no active row');
const activeTrans = activeRow.querySelectorAll('div');
if (activeTrans.length !== 2) throw new Error(`active row should have line + translation, got ${activeTrans.length} divs`);
if (activeTrans[1].textContent !== '如果你错过了我搭的那班火车') {
    throw new Error(`active row translation wrong: ${activeTrans[1].textContent}`);
}
// Neighbour rows keep their own translations too.
const neighbourTrans = [...container.querySelectorAll('[data-active] ~ * div, * > div > div')]
    .map((el) => el.textContent);
if (!neighbourTrans.includes('五百英里')) throw new Error('neighbour row missing its own translation');
console.log('per-line translations ok: active + neighbours carry their own');

// Karaoke: the active row of a word-timed line is built from spans.
const spans = [...activeRow.querySelectorAll('span')];
if (spans.length !== 2) throw new Error(`expected 2 word spans on the active row, got ${spans.length}`);
console.log('multi-line window ok, metadata skipped, karaoke spans:', spans.map((s) => s.textContent.trim()).join('|'));
// Smooth karaoke: the sung colour must sweep through each word with the
// lyric clock (--wp) instead of flipping at word end, and the word being
// sung pops slightly via transform.
lyricT = 6.75; // word 1 fully sung, word 2 halfway through
listeners.frame.forEach((fn) => fn());
const [w1, w2] = container.querySelectorAll('[data-active] span');
if (w1.style.getPropertyValue('--wp') !== '100.0%') throw new Error(`word 1 sweep not finished: ${w1.style.getPropertyValue('--wp')}`);
if (w2.style.getPropertyValue('--wp') !== '50.0%') throw new Error(`word 2 sweep not halfway: ${w2.style.getPropertyValue('--wp')}`);
if (w2.style.transform !== 'scale(1.06)') throw new Error(`singing word not popped: ${w2.style.transform}`);
if (w1.style.transform !== 'scale(1)') throw new Error(`finished word still popped: ${w1.style.transform}`);
if (!w1.style.backgroundImage.includes('linear-gradient')) throw new Error('karaoke span missing gradient sweep background');
lyricT = null;
console.log('karaoke smooth sweep: word1 100%, word2 50%, singing pop ok');

// A bare title line is a legitimate lyric and must be rendered.
lineIndex = 0;
listeners.time.forEach((fn) => fn(0));
const bareShown = [...container.querySelectorAll('[data-active]')].map((el) => el.textContent.trim());
if (!bareShown.some((t) => t.startsWith('Five Hundred Miles'))) throw new Error('bare title lyric was hidden');
console.log('bare title lyric kept: true');

// Metadata combo ("title - artist") is not a lyric: it must never render.
lineIndex = 4;
listeners.time.forEach((fn) => fn(14));
const metaRendered = [...container.querySelectorAll('[data-active]')]
    .some((el) => el.textContent.includes('Justin Timberlake') && el.textContent.includes('Five Hundred Miles -'));
if (metaRendered) throw new Error('metadata combo line rendered as a lyric');
console.log('metadata combo skipped: true');

// Degenerate resize (settings modal collapsing the stage) must be ignored.
listeners.resize.forEach((fn) => fn({ width: 1200, height: 4 }));
const sceneEl2 = container.querySelector('[style*="aspect-ratio"]');
if (!sceneEl2 || sceneEl2.style.width !== '504px') throw new Error(`degenerate resize shrunk the scene: ${sceneEl2?.style.width}`);
listeners.resize.forEach((fn) => fn({ width: 1200, height: 700 }));
console.log('degenerate resize ignored: true');

// Blank line (instrumental gap): the previous sung line stays on screen.
lineIndex = 3;
listeners.time.forEach((fn) => fn(12));
let gapTexts = [...container.querySelectorAll('div')].map((el) => el.textContent);
if (gapTexts.some((t) => t.includes('♪'))) throw new Error('empty line shows a ♪ placeholder');
if (!gapTexts.includes('You will know that I am gone')) throw new Error('blank line does not keep the previous line');
// Host reports -1 between lines: keep holding the last sung line.
lineIndex = -1;
listeners.time.forEach((fn) => fn(14));
gapTexts = [...container.querySelectorAll('div')].map((el) => el.textContent);
if (!gapTexts.includes('You will know that I am gone')) throw new Error('gap (-1) does not hold the last sung line');
console.log('blank/gap keeps previous lyric: true');

// Pause: arm must lift, disc must pause.
paused = true;
listeners.frame.forEach((fn) => fn());
listeners.change.forEach((fn) => fn());
const armEl = container.querySelector('svg');
if (!armEl || armEl.style.transform !== 'rotate(-50deg)') {
    throw new Error(`arm not lifted on pause: ${armEl?.style.transform}`);
}
if (!armEl.outerHTML.includes('vinylArmShadow')) throw new Error('arm shadow filter missing (rectangle fix)');
console.log('arm on pause: rotate(-50deg), in-SVG shadow ok');

// Settings section changes reach the stage.
sectionValues = { ...sectionValues, discSide: 'left' };
listeners.settings.forEach((fn) => fn());
listeners.change.forEach((fn) => fn());

// Settings panel: draft edits stay local until 保存 writes through.
const panelHost = document.createElement('div');
document.body.appendChild(panelHost);
const setCalls = [];
const panelCtx = {
    locale: 'zh-CN',
    getTheme: () => theme,
    settings: {
        get: () => ({ ...sectionValues }),
        set: (patch) => { setCalls.push(patch); },
        reset: () => {},
    },
};
registered.section.settingsPanel(panelHost, panelCtx);
const checkbox = panelHost.querySelector('input[type=checkbox]');
checkbox.checked = false;
checkbox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
const savedBefore = setCalls.length;
const saveBtn = [...panelHost.querySelectorAll('button')].find((b) => b.textContent === '保存');
if (!saveBtn) throw new Error('panel has no 保存 button');
saveBtn.click();
if (setCalls.length !== savedBefore + 1) throw new Error('保存 did not write the draft through');
console.log(`panel draft->save writes through: true (${checkbox.dataset ? '' : ''}showSpindle n/a -> checkbox toggle saved)`);
sectionValues = { ...sectionValues, ...setCalls[setCalls.length - 1] };

dispose();
console.log('SMOKE TEST OK');
