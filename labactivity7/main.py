import requests
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
import plotly.express as px
import os
import sys
import subprocess
import platform


def open_file(path: str):

    try:
        is_wsl = "microsoft" in platform.uname().release.lower()
        if is_wsl:
            win_path = subprocess.check_output(["wslpath", "-w", path]).decode().strip()
            subprocess.run(["explorer.exe", win_path])
        elif platform.system() == "Darwin":
            subprocess.run(["open", path])
        elif platform.system() == "Windows":
            os.startfile(path)
        else:
            subprocess.run(["xdg-open", path])
    except Exception as e:
        print(f"  [INFO] Could not auto-open {path} ({e}). Please open it manually.")

BASE_URL = "https://pokeapi.co/api/v2/pokemon/"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR) if os.path.basename(SCRIPT_DIR) == "src" else SCRIPT_DIR
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "output")
DATA_DIR = os.path.join(PROJECT_ROOT, "data")

STAT_KEYS = ["hp", "attack", "defense", "special-attack", "special-defense", "speed"]

POKEMON = [ # These pokemons are starters from gen 5-9, edit this if you want other pokemon, etc.
    "snivy", "tepig", "oshawott",     
    "chespin", "fennekin", "froakie",   
    "rowlet", "litten", "popplio",     
    "grookey", "scorbunny", "sobble",   
    "sprigatito", "fuecoco", "quaxly", 
]


def fetch_pokemon(name: str) -> dict | None:
    url = f"{BASE_URL}{name.lower().strip()}"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
    except requests.exceptions.HTTPError:
        print(f"  [ERROR] '{name}' not found on PokeAPI (HTTP {response.status_code}). Skipping.")
        return None
    except requests.exceptions.ConnectionError:
        print(f"  [ERROR] Could not connect to PokeAPI while fetching '{name}'. "
              f"Please check that you are connected to the internet and try again.")
        return None
    except requests.exceptions.Timeout:
        print(f"  [ERROR] Request timed out while fetching '{name}'. "
              f"Please check your internet connection and try again.")
        return None
    except requests.exceptions.RequestException as e:
        print(f"  [ERROR] Network error while fetching '{name}': {e}. Skipping.")
        return None

    payload = response.json()
    stats = {s["stat"]["name"]: s["base_stat"] for s in payload["stats"]}
    return {
        "name": payload["name"].capitalize(),
        "type": payload["types"][0]["type"]["name"],
        **{k: stats.get(k, 0) for k in STAT_KEYS},
    }


def fetch_many(names: list[str]) -> pd.DataFrame:
    records = []
    for name in names:
        print(f"Fetching {name} ...")
        record = fetch_pokemon(name)
        if record is not None:
            records.append(record)
    if not records:
        print("No valid Pokemon data was retrieved. Exiting.")
        sys.exit(1)
    return pd.DataFrame(records)


def chart_grouped_bar(df: pd.DataFrame):
    df = df.copy()
    df["total"] = df[STAT_KEYS].sum(axis=1)
    df = df.sort_values("total", ascending=False)

    fig, ax = plt.subplots(figsize=(11, 6))
    bars = ax.bar(df["name"], df["total"], color="#4C72B0")
    ax.set_title("Total Base Stats by  Pokemon chosen", fontsize=14, fontweight="bold")
    ax.set_xlabel("Pokemon")
    ax.set_ylabel("Sum of Base Stats (HP+ATK+DEF+SPA+SPD+SPE)")
    ax.bar_label(bars, padding=3)
    plt.xticks(rotation=40, ha="right")
    plt.tight_layout()
    path = os.path.join(OUTPUT_DIR, "total_stats_bar.png")
    plt.savefig(path, dpi=150)
    plt.close()
    print(f"Saved: {path}")
    open_file(path)


def chart_radar(df: pd.DataFrame, names: list[str]):
    subset = df[df["name"].str.lower().isin([n.lower() for n in names])]
    labels = ["HP", "Attack", "Defense", "Sp.Atk", "Sp.Def", "Speed"]
    angles = np.linspace(0, 2 * np.pi, len(labels), endpoint=False).tolist()
    angles += angles[:1]

    fig, ax = plt.subplots(figsize=(7, 7), subplot_kw=dict(polar=True))
    for _, row in subset.iterrows():
        values = [row[k] for k in STAT_KEYS]
        values += values[:1]
        ax.plot(angles, values, linewidth=2, label=row["name"])
        ax.fill(angles, values, alpha=0.1)

    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(labels)
    ax.set_title("Base Stat Comparison (Radar)", fontsize=14, fontweight="bold", pad=20)
    ax.legend(loc="upper right", bbox_to_anchor=(1.3, 1.1))
    plt.tight_layout()
    path = os.path.join(OUTPUT_DIR, "radar_comparison.png")
    plt.savefig(path, dpi=150)
    plt.close()
    print(f"Saved: {path}")
    open_file(path)


def chart_interactive_type_avg(df: pd.DataFrame):
    df = df.copy()
    df["total"] = df[STAT_KEYS].sum(axis=1)
    type_avg = df.groupby("type", as_index=False)["total"].mean().sort_values("total", ascending=False)

    fig = px.bar(
        type_avg,
        x="type",
        y="total",
        color="type",
        title="Average Total Base Stats by Primary Type",
        labels={"total": "Average Total Base Stats", "type": "Primary Type"},
        text_auto=".1f",
    )
    fig.update_layout(showlegend=False)
    path = os.path.join(OUTPUT_DIR, "type_average_interactive.html")
    fig.write_html(path)
    print(f"Saved: {path}")
    open_file(path)


def check_internet_connection() -> bool:
    try:
        requests.get(BASE_URL, timeout=5)
        return True
    except requests.exceptions.RequestException:
        return False


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(DATA_DIR, exist_ok=True)

    if not check_internet_connection():
        print("[ERROR] Cannot reach PokeAPI (https://pokeapi.co).")
        print("        Please make sure you are connected to the internet, then run this script again.")
        sys.exit(1)

    print("Fetching Pokemon data from PokeAPI")
    df = fetch_many(POKEMON)

    csv_path = os.path.join(DATA_DIR, "pokemon_stats.csv")
    df.to_csv(csv_path, index=False)
    print(f"\nSaved processed data: {csv_path}")
    print("\n Data Preview ")
    print(df.to_string(index=False))

    print("\n Generating charts")
    chart_grouped_bar(df)
    chart_radar(df, ["Snivy", "Tepig", "Oshawott"])
    chart_interactive_type_avg(df)

    print("\n Interpretation ")
    df["total"] = df[STAT_KEYS].sum(axis=1)
    best = df.loc[df["total"].idxmax()]
    print(f"Highest total base stats among sampled pokemons: {best['name']} ({best['total']})")
    print("See output/ for charts and data/pokemon_stats.csv for the full processed dataset.")


if __name__ == "__main__":
    main()