// client.mjs — the whole vinyl-disc mod.
//
// A lyric animation *mode* (like the builtin ones): pick 「黑胶唱片」in the
// mode picker and the player page shows a vinyl record — the current song's
// cover as the disc label, grooves around it, a fixed sheen, and a tonearm
// reaching in from the top-right — with the lyric text beside it. While the
// song plays the disc spins and the arm rests on it; on pause the arm lifts
// and the disc freezes, as in QQ Music / NetEase Cloud Music.
//
// It is a normal visualizer entry, so it only draws when the user selects this
// mode: every other mode is completely unaffected.
//
// Everything is public Folium surface:
//   - `folium.registries.visualizers` registers the mode, its settings and the
//     host layers around it (we draw the lyrics ourselves, so subtitles off).
//   - The stage context provides lines, the lyric clock, the cover URL, the
//     pause state, theme and display settings. The host remounts the mode when
//     the song or the lyric data changes.
//
// Nothing here queries or mutates host DOM outside its own container.

export default function activate(folium) {
    const label = (zh, en) => ({ 'zh-CN': zh, en });

    const SETTINGS = [
        {
            key: 'discSide', type: 'select', defaultValue: 'right',
            label: label('唱片位置', 'Disc side'),
            description: label('唱片在歌词的哪一侧', 'Which side of the lyrics the disc sits on'),
            options: [
                { value: 'left', label: label('左侧', 'Left') },
                { value: 'right', label: label('右侧', 'Right') },
            ],
        },
        {
            key: 'discSize', type: 'number', defaultValue: 0.8, min: 0.45, max: 1, step: 0.01,
            label: label('唱片大小', 'Disc size'),
            description: label('唱片直径占播放区高度的比例', 'Disc diameter as a fraction of the stage height'),
        },
        {
            key: 'spinSeconds', type: 'number', defaultValue: 20, min: 6, max: 60, step: 1,
            label: label('旋转一圈（秒）', 'Spin period (s)'),
            description: label('真黑胶 33⅓ 转约 1.8 秒一圈；默认放慢到 20 秒更像装饰', 'A real 33⅓ rpm record turns once every 1.8s; 20s looks calmer'),
        },
        {
            key: 'labelRatio', type: 'number', defaultValue: 0.42, min: 0.3, max: 0.6, step: 0.01,
            label: label('封面占比', 'Cover size'),
            description: label('碟心封面占唱片直径的比例', 'The cover label as a fraction of the disc diameter'),
        },
        {
            key: 'showArm', type: 'boolean', defaultValue: true,
            label: label('唱臂', 'Tonearm'),
            description: label('播放时落在唱片上，暂停时抬起', 'Rests on the disc while playing, lifts on pause'),
        },
        {
            key: 'sheen', type: 'boolean', defaultValue: true,
            label: label('高光光泽', 'Sheen'),
            description: label('碟面上一道固定的反光', 'A fixed light reflection on the disc'),
        },
        {
            key: 'glow', type: 'boolean', defaultValue: false,
            label: label('主题色光晕', 'Theme glow'),
            description: label('用当前主题色给唱片加一圈柔和辉光', 'A soft halo in the current theme color around the disc'),
        },
        {
            key: 'textScale', type: 'number', defaultValue: 1, min: 0.6, max: 1.8, step: 0.05,
            label: label('歌词字号', 'Lyric size'),
        },
        {
            key: 'showNext', type: 'boolean', defaultValue: true,
            label: label('显示下一句', 'Show next line'),
        },
    ];

    folium.registries.visualizers.register({
        id: 'disc',
        label: label('黑胶唱片', 'Vinyl'),
        order: 430,
        // We draw the lyric text ourselves, so the host must not draw its own
        // subtitle layer on top; the background stays the host's.
        hostLayers: { background: true, subtitles: false },
        settings: SETTINGS,
        mount: (container, ctx) => mountVinyl(folium, container, ctx),
    });
}

// ---------------------------------------------------------------------------
// The mode. The disc is plain DOM + CSS (the spin is a compositor-driven CSS
// animation, so pausing is free); the text is DOM so the theme's font stack and
// the user's lyric size apply without a canvas text layout.
// ---------------------------------------------------------------------------

function mountVinyl(folium, container, ctx) {
    container.style.cssText = 'position:absolute;inset:0;overflow:hidden;';

    const style = document.createElement('style');
    style.textContent = [
        '@keyframes vinyl-disc-spin { to { transform: rotate(360deg); } }',
        '.vinyl-line-in { animation: vinyl-line-in 0.32s cubic-bezier(0.2, 0.8, 0.3, 1) both; }',
        '@keyframes vinyl-line-in {',
        '  from { opacity: 0; transform: translateY(0.35em); }',
        '  to { opacity: 1; transform: none; }',
        '}',
    ].join('\n');
    container.appendChild(style);

    // ---- layout: [text][disc] or [disc][text] ------------------------------
    const stage = document.createElement('div');
    stage.style.cssText = [
        'position:absolute;inset:0;display:flex;align-items:center;',
        'box-sizing:border-box;',
    ].join('');
    container.appendChild(stage);

    const textCol = document.createElement('div');
    textCol.style.cssText = [
        'flex:1 1 auto;min-width:0;display:flex;flex-direction:column;justify-content:center;',
        'box-sizing:border-box;',
    ].join('');
    stage.appendChild(textCol);

    const header = document.createElement('div');
    header.style.cssText = 'margin-bottom:1.6em;line-height:1.35;';

    const titleEl = document.createElement('div');
    const artistEl = document.createElement('div');
    header.append(titleEl, artistEl);
    textCol.appendChild(header);

    const lineEl = document.createElement('div');
    lineEl.style.cssText = 'line-height:1.32;font-weight:700;';

    const translationEl = document.createElement('div');
    translationEl.style.cssText = 'line-height:1.4;font-weight:400;margin-top:0.55em;';

    const nextEl = document.createElement('div');
    nextEl.style.cssText = 'line-height:1.4;font-weight:400;margin-top:1.5em;';

    textCol.append(lineEl, translationEl, nextEl);

    const discBox = document.createElement('div');
    discBox.style.cssText = 'flex:0 0 auto;position:relative;';
    stage.appendChild(discBox);

    const scene = document.createElement('div');
    scene.style.cssText = 'position:relative;aspect-ratio:1/1;';
    discBox.appendChild(scene);

    // ---- the disc ----------------------------------------------------------
    const disc = document.createElement('div');
    disc.style.cssText = [
        'position:absolute;inset:0;border-radius:50%;overflow:hidden;',
        'background:radial-gradient(circle at 50% 50%, #262626 0%, #1b1b1b 30%, #121212 70%, #0d0d0d 100%);',
        'box-shadow:0 18px 60px rgba(0,0,0,0.45);',
        'animation:vinyl-disc-spin var(--vinyl-spin, 20s) linear infinite;',
        'animation-play-state:paused;',
    ].join('');
    scene.appendChild(disc);

    const grooves = document.createElement('div');
    grooves.style.cssText = [
        'position:absolute;inset:0;border-radius:50%;',
        'background:repeating-radial-gradient(circle at 50% 50%,',
        ' rgba(255,255,255,0.045) 0px, rgba(255,255,255,0.045) 1px,',
        ' rgba(255,255,255,0) 1px, rgba(255,255,255,0) 4px);',
        'mask-image:radial-gradient(circle at 50% 50%, transparent 0 28%, #000 29% 97.5%, transparent 98%);',
        '-webkit-mask-image:radial-gradient(circle at 50% 50%, transparent 0 28%, #000 29% 97.5%, transparent 98%);',
    ].join('');
    disc.appendChild(grooves);

    const rim = document.createElement('div');
    rim.style.cssText = 'position:absolute;inset:0;border-radius:50%;'
        + 'background:radial-gradient(circle at 50% 50%, transparent 0 96.4%, rgba(255,255,255,0.10) 97%, transparent 97.8%);';
    disc.appendChild(rim);

    const discLabel = document.createElement('div');
    discLabel.style.cssText = [
        'position:absolute;border-radius:50%;overflow:hidden;background:#1f1a15;',
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
    ].join('');
    const fallbackTitle = document.createElement('div');
    fallbackTitle.style.cssText = 'max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    const fallbackArtist = document.createElement('div');
    fallbackArtist.style.cssText = 'max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:400;opacity:0.7;';
    labelFallback.append(fallbackTitle, fallbackArtist);
    discLabel.appendChild(labelFallback);

    const spindle = document.createElement('div');
    spindle.style.cssText = [
        'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border-radius:50%;',
        'width:3.4%;height:3.4%;box-sizing:border-box;',
        'background:#070707;border:1px solid rgba(255,255,255,0.22);',
        'box-shadow:inset 0 1px 2px rgba(0,0,0,0.9);',
    ].join('');
    scene.appendChild(spindle);

    const sheen = document.createElement('div');
    sheen.style.cssText = [
        'position:absolute;inset:0;border-radius:50%;',
        'background:conic-gradient(from 205deg at 50% 50%,',
        ' rgba(255,255,255,0) 0deg, rgba(255,255,255,0) 28deg,',
        ' rgba(255,255,255,0.09) 46deg, rgba(255,255,255,0.02) 60deg,',
        ' rgba(255,255,255,0) 74deg, rgba(255,255,255,0) 196deg,',
        ' rgba(255,255,255,0.06) 214deg, rgba(255,255,255,0.01) 228deg,',
        ' rgba(255,255,255,0) 242deg, rgba(255,255,255,0) 360deg);',
        'mix-blend-mode:screen;',
    ].join('');
    scene.appendChild(sheen);

    // ---- tonearm -----------------------------------------------------------
    const arm = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arm.setAttribute('viewBox', '0 0 100 100');
    arm.setAttribute('aria-hidden', 'true');
    arm.style.cssText = [
        'position:absolute;inset:0;width:100%;height:100%;overflow:visible;',
        'transform-origin:82% 8%;transform:rotate(-32deg);',
        'transition:transform 0.9s cubic-bezier(0.3, 1.2, 0.45, 1);',
    ].join('');
    arm.innerHTML = [
        '<defs>',
        '<linearGradient id="vinylArmRod" x1="82" y1="8" x2="57" y2="51" gradientUnits="userSpaceOnUse">',
        '<stop offset="0" stop-color="#9a9aa0"/><stop offset="1" stop-color="#5c5c62"/></linearGradient>',
        '<radialGradient id="vinylArmPivot" cx="0.35" cy="0.3" r="1">',
        '<stop offset="0" stop-color="#d8d8dc"/><stop offset="1" stop-color="#55555b"/></radialGradient>',
        '<radialGradient id="vinylArmWeight" cx="0.35" cy="0.3" r="1">',
        '<stop offset="0" stop-color="#6e6e74"/><stop offset="1" stop-color="#333338"/></radialGradient>',
        '</defs>',
        '<circle cx="90" cy="-1" r="6.5" fill="url(#vinylArmWeight)"/>',
        '<circle cx="90" cy="-1" r="6.5" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="0.7"/>',
        '<line x1="82" y1="8" x2="57" y2="51" stroke="url(#vinylArmRod)" stroke-width="2.6" stroke-linecap="round"/>',
        '<g transform="rotate(31 56 54.5)">',
        '<rect x="50.5" y="51" width="11" height="7" rx="2" fill="#2c2c2e" stroke="rgba(255,255,255,0.22)" stroke-width="0.6"/>',
        '<path d="M 55.5 58 L 56 60.6" stroke="rgba(255,255,255,0.55)" stroke-width="0.8" stroke-linecap="round"/>',
        '</g>',
        '<circle cx="82" cy="8" r="6.2" fill="url(#vinylArmPivot)"/>',
        '<circle cx="82" cy="8" r="2.4" fill="#111"/>',
        '<circle cx="82" cy="8" r="6.2" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="0.7"/>',
    ].join('');
    scene.appendChild(arm);

    // ---- state -------------------------------------------------------------
    let disposed = false;
    let paused = ctx.isPaused();
    let width = 1;
    let height = 1;
    let lastLineIndex = null;
    let lastTextKey = '';

    const settings = () => {
        const v = ctx.getSettings() || {};
        return {
            discSide: v.discSide === 'left' ? 'left' : 'right',
            discSize: num(v.discSize, 0.8),
            spinSeconds: num(v.spinSeconds, 20),
            labelRatio: num(v.labelRatio, 0.42),
            showArm: v.showArm !== false,
            sheen: v.sheen !== false,
            glow: v.glow === true,
            textScale: num(v.textScale, 1),
            showNext: v.showNext !== false,
        };
    };

    // ---- text --------------------------------------------------------------
    // Font stack and weight come from the theme, the size from the theme scale,
    // the user's lyric size multiplier and the mod's own setting.
    const applyTypography = () => {
        const theme = ctx.getTheme();
        const s = settings();
        const display = ctx.getDisplay();
        const stack = safeFontStack(folium, theme);
        const weight = safeWeight(folium, theme, 700);
        const base = Math.round(Math.min(Math.max(height * 0.055, 16), 64) * s.textScale * display.lyricsFontScale);

        textCol.style.fontFamily = stack;
        titleEl.style.cssText = `font-size:${Math.round(base * 0.4)}px;color:${theme.secondaryColor};opacity:0.75;`
            + `font-weight:600;letter-spacing:0.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
        artistEl.style.cssText = `font-size:${Math.round(base * 0.34)}px;color:${theme.secondaryColor};opacity:0.55;`
            + 'margin-top:0.35em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        lineEl.style.fontSize = `${base}px`;
        lineEl.style.fontWeight = String(weight);
        lineEl.style.color = theme.primaryColor;
        translationEl.style.fontSize = `${Math.round(base * 0.6)}px`;
        translationEl.style.color = theme.secondaryColor;
        translationEl.style.opacity = '0.72';
        nextEl.style.fontSize = `${Math.round(base * 0.58)}px`;
        nextEl.style.color = theme.primaryColor;
        nextEl.style.opacity = '0.26';
    };

    const renderText = (animate) => {
        const display = ctx.getDisplay();
        const s = settings();
        const showText = display.showText !== false;
        textCol.style.display = showText ? '' : 'none';
        // With the text hidden the record is the only thing on the stage, so
        // centre it instead of leaving it pinned to one edge.
        stage.style.justifyContent = showText ? '' : 'center';
        if (!showText) {
            // Keep the line index in sync so `onLyricTime` does not keep
            // re-entering here on every clock tick while the text is hidden.
            lastLineIndex = ctx.getLineIndex();
            return;
        }

        const song = ctx.song;
        titleEl.textContent = song?.title || '';
        artistEl.textContent = song?.artist || '';

        const index = ctx.staticMode && ctx.staticLineIndex !== null
            ? ctx.staticLineIndex
            : ctx.getLineIndex();
        const line = index >= 0 ? ctx.lines[index] : null;
        const nextLine = s.showNext && index + 1 < ctx.lines.length ? ctx.lines[index + 1] : null;

        const text = line?.fullText?.trim() || '';
        const translation = line?.translation?.trim() || '';
        const nextText = nextLine?.fullText?.trim() || '';

        // Re-animate only when the line really changed (the clock ticks far
        // more often than lines change).
        const key = `${index}|${text}|${translation}|${nextText}`;
        const changed = key !== lastTextKey;
        lastTextKey = key;

        lineEl.textContent = text || '♪';
        translationEl.textContent = translation;
        translationEl.style.display = translation ? '' : 'none';
        nextEl.textContent = nextText;
        nextEl.style.display = nextText ? '' : 'none';

        if (changed && animate && text && !ctx.staticMode) {
            for (const el of [lineEl, translationEl]) {
                el.classList.remove('vinyl-line-in');
                void el.offsetWidth;
                el.classList.add('vinyl-line-in');
            }
        }
        lastLineIndex = index;
    };

    // ---- geometry + disc appearance ---------------------------------------
    const applyLayout = () => {
        if (disposed) return;
        const s = settings();
        const theme = ctx.getTheme();

        // Diameter: a fraction of the stage height, and never more than the
        // room the text leaves (the disc gets at most ~46% of the stage width).
        let diameter = height * s.discSize;
        diameter = Math.min(diameter, width * 0.46);
        diameter = Math.max(72, Math.round(diameter));
        scene.style.width = `${diameter}px`;
        scene.style.height = `${diameter}px`;

        const gap = Math.round(width * 0.03);
        const pad = Math.round(width * 0.05);
        discBox.style.marginLeft = s.discSide === 'right' ? `${gap}px` : '0';
        discBox.style.marginRight = s.discSide === 'left' ? `${gap}px` : '0';
        stage.style.paddingLeft = `${pad}px`;
        stage.style.paddingRight = `${pad}px`;
        // Order: disc first when it sits on the left.
        stage.style.flexDirection = s.discSide === 'left' ? 'row-reverse' : 'row';

        // Disc label proportions.
        const pct = s.labelRatio * 100;
        discLabel.style.left = discLabel.style.top = `${((100 - pct) / 2).toFixed(2)}%`;
        discLabel.style.width = discLabel.style.height = `${pct.toFixed(2)}%`;
        const labelPx = diameter * s.labelRatio;
        fallbackTitle.style.fontSize = `${Math.max(8, Math.round(labelPx * 0.13))}px`;
        fallbackArtist.style.fontSize = `${Math.max(7, Math.round(labelPx * 0.085))}px`;

        // Motion.
        disc.style.setProperty('--vinyl-spin', `${s.spinSeconds}s`);
        disc.style.animationDuration = `${s.spinSeconds}s`;
        disc.style.animationPlayState = !paused && !ctx.staticMode ? 'running' : 'paused';
        arm.style.display = s.showArm ? '' : 'none';
        arm.style.transform = !paused && s.showArm ? 'rotate(0deg)' : 'rotate(-32deg)';
        sheen.style.display = s.sheen ? '' : 'none';

        // Shadow / glow.
        const shadow = '0 18px 60px rgba(0,0,0,0.45)';
        if (s.glow) {
            const accent = hexOr(theme.accentColor, '#8a7cff');
            disc.style.boxShadow = `0 0 ${Math.round(diameter * 0.1)}px ${accent}66, `
                + `0 0 ${Math.round(diameter * 0.28)}px ${accent}33, ${shadow}`;
        } else {
            disc.style.boxShadow = shadow;
        }
    };

    const applyCover = () => {
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
            fallbackArtist.textContent = song?.artist || '';
        }
    };

    const refreshAll = (animate) => {
        applyTypography();
        applyLayout();
        applyCover();
        renderText(animate);
    };

    applyTypography();
    applyLayout();
    applyCover();
    renderText(false);

    // ---- subscriptions -----------------------------------------------------
    const offResize = ctx.onResize((size) => {
        width = Math.max(1, size.width);
        height = Math.max(1, size.height);
        refreshAll(false);
    });

    const offChange = ctx.onChange(() => {
        paused = ctx.isPaused();
        refreshAll(false);
    });

    // Line changes come with the lyric clock; only redraw the text when the
    // active line actually moved.
    const offTime = ctx.onLyricTime(() => {
        const index = ctx.staticMode && ctx.staticLineIndex !== null
            ? ctx.staticLineIndex
            : ctx.getLineIndex();
        if (index === lastLineIndex) return;
        renderText(true);
    });

    return () => {
        disposed = true;
        offResize();
        offChange();
        offTime();
    };
}

const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

const hexOr = (value, fallback) =>
    (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback);

// Theme helpers are Folium 1.3+; fall back to the theme's own family fields.
const safeFontStack = (folium, theme) => {
    try {
        const stack = folium.theme?.resolveFontStack?.(theme);
        if (typeof stack === 'string' && stack) return stack;
    } catch { /* older host */ }
    return theme?.fontFamily || 'system-ui, -apple-system, "PingFang SC", sans-serif';
};

const safeWeight = (folium, theme, fallback) => {
    try {
        const weight = folium.theme?.resolveFontWeight?.(theme, fallback);
        if (Number.isFinite(weight)) return weight;
    } catch { /* older host */ }
    return fallback;
};
