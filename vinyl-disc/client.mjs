// client.mjs — the whole vinyl-disc mod.
//
// A vinyl record floats on the player page: the current song's cover sits in
// the middle as the disc label, grooves fill the rest of the disc, a static
// sheen lies on top, and a tonearm reaches in from the top-right. While the
// song plays the disc spins and the arm rests on it; on pause the arm lifts
// and the disc freezes, exactly like QQ Music / NetEase Cloud Music.
//
// Everything is public Folium surface:
//   - `folium.registries.stageLayers` (`stageLayers` permission) mounts the
//     vinyl into the player page, under the lyrics (`player.stage.back`).
//   - `folium.registries.settingsSections` gives the mod its own settings in
//     the mods panel; the host renders the form and persists the values.
//   - The stage context provides the cover URL, the pause state, the theme
//     and resize events. The host remounts the layer when the song changes.
//
// The layer is click-through (`interactive` stays false) and draws nothing
// outside its own container; host DOM is never queried or mutated.

export default function activate(folium) {
    // ---------------------------------------------------------------- settings
    const label = (zh, en) => ({ 'zh-CN': zh, en });
    const LOOK = label('外观', 'Look');
    const MOTION = label('动画', 'Motion');

    const SETTINGS = [
        {
            key: 'enabled', type: 'boolean', defaultValue: true,
            label: label('显示黑胶唱片', 'Show vinyl'),
        },
        {
            key: 'side', type: 'select', defaultValue: 'right',
            label: label('位置', 'Position'),
            description: label('唱片放在播放区的哪一侧（居中时会垫在歌词后面）', 'Which side of the stage the disc sits on (center puts it behind the lyrics)'),
            options: [
                { value: 'left', label: label('左侧', 'Left') },
                { value: 'center', label: label('居中', 'Center') },
                { value: 'right', label: label('右侧', 'Right') },
            ],
        },
        {
            key: 'size', type: 'number', defaultValue: 0.62, min: 0.3, max: 0.95, step: 0.01,
            label: label('大小', 'Size'),
            description: label('唱片直径占播放区高度的比例', 'Disc diameter as a fraction of the stage height'),
        },
        {
            key: 'verticalBias', type: 'number', defaultValue: 0, min: -0.45, max: 0.45, step: 0.01,
            label: label('垂直偏移', 'Vertical offset'),
            description: label('负值上移，正值下移', 'Negative moves the disc up, positive down'),
            group: LOOK,
        },
        {
            key: 'labelRatio', type: 'number', defaultValue: 0.46, min: 0.3, max: 0.6, step: 0.01,
            label: label('封面占比', 'Cover size'),
            description: label('碟心封面占唱片直径的比例', 'The cover label as a fraction of the disc diameter'),
            group: LOOK,
        },
        {
            key: 'sheen', type: 'boolean', defaultValue: true,
            label: label('高光光泽', 'Sheen'),
            description: label('碟面上一道固定的反光', 'A fixed light reflection on the disc'),
            group: LOOK,
        },
        {
            key: 'glow', type: 'boolean', defaultValue: false,
            label: label('主题色光晕', 'Theme glow'),
            description: label('用当前主题色给唱片加一圈柔和的辉光', 'A soft halo in the current theme color around the disc'),
            group: LOOK,
        },
        {
            key: 'opacity', type: 'number', defaultValue: 1, min: 0.2, max: 1, step: 0.05,
            label: label('不透明度', 'Opacity'),
            group: LOOK,
        },
        {
            key: 'spinSeconds', type: 'number', defaultValue: 20, min: 6, max: 60, step: 1,
            label: label('旋转一圈（秒）', 'Spin period (s)'),
            description: label('33⅓ 转的黑胶大约 1.8 秒一圈，这里默认放慢到 20 秒，更像装饰', 'A real 33⅓ rpm record turns once every 1.8s; the default 20s looks calmer'),
            group: MOTION,
        },
        {
            key: 'showArm', type: 'boolean', defaultValue: true,
            label: label('唱臂', 'Tonearm'),
            description: label('播放时落在唱片上，暂停时抬起', 'Rests on the disc while playing, lifts on pause'),
            group: MOTION,
        },
    ];

    const DEFAULTS = Object.freeze({
        enabled: true,
        side: 'right',
        size: 0.62,
        verticalBias: 0,
        labelRatio: 0.46,
        sheen: true,
        glow: false,
        opacity: 1,
        spinSeconds: 20,
        showArm: true,
    });

    // The section must exist for `getSettings()` inside the layer to return
    // anything; if registration fails (older host) fall back to the defaults.
    let section = null;
    try {
        section = folium.registries.settingsSections.register({
            id: 'vinyl',
            label: label('黑胶唱片', 'Vinyl'),
            description: label('播放页黑胶唱片的外观与动画。', 'Look and motion of the vinyl on the player page.'),
            settings: SETTINGS,
        });
    } catch (error) {
        folium.log.warn('settings section unavailable, using built-in defaults', String(error));
    }

    const readSettings = () => {
        try {
            const values = section?.settings.get();
            if (!values) return { ...DEFAULTS };
            const side = values.side === 'left' || values.side === 'center' ? values.side : 'right';
            return {
                enabled: values.enabled !== false,
                side,
                size: clamp(Number(values.size), DEFAULTS.size, 0.3, 0.95),
                verticalBias: clamp(Number(values.verticalBias), 0, -0.45, 0.45),
                labelRatio: clamp(Number(values.labelRatio), DEFAULTS.labelRatio, 0.3, 0.6),
                sheen: values.sheen !== false,
                glow: values.glow === true,
                opacity: clamp(Number(values.opacity), 1, 0.2, 1),
                spinSeconds: clamp(Number(values.spinSeconds), 20, 6, 60),
                showArm: values.showArm !== false,
            };
        } catch {
            return { ...DEFAULTS };
        }
    };

    const clamp = (value, fallback, min, max) => {
        if (!Number.isFinite(value)) return fallback;
        return Math.min(max, Math.max(min, value));
    };

    // ------------------------------------------------------------------ layer
    const layer = folium.registries.stageLayers.register({
        id: 'disc',
        slot: 'player.stage.back',
        order: 400,
        // Click-through: the record is a decoration, the player must keep
        // working everywhere above it.
        interactive: false,
        mount: (container, ctx) => mountVinyl(container, ctx, () => readSettings()),
    });

    folium.onDispose(() => {
        layer.unregister();
        section?.unregister();
    });
}

// ---------------------------------------------------------------------------
// The vinyl itself. Plain DOM + CSS: the disc is a stack of circular layers
// (grooves, cover label, spindle hole, sheen) spun by a CSS animation, so the
// compositor owns the motion and pausing costs nothing.
// ---------------------------------------------------------------------------

function mountVinyl(container, ctx, getSettings) {
    container.style.cssText = 'position:absolute;inset:0;pointer-events:none;';

    // A <style> inside our own container carries the keyframes; the host never
    // sees a global stylesheet.
    const style = document.createElement('style');
    style.textContent = [
        '@keyframes vinyl-disc-spin { to { transform: rotate(360deg); } }',
        '.vinyl-scene, .vinyl-scene * { pointer-events: none; user-select: none; }',
    ].join('\n');
    container.appendChild(style);

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;';
    container.appendChild(wrap);

    const scene = document.createElement('div');
    scene.style.cssText = [
        'position:relative;',
        'aspect-ratio:1/1;',
        'will-change:transform;',
    ].join('');
    wrap.appendChild(scene);

    // --- the disc (everything inside spins together) -------------------------
    const disc = document.createElement('div');
    disc.style.cssText = [
        'position:absolute;inset:0;border-radius:50%;overflow:hidden;',
        'background:radial-gradient(circle at 50% 50%, #262626 0%, #1b1b1b 30%, #121212 70%, #0d0d0d 100%);',
        'box-shadow:0 18px 60px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.07);',
        'animation:vinyl-disc-spin var(--vinyl-spin, 20s) linear infinite;',
        'animation-play-state:paused;',
    ].join('');
    scene.appendChild(disc);

    // Grooves: hairline rings, a hair wider every few rings, like a pressed LP.
    const grooves = document.createElement('div');
    grooves.style.cssText = [
        'position:absolute;inset:0;border-radius:50%;',
        'background:repeating-radial-gradient(circle at 50% 50%,',
        ' rgba(255,255,255,0.045) 0px, rgba(255,255,255,0.045) 1px,',
        ' rgba(255,255,255,0) 1px, rgba(255,255,255,0) 4px);',
        'mask-image:radial-gradient(circle at 50% 50%, transparent 0 31%, #000 32% 97.5%, transparent 98%);',
        '-webkit-mask-image:radial-gradient(circle at 50% 50%, transparent 0 31%, #000 32% 97.5%, transparent 98%);',
    ].join('');
    disc.appendChild(grooves);

    // A faint outer rim highlight between grooves and edge.
    const rim = document.createElement('div');
    rim.style.cssText = [
        'position:absolute;inset:0;border-radius:50%;',
        'background:radial-gradient(circle at 50% 50%, transparent 0 96.4%, rgba(255,255,255,0.10) 97%, transparent 97.8%);',
    ].join('');
    disc.appendChild(rim);

    // The cover label. A rotating <img>; when there is no cover the fallback
    // shows the title and artist on a plain label instead.
    const discLabel = document.createElement('div');
    discLabel.style.cssText = [
        'position:absolute;border-radius:50%;overflow:hidden;',
        'background:#1f1a15;',
        'box-shadow:0 0 0 1px rgba(0,0,0,0.65), 0 0 0 2.5px rgba(255,255,255,0.05);',
    ].join('');
    disc.appendChild(discLabel);

    const labelImg = document.createElement('img');
    labelImg.alt = '';
    labelImg.draggable = false;
    labelImg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none;';
    discLabel.appendChild(labelImg);

    const labelFallback = document.createElement('div');
    labelFallback.style.cssText = [
        'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;',
        'gap:0.4em;padding:12%;box-sizing:border-box;text-align:center;',
        'color:rgba(255,255,255,0.82);font-weight:600;line-height:1.25;',
        'background:repeating-conic-gradient(from 0deg, #241f19 0deg 14deg, #1e1a15 14deg 28deg);',
        'text-shadow:0 1px 2px rgba(0,0,0,0.6);',
    ].join('');
    const fallbackTitle = document.createElement('div');
    fallbackTitle.style.cssText = 'max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:1em;';
    const fallbackArtist = document.createElement('div');
    fallbackArtist.style.cssText = 'max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.62em;font-weight:400;opacity:0.7;';
    labelFallback.append(fallbackTitle, fallbackArtist);
    discLabel.appendChild(labelFallback);

    // --- static layers above the disc ----------------------------------------
    // The spindle hole does not need to spin; a circle looks the same rotated.
    const spindle = document.createElement('div');
    spindle.style.cssText = [
        'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border-radius:50%;',
        'width:3.4%;height:3.4%;box-sizing:border-box;',
        'background:#070707;border:1px solid rgba(255,255,255,0.22);',
        'box-shadow:inset 0 1px 2px rgba(0,0,0,0.9);',
    ].join('');
    scene.appendChild(spindle);

    // Sheen: a fixed light source, so it stays put while the disc spins.
    const sheen = document.createElement('div');
    sheen.style.cssText = [
        'position:absolute;inset:0;border-radius:50%;',
        'background:conic-gradient(from 205deg at 50% 50%,',
        ' rgba(255,255,255,0) 0deg, rgba(255,255,255,0.00) 28deg,',
        ' rgba(255,255,255,0.09) 46deg, rgba(255,255,255,0.02) 60deg,',
        ' rgba(255,255,255,0) 74deg,',
        ' rgba(255,255,255,0) 196deg, rgba(255,255,255,0.06) 214deg,',
        ' rgba(255,255,255,0.01) 228deg, rgba(255,255,255,0) 242deg,',
        ' rgba(255,255,255,0) 360deg);',
        'mix-blend-mode:screen;',
    ].join('');
    scene.appendChild(sheen);

    // --- the tonearm ----------------------------------------------------------
    // One SVG covering the scene; the whole arm rotates around its pivot, and
    // CSS transitions do the lift on pause. Coordinates in a 0..100 viewBox.
    const arm = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arm.setAttribute('viewBox', '0 0 100 100');
    arm.setAttribute('aria-hidden', 'true');
    arm.style.cssText = [
        'position:absolute;inset:0;width:100%;height:100%;overflow:visible;',
        'transform-origin:82% 8%;',
        'transform:rotate(-32deg);',
        'transition:transform 0.9s cubic-bezier(0.3, 1.2, 0.45, 1);',
        'filter:drop-shadow(0 6px 10px rgba(0,0,0,0.5));',
    ].join('');
    arm.innerHTML = [
        // counterweight behind the pivot
        '<circle cx="90" cy="-1" r="6.5" fill="url(#vinylArmWeight)"/>',
        '<circle cx="90" cy="-1" r="6.5" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="0.7"/>',
        // the rod, pivot -> head
        '<line x1="82" y1="8" x2="57" y2="51" stroke="url(#vinylArmRod)" stroke-width="2.6" stroke-linecap="round"/>',
        // head shell + stylus
        '<g transform="rotate(31 56 54.5)">',
        '<rect x="50.5" y="51" width="11" height="7" rx="2" fill="#2c2c2e" stroke="rgba(255,255,255,0.22)" stroke-width="0.6"/>',
        '<path d="M 55.5 58 L 56 60.6" stroke="rgba(255,255,255,0.55)" stroke-width="0.8" stroke-linecap="round"/>',
        '</g>',
        // pivot
        '<circle cx="82" cy="8" r="6.2" fill="url(#vinylArmPivot)"/>',
        '<circle cx="82" cy="8" r="2.4" fill="#111"/>',
        '<circle cx="82" cy="8" r="6.2" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="0.7"/>',
    ].join('');
    // Gradients must live in a <defs> with stable ids; the layer content is
    // scoped to this mount, so the ids cannot collide with anything else.
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = [
        '<linearGradient id="vinylArmRod" x1="82" y1="8" x2="57" y2="51" gradientUnits="userSpaceOnUse">',
        '<stop offset="0" stop-color="#9a9aa0"/><stop offset="1" stop-color="#5c5c62"/>',
        '</linearGradient>',
        '<radialGradient id="vinylArmPivot" cx="0.35" cy="0.3" r="1">',
        '<stop offset="0" stop-color="#d8d8dc"/><stop offset="1" stop-color="#55555b"/>',
        '</radialGradient>',
        '<radialGradient id="vinylArmWeight" cx="0.35" cy="0.3" r="1">',
        '<stop offset="0" stop-color="#6e6e74"/><stop offset="1" stop-color="#333338"/>',
        '</radialGradient>',
    ].join('');
    arm.insertBefore(defs, arm.firstChild);
    scene.appendChild(arm);

    // ------------------------------------------------------------------ state
    let disposed = false;
    let paused = ctx.isPaused();
    let stageSize = { width: 0, height: 0 };

    const apply = () => {
        if (disposed) return;
        const s = getSettings();
        const { width, height } = stageSize;

        wrap.style.display = s.enabled ? '' : 'none';
        if (!s.enabled) return;
        wrap.style.opacity = String(s.opacity);

        // Side + breathing room from the stage edge.
        wrap.style.justifyContent = s.side === 'left' ? 'flex-start' : s.side === 'center' ? 'center' : 'flex-end';
        const inset = Math.round(width * 0.04);
        wrap.style.paddingLeft = s.side === 'left' ? `${inset}px` : '0';
        wrap.style.paddingRight = s.side === 'right' ? `${inset}px` : '0';

        // Diameter: a fraction of the stage height, never wider than the stage.
        let diameter = height * s.size;
        if (width > 0) diameter = Math.min(diameter, width * 0.8);
        diameter = Math.max(80, Math.round(diameter));
        scene.style.width = `${diameter}px`;
        scene.style.height = `${diameter}px`;
        scene.style.transform = `translateY(${Math.round(s.verticalBias * height)}px)`;

        // Disc label proportions.
        const labelPct = s.labelRatio * 100;
        discLabel.style.left = discLabel.style.top = `${((100 - labelPct) / 2).toFixed(2)}%`;
        discLabel.style.width = discLabel.style.height = `${labelPct.toFixed(2)}%`;
        const labelPx = (diameter * s.labelRatio) | 0;
        fallbackTitle.style.fontSize = `${Math.max(10, Math.round(labelPx * 0.14))}px`;
        fallbackArtist.style.fontSize = `${Math.max(8, Math.round(labelPx * 0.09))}px`;

        // Motion.
        disc.style.setProperty('--vinyl-spin', `${s.spinSeconds}s`);
        disc.style.animationDuration = `${s.spinSeconds}s`;
        disc.style.animationPlayState = !paused && !ctx.staticMode ? 'running' : 'paused';
        arm.style.display = s.showArm ? '' : 'none';
        arm.style.transform = !paused && s.showArm ? 'rotate(0deg)' : 'rotate(-32deg)';

        sheen.style.display = s.sheen ? '' : 'none';

        // Glow in the theme accent; always keep the drop shadow.
        const shadow = '0 18px 60px rgba(0,0,0,0.45)';
        if (s.glow) {
            const accent = hexOr(ctx.getTheme()?.accentColor, '#8a7cff');
            disc.style.boxShadow = `0 0 ${Math.round(diameter * 0.1)}px ${accent}66, 0 0 ${Math.round(diameter * 0.28)}px ${accent}33, ${shadow}`;
        } else {
            disc.style.boxShadow = shadow;
        }
    };

    // Cover + song text; the host remounts this layer when the song changes,
    // so this only needs to track cover-within-song changes.
    const applySong = () => {
        if (disposed) return;
        const cover = ctx.getCoverUrl();
        if (cover) {
            if (labelImg.getAttribute('src') !== cover) labelImg.setAttribute('src', cover);
            labelImg.style.display = '';
            labelFallback.style.display = 'none';
        } else {
            labelImg.removeAttribute('src');
            labelImg.style.display = 'none';
            labelFallback.style.display = '';
            const song = ctx.song;
            fallbackTitle.textContent = song?.title || '♪';
            fallbackTitle.title = song?.title || '';
            fallbackArtist.textContent = song?.artist || '';
        }
    };

    applySong();
    apply();

    const offResize = ctx.onResize((size) => {
        stageSize = { width: size.width, height: size.height };
        apply();
    });
    const offChange = ctx.onChange(() => {
        paused = ctx.isPaused();
        applySong();
        apply();
    });

    return () => {
        disposed = true;
        offResize();
        offChange();
    };
}

const hexOr = (value, fallback) =>
    (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback);
