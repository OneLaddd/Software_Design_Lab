# Lab Activity 7 — Data Mining APIs and Interactive Data Visualization

**Course:** CPE106L-4 Software Design Laboratory
**Instructor:** Dr. John De Guzman Tarampi
**Data Source:** [PokeAPI](https://pokeapi.co/) — free, public REST API, no key required

## What this does

The script fetches base stat data (HP, Attack, Defense, Sp. Atk, Sp. Def, Speed)
and primary type for nine starter Pokemon spanning Generations 1–3, then answers:

> **Which starter has the best overall stat total, and how do primary types
> compare on average?**

It produces:
1. `output/total_stats_bar.png` — static, labeled bar chart ranking starters by
   total base stats
2. `output/radar_comparison.png` — static radar chart comparing the three
   Gen 1 starters across all six stats
3. `output/type_average_interactive.html` — **interactive** Plotly bar chart
   (hover for exact values) of average total stats per primary type
4. `data/pokemon_stats.csv` — the cleaned, processed dataset

## Folder structure

```
labactivity7/
├── src/
│   └── main.py                 # main script
├── data/
│   ├── fallback_cache.json     # offline fallback (see note below)
│   └── pokemon_stats.csv       # generated on run
├── output/
│   ├── total_stats_bar.png
│   ├── radar_comparison.png
│   ├── type_average_interactive.html
│   └── run_log_case*.txt       # sample run logs (test evidence)
├── tests/
│   └── test_notes.md
└── README.md
```

## How to run (Ubuntu WSL / Anaconda)

```bash
# 1. Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate

# 2. Install dependencies
pip install requests pandas matplotlib plotly

# 3. Run the script
cd src
python3 main.py
```

Charts and the CSV will be written to `output/` and `data/`.
Open `output/type_average_interactive.html` in a browser to interact with
the Plotly chart (hover, zoom, pan).

## Error handling / offline fallback

PokeAPI is normally reached live via `requests.get()`. If the live API
call fails (network restriction, rate limit, or an invalid Pokemon name),
`fetch_pokemon()` prints a warning and, for the sample starter set, falls
back to a small local cache (`data/fallback_cache.json`) so the pipeline
still completes instead of crashing. On a machine with normal internet
access, the live API is used directly and the fallback is never triggered.
This also doubles as a demonstration of graceful error handling
(see Test Case 3 below).

## Test cases (see `output/run_log_case*.txt`)

| # | Case | Purpose |
|---|------|---------|
| 1 | Full run — 9 starters | Normal end-to-end pipeline: fetch → process → 3 charts |
| 2 | Single Pokemon lookup (`pikachu`) | Confirms `fetch_pokemon()` works for a single, valid name |
| 3 | Invalid name (`notarealpokemon123`) | Confirms the script fails gracefully (returns `None`, no crash, no fallback available) |

## Interpretation of results

Among the sampled starters, **Bulbasaur and Chikorita** (both Grass-type)
tie for the highest total base stats (318), while the Fire starters
(Charmander, Cyndaquil) sit slightly lower. The interactive type-average
chart makes it easy to see this pattern across the whole sample at a
glance rather than pokemon-by-pokemon.
