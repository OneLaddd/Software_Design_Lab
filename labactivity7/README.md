# Lab Activity 7 - Data Mining APIs and Interactive Data Visualization


By John David C. Ajon
Uses Data Source from (https://pokeapi.co/)

## What this does

main.py fetches base stat data (HP, Attack, Defense, Sp. Atk, Sp. Def, Speed)
and primary type for a list of Pokemon (by default, the fifteen starters from
Generations 5–9), then answers:

> **Which Pokemon has the best overall stat total, and how do primary types
> compare on average?**

Running it saves three charts to output/ and automatically opens each
one as soon as it's created:

1. `output/total_stats_bar.png` — static, labeled bar chart ranking the
   chosen Pokemon by total base stats
2. `output/radar_comparison.png` — static radar chart comparing Snivy,
   Tepig, and Oshawott across all six stats
3. `output/type_average_interactive.html` — interactive Plotly bar
   chart (hover for exact values, zoom, pan) of average total stats per
   primary type.

It also saves data/pokemon_stats.csv, the cleaned, processed dataset.

Note: this script requires an active internet connection since it always
calls the live PokeAPI


## How to run

```
python3 -m venv venv
source venv/bin/activate

pip install requests pandas matplotlib plotly numpy

python3 main.py
```

To save a log:
```
python3 main.py | tee output/run_log_case1.txt
```

### Changing which Pokemon are analyzed

Edit the 'POKEMON' list near the top of main.py.