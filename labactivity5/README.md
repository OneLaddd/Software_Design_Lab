# Lab Activity 5: Data Modeling and Introduction to SQL
by John David C. Ajon

**CPE106L-4 Software Design Laboratory**

## Overview

A small relational database built with SQL and queried via terminal and Python print outs. The theme is based on "Got Dropped Into a Ghost Story, Still Got to Work" (GSGW) by Baek Dook-su.
## Files

- `schema.sql`: table creation
- `seed.sql`: insert data
- `main.py` — runs the test queries
- `database.db` — generated SQLite database
- `README.md` — this file

## Schema

- organizations -> characters -> darknesses -> expeditions -> participants 
(links characters to expeditions, with survival status)

## Terms

- organizations - groups/factions characters belong to (e.g., Daydream Inc.)
- characters - the people in the story (name, alias, whether they're supernatural, etc.)
- darknesses - the anomalies/dungeons from the novel (title, rank, sometimes hosted by a character)
- expeditions - attempts made against a specific darkness (date, outcome, points earned)
- participants - record of which characters joined which expedition, and whether they survived

## How to Run

```
sqlite3 
.read schema.sql
.read seed.sql
{Any SQL prompt here}
or optionally...
python3 main.py
```

## Test Cases

1. Simple select - list all darknesses with rank.
2. Join - expedition + darkness + participant + character details.
3. Aggregate - total points earned per character.


