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
            key: 'discSize', type: 'number', defaultValue: 0.62, min: 0.3, max: 1, step: 0.01,
            label: label('唱片大小', 'Disc size'),
            description: label('唱片直径占播放区高度的比例', 'Disc diameter as a fraction of the stage height'),
        },
        {
            key: 'spinSeconds', type: 'number', defaultValue: 20, min: 6, max: 60, step: 1,
            label: label('旋转一圈（秒）', 'Spin period (s)'),
            description: label('真黑胶 33⅓ 转约 1.8 秒一圈；默认放慢到 20 秒更像装饰', 'A real 33⅓ rpm record turns once every 1.8s; 20s looks calmer'),
        },
        {
            key: 'labelRatio', type: 'number', defaultValue: 0.72, min: 0.5, max: 0.85, step: 0.01,
            label: label('封面占比', 'Cover size'),
            description: label('碟心封面占唱片直径的比例', 'The cover label as a fraction of the disc diameter'),
        },
        {
            key: 'showSpindle', type: 'boolean', defaultValue: true,
            label: label('中心孔（黑色圆点）', 'Spindle hole'),
            description: label('盖在封面正中的黑色转轴孔圆点，关掉后封面完整无孔', 'The small black spindle dot on the cover; off leaves the artwork intact'),
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
            key: 'halo', type: 'select', defaultValue: 'cover',
            label: label('弥散投影', 'Diffuse glow'),
            description: label('唱片背后的柔和光晕；跟随封面会取当前封面的主色', 'A soft halo behind the disc; “cover” takes the dominant colour of the artwork'),
            options: [
                { value: 'off', label: label('关闭', 'Off') },
                { value: 'cover', label: label('跟随封面', 'Cover colour') },
                { value: 'theme', label: label('主题色', 'Theme colour') },
            ],
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

    // The settings live in a settings section, so they show up in the mod's
    // own row in Settings → Mods (expanded). The visualizer reads the same
    // values through the section handle; there is no second schema on the
    // visualizer itself, so there is exactly one source of truth.
    const section = folium.registries.settingsSections.register({
        id: 'settings',
        label: label('黑胶唱片', 'Vinyl'),
        description: label('选中「黑胶唱片」动画模式时生效；改动点「保存」后应用', 'Applies while the Vinyl lyric mode is selected; press Save to apply changes'),
        settings: SETTINGS,
        // We draw the form ourselves: edits stay in a draft until 保存 is
        // pressed, so the player page does not re-layout (and flicker) on
        // every keystroke in the mod panel.
        settingsPanel: (container, panelCtx) => buildSettingsPanel(container, panelCtx, SETTINGS, label),
    });

    folium.registries.visualizers.register({
        id: 'disc',
        label: label('黑胶唱片', 'Vinyl'),
        order: 430,
        // We draw the lyric text ourselves, so the host must not draw its own
        // subtitle layer on top; the background stays the host's.
        hostLayers: { background: true, subtitles: false },
        mount: (container, ctx) => mountVinyl(folium, container, ctx, section.settings),
    });
}

// ---------------------------------------------------------------------------
// The mode. The disc is plain DOM + CSS (the spin is a compositor-driven CSS
// animation, so pausing is free); the text is DOM so the theme's font stack and
// the user's lyric size apply without a canvas text layout.
// ---------------------------------------------------------------------------

function mountVinyl(folium, container, ctx, settingsAccess) {
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

    // Diffuse halo behind the disc: a soft, blurred colour field taken from
    // the artwork (or the theme), so the record sits in its own light.
    const halo = document.createElement('div');
    halo.style.cssText = [
        'position:absolute;inset:-12.6%;border-radius:50%;pointer-events:none;',
        'opacity:0;transition:opacity 0.5s ease;',
    ].join('');
    scene.appendChild(halo);

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
        // No centre mask: the cover label is drawn on top and covers it.
        'background:repeating-radial-gradient(circle at 50% 50%,',
        ' rgba(255,255,255,0.045) 0px, rgba(255,255,255,0.045) 1px,',
        ' rgba(255,255,255,0) 1px, rgba(255,255,255,0) 4px);',
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
    // A light, thin arm as in the reference: a small pivot disc at the top, a
    // long straight tube (70% of the arm) that flows into a rounded 30% bend,
    // and a small capsule head shell. One SVG covering the scene; the whole
    // arm rotates around the pivot and a CSS transition does the lift on
    // pause. ViewBox 0..100.
    const arm = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arm.setAttribute('viewBox', '0 0 100 100');
    arm.setAttribute('aria-hidden', 'true');
    arm.style.cssText = [
        'position:absolute;inset:0;width:100%;height:100%;overflow:visible;',
        'transform-origin:90% -8%;transform:rotate(-50deg);',
        'transition:transform 0.9s cubic-bezier(0.3, 1.2, 0.45, 1);',
    ].join('');
    arm.style.filter = 'drop-shadow(0 3px 4px rgba(0,0,0,0.45))';
    scene.appendChild(arm);

    const armMarkup = () => [
        '<defs>',
        '<linearGradient id="vinylArmRod" x1="90" y1="-8" x2="64.6" y2="29" gradientUnits="userSpaceOnUse">',
        '<stop offset="0" stop-color="#f4f4f6"/><stop offset="1" stop-color="#dcdce0"/></linearGradient>',
        '</defs>',
        // One continuous rod: pivot -> long straight tube -> rounded elbow ->
        // short tail -> head. The elbow is filleted (quadratic) so the bend
        // reads as a smooth curve rather than a kink.
        '<path d="M 90 -8 L 77.95 18.42 Q 76.5 21.6 73.53 23.45 L 64.6 29"',
        ' fill="none" stroke="url(#vinylArmRod)" stroke-width="1.9"',
        ' stroke-linecap="round" stroke-linejoin="round"/>',
        // head shell: a small capsule continuing the lower rod
        '<g transform="rotate(148 64.6 29)">',
        '<rect x="59.1" y="26.5" width="11" height="5" rx="2.5" fill="#f2f2f4"/>',
        '<circle cx="69" cy="29" r="0.95" fill="#3a3a3e"/>',
        '</g>',
        // pivot: white disc with a dark centre dot
        '<circle cx="90" cy="-8" r="4.3" fill="#f6f6f8"/>',
        '<circle cx="90" cy="-8" r="1.8" fill="#2a2a2e"/>',
        '<circle cx="90" cy="-8" r="4.3" fill="none" stroke="rgba(0,0,0,0.18)" stroke-width="0.5"/>',
    ].join('');
    arm.innerHTML = armMarkup();

    // ---- state -------------------------------------------------------------
    let disposed = false;
    let paused = ctx.isPaused();
    let width = 1;
    let height = 1;
    let lastLineIndex = null;
    let lastTextKey = '';
    // The last non-empty line shown; held on screen through blank stretches.
    let holdIndex = null;
    let diameterPx = 0;
    // Dominant colour of the current artwork, used by the diffuse halo. Null
    // until extracted (or when the artwork cannot be read), then the theme
    // accent is used instead.
    let coverColor = null;
    let coverUrlForColor = null;

    const settings = () => {
        // Values come from the mod's settings section (defaults merged by the
        // host); ctx.getSettings() is only a fallback for odd hosts.
        const v = settingsAccess ? settingsAccess.get() : (ctx.getSettings() || {});
        return {
            discSide: v.discSide === 'left' ? 'left' : 'right',
            discSize: num(v.discSize, 0.62),
            spinSeconds: num(v.spinSeconds, 20),
            labelRatio: num(v.labelRatio, 0.72),
            showSpindle: v.showSpindle !== false,
            showArm: v.showArm !== false,
            sheen: v.sheen !== false,
            halo: v.halo === 'off' || v.halo === 'theme' ? v.halo : 'cover',
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
        // Blank stretch (instrumental gap, song intro, the moment between
        // lines when the host reports -1): keep showing the last sung line
        // until the next real line arrives — the default on every player.
        // `holdIndex` remembers it across renders.
        let shown = index;
        while (shown >= 0 && !(ctx.lines[shown]?.fullText?.trim())) shown -= 1;
        if (shown >= 0) {
            holdIndex = shown;
        } else if (index < 0 && holdIndex !== null && holdIndex < ctx.lines.length) {
            shown = holdIndex;
        }
        const line = shown >= 0 ? ctx.lines[shown] : null;
        let nextAt = index < 0 ? 0 : index + 1;
        while (nextAt < ctx.lines.length && !(ctx.lines[nextAt]?.fullText?.trim())) nextAt += 1;
        const nextLine = s.showNext && nextAt < ctx.lines.length ? ctx.lines[nextAt] : null;

        const text = line?.fullText?.trim() || '';
        const translation = line?.translation?.trim() || '';
        const nextText = nextLine?.fullText?.trim() || '';

        // Re-animate only when the line really changed (the clock ticks far
        // more often than lines change). Keyed on the *shown* line so passing
        // through blank lines does not re-run the animation.
        const key = `${shown}|${text}|${translation}|${nextText}`;
        const changed = key !== lastTextKey;
        lastTextKey = key;

        lineEl.textContent = text;
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

        // Diameter: a fraction of the stage height, and never more than the
        // room the text leaves.
        let diameter = height * s.discSize;
        diameter = Math.min(diameter, width * 0.42);
        diameter = Math.max(64, Math.round(diameter));
        diameterPx = diameter;
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
        // The spindle is the small black dot sitting on the cover; off leaves
        // the artwork intact.
        spindle.style.display = s.showSpindle ? '' : 'none';
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
        arm.style.transform = !paused && s.showArm ? 'rotate(0deg)' : 'rotate(-50deg)';
        sheen.style.display = s.sheen ? '' : 'none';

        // Ground shadow stays neutral; the coloured part is the halo behind it.
        disc.style.boxShadow = '0 18px 60px rgba(0,0,0,0.45)';
        applyHalo(diameter);
    };

    // A wide, soft bloom in the artwork's own colour, behind the record — the
    // "diffuse projection" the album light casts on the page.
    const applyHalo = (diameter) => {
        const s = settings();
        if (s.halo === 'off' || !diameter) {
            halo.style.opacity = '0';
            return;
        }
        const fallback = hexOr(ctx.getTheme()?.accentColor, '#8a7cff');
        const color = s.halo === 'cover' && coverColor ? coverColor : fallback;
        const rgb = hexToRgb(color) || { r: 138, g: 124, b: 255 };
        const { r, g, b } = rgb;
        halo.style.background = 'radial-gradient(circle at 50% 50%, '
            + `rgba(${r},${g},${b},0.55) 0%, `
            + `rgba(${r},${g},${b},0.34) 36%, `
            + `rgba(${r},${g},${b},0.14) 54%, `
            + `rgba(${r},${g},${b},0) 68.4%)`;
        halo.style.filter = `blur(${Math.round(diameter * 0.09)}px)`;
        halo.style.opacity = '1';
    };

    const applyCover = () => {
        if (disposed) return;
        const cover = ctx.getCoverUrl();
        if (cover) {
            if (labelImg.getAttribute('src') !== cover) labelImg.setAttribute('src', cover);
            labelImg.style.display = '';
            labelFallback.style.display = 'none';

            // The halo follows the artwork's dominant colour; each cover is
            // extracted once and cached.
            if (coverUrlForColor !== cover) {
                coverUrlForColor = cover;
                coverColor = null;
                void dominantColor(cover).then((color) => {
                    if (disposed || coverUrlForColor !== cover) return;
                    coverColor = color;
                    applyHalo(diameterPx);
                });
            }
        } else {
            labelImg.removeAttribute('src');
            labelImg.style.display = 'none';
            labelFallback.style.display = '';
            coverUrlForColor = null;
            coverColor = null;
            const song = ctx.song;
            fallbackTitle.textContent = song?.title || '♪';
            fallbackArtist.textContent = song?.artist || '';
            applyHalo(diameterPx);
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

    // Setting changes do not come through ctx.onChange (they are the section's
    // values, not the visualizer's own), so listen on the section directly.
    const offSettings = settingsAccess?.onChange
        ? settingsAccess.onChange(() => refreshAll(false))
        : () => {};

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
        offSettings();
    };
}

const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

// ---------------------------------------------------------------------------
// Settings panel. Deliberately monochrome — the theme's own ink on the page —
// so it stays legible on light and dark themes alike. Edits are held in a
// local draft and only written through on 保存 (or restored with 恢复默认),
// because applying live would restart the disc animations on every change and
// read as flicker on the player page behind the panel.
// ---------------------------------------------------------------------------

function buildSettingsPanel(container, panelCtx, schema, bi) {
    const el = (tag, cls) => {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        return node;
    };
    const loc = (value) => {
        if (value == null) return '';
        if (typeof value === 'string') return value;
        const zh = panelCtx.locale?.startsWith('zh');
        return (zh ? value['zh-CN'] : value.en) ?? value['zh-CN'] ?? value.en ?? '';
    };

    let draft = { ...panelCtx.settings.get() };
    let savedTimer = null;
    const text = (zh, en) => loc(bi(zh, en));

    const render = () => {
        container.textContent = '';
        const theme = panelCtx.getTheme();
        const light = isLightBackground(theme);
        const fg = theme.primaryColor || (light ? '#1a1a1a' : '#f2f2f2');
        const dim = theme.secondaryColor || (light ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.55)');
        const border = light ? 'rgba(0,0,0,0.20)' : 'rgba(255,255,255,0.24)';
        const field = light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)';

        const style = el('style');
        style.textContent = [
            '.vinyl-set-row{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:7px 0;border-bottom:1px solid ' + border + ';}',
            '.vinyl-set-row:last-of-type{border-bottom:none;}',
            '.vinyl-set-name{font-size:12.5px;font-weight:600;color:' + fg + ';}',
            '.vinyl-set-desc{font-size:11px;color:' + dim + ';margin-top:2px;max-width:340px;}',
            '.vinyl-set-control{flex:0 0 auto;display:flex;align-items:center;}',
            '.vinyl-set-control input[type=number]{width:96px;box-sizing:border-box;padding:4px 7px;border-radius:7px;border:1px solid ' + border + ';background:' + field + ';color:' + fg + ';font:inherit;font-size:12px;outline:none;}',
            '.vinyl-set-control select{box-sizing:border-box;padding:4px 7px;border-radius:7px;border:1px solid ' + border + ';background:' + field + ';color:' + fg + ';font:inherit;font-size:12px;outline:none;}',
            '.vinyl-set-control input[type=checkbox]{width:17px;height:17px;accent-color:' + fg + ';}',
            '.vinyl-set-actions{display:flex;align-items:center;gap:8px;margin-top:11px;}',
            '.vinyl-btn{font:inherit;font-size:12.5px;font-weight:600;padding:5px 14px;border-radius:8px;cursor:pointer;transition:opacity .15s ease;}',
            '.vinyl-btn:active{opacity:0.72;}',
            '.vinyl-btn-primary{border:1px solid ' + fg + ';background:' + fg + ';color:' + (light ? '#ffffff' : '#101010') + ';}',
            '.vinyl-btn-ghost{border:1px solid ' + border + ';background:transparent;color:' + fg + ';}',
            '.vinyl-set-status{font-size:11.5px;color:' + dim + ';}',
        ].join('\n');
        container.appendChild(style);

        for (const def of schema) {
            const row = el('div', 'vinyl-set-row');
            const left = el('div');
            const name = el('div', 'vinyl-set-name');
            name.textContent = loc(def.label);
            left.appendChild(name);
            const desc = loc(def.description);
            if (desc) {
                const descEl = el('div', 'vinyl-set-desc');
                descEl.textContent = desc;
                left.appendChild(descEl);
            }
            const control = el('div', 'vinyl-set-control');

            if (def.type === 'boolean') {
                const input = el('input');
                input.type = 'checkbox';
                input.checked = draft[def.key] !== false;
                input.addEventListener('change', () => { draft[def.key] = input.checked; });
                control.appendChild(input);
            } else if (def.type === 'number') {
                const input = el('input');
                input.type = 'number';
                if (def.min !== undefined) input.min = String(def.min);
                if (def.max !== undefined) input.max = String(def.max);
                if (def.step !== undefined) input.step = String(def.step);
                input.value = String(num(draft[def.key], def.defaultValue));
                input.addEventListener('input', () => {
                    const value = Number(input.value);
                    if (Number.isFinite(value)) draft[def.key] = value;
                });
                control.appendChild(input);
            } else if (def.type === 'select') {
                const select = el('select');
                for (const option of def.options || []) {
                    const opt = el('option');
                    opt.value = option.value;
                    opt.textContent = loc(option.label);
                    if (draft[def.key] === option.value) opt.selected = true;
                    select.appendChild(opt);
                }
                select.addEventListener('change', () => { draft[def.key] = select.value; });
                control.appendChild(select);
            } else {
                continue;
            }

            row.append(left, control);
            container.appendChild(row);
        }

        const actions = el('div', 'vinyl-set-actions');
        const save = el('button', 'vinyl-btn vinyl-btn-primary');
        save.type = 'button';
        save.textContent = text('保存', 'Save');
        const reset = el('button', 'vinyl-btn vinyl-btn-ghost');
        reset.type = 'button';
        reset.textContent = text('恢复默认', 'Reset');
        const status = el('span', 'vinyl-set-status');

        save.addEventListener('click', () => {
            panelCtx.settings.set(draft);
            draft = { ...panelCtx.settings.get() };
            status.textContent = text('已保存 ✓', 'Saved ✓');
            clearTimeout(savedTimer);
            savedTimer = setTimeout(() => { status.textContent = ''; }, 1800);
        });
        reset.addEventListener('click', () => {
            panelCtx.settings.reset();
            draft = { ...panelCtx.settings.get() };
            render();
            status.textContent = text('已恢复默认', 'Defaults restored');
            clearTimeout(savedTimer);
            savedTimer = setTimeout(() => { status.textContent = ''; }, 1800);
        });

        actions.append(save, reset, status);
        container.appendChild(actions);
    };

    render();
    // Deliberately no re-render on theme change here: rebuilding the form
    // while the mods list scrolls reads as flicker in the panel. Colors are
    // picked up the next time the panel is opened.
    return () => {
        clearTimeout(savedTimer);
    };
}

const hexOr = (value, fallback) =>
    (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback);

const hexToRgb = (hex) => {
    if (typeof hex !== 'string') return null;
    const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
    if (!m) return null;
    const value = parseInt(m[1], 16);
    return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
};

// Relative luminance of the theme's page background: the scene's ink (the
// tonearm) flips with this so it stays visible on light and dark themes.
const isLightBackground = (theme) => {
    const rgb = hexToRgb(theme?.backgroundColor);
    if (!rgb) return false;
    return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255 > 0.6;
};

const rgbToHsl = (r, g, b) => {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
    return [h, s, l];
};

const hueToRgb = (p, q, t) => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
};

const hslToRgb = (h, s, l) => {
    if (s === 0) {
        const v = Math.round(l * 255);
        return [v, v, v];
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)]
        .map((v) => Math.round(v * 255));
};

const toHex = (r, g, b) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;

// One entry per cover URL, so switching back and forth costs nothing.
const COLOR_CACHE = new Map();

/**
 * Dominant colour of an image, as a `#rrggbb` string (or null).
 * A 24×24 downscale is sampled, each pixel weighted by saturation and by how
 * close its lightness is to mid-grey (a big white border or a black sleeve
 * should not wash the result out), then the average is pushed back into a
 * usable saturation/lightness for a glow.
 *
 * Reading the canvas can throw on a tainted canvas (a cross-origin cover
 * without CORS headers); that is expected and simply means "no colour".
 */
const dominantColor = (url) => new Promise((resolve) => {
    if (COLOR_CACHE.has(url)) {
        resolve(COLOR_CACHE.get(url));
        return;
    }
    let settled = false;
    const finish = (color) => {
        if (settled) return;
        settled = true;
        if (color) COLOR_CACHE.set(url, color);
        resolve(color);
    };

    const img = document.createElement('img');
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        try {
            const size = 24;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const g = canvas.getContext('2d', { willReadFrequently: true });
            g.drawImage(img, 0, 0, size, size);
            const { data } = g.getImageData(0, 0, size, size);

            let sum = 0;
            let r = 0;
            let gr = 0;
            let b = 0;
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] < 160) continue;
                const [, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
                const weight = (0.08 + s * s) * Math.max(0, 1 - Math.abs(l - 0.5) * 1.3);
                if (weight <= 0) continue;
                r += data[i] * weight;
                gr += data[i + 1] * weight;
                b += data[i + 2] * weight;
                sum += weight;
            }
            if (sum <= 0) {
                finish(null);
                return;
            }
            const [h, s, l] = rgbToHsl(r / sum, gr / sum, b / sum);
            const [rr, gg, bb] = hslToRgb(h, Math.min(0.85, Math.max(0.42, s * 1.2 + 0.08)), Math.min(0.62, Math.max(0.46, l)));
            finish(toHex(rr, gg, bb));
        } catch {
            finish(null);
        }
    };
    img.onerror = () => finish(null);
    // A cover that never loads must not leave the halo waiting forever.
    setTimeout(() => finish(null), 4000);
    img.src = url;
});

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
