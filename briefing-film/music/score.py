"""NOON SCAN — original score, numpy synthesis (no samples). Reads ../timeline.json, writes score.wav.
120 BPM, 4/4, E minor. Boot: pad + projector arp from bar 2 · verdict: one bar of held tension, true silence beat, bass enters on the lock ·
sites: 8th bass + ping-pong saw arp + synth hats, one layer more per site (max 3) · totals: half-time, pads only ·
end: clear → drop (808 glide + wide saw chord); critical → everything stops, one sustained tone.
Usage: LIB=<library> python music/score.py <work dir>
"""
import os, sys, json
import numpy as np, soundfile as sf
LIB = os.environ['LIB']; sys.path.insert(0, LIB)
from core.audio.sfx import SR, lp, hp, bp, limit  # noqa: E402

W = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TL = json.load(open(os.path.join(W, 'timeline.json')))
BEAT = 60 / TL['bpm']; S8 = BEAT / 2; S16 = BEAT / 4; BAR = BEAT * 4
DUR = TL['dur']; N = int(DUR * SR) + SR
V0, V1 = TL['verdict']; O0, O1 = TL['totals']; E0, E1 = TL['end']; SITES = TL['sites']
VLOCK = V0 + 2.0; IGN = E0 + 1.0; CRIT = TL['status'] == 'critical'
buf = np.zeros((N, 2))
hz = lambda m: 440 * 2 ** ((m - 69) / 12)
tt = lambda d: np.arange(int(d * SR)) / SR


def put(x, at, g=1.0, pan=0.0):
    s = int(round(at * SR))
    if s >= N or s < 0: return
    if x.ndim == 1:
        x = np.stack([x * np.cos((pan + 1) * np.pi / 4) * 1.414, x * np.sin((pan + 1) * np.pi / 4) * 1.414], 1)
    e = min(N, s + len(x)); buf[s:e] += x[:e - s] * g


def saw(f, d, det=0.0):
    t = tt(d); return sum(2 * ((t * f * (1 + k * det)) % 1) - 1 for k in (-1, 0, 1)) / 3


def env(d, a=.005, r=.1):
    t = tt(d); return np.minimum(1, t / a) * np.exp(-t / r)


def pluck(m, d=.22, v=1.0):        # square/saw arp note, scooped later
    t = tt(d); f = hz(m)
    x = (np.sign(np.sin(2 * np.pi * f * t)) * .5 + saw(f, d) * .5) * env(d, .003, .07)
    return lp(x, 3200) * v


def bassn(m, d, v=1.0):
    t = tt(d); f = hz(m)
    x = np.sin(2 * np.pi * f * t) + .35 * np.sin(4 * np.pi * f * t) + .18 * saw(f, d)
    return lp(x, 900) * np.minimum(1, t / .004) * np.exp(-t / (d * .9)) * v


def pad(ms, d, v=1.0, cut=1600):
    t = tt(d); x = sum(saw(hz(m), d, .004) for m in ms) / len(ms)
    e = np.minimum(1, t / .6) * np.minimum(1, (d - t) / .8)
    return lp(x, cut) * e * v


def hat(v=1.0):
    d = .05; return hp(np.random.default_rng(int(v * 1e4)).uniform(-1, 1, int(d * SR)), 7000) * env(d, .001, .012) * v


def kick(v=1.0):
    t = tt(.35); f = 110 * np.exp(-t * 18) + 45
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .12) * v


def boom808(d=2.5, v=1.0):
    t = tt(d); f = 70 * np.exp(-t * 1.2) + 41
    return np.tanh(1.6 * np.sin(2 * np.pi * np.cumsum(f) / SR)) * np.exp(-t / .9) * v


E2, G2, A2, B2, C3, D3 = 40, 43, 45, 47, 48, 50
CHORDS = [[52, 55, 59], [48, 52, 55], [50, 53, 57], [47, 50, 55]]   # Em C Dm(colour) G/B
ROOTS = [E2, C3 - 12, D3 - 12, B2 - 12]
ARP = [[64, 67, 71, 76], [60, 64, 67, 72], [62, 65, 69, 74], [59, 62, 67, 71]]

# ---- boot: pad from 0, arp from bar 2 ----
put(pad([52, 59, 64], 3 * BAR, .5, 1100), 0, .5)
for k in range(int((V0 - BAR) / S8)):
    t = BAR + k * S8; put(pluck(ARP[0][k % 4] + (12 if k % 8 >= 4 else 0)), t, .22, -.5 if k % 2 else .5)
# ---- verdict: held pad, true silence beat before the lock, bass enters on the lock ----
put(pad([52, 55, 59, 64], VLOCK - 0.5 - V0, .55, 1300), V0, .45)
for k in range(int((V1 - VLOCK) / S8)):
    t = VLOCK + k * S8; put(bassn(E2 if k % 2 == 0 else E2 + 12, S8 * .95), t, .5)
put(kick(), VLOCK, .6)

# ---- sites ----
for j, s in enumerate(SITES):
    t0, t1 = s['t0'], s['t1']; ci = j % 4; layers = min(3, j + 1)
    for k in range(int((t1 - t0) / S8)):
        t = t0 + k * S8
        put(bassn(ROOTS[ci] + (12 if k % 4 == 3 else 0), S8 * .95), t, .45)
        if k % 2 == 0: put(pluck(ARP[ci][(k // 2) % 4] + 12, .2), t, .16, -.6)
        else: put(pluck(ARP[ci][(k // 2) % 4] + 12, .2), t + S16 * 0, .1, .6)        # ping-pong echo
        if layers >= 2: put(hat(.6 + .4 * (k % 2 == 1)), t, .14, .3)
        if layers >= 3 and k % 8 == 4: put(hat(1), t, .25)                          # clap-ish backbeat
        if k % 8 == 0: put(kick(), t, .45)
    put(pad(CHORDS[ci], t1 - t0, .35, 1500), t0, .3)
    if s['state'] == 'down': put(pad([52, 53], 1.0, .5), t0, .2)       # a dissonant cluster under the fault

# ---- totals: half-time, pads only + slow pulses ----
for b in range(4):
    put(pad(CHORDS[b], BAR, .5, 1100), O0 + b * BAR, .4)
    put(bassn(ROOTS[b], BAR * .9, .8), O0 + b * BAR, .35)
    for k in range(4): put(pluck(ARP[b][k] + 12, .35, .7), O0 + b * BAR + k * BEAT, .1, [-.5, .5][k % 2])

# ---- ending ----
if not CRIT:
    put(boom808(2.6), IGN, .7)
    put(pad([40, 52, 59, 64, 71], E1 - IGN + 1, .7, 2400), IGN, .45)
    for k in range(int((E1 - IGN) / S8)):
        t = IGN + k * S8; put(pluck(ARP[0][k % 4] + 24, .25, .7), t, .1 * (1 - k / ((E1 - IGN) / S8)), -.4 if k % 2 else .4)
else:
    t = tt(E1 - IGN + 1); put(np.sin(2 * np.pi * hz(64) * t) * np.minimum(1, t / .3) * np.minimum(1, (len(t) / SR - t) / 1.5), IGN, .18)

# true silences: nothing at all
for a, b in [(VLOCK - 0.5, VLOCK), (E0 + 0.5, IGN)]:
    buf[int(a * SR) + 1:int(b * SR) - 1] = 0
for i in range(2): buf[:, i] = limit(buf[:, i] * .8, .9)
os.makedirs(os.path.join(W, 'music'), exist_ok=True)
sf.write(os.path.join(W, 'music', 'score.wav'), buf[:int(DUR * SR)].astype(np.float32), SR)
print('score.wav', round(DUR, 2), 's')
