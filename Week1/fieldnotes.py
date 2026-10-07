#!/usr/bin/env python3
"""Field Notes: an offline birding companion.

BirdNET identifies birds from a recording, a local Gemma (via Ollama) writes a
short field-journal entry, and TabPFN forecasts what to listen for next.
Everything runs locally. Nothing leaves the machine.
"""
import argparse
import csv
import json
import math
import os
import random
import sqlite3
import urllib.request
from collections import Counter
from datetime import datetime
from pathlib import Path

DB_PATH = Path(os.environ.get("FIELDNOTES_DB", Path.home() / ".fieldnotes" / "fieldnotes.db"))
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/generate")
MODEL = os.environ.get("FIELDNOTES_MODEL", "gemma3:1b")


# ---------- storage ----------
def db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.execute(
        "create table if not exists sightings("
        "ts text, species text, sci text, conf real, lat real, lon real)"
    )
    return con


def save(detections, when, lat, lon):
    con = db()
    with con:
        for d in detections:
            con.execute(
                "insert into sightings values(?,?,?,?,?,?)",
                (when.isoformat(), d["common_name"], d.get("scientific_name", ""),
                 d["confidence"], lat, lon),
            )


def known_species():
    return {r[0] for r in db().execute("select distinct species from sightings")}


# ---------- 1. identify (BirdNET) ----------
def detect(path, lat, lon, when, min_conf):
    try:
        from birdnetlib import Recording
        from birdnetlib.analyzer import Analyzer
    except ImportError:
        raise SystemExit("Install BirdNET bindings first: pip install birdnetlib tensorflow")
    rec = Recording(Analyzer(), path, lat=lat, lon=lon, date=when, min_conf=min_conf)
    rec.analyze()
    best = {}
    for d in rec.detections:  # keep best confidence per species
        n = d["common_name"]
        if n not in best or d["confidence"] > best[n]["confidence"]:
            best[n] = d
    return sorted(best.values(), key=lambda d: -d["confidence"])


# ---------- 2. journal (local LLM) ----------
def journal(detections, new_species, when):
    lines = [f"- {d['common_name']} (confidence {d['confidence']:.0%})" for d in detections]
    prompt = (
        "You are a field naturalist's notebook. Write a 3-4 sentence journal entry "
        f"for {when:%A %d %B, %H:%M}. Use ONLY the species listed below and do not "
        "invent facts about them beyond well-known general behaviour. Mention which "
        f"are new to the life list: {', '.join(new_species) or 'none'}. "
        "End with one thing to listen for.\n\nDetections:\n" + "\n".join(lines)
    )
    req = urllib.request.Request(
        OLLAMA_URL,
        data=json.dumps({"model": MODEL, "prompt": prompt, "stream": False}).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read())["response"].strip()
    except Exception as e:  # Ollama not running: degrade, don't die
        names = ", ".join(d["common_name"] for d in detections)
        return (f"[LLM unavailable ({type(e).__name__}); plain log] "
                f"Heard: {names}. New: {', '.join(new_species) or 'none'}.")


# ---------- 3. forecast (TabPFN) ----------
def features(lat, lon, when):
    doy = when.timetuple().tm_yday
    return [lat, lon, doy, when.hour + when.minute / 60]


def load_rows(csv_path):
    rows = []
    if csv_path:
        with open(csv_path, newline="") as f:
            for r in csv.DictReader(f):
                t = datetime.fromisoformat(r["datetime"])
                rows.append((r["species"], features(float(r["lat"]), float(r["lon"]), t)))
    for ts, sp, la, lo in db().execute("select ts, species, lat, lon from sightings"):
        rows.append((sp, features(la, lo, datetime.fromisoformat(ts))))
    return rows


def forecast(lat, lon, when, csv_path, k=3):
    rows = load_rows(csv_path)
    if len(rows) < 30:
        return [], "need at least 30 logged sightings (add a CSV with --history)"
    top = [s for s, _ in Counter(r[0] for r in rows).most_common(9)]  # TabPFN: <=10 classes
    y = [s if s in top else "other" for s, _ in rows]
    X = [r[1] for r in rows]
    if len(X) > 1000:  # keep CPU inference quick
        idx = random.Random(0).sample(range(len(X)), 1000)
        X, y = [X[i] for i in idx], [y[i] for i in idx]
    q = [features(lat, lon, when)]
    try:
        import numpy as np
        from tabpfn import TabPFNClassifier
        clf = TabPFNClassifier(device="cpu")
        clf.fit(np.array(X), np.array(y))
        probs = clf.predict_proba(np.array(q))[0]
        ranked = sorted(zip(clf.classes_, probs), key=lambda p: -p[1])
        engine = "TabPFN"
    except ImportError:
        # Fallback so the CLI still works: nearest neighbours in (day-of-year, hour)
        def dist(a):
            dd = min(abs(a[2] - q[0][2]), 365 - abs(a[2] - q[0][2])) / 30
            return math.hypot(dd, (a[3] - q[0][3]) / 3)
        near = sorted(zip(X, y), key=lambda p: dist(p[0]))[:40]
        c = Counter(lbl for _, lbl in near)
        ranked = [(s, n / len(near)) for s, n in c.most_common()]
        engine = "nearest-neighbour fallback (pip install tabpfn for the real thing)"
    out = [(s, p) for s, p in ranked if s != "other"][:k]
    return out, engine


# ---------- demo data ----------
def synth(path, n=400):
    """Synthetic sightings for testing ONLY. Replace with your own log or an eBird export."""
    rnd = random.Random(1)
    # species: (peak hour, peak day-of-year)
    prof = {"Northern Cardinal": (6.5, 120), "American Robin": (6.0, 110),
            "Carolina Wren": (8.0, 150), "Blue Jay": (10.0, 280),
            "Tufted Titmouse": (9.0, 200), "Mourning Dove": (7.0, 160)}
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["species", "lat", "lon", "datetime"])
        for _ in range(n):
            sp, (h, d) = rnd.choice(list(prof.items()))
            doy = int(rnd.gauss(d, 25)) % 365 + 1
            hr = max(0, min(23, rnd.gauss(h, 1.5)))
            t = datetime.strptime(f"2025-{doy}", "%Y-%j").replace(hour=int(hr), minute=int((hr % 1) * 60))
            w.writerow([sp, round(rnd.gauss(26.85, .02), 4), round(rnd.gauss(80.95, .02), 4), t.isoformat()])
    print(f"wrote {n} SYNTHETIC rows to {path}")


# ---------- CLI ----------
def main():
    p = argparse.ArgumentParser(prog="fieldnotes")
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("listen", help="identify birds in a recording and write a journal entry")
    a.add_argument("audio")
    a.add_argument("--lat", type=float, required=True)
    a.add_argument("--lon", type=float, required=True)
    a.add_argument("--min-conf", type=float, default=0.35)
    a.add_argument("--demo", action="store_true", help="skip BirdNET, use fake detections (testing)")

    b = sub.add_parser("forecast", help="what to listen for at a place and time")
    b.add_argument("--lat", type=float, required=True)
    b.add_argument("--lon", type=float, required=True)
    b.add_argument("--when", default=None, help="ISO datetime, default: tomorrow 06:30")
    b.add_argument("--history", help="CSV: species,lat,lon,datetime")

    sub.add_parser("lifelist", help="show your life list")
    s = sub.add_parser("synth", help="write a synthetic CSV for testing")
    s.add_argument("path")
    args = p.parse_args()

    if args.cmd == "listen":
        when = datetime.now()
        if args.demo:
            dets = [{"common_name": "Northern Cardinal", "scientific_name": "Cardinalis cardinalis", "confidence": 0.91},
                    {"common_name": "Carolina Wren", "scientific_name": "Thryothorus ludovicianus", "confidence": 0.62}]
        else:
            dets = detect(args.audio, args.lat, args.lon, when, args.min_conf)
        if not dets:
            return print("No birds above the confidence threshold. Try a longer clip or --min-conf 0.2")
        new = [d["common_name"] for d in dets if d["common_name"] not in known_species()]
        save(dets, when, args.lat, args.lon)
        print(journal(dets, new, when))
    elif args.cmd == "forecast":
        when = datetime.fromisoformat(args.when) if args.when else \
            (datetime.now().replace(hour=6, minute=30, second=0, microsecond=0) + __import__("datetime").timedelta(days=1))
        picks, engine = forecast(args.lat, args.lon, when, args.history)
        if not picks:
            return print(engine)
        print(f"{when:%a %d %b %H:%M}: listen for")
        for sp, pr in picks:
            print(f"  {sp}  ({pr:.0%})")
        print(f"[engine: {engine}]")
    elif args.cmd == "lifelist":
        for sp, n, first in db().execute(
                "select species, count(*), min(ts) from sightings group by species order by min(ts)"):
            print(f"{sp:28} heard {n}x, first {first[:10]}")
    elif args.cmd == "synth":
        synth(args.path)


if __name__ == "__main__":
    main()
