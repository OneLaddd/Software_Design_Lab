# Lab Activity 6: openGauss — Beyonder Registry (LOTM Edition)

A small openGauss database exercise themed on Lord of the Mysteries: tracks
Beyonders, their organizations, and sealed artifacts.

## Files
- schema.sql - creates the 3 tables
- seed.sql - sample data
- main.py - connects, loads schema+seed, runs 4 test queries
- .env - fill in real DB credentials (don't submit `.env`)

## Setup
```
python3 -m venv venv
source venv/bin/activate
cp .env.example .env
```

## Run
```
python3 main.py
```
Drops/recreates tables, reloads seed data, and prints 4 test query results:
1. High Sequence threats (<=4)
2. Tarot Club roster (JOIN)
3. Beyonders flagged dangerous
4. Beyonders + their sealed artifacts (JOIN)
