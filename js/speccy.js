// Sdílená sada pro hry ve stylu ZX Spectrum (256x192, atributy 8x8, beeper, dotykové ovládání).
// Použití: Z.init({title, touch:[{act,label,cls}]}); Z.run({tick, draw}); kreslení přes Z.* (viz README.md).
(function (root) {
    'use strict';

    var Z = root.Z = root.Z || {};
    var W = 256, H = 192, CW = 32, CH = 24;
    Z.W = W; Z.H = H; Z.CW = CW; Z.CH = CH;

    // ---------- Barvy: 0..7 normální, 8..15 jasné (černá, modrá, červená, fialová, zelená, azurová, žlutá, bílá)
    Z.C = { BLACK: 0, BLUE: 1, RED: 2, MAGENTA: 3, GREEN: 4, CYAN: 5, YELLOW: 6, WHITE: 7 };
    Z.PAL = [
        [0, 0, 0], [0, 0, 215], [215, 0, 0], [215, 0, 215], [0, 215, 0], [0, 215, 215], [215, 215, 0], [215, 215, 215],
        [0, 0, 0], [0, 0, 255], [255, 0, 0], [255, 0, 255], [0, 255, 0], [0, 255, 255], [255, 255, 0], [255, 255, 255]
    ];

    // ---------- Obrazovka: bitmapa + atributy (attribute clash) a nad tím volitelná přímá vrstva (ov)
    var bits = new Uint8Array(W * H);
    var ink = new Uint8Array(CW * CH), paper = new Uint8Array(CW * CH), bright = new Uint8Array(CW * CH);
    var ov = new Uint8Array(W * H);          // 255 = průhledné, jinak barva 0..15 (bez attribute clash)
    Z.bits = bits; Z.ov = ov; Z.ink = ink; Z.paper = paper; Z.bright = bright;
    Z.border = 0;
    ov.fill(255);

    // Vymaže obrazovku (paper/ink 0..15; jasný paper = bright celé obrazovky)
    Z.cls = function (p, i) {
        bits.fill(0); ov.fill(255);
        ink.fill((i === undefined ? 7 : i) & 7);
        paper.fill((p || 0) & 7);
        bright.fill(((p || 0) & 8) || ((i === undefined ? 0 : i) & 8) ? 1 : 0);
    };

    // Nastaví atributy políček (cx,cy,w,h v buňkách 8x8)
    Z.attr = function (cx, cy, w, h, i, p) {
        for (var y = cy; y < cy + h; y++) {
            for (var x = cx; x < cx + w; x++) {
                if (x < 0 || y < 0 || x >= CW || y >= CH) { continue; }
                var k = y * CW + x;
                ink[k] = i & 7; paper[k] = (p === undefined ? paper[k] : p) & 7;
                bright[k] = ((i & 8) || ((p || 0) & 8)) ? 1 : 0;
            }
        }
    };

    // Bit do bitmapy; clash: přebarví INK buňky (jako na skutečném Spectru)
    Z.plot = function (x, y, col, clash) {
        x |= 0; y |= 0;
        if (x < 0 || y < 0 || x >= W || y >= H) { return; }
        bits[y * W + x] = 1;
        if (clash !== false) {
            var k = (y >> 3) * CW + (x >> 3);
            ink[k] = col & 7;
            if (col & 8) { bright[k] = 1; }
        }
    };

    Z.unplot = function (x, y) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < W && y < H) { bits[y * W + x] = 0; } };

    // Bitmapový obdélník (vyplněný bity) s přebarvením INK
    Z.fillBits = function (x, y, w, h, col, clash) {
        for (var yy = y; yy < y + h; yy++) { for (var xx = x; xx < x + w; xx++) { Z.plot(xx, yy, col, clash); } }
    };

    // Přímá vrstva (bez clash) – barva 0..15
    Z.pix = function (x, y, col) {
        x |= 0; y |= 0;
        if (x >= 0 && y >= 0 && x < W && y < H) { ov[y * W + x] = col; }
    };
    Z.rect = function (x, y, w, h, col) {
        x |= 0; y |= 0; w |= 0; h |= 0;
        for (var yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) {
            for (var xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) { ov[yy * W + xx] = col; }
        }
    };
    Z.frame = function (x, y, w, h, col) {
        Z.rect(x, y, w, 1, col); Z.rect(x, y + h - 1, w, 1, col); Z.rect(x, y, 1, h, col); Z.rect(x + w - 1, y, 1, h, col);
    };
    Z.line = function (x0, y0, x1, y1, col) {
        x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
        var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy;
        for (var n = 0; n < 1000; n++) {
            Z.pix(x0, y0, col);
            if (x0 === x1 && y0 === y1) { break; }
            var e2 = 2 * e;
            if (e2 >= dy) { e += dy; x0 += sx; }
            if (e2 <= dx) { e += dx; y0 += sy; }
        }
    };
    Z.disc = function (cx, cy, r, col) {
        for (var y = -r; y <= r; y++) { for (var x = -r; x <= r; x++) { if (x * x + y * y <= r * r + r * 0.8) { Z.pix(cx + x, cy + y, col); } } }
    };
    Z.ring = function (cx, cy, r, col) {
        for (var a = 0; a < 6.2832; a += 1 / Math.max(r, 1)) { Z.pix(cx + Math.cos(a) * r, cy + Math.sin(a) * r, col); }
    };

    // Sprite: pole řetězců, 'X' = bod. Clash varianta (bitmapa + INK buňky).
    Z.sprite = function (x, y, rows, col, flip) {
        var w = rows[0].length;
        for (var r = 0; r < rows.length; r++) {
            for (var c = 0; c < w; c++) {
                if (rows[r].charAt(flip ? w - 1 - c : c) === 'X') { Z.plot(x + c, y + r, col); }
            }
        }
    };
    // Barevný sprite do přímé vrstvy: pal mapuje znak -> barva 0..15 (např. {'r':2,'y':14}); '.' a ' ' průhledné
    Z.spriteC = function (x, y, rows, pal, flip) {
        var w = rows[0].length;
        for (var r = 0; r < rows.length; r++) {
            for (var c = 0; c < w; c++) {
                var ch = rows[r].charAt(flip ? w - 1 - c : c);
                var col = pal[ch];
                if (col !== undefined) { Z.pix(x + c, y + r, col); }
            }
        }
    };
    // Přeškálovaný sprite (celočíselně)
    Z.spriteCS = function (x, y, rows, pal, k, flip) {
        var w = rows[0].length;
        for (var r = 0; r < rows.length; r++) {
            for (var c = 0; c < w; c++) {
                var col = pal[rows[r].charAt(flip ? w - 1 - c : c)];
                if (col !== undefined) { Z.rect(x + c * k, y + r * k, k, k, col); }
            }
        }
    };

    // ---------- Písmo 5x7 (velká písmena, číslice, česká diakritika)
    var G = {
        'A': [0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11], 'B': [0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E],
        'C': [0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E], 'D': [0x1E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1E],
        'E': [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F], 'F': [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10],
        'G': [0x0E, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0F], 'H': [0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
        'I': [0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E], 'J': [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0C],
        'K': [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11], 'L': [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F],
        'M': [0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11], 'N': [0x11, 0x11, 0x19, 0x15, 0x13, 0x11, 0x11],
        'O': [0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E], 'P': [0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10],
        'Q': [0x0E, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0D], 'R': [0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11],
        'S': [0x0F, 0x10, 0x10, 0x0E, 0x01, 0x01, 0x1E], 'T': [0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
        'U': [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E], 'V': [0x11, 0x11, 0x11, 0x11, 0x11, 0x0A, 0x04],
        'W': [0x11, 0x11, 0x11, 0x15, 0x15, 0x15, 0x0A], 'X': [0x11, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x11],
        'Y': [0x11, 0x11, 0x11, 0x0A, 0x04, 0x04, 0x04], 'Z': [0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1F],
        '0': [0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E], '1': [0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E],
        '2': [0x0E, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1F], '3': [0x1F, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0E],
        '4': [0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02], '5': [0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E],
        '6': [0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E], '7': [0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
        '8': [0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E], '9': [0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C],
        '.': [0, 0, 0, 0, 0, 0x0C, 0x0C], ',': [0, 0, 0, 0, 0x0C, 0x04, 0x08],
        ':': [0, 0x0C, 0x0C, 0, 0x0C, 0x0C, 0], '!': [0x04, 0x04, 0x04, 0x04, 0x04, 0, 0x04],
        '?': [0x0E, 0x11, 0x01, 0x02, 0x04, 0, 0x04], '-': [0, 0, 0, 0x1F, 0, 0, 0],
        '+': [0, 0x04, 0x04, 0x1F, 0x04, 0x04, 0], '/': [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
        '(': [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02], ')': [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
        '\'': [0x04, 0x04, 0x08, 0, 0, 0, 0], '=': [0, 0, 0x1F, 0, 0x1F, 0, 0],
        '<': [0x02, 0x04, 0x08, 0x10, 0x08, 0x04, 0x02], '>': [0x08, 0x04, 0x02, 0x01, 0x02, 0x04, 0x08],
        '*': [0, 0x0A, 0x04, 0x1F, 0x04, 0x0A, 0], ' ': [0, 0, 0, 0, 0, 0, 0]
    };

    var ACCENT = {
        '́': [[3, 1], [4, 0]],
        '̌': [[1, 0], [3, 0], [2, 1]],
        '̊': [[2, 0], [3, 0], [2, 1], [3, 1]]
    };
    Z.CHAR_W = 6;

    // Text do přímé vrstvy (barva 0..15), align: 'left' | 'center' | 'right'; vrací šířku
    Z.text = function (x, y, str, col, opt) {
        opt = opt || {};
        var k = opt.scale || 1;
        var s = String(str).toUpperCase().normalize('NFD');
        var w = Z.textW(str, k);
        var cx = x - (opt.align === 'center' ? w / 2 : opt.align === 'right' ? w : 0);
        cx = Math.round(cx);
        var baseX = null;
        for (var i = 0; i < s.length; i++) {
            var ch = s.charAt(i);
            if (ACCENT[ch]) {
                if (baseX !== null) {
                    ACCENT[ch].forEach(function (p) { Z.rect(baseX + p[0] * k, y + p[1] * k, k, k, col); });
                }
                continue;
            }
            var g = G[ch] || G['?'];
            if (opt.paper !== undefined) { Z.rect(cx, y + 2 * k, 6 * k, 7 * k, opt.paper); }
            for (var r = 0; r < 7; r++) {
                for (var c = 0; c < 5; c++) {
                    if (g[r] & (0x10 >> c)) { Z.rect(cx + c * k, y + (r + 2) * k, k, k, col); }
                }
            }
            baseX = cx;
            cx += 6 * k;
        }
        return w;
    };
    Z.textW = function (str, k) {
        return String(str).normalize('NFD').replace(/[̀-ͯ]/g, '').length * 6 * (k || 1);
    };
    // Text s INK atributy (attribute clash styl): sloučí bitmapu a přebarví buňky
    Z.textA = function (x, y, str, col, opt) {
        opt = opt || {};
        var k = opt.scale || 1;
        var s = String(str).toUpperCase().normalize('NFD');
        var w = Z.textW(str, k);
        var cx = Math.round(x - (opt.align === 'center' ? w / 2 : opt.align === 'right' ? w : 0)), baseX = null;
        for (var i = 0; i < s.length; i++) {
            var ch = s.charAt(i);
            if (ACCENT[ch]) {
                if (baseX !== null) { ACCENT[ch].forEach(function (p) { Z.fillBits(baseX + p[0] * k, y + p[1] * k, k, k, col); }); }
                continue;
            }
            var g = G[ch] || G['?'];
            for (var r = 0; r < 7; r++) { for (var c = 0; c < 5; c++) { if (g[r] & (0x10 >> c)) { Z.fillBits(cx + c * k, y + (r + 2) * k, k, k, col); } } }
            baseX = cx; cx += 6 * k;
        }
        return w;
    };

    // ---------- Vykreslení do RGBA (pro canvas i pro testy)
    var rgba = new Uint8ClampedArray(W * H * 4);
    Z.toRGBA = function () {
        for (var y = 0; y < H; y++) {
            var crow = (y >> 3) * CW;
            for (var x = 0; x < W; x++) {
                var i = y * W + x, o = ov[i], ci = crow + (x >> 3), col;
                if (o !== 255) { col = Z.PAL[o]; }
                else {
                    var b = bright[ci] ? 8 : 0;
                    col = Z.PAL[(bits[i] ? ink[ci] : paper[ci]) + b];
                }
                var q = i * 4;
                rgba[q] = col[0]; rgba[q + 1] = col[1]; rgba[q + 2] = col[2]; rgba[q + 3] = 255;
            }
        }
        return rgba;
    };

    // ---------- Zvuk (beeper: čtvercová vlna přes WebAudio)
    var ac = null, muted = false;
    try {
        var AC = root.AudioContext || root.webkitAudioContext;
        if (AC) { ac = new AC(); }
    } catch (e) { ac = null; }

    Z.snd = {
        unlock: function () { if (ac && ac.state === 'suspended') { try { ac.resume(); } catch (e) { /* ignorovat */ } } },
        // freq Hz, dur s, slideTo Hz (volitelně), vol, delay s, type
        beep: function (freq, dur, slideTo, vol, delay, type) {
            if (!ac || muted) { return; }
            try {
                var t0 = ac.currentTime + (delay || 0);
                var o = ac.createOscillator(), g = ac.createGain();
                o.type = type || 'square';
                o.frequency.setValueAtTime(freq, t0);
                if (slideTo) { o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur); }
                g.gain.setValueAtTime(vol || 0.04, t0);
                g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
                o.connect(g); g.connect(ac.destination);
                o.start(t0); o.stop(t0 + dur + 0.02);
            } catch (e) { /* ignorovat */ }
        },
        // Šum (výbuchy): dur s, vol
        noise: function (dur, vol, delay) {
            if (!ac || muted) { return; }
            try {
                var t0 = ac.currentTime + (delay || 0), n = Math.floor(ac.sampleRate * dur);
                var buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
                for (var i = 0; i < n; i++) { d[i] = (Math.random() * 2 - 1) * (1 - i / n); }
                var s = ac.createBufferSource(), g = ac.createGain();
                s.buffer = buf; g.gain.value = vol || 0.05;
                s.connect(g); g.connect(ac.destination); s.start(t0);
            } catch (e) { /* ignorovat */ }
        },
        // Sekvence not [Hz...] po step sekundách (0 = pauza)
        seq: function (notes, step, vol) {
            notes.forEach(function (f, i) { if (f) { Z.snd.beep(f, step * 0.9, 0, vol || 0.04, i * step); } });
        },
        toggleMute: function () { muted = !muted; return muted; },
        isMuted: function () { return muted; },
        // Typické efekty
        jump: function () { Z.snd.beep(220, 0.16, 660, 0.035); },
        coin: function () { Z.snd.beep(880, 0.06, 0, 0.05); Z.snd.beep(1320, 0.09, 0, 0.05, 0.06); },
        hit: function () { Z.snd.beep(300, 0.12, 80, 0.05); },
        shoot: function () { Z.snd.beep(1200, 0.07, 300, 0.03); },
        boom: function () { Z.snd.noise(0.35, 0.06); },
        die: function () { Z.snd.beep(660, 0.7, 50, 0.05); },
        win: function () { Z.snd.seq([523, 659, 784, 659, 784, 1047], 0.12); },
        over: function () { Z.snd.seq([392, 330, 262, 196], 0.22); },
        tick: function () { Z.snd.beep(1800, 0.02, 0, 0.02); }
    };

    // ---------- Vstup: akce left/right/up/down/fire/alt (+ pause, mute řeší jádro)
    var KEYMAP = {
        left: [37, 65], right: [39, 68], up: [38, 87], down: [40, 83],
        fire: [32, 13, 90], alt: [88, 86, 67], pause: [80, 10252], mute: [77]
    };
    Z.keymap = KEYMAP;
    var held = {}, hits = {}, byCode = {};

    function rebuild() {
        byCode = {};
        Object.keys(KEYMAP).forEach(function (a) { KEYMAP[a].forEach(function (c) { byCode[c] = a; }); });
    }
    rebuild();
    Z.rebuildKeys = rebuild;

    Z.input = {
        down: function (a) { return !!held[a]; },
        hit: function (a) { return !!hits[a]; },          // stisknuto od posledního ticku
        any: function () { return Object.keys(held).some(function (k) { return held[k]; }); },
        press: function (a) { if (!held[a]) { hits[a] = true; } held[a] = true; },
        release: function (a) { held[a] = false; },
        clear: function () { held = {}; hits = {}; },
        // pomocné pro testy: simulace kláves podle kódu
        keyDown: function (code) { var a = byCode[code]; if (a) { Z.input.press(a); } return a; },
        keyUp: function (code) { var a = byCode[code]; if (a) { Z.input.release(a); } return a; }
    };

    // ---------- Úložiště
    Z.hi = {
        get: function (key) { try { return parseInt(root.localStorage.getItem('zx.' + key), 10) || 0; } catch (e) { return 0; } },
        set: function (key, v) { try { root.localStorage.setItem('zx.' + key, String(v)); } catch (e) { /* ignorovat */ } },
        // zapíše, jen když je lepší; vrací nový rekord
        submit: function (key, v) { var o = Z.hi.get(key); if (v > o) { Z.hi.set(key, v); return v; } return o; }
    };

    // ---------- Pomůcky
    Z.rng = function (seed) {
        var a = seed >>> 0 || 1;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            var t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };
    Z.hit = function (ax, ay, aw, ah, bx, by, bw, bh) { return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah; };
    Z.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
    Z.pad = function (n, len) { var s = String(n); while (s.length < len) { s = '0' + s; } return s; };

    // ---------- Inicializace a smyčka
    var canvas = null, ctx = null, imageData = null, game = null, paused = false;
    Z.paused = function () { return paused; };
    Z.pauseOk = false;        // hra nastaví true, když má pauza smysl (probíhá hra)
    Z.tickCount = 0;

    function fit() {
        if (!canvas || !root.innerWidth) { return; }
        var tb = root.document.getElementById('touch');
        var touchH = tb && tb.offsetHeight ? tb.offsetHeight : 0;
        var k = Math.max(1, Math.floor(Math.min(root.innerWidth / W, (root.innerHeight - touchH - 8) / H)));
        canvas.style.width = (W * k) + 'px';
        canvas.style.height = (H * k) + 'px';
    }

    Z.init = function (opt) {
        opt = opt || {};
        var doc = root.document;
        if (opt.title) { doc.title = opt.title; }
        canvas = doc.getElementById('screen');
        ctx = canvas.getContext('2d');
        var tb = doc.getElementById('touch');
        if (tb && opt.touch) {
            tb.innerHTML = '';
            opt.touch.forEach(function (b) {
                var el = doc.createElement('button');
                el.textContent = b.label;
                el.setAttribute('data-act', b.act);
                if (b.cls) { el.className = b.cls; }
                var on = function (e) { e.preventDefault(); Z.snd.unlock(); Z.input.press(b.act); };
                var off = function (e) { e.preventDefault(); Z.input.release(b.act); };
                el.addEventListener('pointerdown', on);
                el.addEventListener('pointerup', off);
                el.addEventListener('pointercancel', off);
                el.addEventListener('pointerleave', off);
                tb.appendChild(el);
            });
        }
        doc.addEventListener('keydown', function (e) {
            var a = byCode[e.keyCode];
            if (!a) { return; }
            e.preventDefault();
            Z.snd.unlock();
            if (!e.repeat) { Z.input.press(a); }
        });
        doc.addEventListener('keyup', function (e) {
            var a = byCode[e.keyCode];
            if (a) { e.preventDefault(); Z.input.release(a); }
        });
        doc.addEventListener('visibilitychange', function () { if (doc.hidden && Z.pauseOk) { paused = true; } });
        root.addEventListener('resize', fit);
        fit();
    };

    var acc = 0, last = 0, STEP = 1000 / 50;

    function stepOnce() {
        if (Z.input.hit('mute')) { Z.snd.toggleMute(); }
        if (Z.input.hit('pause') && Z.pauseOk) { paused = !paused; }
        if (!paused) { game.tick(); Z.tickCount++; }
        hits = {};
        game.draw();
        if (paused) {
            Z.rect(76, 84, 104, 24, 0); Z.frame(76, 84, 104, 24, 15);
            Z.text(128, 92, 'PAUZA', 14, { align: 'center' });
        }
    }
    Z.stepOnce = function () { stepOnce(); };       // pro testy

    function blit() {
        if (!ctx) { return; }
        if (!imageData) { imageData = ctx.createImageData(W, H); }
        imageData.data.set(Z.toRGBA());
        ctx.putImageData(imageData, 0, 0);
        var p = Z.PAL[Z.border];
        root.document.body.style.background = 'rgb(' + p[0] + ',' + p[1] + ',' + p[2] + ')';
    }

    // game = { tick(), draw() } – tick běží 50x za sekundu
    Z.run = function (g) {
        game = g;
        function loop(ts) {
            acc += Math.min(100, ts - last);
            last = ts;
            while (acc >= STEP) { acc -= STEP; stepOnce(); }
            blit();
            root.requestAnimationFrame(loop);
        }
        root.requestAnimationFrame(function (ts) { last = ts; loop(ts); });
    };
    Z.setGame = function (g) { game = g; };
})(typeof window !== 'undefined' ? window : globalThis);
