// Stíhač nad oceánem – vertikální letecká střílečka ve stylu ZX Spectrum (inspirace: 1942, Capcom).
(function () {
    'use strict';
    var W = 256, H = 192;
    var SCROLL = 0.6;                 // rychlost posunu moře (px/tick)
    var LEVELS = 10;
    var HI_KEY = 'stihac';

    var LEVEL_NAMES = ['TICHÝ OCEÁN', 'KORÁLOVÉ OSTROVY', 'MLŽNÉ PRŮLIVY', 'LOVCI NAD VLNAMI', 'POLEDNÍ BOUŘE',
        'OCELOVÁ FLOTILA', 'NOČNÍ KONVOJ', 'OHNIVÉ SOUOSTROVÍ', 'OKO HURIKÁNU', 'POSLEDNÍ BASTION'];
    var SEA_PAPER = [1, 1, 5, 1, 1, 1, 0, 1, 0, 1];
    var BOSS_COL = [2, 3, 6, 5, 4, 2, 3, 6, 5, 2];

    // ---------- Sprity (půlky se zrcadlí; poslední znak půlky = střed)
    function mirror(half) {
        return half.map(function (r) { return r + r.slice(0, -1).split('').reverse().join(''); });
    }
    function vflip(rows) { return rows.slice().reverse(); }

    var SP_PLAYER = mirror([
        '.......y', '.......w', '.......w', '......bw', '.....bbw', '.b...bbw', 'bbb.bbbw', 'bbbbbbbw',
        'bbbbbbcw', '.....bbw', '......bw', '.....bbw', '....bbbw']);
    var SP_HELP = mirror(['...y', '..bw', 'bbbw', '.bbw', '..bw']);
    var SP_SMALL = mirror(['....gg', 'g...gw', 'gggggw', '.ggggw', '...ggw', '....gw', '.....y']);
    var SP_MED = mirror([
        '......rrr', '.....rrrw', 'rr...rrrw', 'rrr.rrrrw', 'rrrrrrrrw', '.rrrrrrrw', '..rr.rrrw', '.....rrrw',
        '......rrw', '.......ry']);
    var SP_BOSS = mirror([
        '............w', '..........rrw', '........rrrrw', '...r....rrrrw', '..rrr..rrrrww', '.rrrrrrrrrrrw',
        'rrrrrwrrrrrrw', 'rrrrrrrrrccrw', 'rrwrrrrrrccrw', '.rrrrrrrrrrrw', '..rr.rrrrrrrw', '...r..rrrrrrw',
        '......rrrrrrw', '.......rrrrww', '........rrryw', '.........rryw']);
    var SP_SMALL_V = vflip(SP_SMALL), SP_MED_V = vflip(SP_MED);

    var SP_SHIP = (function () {
        var r = ['....a....', '...aaa...', '..aaaaa..', '.aaaaaaa.'];
        for (var i = 0; i < 16; i++) {
            if (i === 3 || i === 12) { r.push('.adTTTda.'); }
            else if (i === 7 || i === 8) { r.push('.awwwwwa.'); }
            else { r.push('.addddda.'); }
        }
        r.push('.aaaaaaa.', '..aaaaa..');
        return r.map(function (s) { return s.length === 9 ? s : (s + '.........').slice(0, 9); });
    })();
    var PAL_SHIP = { a: 7, d: 8, T: 2, w: 15 };
    var PAL_PLAYER = { b: 7, w: 14, c: 9, y: 10 };
    var PAL_HELP = { b: 7, w: 14, y: 10 };

    function flashPal(p) { var o = {}; for (var k in p) { o[k] = 15; } return o; }
    var FLASH_PLAYER = flashPal(PAL_PLAYER);

    // ---------- Stav
    var st = { mode: 'title', t: 0, scroll: 0 };
    var GAME = window.GAME = { st: st, W: W, H: H, LEVELS: LEVELS, makeLevel: null };
    var rnd = Z.rng(Date.now() & 0xffffff);
    var P, enemies, pb, eb, pickups, expl, islands, ev, evIdx;

    function hs(a, b) {
        var h = (a * 374761393 + b * 668265263) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return (h ^ (h >>> 16)) >>> 0;
    }
    function ri(n) { return (rnd() * n) | 0; }
    function pad6(n) { return Z.pad(n, 6); }

    // ---------- Úrovně: seznam událostí podle čísla úrovně
    function makeLevel(L) {
        var r = Z.rng(L * 7919 + 13), list = [], t = 70, nW = 8 + L, gap = Math.max(110, 190 - 7 * L);
        var pool = ['line', 'vee', 'sine'];
        if (L >= 2) { pool.push('side'); }
        if (L >= 3) { pool.push('loop', 'medium'); }
        if (L >= 4) { pool.push('dive'); }
        if (L >= 6) { pool.push('loop', 'dive', 'medium'); }
        for (var i = 0; i < nW; i++) {
            var k = (i === 1 || i % 4 === 3) ? 'carrier' : pool[(r() * pool.length) | 0];
            list.push({ t: t, k: k, x: 50 + ((r() * 156) | 0), n: 3 + ((r() * 2) | 0) + (L > 5 ? 1 : 0), dir: r() < 0.5 ? -1 : 1 });
            if (i % 2 === 0) { list.push({ t: t + ((gap / 2) | 0), k: 'ship', x: 30 + ((r() * 196) | 0), n: 1, dir: 1 }); }
            t += (gap * (0.8 + r() * 0.5)) | 0;
        }
        list.sort(function (a, b) { return a.t - b.t; });
        return { list: list, end: t };
    }
    GAME.makeLevel = makeLevel;

    // ---------- Nová hra / úroveň
    function newGame() {
        st.score = 0; st.lives = 3; st.level = 1; st.nextLife = 20000; st.win = false;
        P = { x: 128, y: 160, cd: 0, gun: 1, helpers: 0, shield: 0, roll: 0, rolls: 3, invul: 120, alive: true, sfx: 0 };
        GAME.P = P;
        startLevel(1);
        st.mode = 'play';
    }
    function startLevel(L) {
        st.level = L; st.lt = 0; st.intro = 140; st.boss = null; st.bossState = 0; st.warn = 0;
        var lv = makeLevel(L); ev = lv.list; evIdx = 0; st.lvEnd = lv.end;
        enemies = []; pb = []; eb = []; pickups = []; expl = []; islands = [];
        st.islandCd = 20; st.group = 0; st.clearT = 0;
        P.rolls = Math.max(P.rolls, 3); P.invul = Math.max(P.invul, 60);
        GAME.enemies = enemies; GAME.eb = eb; GAME.pickups = pickups; GAME.pb = pb;
    }

    // ---------- Nepřátelé
    function addF(x, y, o) {
        var L = st.level;
        var e = { kind: 'f', x: x, y: y, w: 11, h: 7, hp: 1, mode: 'line', age: 0, delay: 0, vx: 0, vy: 1.0 + 0.05 * L,
            pal: { g: 12, w: 15, y: 14 }, sc: 100, fireAt: -1, flash: 0, pow: 0, grp: 0, x0: x, A: 0, ph: 0 };
        for (var k in o) { e[k] = o[k]; }
        if (e.fireAt === -1 && rnd() < 0.4 + 0.06 * L) { e.fireAt = 30 + ri(60); }
        return enemies.push(e), e;
    }
    function spawn(d) {
        var L = st.level, i, n = d.n, x = d.x, e;
        switch (d.k) {
        case 'line':
            for (i = 0; i < n; i++) { addF(Z.clamp(x - (n - 1) * 11, 14, 242 - (n - 1) * 22) + i * 22, -8, {}); }
            break;
        case 'vee':
            for (i = 0; i < 5; i++) { addF(Z.clamp(x, 60, 196) + (i - 2) * 22, -8 - Math.abs(i - 2) * 14, { pal: { g: 14, w: 15, y: 10 } }); }
            break;
        case 'sine':
            for (i = 0; i < n + 1; i++) {
                addF(Z.clamp(x, 70, 186), -10, { mode: 'sine', delay: i * 14, A: 56, ph: 0, vy: 0.9 + 0.04 * L, pal: { g: 13, w: 15, y: 14 } });
            }
            break;
        case 'side':
            for (i = 0; i < n; i++) {
                addF(d.dir > 0 ? -12 : 268, 20 + (d.x % 40), { mode: 'diag', delay: i * 16, vx: 1.3 * d.dir, vy: 0.5 + 0.03 * L, pal: { g: 11, w: 15, y: 14 } });
            }
            break;
        case 'loop':
            for (i = 0; i < n; i++) {
                addF(Z.clamp(x, 70, 186), -10, { mode: 'loop', delay: i * 18, hd: Math.PI / 2, ly: 60 + (d.x % 30), dir: d.dir, stage: 0, lt: 0,
                    sp: 1.5 + 0.04 * L, hp: L >= 7 ? 2 : 1, pal: { g: 5, w: 15, y: 14 } });
            }
            break;
        case 'dive':
            for (i = 0; i < 3; i++) {
                addF(Z.clamp(x, 30, 226) + (i - 1) * 26, -8, { mode: 'dive', delay: i * 10, hp: L >= 7 ? 2 : 1, pal: { g: 3, w: 15, y: 14 } });
            }
            break;
        case 'carrier':
            st.group++;
            for (i = 0; i < 5; i++) {
                addF(Z.clamp(x, 60, 196) + (i - 2) * 20, -8 - Math.abs(i - 2) * 12, { pow: 1, grp: st.group, sc: 150, vy: 0.85, pal: { g: 10, w: 15, y: 14 }, fireAt: -2 });
            }
            break;
        case 'medium':
            for (i = 0; i < (L >= 6 ? 2 : 1); i++) {
                addF(L >= 6 ? 80 + i * 96 : Z.clamp(x, 40, 216), -14, { kind: 'm', w: 17, h: 10, hp: 6 + L, mode: 'hover', hy: 26 + i * 12 + (d.x % 20), sc: 400, vy: 0.7, fireAt: -2, fcd: 60, pal: { r: 2, w: 15, y: 14 } });
            }
            break;
        case 'ship':
            enemies.push({ kind: 's', x: d.x, y: -26, w: 9, h: 22, hp: 5, mode: 'ship', age: 0, delay: 0, vx: 0, vy: SCROLL, sc: 300, flash: 0, fcd: 80 + ri(80), pal: PAL_SHIP, fireAt: -2, grp: 0, pow: 0 });
            break;
        }
    }
    function spawnBoss() {
        var L = st.level;
        var b = { kind: 'B', x: 128, y: -30, w: 50, h: 32, hp: 55 + 14 * L, mhp: 55 + 14 * L, mode: 'boss', age: 0, delay: 0, vx: 0, vy: 0.9, sc: 0,
            flash: 0, fireAt: -2, fcd: 80, rcd: 150, ccd: 40, pal: { r: BOSS_COL[L - 1], w: 15, c: 11, y: 14 }, grp: 0, pow: 0, x0: 128 };
        b.sc = 3000 + 1000 * L;
        enemies.push(b); st.boss = b; st.bossState = 1;
    }
    function ebullet(x, y, tx, ty, sp, kind) {
        var dx = tx - x, dy = ty - y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        eb.push({ x: x, y: y, vx: dx / d * sp, vy: dy / d * sp, k: kind || 0 });
    }
    function ebAng(x, y, a, sp) { eb.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, k: 1 }); }
    function bspeed() { return 0.9 + 0.07 * st.level; }

    function updEnemy(e) {
        var L = st.level;
        if (e.delay > 0) { e.delay--; return; }
        e.age++;
        if (e.flash > 0) { e.flash--; }
        var tx = P.x, ty = P.y;
        switch (e.mode) {
        case 'line': e.y += e.vy; e.x += e.vx; break;
        case 'sine': e.y += e.vy; e.x = e.x0 + e.A * Math.sin(e.age * 0.05 + e.ph); break;
        case 'diag': e.x += e.vx; e.y += e.vy; break;
        case 'loop':
            e.x += Math.cos(e.hd) * e.sp; e.y += Math.sin(e.hd) * e.sp;
            if (e.stage === 0 && e.y > e.ly) { e.stage = 1; }
            else if (e.stage === 1) { e.hd += 0.05 * e.dir; e.lt++; if (e.lt > 125) { e.stage = 2; e.hd = Math.PI / 2; } }
            break;
        case 'dive':
            if (e.age < 30) { e.y += 0.7; }
            else {
                if (e.age === 30) { var dx = tx - e.x, dy = ty - e.y, d = Math.sqrt(dx * dx + dy * dy) || 1; e.vx = dx / d * 2.0; e.vy = dy / d * 2.0; if (e.vy < 0.8) { e.vy = 0.8; } }
                e.x += e.vx; e.y += e.vy;
            }
            break;
        case 'hover':
            if (e.age < 600) {
                if (e.y < e.hy) { e.y += e.vy; } else { e.x += Math.sin(e.age * 0.02) * 0.6; }
                e.fcd--;
                if (e.fcd <= 0 && e.y > 0) {
                    e.fcd = Math.max(40, 90 - 4 * L);
                    var a = Math.atan2(ty - e.y, tx - e.x);
                    for (var j = -1; j <= 1; j++) { ebAng(e.x, e.y + 6, a + j * 0.2, bspeed() * 1.1); }
                }
            } else { e.y += 0.9; }
            break;
        case 'ship':
            e.y += e.vy;
            e.fcd--;
            if (e.fcd <= 0 && e.y > 5 && e.y < 140) { e.fcd = Math.max(70, 160 - 8 * L); ebullet(e.x, e.y, tx, ty, bspeed() * 0.9); }
            break;
        case 'boss': updBoss(e); break;
        }
        // palba stíhaček
        if (e.kind === 'f' && e.fireAt >= 0 && e.age >= e.fireAt && e.y > 4 && e.y < 150) {
            ebullet(e.x, e.y + 4, tx, ty, bspeed());
            e.fireAt = (L >= 5 && rnd() < 0.4) ? e.age + 45 : -1;
        }
    }
    function updBoss(b) {
        var L = st.level;
        if (b.hp <= 0) { return; }
        if (b.age < 90) { b.y += b.vy; if (b.y > 42) { b.y = 42; } }
        else {
            b.x = 128 + 70 * Math.sin((b.age - 90) * 0.012 * (1 + L * 0.06));
            b.y = 42 + 8 * Math.sin(b.age * 0.03);
        }
        if (b.age < 70) { return; }
        b.fcd--; b.rcd--; b.ccd--;
        var sp = bspeed();
        if (b.fcd <= 0) {
            b.fcd = Math.max(45, 90 - 4 * L);
            var n = L >= 5 ? 5 : 3, a = Math.atan2(P.y - (b.y + 14), P.x - b.x);
            for (var j = 0; j < n; j++) { ebAng(b.x, b.y + 14, a + (j - (n - 1) / 2) * 0.22, sp * 1.1); }
        }
        if (b.rcd <= 0) {
            b.rcd = Math.max(110, 200 - 6 * L);
            var m = 10 + L, off = rnd() * 6.28;
            for (var q = 0; q < m; q++) { ebAng(b.x, b.y + 4, off + q * 6.2832 / m, sp * 0.75); }
        }
        if (L >= 3 && b.ccd <= 0) {
            b.ccd = Math.max(26, 46 - 2 * L);
            eb.push({ x: b.x - 20, y: b.y + 14, vx: 0, vy: sp * 1.5, k: 1 });
            eb.push({ x: b.x + 20, y: b.y + 14, vx: 0, vy: sp * 1.5, k: 1 });
        }
    }

    // ---------- Pozadí (ostrovy)
    function addIsland() {
        var cx = 20 + ri(216), discs = [], n = 3 + ri(5), i;
        for (i = 0; i < n; i++) { discs.push({ x: (rnd() - 0.5) * 50, y: (rnd() - 0.5) * 30, r: 8 + ri(14) }); }
        var minY = 0, maxY = 0;
        discs.forEach(function (d) { minY = Math.min(minY, d.y - d.r); maxY = Math.max(maxY, d.y + d.r); });
        islands.push({ x: cx, y: -maxY - 6, discs: discs, ext: maxY - minY + 6, maxY: maxY, trees: ri(4) + 2 });
    }
    function updBg() {
        st.scroll += SCROLL;
        if (st.mode === 'title') { return; }
        if (islands) {
            st.islandCd--;
            if (st.islandCd <= 0) { addIsland(); st.islandCd = 110 + ri(160); }
            for (var i = islands.length - 1; i >= 0; i--) {
                islands[i].y += SCROLL;
                if (islands[i].y - islands[i].maxY - 6 > H) { islands.splice(i, 1); }
            }
        }
    }

    // ---------- Pomocné efekty
    function boom(x, y, big) { expl.push({ x: x, y: y, age: 0, big: big ? 1 : 0 }); }
    function addScore(n) {
        st.score += n;
        if (st.score >= st.nextLife) { st.lives++; st.nextLife += st.nextLife < 40000 ? 40000 : 60000; Z.snd.win(); }
    }
    function dropPickup(x, y, forced) {
        var w = [], t;
        if (P.gun < 3) { w.push('D', 'D', 'D'); }
        if (P.helpers < 2) { w.push('H', 'H'); }
        w.push('S', 'S');
        if (rnd() < 0.08) { w.push('1'); }
        t = forced || w[ri(w.length)];
        pickups.push({ x: x, y: y, t: t, age: 0 });
    }
    function killEnemy(e) {
        addScore(e.sc);
        Z.snd.boom();
        boom(e.x, e.y, e.kind !== 'f');
        if (e.pow) {
            var left = enemies.filter(function (o) { return o !== e && o.grp === e.grp && o.hp > 0; }).length;
            if (left === 0) { dropPickup(e.x, e.y); addScore(1000); }
        } else if (e.kind === 'm') { if (rnd() < 0.6) { dropPickup(e.x, e.y); } }
        else if (e.kind === 's') { if (rnd() < 0.25) { dropPickup(e.x, e.y); } }
        e.hp = 0;
    }

    // ---------- Hráč
    function hurtPlayer() {
        if (st.mode !== 'play' || P.roll > 0 || P.invul > 0 || P.shield > 0) { return; }
        if (GAME.god) { return; }
        P.alive = false; st.mode = 'dying'; st.dt = 90;
        st.lives--;
        Z.snd.die();
        boom(P.x, P.y, true);
    }
    function fire() {
        var x = P.x, y = P.y - 8;
        pb.push({ x: x, y: y, vx: 0, vy: -4.6 });
        if (P.gun >= 2) { pb.pop(); pb.push({ x: x - 3, y: y, vx: 0, vy: -4.6 }, { x: x + 3, y: y, vx: 0, vy: -4.6 }); }
        if (P.gun >= 3) { pb.push({ x: x - 6, y: y + 2, vx: -0.8, vy: -4.4 }, { x: x + 6, y: y + 2, vx: 0.8, vy: -4.4 }); }
        for (var h = 0; h < P.helpers; h++) { pb.push({ x: P.x + (h === 0 ? -17 : 17), y: P.y - 3, vx: 0, vy: -4.6 }); }
        P.sfx++;
        if (P.sfx % 2 === 0) { Z.snd.shoot(); }
    }
    function playerUpd(canFire) {
        var I = Z.input, sp = P.roll > 0 ? 1.3 : 1.7;
        if (I.down('left')) { P.x -= sp; }
        if (I.down('right')) { P.x += sp; }
        if (I.down('up')) { P.y -= sp; }
        if (I.down('down')) { P.y += sp; }
        P.x = Z.clamp(P.x, 9, W - 9); P.y = Z.clamp(P.y, 22, H - 9);
        if (P.cd > 0) { P.cd--; }
        if (P.roll > 0) { P.roll--; }
        if (P.invul > 0) { P.invul--; }
        if (P.shield > 0) { P.shield--; }
        if (canFire && P.roll === 0) {
            if (I.hit('alt') && P.rolls > 0) { P.roll = 56; P.rolls--; Z.snd.beep(300, 0.4, 900, 0.04); }
            else if (I.down('fire') && P.cd === 0) { fire(); P.cd = 8; }
        }
    }

    // ---------- Aktualizace světa
    function worldUpd(spawnOk) {
        var i, j, e, b;
        // události
        if (spawnOk && st.bossState === 0) {
            st.lt++;
            while (evIdx < ev.length && ev[evIdx].t <= st.lt) { spawn(ev[evIdx++]); }
            if (evIdx >= ev.length && st.lt > st.lvEnd) {
                var air = enemies.some(function (o) { return o.kind !== 's' && o.hp > 0; });
                if (!air) { st.bossState = 0.5; st.warn = 110; Z.snd.over(); }
            }
        }
        if (st.bossState === 0.5) { st.warn--; if (st.warn <= 0) { spawnBoss(); } }
        // nepřátelé
        for (i = enemies.length - 1; i >= 0; i--) {
            e = enemies[i];
            if (e.hp > 0) { updEnemy(e); }
            var out = e.y > H + 40 || e.y < -70 || e.x < -60 || e.x > W + 60;
            if (e.kind === 'f' && e.mode === 'loop' && e.y < -30 && e.stage !== 2) { out = false; }
            if (e.hp <= 0 && e.kind !== 'B') { enemies.splice(i, 1); }
            else if (out && e.delay <= 0 && e.age > 5) { enemies.splice(i, 1); }
        }
        // střely hráče
        for (i = pb.length - 1; i >= 0; i--) {
            b = pb[i]; b.x += b.vx; b.y += b.vy;
            if (b.y < -6 || b.x < -4 || b.x > W + 4) { pb.splice(i, 1); continue; }
            for (j = 0; j < enemies.length; j++) {
                e = enemies[j];
                if (e.hp <= 0 || e.delay > 0) { continue; }
                if (Z.hit(b.x - 1, b.y - 2, 3, 5, e.x - e.w / 2, e.y - e.h / 2, e.w, e.h)) {
                    e.hp--; e.flash = 3; pb.splice(i, 1);
                    if (e.hp <= 0) {
                        if (e.kind === 'B') { bossDie(e); } else { killEnemy(e); }
                    } else { Z.snd.hit(); }
                    break;
                }
            }
        }
        // střely nepřátel
        for (i = eb.length - 1; i >= 0; i--) {
            b = eb[i]; b.x += b.vx; b.y += b.vy;
            if (b.y > H + 4 || b.y < -6 || b.x < -4 || b.x > W + 4) { eb.splice(i, 1); continue; }
            if (P.alive && st.mode === 'play' && Z.hit(b.x - 1, b.y - 1, 3, 3, P.x - 2, P.y - 2, 5, 5)) {
                if (P.roll > 0 || P.invul > 0) { continue; }
                eb.splice(i, 1);
                if (P.shield <= 0) { hurtPlayer(); }
            }
        }
        // srážka letadel
        if (P.alive && st.mode === 'play') {
            for (j = 0; j < enemies.length; j++) {
                e = enemies[j];
                if (e.hp <= 0 || e.delay > 0 || e.kind === 's') { continue; }
                if (Z.hit(P.x - 3, P.y - 3, 7, 7, e.x - e.w / 2 + 1, e.y - e.h / 2 + 1, e.w - 2, e.h - 2)) {
                    if (P.roll > 0 || P.invul > 0) { continue; }
                    if (P.shield > 0) { if (e.kind === 'f') { killEnemy(e); } continue; }
                    hurtPlayer();
                }
            }
        }
        // bonusy
        for (i = pickups.length - 1; i >= 0; i--) {
            var p = pickups[i]; p.age++; p.y += 0.45; p.x += Math.sin(p.age * 0.05) * 0.3;
            if (p.y > H + 10) { pickups.splice(i, 1); continue; }
            if (P.alive && st.mode !== 'dying' && Z.hit(P.x - 8, P.y - 8, 17, 17, p.x - 6, p.y - 6, 12, 12)) {
                if (p.t === 'D') { P.gun = Math.min(3, P.gun + 1); }
                else if (p.t === 'H') { P.helpers = Math.min(2, P.helpers + 1); }
                else if (p.t === 'S') { P.shield = 600; }
                else if (p.t === '1') { st.lives++; }
                addScore(200); Z.snd.coin();
                pickups.splice(i, 1);
            }
        }
        // exploze
        for (i = expl.length - 1; i >= 0; i--) { expl[i].age++; if (expl[i].age > 22) { expl.splice(i, 1); } }
    }
    function bossDie(b) {
        addScore(b.sc);
        Z.snd.boom();
        st.bossState = 2; st.bossT = 0;
        eb.length = 0;
    }

    // ---------- Hlavní tick
    function tick() {
        st.t++;
        updBg();
        var I = Z.input;
        switch (st.mode) {
        case 'title':
            Z.pauseOk = false;
            if (I.hit('fire')) { newGame(); }
            break;
        case 'play':
            Z.pauseOk = true;
            if (st.intro > 0) { st.intro--; }
            playerUpd(true);
            worldUpd(st.intro <= 0);
            if (st.bossState === 2) { bossSequence(); }
            if (st.bossState === 3) { st.mode = 'clear'; st.clearT = 0; st.bonus = 0; }
            break;
        case 'dying':
            Z.pauseOk = true;
            worldUpd(st.intro <= 0);
            st.dt--;
            if (st.bossState === 2) { bossSequence(); }
            if (st.dt <= 0) {
                if (st.lives <= 0) { endGame(false); }
                else {
                    P.x = 128; P.y = 160; P.gun = 1; P.helpers = 0; P.shield = 0; P.roll = 0; P.invul = 150; P.alive = true;
                    eb.length = 0; st.mode = 'play';
                }
            }
            break;
        case 'clear':
            Z.pauseOk = true;
            st.clearT++;
            playerUpd(false);
            worldUpd(false);
            if (st.clearT === 40) { var bn = P.rolls * 1000; addScore(bn); st.bonus = bn; Z.snd.win(); }
            if (st.clearT > 230) {
                if (st.level >= LEVELS) { endGame(true); }
                else { startLevel(st.level + 1); st.mode = 'play'; }
            }
            break;
        case 'over':
            Z.pauseOk = false;
            st.ot++;
            if (st.ot > 60 && I.hit('fire')) { st.mode = 'title'; st.t = 0; }
            if (st.ot > 700) { st.mode = 'title'; st.t = 0; }
            break;
        }
    }
    function bossSequence() {
        // série výbuchů po zničení velkého letadla
        st.bossT++;
        var b = st.boss;
        if (st.bossT < 50 && st.bossT % 4 === 0) { boom(b.x + (rnd() - 0.5) * 44, b.y + (rnd() - 0.5) * 28, true); Z.snd.boom(); }
        if (st.bossT === 56) {
            b.hp = 0;
            enemies = enemies.filter(function (o) { return o.kind === 's'; });
            GAME.enemies = enemies;
            st.bossState = 3; st.boss = null;
        }
    }
    function endGame(win) {
        st.win = win;
        st.newHi = st.score > Z.hi.get(HI_KEY);
        Z.hi.submit(HI_KEY, st.score);
        st.mode = 'over'; st.ot = 0;
        if (win) { Z.snd.win(); } else { Z.snd.over(); }
    }
    GAME.reset = function () { st.mode = 'title'; };

    // ---------- Kreslení
    function drawSea() {
        var pc = SEA_PAPER[(st.level || 1) - 1];
        if (st.mode === 'title') { pc = 1; }
        Z.cls(pc, pc === 0 ? 1 : 7);
        var wc = pc === 1 ? 9 : pc === 5 ? 13 : 1;
        var off = Math.floor(st.scroll % 14), base = Math.floor(st.scroll / 14);
        for (var j = 0; j * 14 - 14 + off < H; j++) {
            var row = base - j;
            for (var i = 0; i < 4; i++) {
                var h = hs(row, i);
                Z.rect(h % 250, off + 14 * j - 14 + ((h >> 8) % 14), 3 + ((h >> 12) % 5), 1, wc);
            }
        }
    }
    function drawIslands() {
        if (!islands) { return; }
        islands.forEach(function (is) {
            is.discs.forEach(function (d) { Z.disc(Math.round(is.x + d.x), Math.round(is.y + d.y), d.r + 2, 6); });
            is.discs.forEach(function (d) { Z.disc(Math.round(is.x + d.x), Math.round(is.y + d.y), d.r, 4); });
            for (var i = 0; i < is.trees; i++) {
                var d = is.discs[i % is.discs.length], a = i * 2.1;
                Z.disc(Math.round(is.x + d.x + Math.cos(a) * d.r * 0.4), Math.round(is.y + d.y + Math.sin(a) * d.r * 0.4), 2, 12);
            }
        });
    }
    function drawScaled(cx, cy, rows, pal, fx, fy) {
        var w = rows[0].length, h = rows.length;
        for (var r = 0; r < h; r++) {
            for (var c = 0; c < w; c++) {
                var col = pal[rows[r].charAt(c)];
                if (col === undefined) { continue; }
                var x0 = Math.round(cx + (c - w / 2) * fx), x1 = Math.round(cx + (c + 1 - w / 2) * fx);
                var y0 = Math.round(cy + (r - h / 2) * fy), y1 = Math.round(cy + (r + 1 - h / 2) * fy);
                Z.rect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0), col);
            }
        }
    }
    function drawEnemy(e) {
        if (e.delay > 0 || e.hp <= 0 && e.kind !== 'B') { return; }
        var pal = e.flash > 0 ? flashPal(e.pal) : e.pal;
        var x = Math.round(e.x), y = Math.round(e.y);
        if (e.kind === 'f') {
            var up = e.mode === 'loop' && Math.sin(e.hd) < -0.3;
            Z.spriteC(x - 5, y - 3, up ? SP_SMALL_V : SP_SMALL, pal);
        } else if (e.kind === 'm') {
            Z.spriteC(x - 8, y - 5, SP_MED, pal);
        } else if (e.kind === 's') {
            Z.spriteC(x - 4, y - 11, SP_SHIP, pal);
        } else if (e.kind === 'B') {
            if (e.hp > 0 || st.bossT % 6 < 3) { Z.spriteCS(x - 25, y - 16, SP_BOSS, pal, 2); }
        }
    }
    function drawPlayer() {
        if (!P.alive) { return; }
        if (P.invul > 0 && P.roll === 0 && (st.t % 6) < 3) { return; }
        var pal = PAL_PLAYER;
        var x = Math.round(P.x), y = Math.round(P.y);
        if (P.roll > 0) {
            var pr = 1 - P.roll / 56;
            var fx = Math.max(0.15, Math.abs(Math.cos(pr * Math.PI * 4)));
            var fy = 1 + 0.5 * Math.sin(pr * Math.PI);
            drawScaled(x, y, SP_PLAYER, pal, fx, fy);
        } else {
            Z.spriteC(x - 7, y - 6, SP_PLAYER, pal);
        }
        for (var h = 0; h < P.helpers; h++) { Z.spriteC(x + (h === 0 ? -20 : 14), y - 1, SP_HELP, PAL_HELP); }
        if (P.shield > 0 && (P.shield > 100 || (st.t % 8) < 5)) {
            Z.ring(x, y, 12, 13); Z.ring(x, y, 11 + ((st.t >> 2) & 1), 15);
        }
    }
    function drawExpl() {
        expl.forEach(function (x) {
            var r = x.big ? Math.min(16, 2 + x.age * 0.9) : Math.min(8, 1 + x.age * 0.5);
            r = Math.round(r);
            var c = x.age < 6 ? 15 : x.age < 12 ? 14 : x.age < 18 ? 10 : 2;
            if (x.age < 18) { Z.disc(Math.round(x.x), Math.round(x.y), r, c); }
            Z.ring(Math.round(x.x), Math.round(x.y), r + 2, c === 15 ? 14 : 10);
        });
    }
    function drawHud() {
        Z.rect(0, 0, W, 10, 0);
        Z.text(2, 1, 'SKÓRE ' + pad6(st.score), 15);
        Z.text(92, 1, 'ÚROVEŇ ' + st.level, 14);
        Z.spriteC(150, 2, SP_HELP, PAL_HELP);
        Z.text(160, 1, 'X' + Math.max(0, st.lives), 15);
        Z.text(184, 1, 'VÝVRTKA', 13);
        for (var i = 0; i < P.rolls && i < 5; i++) { Z.rect(228 + i * 5, 2, 3, 6, 12); }
        if (st.boss && st.boss.hp > 0) {
            var f = st.boss.hp / st.boss.mhp;
            Z.rect(78, 12, 100, 4, 8); Z.rect(78, 12, Math.max(1, Math.round(100 * f)), 4, 10); Z.frame(77, 11, 102, 6, 15);
        }
    }
    function drawPlay() {
        drawSea(); drawIslands();
        enemies.forEach(function (e) { if (e.kind === 's') { drawEnemy(e); } });
        enemies.forEach(function (e) { if (e.kind !== 's') { drawEnemy(e); } });
        pickups.forEach(function (p) {
            var col = ({ D: 14, H: 12, S: 13, '1': 10 })[p.t];
            Z.disc(Math.round(p.x), Math.round(p.y), 6, (p.age >> 3) & 1 ? col : 0);
            Z.ring(Math.round(p.x), Math.round(p.y), 6, col);
            Z.text(Math.round(p.x), Math.round(p.y) - 3, p.t === '1' ? '+' : p.t, (p.age >> 3) & 1 ? 0 : 15, { align: 'center' });
        });
        pb.forEach(function (b) { Z.rect(Math.round(b.x) - 1, Math.round(b.y) - 2, 2, 5, 14); });
        eb.forEach(function (b) { Z.rect(Math.round(b.x) - 1, Math.round(b.y) - 1, 3, 3, (st.t >> 2) & 1 ? 15 : 10); });
        drawPlayer();
        drawExpl();
        drawHud();
        var cx = 128;
        if (st.intro > 0 && st.mode === 'play') {
            Z.rect(30, 70, 196, 40, 0); Z.frame(30, 70, 196, 40, 14);
            Z.text(cx, 76, 'ÚROVEŇ ' + st.level, 14, { scale: 2, align: 'center' });
            Z.text(cx, 96, LEVEL_NAMES[st.level - 1], 15, { align: 'center' });
        }
        if (st.bossState === 0.5 && (st.t % 30) < 20) {
            Z.rect(30, 80, 196, 22, 0); Z.frame(30, 80, 196, 22, 10);
            Z.text(cx, 87, 'POZOR! OBŘÍ LETADLO', 10, { align: 'center' });
        }
        if (st.mode === 'clear') {
            Z.rect(30, 66, 196, 56, 0); Z.frame(30, 66, 196, 56, 12);
            Z.text(cx, 72, 'ÚROVEŇ ' + st.level + ' SPLNĚNA', 12, { scale: 1, align: 'center' });
            if (st.clearT >= 40) {
                Z.text(cx, 90, 'ZBÝVÁ VÝVRTEK: ' + P.rolls, 15, { align: 'center' });
                Z.text(cx, 102, 'BONUS ' + (st.bonus || 0), 14, { align: 'center' });
            }
        }
    }
    function drawTitle() {
        drawSea();
        Z.text(128, 14, 'STÍHAČ', 14, { scale: 3, align: 'center' });
        Z.text(128, 40, 'NAD OCEÁNEM', 15, { scale: 2, align: 'center' });
        var fy = 70 + Math.round(Math.sin(st.t * 0.05) * 3);
        Z.spriteCS(128 - 15, fy, SP_PLAYER, PAL_PLAYER, 2);
        Z.text(128, 108, 'ŠIPKY - LET   MEZERNÍK - PALBA', 13, { align: 'center' });
        Z.text(128, 118, 'X - VÝVRTKA (UHNUTÍ PŘED STŘELAMI)', 13, { align: 'center' });
        Z.text(128, 128, 'D DVOJITÁ  H POMOCNÍCI  S ŠTÍT', 12, { align: 'center' });
        Z.text(128, 138, 'P PAUZA   M ZVUK', 12, { align: 'center' });
        Z.text(128, 152, '10 ÚROVNÍ, NA KONCI VELKÉ LETADLO', 6, { align: 'center' });
        Z.text(128, 164, 'REKORD ' + pad6(Z.hi.get(HI_KEY)), 14, { align: 'center' });
        if ((st.t >> 4) & 1) { Z.text(128, 178, 'STISKNI PALBU', 15, { align: 'center' }); }
    }
    function drawOver() {
        drawPlay();
        Z.rect(30, 54, 196, 84, 0); Z.frame(30, 54, 196, 84, st.win ? 12 : 10);
        if (st.win) {
            Z.text(128, 62, 'VÍTĚZSTVÍ!', 12, { scale: 2, align: 'center' });
            Z.text(128, 82, 'OCEÁN JE BEZPEČNÝ', 15, { align: 'center' });
        } else {
            Z.text(128, 62, 'KONEC HRY', 10, { scale: 2, align: 'center' });
            Z.text(128, 82, 'DOSÁHL JSI ÚROVNĚ ' + st.level, 15, { align: 'center' });
        }
        Z.text(128, 96, 'SKÓRE ' + pad6(st.score), 14, { align: 'center' });
        Z.text(128, 108, 'REKORD ' + pad6(Z.hi.get(HI_KEY)), 13, { align: 'center' });
        if (st.newHi) { Z.text(128, 120, 'NOVÝ REKORD!', (st.t >> 3) & 1 ? 14 : 10, { align: 'center' }); }
    }
    function draw() {
        Z.border = st.mode === 'title' ? 1 : 0;
        if (st.mode === 'title') { drawTitle(); }
        else if (st.mode === 'over') { drawOver(); }
        else { drawPlay(); }
    }

    Z.init({
        title: 'Stíhač nad oceánem',
        touch: [
            { act: 'left', label: '◀' }, { act: 'right', label: '▶' }, { act: 'up', label: '▲' }, { act: 'down', label: '▼' },
            { act: 'alt', label: 'VÝVRTKA' }, { act: 'fire', label: 'OHEŇ', cls: 'big' }
        ]
    });
    islands = []; enemies = []; pb = []; eb = []; pickups = []; expl = [];
    P = { x: 128, y: 160, alive: true, shield: 0, roll: 0, rolls: 3, helpers: 0, gun: 1, invul: 0, cd: 0 };
    st.level = 1; st.score = 0; st.lives = 3;
    Z.run({ tick: tick, draw: draw });
})();
