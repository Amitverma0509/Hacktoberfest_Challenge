---
title: Field Notes: an offline birding companion (BirdNET + Gemma + TabPFN)
published: false
tags: devchallenge, hf26challenge
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 1: Touch Grass](https://dev.to/challenges/hacktoberfest-week1-2026-10-05)*

## What I Built

Field Notes is a command-line birding companion that works with zero signal. You record about 10 seconds of audio on a trail and put your phone away. Later, BirdNET identifies the birds, a local Gemma model writes a short field-journal entry, and TabPFN forecasts what to listen for at your spot tomorrow morning. The screen is the shortest part of the experience: the forecast exists to give you a reason to go outside at 6:30am.

It's for anyone who walks, hikes or birds where coverage is bad and doesn't want their location history on someone else's server.

## Demo

<!-- TODO: add a short video or screenshots of the terminal output after your field test -->

## Code

<!-- TODO: embed your GitHub repo: {% embed https://github.com/YOUR_USERNAME/field-notes %} -->

## How I Built It

- **BirdNET** (via `birdnetlib`) does species identification on-device.
- **Gemma 3 1B via Ollama** turns raw detections into a 3-4 sentence journal entry. The prompt restricts it to the detected species to limit invented facts.
- **TabPFN** is trained on my sighting history (features: lat, lon, day of year, time of day) and predicts which species are likely at a given place and time. It works well on small tabular datasets, which is exactly what a personal bird log is. It supports up to 10 classes, so the forecast covers the 9 most common species plus "other".
- **SQLite** stores everything locally.

The pipeline degrades gracefully: without Ollama it prints a plain log, and without TabPFN it uses a nearest-neighbour baseline and labels the output as such.

## Why Does Open Innovation Matter?

- **Offline:** birders lose signal exactly where the birds are. A hosted API fails there; local weights don't.
- **Privacy:** a log of where you stand at dawn is sensitive. It never leaves the device.
- **Swappable:** the journal model is one environment variable (`FIELDNOTES_MODEL`). I can try a different size or fine-tune the voice without asking anyone.
- **Cost:** zero per-request cost, so logging every walk is free.
- **Caveat:** BirdNET's weights are non-commercial, so this is a hobby tool as built.

## Field Test

<!-- TODO: fill in honestly. Where did you go, how long, what did it identify, what did it get wrong, how did Gemma's journal read, did the forecast match what you heard? Photos help. -->

## My Agent Session

<!-- TODO: embed your DevRelay / Entire session here -->

## Prize Categories

- Best Use of Gemma
- Best Use of TabPFN
- Best Use of Entire (if you embed your sessions)
