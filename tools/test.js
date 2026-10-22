// Test v Node: node tools/test.js [adresář pro screenshoty]
const path = require('path');
const H = require('/Users/hyman/EngetoAcademy/TizenOS/_kit/headless.js');
const root = path.join(__dirname, '..');
const out = process.argv[2] || '/tmp';
let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('SELHÁNÍ: ' + m); } else { console.log('ok: ' + m); } }

function fresh() { return H.load([root + '/js/speccy.js', root + '/js/game.js']); }

// bot: zaměří nejnižší nepřátelské letadlo, uhýbá střelám, v nouzi vývrtka
function bot(g) {
    const G = g.sandbox.GAME, st = G.st, P = G.P, Z = g.Z;
    if (st.mode !== 'play') { ['left', 'right', 'up', 'down'].forEach(a => g.release(a)); return; }
    let tx = 128, best = -1;
    G.enemies.forEach(e => { if (e.hp > 0 && e.delay <= 0 && e.y > best && e.y < P.y - 10 && e.kind !== 's' || (e.kind === 's' && e.hp > 0 && e.y > best && e.y > 0 && e.y < P.y - 10)) { best = e.y; tx = e.x; } });
    G.pickups.forEach(p => { if (p.y > 60) { tx = p.x; best = 999; } });
    let dodge = 0, danger = false, ty = 160;
    G.eb.forEach(b => {
        const dy = P.y - b.y, dx = P.x - b.x;
        if (dy > -4 && dy < 55 && Math.abs(dx) < 16) { dodge += dx >= 0 ? 1 : -1; if (dy < 14 && Math.abs(dx) < 6) { danger = true; } }
    });
    G.enemies.forEach(e => {
        if (e.hp > 0 && e.delay <= 0 && e.kind !== 's') {
            const dy = P.y - e.y, dx = P.x - e.x;
            if (dy > -10 && dy < 50 && Math.abs(dx) < 24) { dodge += dx >= 0 ? 2 : -2; if (dy < 20 && Math.abs(dx) < 14) { danger = true; } }
        }
    });
    let dir = 0;
    if (dodge !== 0) { dir = dodge > 0 ? 1 : -1; } else if (Math.abs(tx - P.x) > 3) { dir = tx > P.x ? 1 : -1; }
    if (P.x < 20 && dir < 0) { dir = 1; } if (P.x > 236 && dir > 0) { dir = -1; }
    g.release('left'); g.release('right');
    if (dir < 0) { g.press('left'); } if (dir > 0) { g.press('right'); }
    g.release('up'); g.release('down');
    if (P.y > ty + 3) { g.press('up'); } else if (P.y < ty - 3) { g.press('down'); }
    g.press('fire');
    if (danger && P.roll === 0 && P.rolls > 0 && !G.god) { g.press('alt'); } else { g.release('alt'); }
}

function noNaN(g, m) { ok(!g.hasNaN(g.sandbox.GAME.st) && !g.hasNaN(g.sandbox.GAME.P) && !g.hasNaN(g.sandbox.GAME.enemies) && !g.hasNaN(g.sandbox.GAME.eb), 'bez NaN: ' + m); }

// 1) titulní obrazovka, start
let g = fresh(), G = g.sandbox.GAME;
g.step(40); ok(G.st.mode === 'title', 'start na titulní obrazovce');
g.png(out + '/title.png', 3);
g.press('fire'); g.step(2); g.release('fire');
ok(G.st.mode === 'play', 'palba spustí hru');
g.step(200); g.png(out + '/play1.png', 3);
noNaN(g, 'začátek hry');

// 2) vývrtka: nesmrtelnost a spotřeba
const r0 = G.P.rolls; g.press('alt'); g.step(2); g.release('alt');
ok(G.P.roll > 0 && G.P.rolls === r0 - 1, 'vývrtka se spustí a spotřebuje zásobu');
g.step(60); ok(G.P.roll === 0, 'vývrtka skončí');

// 3) smrt a konec hry bez ovládání (pasivní hráč)
g = fresh(); G = g.sandbox.GAME;
g.press('fire'); g.step(2); g.release('fire');
let sawDying = false, ticks = 0;
G.P.invul = 0;
while (G.st.mode !== 'over' && ticks < 60000) { g.step(1); ticks++; if (G.st.mode === 'dying') { sawDying = true; } }
ok(sawDying && G.st.mode === 'over', 'pasivní hráč: dying -> over (' + ticks + ' ticků, úroveň ' + G.st.level + ')');
noNaN(g, 'po konci hry');
g.png(out + '/over.png', 3);
g.step(100); g.press('fire'); g.step(2); g.release('fire');
ok(G.st.mode === 'title', 'over -> title');
ok(g.Z.hi.get('stihac') >= 0, 'rekord uložen');

// 4) bot bez nesmrtelnosti – kolik dokáže
g = fresh(); G = g.sandbox.GAME;
g.press('fire'); g.step(2); g.release('fire');
let maxLvl = 1; ticks = 0; let shot = false;
while (G.st.mode !== 'over' && ticks < 200000) {
    bot(g); g.step(1); ticks++;
    if (G.st.level > maxLvl) { maxLvl = G.st.level; }
    if (!shot && G.st.mode === 'play' && G.st.level === 1 && G.st.lt > 700) { g.png(out + '/play_bot.png', 3); shot = true; }
}
ok(maxLvl >= 2, 'bot (bez cheatu) dokončil 1. úroveň; dosáhl úrovně ' + maxLvl + ', skóre ' + G.st.score);
noNaN(g, 'bot');

// 5) bot s nesmrtelností: všech 10 úrovní, bossové, vítězství
g = fresh(); G = g.sandbox.GAME; G.god = true;
g.press('fire'); g.step(2); g.release('fire');
ticks = 0; const lvTicks = {}; let bossSeen = {}, shots = {}, pickupTypes = new Set(), maxGun = 1, maxHelp = 0;
while (G.st.mode !== 'over' && ticks < 400000) {
    bot(g); g.step(1); ticks++;
    const L = G.st.level;
    lvTicks[L] = (lvTicks[L] || 0) + 1;
    if (G.st.boss) { bossSeen[L] = true; if (!shots[L] && G.st.boss.hp > 0 && G.st.boss.age > 200) { g.png(out + '/boss' + L + '.png', 3); shots[L] = true; } }
    G.pickups.forEach(p => pickupTypes.add(p.t));
    maxGun = Math.max(maxGun, G.P.gun); maxHelp = Math.max(maxHelp, G.P.helpers);
    if (ticks % 500 === 0 && g.hasNaN({ a: G.st, b: G.P, c: G.enemies, d: G.eb })) { ok(false, 'NaN v ticku ' + ticks); break; }
}
ok(G.st.mode === 'over' && G.st.win === true, 'bot s nesmrtelností: všech ' + G.LEVELS + ' úrovní dokončeno, vítězství (' + ticks + ' ticků)');
ok(Object.keys(bossSeen).length === G.LEVELS, 'boss se objevil v každé úrovni');
ok(maxGun === 3 && maxHelp === 2, 'power-upy: střelba ' + maxGun + ', pomocníci ' + maxHelp + ', typy ' + [...pickupTypes].join(''));
console.log('ticků na úroveň:', JSON.stringify(lvTicks));
g.png(out + '/win.png', 3);

// 6) řešitelnost: každá úroveň má události a konec
for (let L = 1; L <= G.LEVELS; L++) { const lv = G.makeLevel(L); if (!(lv.list.length >= 10 && lv.end > 500)) { ok(false, 'úroveň ' + L + ' prázdná'); } }
ok(true, 'všech ' + G.LEVELS + ' úrovní má scénář');
console.log(fails ? 'CELKEM SELHÁNÍ: ' + fails : 'VŠE V POŘÁDKU');
process.exit(fails ? 1 : 0);
