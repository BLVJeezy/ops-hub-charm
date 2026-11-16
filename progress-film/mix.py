"""mix.py — SOLYN GLOBAL PROGRESS: a small generated score + interface sounds + voice → mix.wav
The score is written by the plan: key and tempo change per edition (plan.look.key / .bpm), so films do not sound alike.
During narration the music drops under the voice. Usage: LIB=<library> python mix.py <work dir>
"""
import os, sys, json, numpy as np, soundfile as sf
from scipy.signal import resample_poly
from scipy.ndimage import uniform_filter1d, maximum_filter1d
D = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.environ['LIB'])
from core.audio.sfx import SR, t_, env_exp, lp, hp, noise, add, limit, whoosh

W = sys.argv[1] if len(sys.argv) > 1 else D
os.makedirs(os.path.join(W, 'out'), exist_ok=True)
E = json.load(open(os.path.join(W, 'events.json'))); EV = E['ev']; DUR = E['dur']; SCENES = E['scenes']
P = json.load(open(os.path.join(W, 'plan.json'))); LOOK = P['look']
N = int(round(DUR * SR)); rng = np.random.default_rng(abs(hash(P['day'])) % 2**31)
mus = np.zeros((N, 2)); fol = np.zeros((N, 2)); vox = np.zeros((N, 2))
hz = lambda m: 440 * 2 ** ((m - 69) / 12)
ROOT = [57, 60, 62, 55, 53][LOOK['key'] % 5]                      # A, C, D, G, F
MINOR = LOOK['theme'] in ('vault', 'terminal', 'aurora')
SCALE = [0, 2, 3, 5, 7, 8, 10] if MINOR else [0, 2, 4, 5, 7, 9, 11]
deg = lambda d: ROOT + SCALE[d % 7] + 12 * (d // 7)
PROG = [[0, 5, 3, 4], [0, 3, 5, 4], [0, 4, 5, 3], [5, 3, 0, 4]][LOOK['key'] % 4]    # scale degrees of the four chords
BEAT = 60 / LOOK['bpm']; BAR = BEAT * 4

def tone(m, d, kind='sine', tau=None):
    f = hz(m); tt = t_(d); ph = 2 * np.pi * f * tt
    x = np.sin(ph) if kind == 'sine' else (2 / np.pi) * np.arcsin(np.sin(ph)) if kind == 'tri' else np.sin(ph + 1.6 * np.sin(2 * ph) * np.exp(-tt * 9))
    x = x * (np.exp(-tt / tau) if tau else 1)
    n = min(len(x), int(.006 * SR)); x[:n] *= np.linspace(0, 1, n); m2 = min(len(x), int(.03 * SR)); x[-m2:] *= np.linspace(1, 0, m2)
    return x

def pad(notes, d):
    tt = t_(d); x = np.zeros(len(tt))
    for m in notes:
        for det in (-.07, .06): x += np.sin(2 * np.pi * hz(m + det) * tt + rng.uniform(0, 6)) + .3 * np.sin(4 * np.pi * hz(m + det) * tt)
    e = np.minimum(1, tt / (d * .3)) * np.minimum(1, (d - tt) / (d * .35))
    return lp(x, 1800) * e / len(notes)

# sections: calm on the title and the ending, full in between
body0 = SCENES[1]['t0'] if len(SCENES) > 1 else 0; body1 = SCENES[-1]['t0']
bar = 0; t = 0.0
ARP = [[0, 2, 4, 2, 7, 4, 2, 4], [0, 4, 2, 7, 4, 2, 9, 4], [7, 4, 2, 0, 2, 4, 7, 9]][LOOK['key'] % 3]
while t < DUR:
    d0 = PROG[bar % 4]; chord = [deg(d0), deg(d0 + 2), deg(d0 + 4)]; full = body0 - .1 <= t < body1
    add(mus, pad([c - 12 for c in chord] + [chord[0]], BAR * 1.15), t, .16)
    add(mus, tone(deg(d0) - 24, BAR * .98, 'sine') * np.minimum(1, t_(BAR * .98) / .05), t, .22 if full else .12)
    for k in range(8):
        tk = t + k * BEAT / 2
        if tk >= DUR: break
        if full or k % 2 == 0: add(mus, tone(deg(d0 + ARP[k]) + 12, .5, 'fm', .16), tk, .075 if full else .05, [-.45, .45][k % 2])
        if full and k % 2 == 1: add(mus, hp(noise(.05), 7000) * env_exp(.05, .012), tk, .035, .2)
    if full:
        for b in (0, 2): tt = t_(.28); add(mus, np.sin(2 * np.pi * (48 + 70 * np.exp(-tt * 28)) * tt) * np.exp(-tt * 13), t + b * BEAT, .28)
        add(mus, hp(noise(.14), 1800) * env_exp(.14, .04), t + 1 * BEAT, .05); add(mus, hp(noise(.14), 1800) * env_exp(.14, .04), t + 3 * BEAT, .05)
    t += BAR; bar += 1

tot = 0
for e in EV:
    t, ty = e['t'], e['type']; tot += 1
    if ty == 'cut': add(fol, whoosh(.5, .9), t - .05, .32); add(fol, tone(deg(7) + 12, .5, 'sine', .12), t + .32, .16)
    elif ty == 'start' or ty == 'rise':
        d = 1.4; tt = t_(d); add(fol, lp(noise(d), 2500) * (tt / d) ** 2 * .5 + np.sin(2 * np.pi * hz(deg(0)) * tt) * (tt / d) * .4, t, .22)
        add(fol, tone(deg(4) + 12, 1.2, 'sine', .4), t + d, .2)
    elif ty == 'draw':
        for k in range(e.get('n', 6)): add(fol, tone(deg(k) + 24, .09, 'tri', .03), t + k * .13, .1, rng.uniform(-.4, .4))
    elif ty == 'lock': add(fol, tone(deg(4) + 12, .7, 'sine', .22), t, .22); add(fol, tone(deg(7) + 12, .9, 'sine', .3), t + .09, .2)
    elif ty == 'card': add(fol, tone(deg(2) + 12, .3, 'tri', .08), t, .2); add(fol, whoosh(.25, .5), t - .1, .15)
    elif ty == 'vo':
        a, sr = sf.read(os.path.join(W, 'voices', e['id'] + '.wav'))
        if a.ndim > 1: a = a.mean(1)
        add(vox, resample_poly(a, SR, sr), t, 1.5)

vo = maximum_filter1d((np.abs(vox).max(1) > .01).astype(float), int(.5 * SR)); vo = uniform_filter1d(vo, int(.25 * SR))
mus *= (1 - .68 * np.clip(vo * 1.5, 0, 1))[:, None]; fol *= (1 - .6 * np.clip(vo * 1.5, 0, 1))[:, None]
fade = np.minimum(1, np.arange(N) / (.6 * SR)) * np.minimum(1, (N - np.arange(N)) / (1.4 * SR)); mus *= fade[:, None]
mix = mus * .9 + fol + vox
for i in range(2): mix[:, i] = limit(mix[:, i], .95)
sf.write(os.path.join(W, 'mix.wav'), mix.astype(np.float32), SR)
print('mix.wav', DUR, 's', tot, 'events; peak', float(np.abs(mix).max()), 'bpm', LOOK['bpm'])
