# Field Notes

An offline birding companion. Record 10 seconds on the trail, pocket the phone, read your journal later.

| Step | Open piece | Runs |
|---|---|---|
| Identify birds from audio | BirdNET (via `birdnetlib`) | on-device |
| Write the journal entry | Gemma via Ollama (`gemma3:1b`) | on-device |
| Forecast "what to listen for" | TabPFN on your sighting history | on-device |
| Storage | SQLite file in `~/.fieldnotes/` | on-device |

No accounts, no API keys, no network after the one-time model downloads.

## Setup

```bash
pip install birdnetlib tensorflow tabpfn numpy
ollama pull gemma3:1b
```

## Use

```bash
# 1. On the trail: record a clip (any phone voice recorder), then:
python fieldnotes.py listen clip.wav --lat 26.85 --lon 80.95

# 2. Evening: what should I listen for tomorrow morning?
python fieldnotes.py forecast --lat 26.85 --lon 80.95 --when 2026-10-08T06:30 --history my_sightings.csv

# 3. Life list
python fieldnotes.py lifelist
```

`--history` CSV format: `species,lat,lon,datetime` (ISO datetime). Your own logged detections are added automatically.

## Test without hardware

```bash
python fieldnotes.py synth sample.csv                      # SYNTHETIC data, testing only
python fieldnotes.py listen x.wav --lat 26.85 --lon 80.95 --demo
```

## Graceful degradation

- Ollama not running: prints a plain detection log instead of a journal entry.
- TabPFN not installed: falls back to a nearest-neighbour baseline and says so in the output.

## Known limits

- TabPFN handles at most 10 classes, so the forecast covers your 9 most common species plus "other".
- Forecasts need roughly 30+ logged sightings to say anything useful.
- BirdNET model weights are licensed non-commercial (CC BY-NC-SA). Fine for this project, not for a commercial product.
- Gemma can still embellish; the prompt restricts it to the detected species, but read entries critically.
- Single clip analysis only; no continuous recording.
