# Genera assets/intro.wav: el sonido de la intro de MorvehTV (unos 5,5 s), sintetizado desde
# cero para que sea propio. Va sincronizado con src/Intro.js:
#   0,0 s  zumbido grave que crece + soplo de aire (los haces de luz)
#   1,6 s  impacto: golpe grave, crujido y cola de eco (aparece el logo, onda expansiva)
#   2,3 s  brillo metálico ascendente (se escribe «MorvehTV»)
#   4,6 s  soplo final de salida (zoom hacia la app)
# Uso: python sonido-intro.py   (solo librería estándar)
import math
import random
import struct
import wave
from pathlib import Path

R = 44100
DUR = 5.6
N = int(R * DUR)
random.seed(7)
pista = [0.0] * N


def env(t, ataque, caida):
    """Envolvente: sube en `ataque` segundos y cae exponencialmente con constante `caida`."""
    if t < 0:
        return 0.0
    return min(1.0, t / ataque) * math.exp(-max(0.0, t - ataque) / caida)


def suma(inicio, fin, f):
    for i in range(int(inicio * R), min(N, int(fin * R))):
        pista[i] += f(i / R)


# Ruido filtrado reutilizable (paso bajo de un polo con corte variable)
def ruido_filtrado(inicio, fin, corte_ini, corte_fin, volumen, forma):
    y = 0.0
    for i in range(int(inicio * R), min(N, int(fin * R))):
        t = (i / R - inicio) / (fin - inicio)
        corte = corte_ini + (corte_fin - corte_ini) * t
        a = 1 - math.exp(-2 * math.pi * corte / R)
        y += a * (random.uniform(-1, 1) - y)
        pista[i] += y * volumen * forma(t)


# 1. Zumbido grave que crece (40 → 58 Hz con armónico)
fase = 0.0
for i in range(0, int(1.65 * R)):
    t = i / R
    f = 40 + 18 * (t / 1.65) ** 2
    fase += 2 * math.pi * f / R
    pista[i] += (math.sin(fase) + 0.35 * math.sin(2 * fase)) * 0.32 * (t / 1.65) ** 1.6

# 2. Soplo de aire de los haces de luz
ruido_filtrado(0.0, 1.62, 300, 5200, 0.55, lambda t: t ** 2.2)

# 3. Impacto en 1,6 s: golpe grave descendente + crujido + eco
T0 = 1.6
fase = 0.0
for i in range(int(T0 * R), N):
    t = i / R - T0
    f = 30 + 70 * math.exp(-t / 0.12)
    fase += 2 * math.pi * f / R
    pista[i] += math.sin(fase) * 0.95 * env(t, 0.004, 0.75)
ruido_filtrado(T0, T0 + 1.2, 6000, 400, 0.9, lambda t: math.exp(-t * 7))
for retardo, vol in ((0.23, 0.32), (0.47, 0.18), (0.71, 0.09)):  # eco de la sala
    ini = int((T0 + retardo) * R)
    for j in range(int(0.35 * R)):
        if ini + j < N:
            pista[ini + j] += pista[int(T0 * R) + j] * vol

# 4. Brillo metálico ascendente (acorde de campanas)
for k, nota in enumerate((659.3, 987.8, 1318.5, 1975.5)):
    inicio = 2.3 + k * 0.09
    suma(inicio, inicio + 2.6, lambda t, f=nota, s=inicio: (
        math.sin(2 * math.pi * f * (t - s)) + 0.3 * math.sin(2 * math.pi * f * 2.01 * (t - s))
    ) * 0.09 * env(t - s, 0.01, 0.9))

# 5. Colchón grave sostenido bajo el nombre
suma(2.2, 5.6, lambda t: (math.sin(2 * math.pi * 55 * t) + 0.5 * math.sin(2 * math.pi * 82.4 * t))
     * 0.16 * min(1, (t - 2.2) / 0.6) * max(0.0, 1 - max(0.0, t - 4.9) / 0.7))

# 6. Soplo final de salida
ruido_filtrado(4.5, 5.5, 900, 7000, 0.45, lambda t: math.sin(math.pi * t) ** 2)

# Normaliza, suaviza el final y guarda en 16 bits mono
pico = max(abs(x) for x in pista) or 1
salida = []
for i, x in enumerate(pista):
    x = math.tanh(1.4 * x / pico) / math.tanh(1.4)  # saturación suave, suena más «gordo»
    final = min(1.0, (N - i) / (0.08 * R))
    salida.append(int(x * final * 0.89 * 32767))

destino = Path(__file__).resolve().parent.parent / 'intro.wav'
with wave.open(str(destino), 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(R)
    w.writeframes(struct.pack(f'<{len(salida)}h', *salida))
print(f'{destino} · {DUR} s · {destino.stat().st_size // 1024} KB')
