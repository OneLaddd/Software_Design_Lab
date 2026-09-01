
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": os.getenv("DB_PORT", "5432"),
    "dbname": os.getenv("DB_NAME", "tarot_registry"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
}


def get_connection():
    return psycopg2.connect(**DB_CONFIG)


def run_setup(cur, conn):
    with open("schema.sql", "r") as f:
        cur.execute(f.read())
    with open("seed.sql", "r") as f:
        cur.execute(f.read())
    conn.commit()
    print("Schema created and seed data loaded.\n")


def run_query(cur, title, sql, params=None):
    print(f"{title}")
    cur.execute(sql, params or ())
    rows = cur.fetchall()
    if not rows:
        print("(no results)")
    for row in rows:
        print(row)
    print()


def main():
    conn = get_connection()
    cur = conn.cursor()

    run_setup(cur, conn)

    run_query(
        cur,
        "Test 1: High Sequence Threats (<=4)",
        """
        SELECT codename, pathway, sequence, organization_id
        FROM beyonders
        WHERE sequence <= %s
        ORDER BY sequence;
        """,
        (4,),
    )

    run_query(
        cur,
        "Test 2: Tarot Club Roster",
        """
        SELECT b.codename, b.true_name, b.sequence
        FROM beyonders b
        JOIN organizations o ON b.organization_id = o.organization_id
        WHERE o.name = %s;
        """,
        ("Tarot Club",),
    )

    run_query(
        cur,
        "Test 3: Flagged as Dangerous",
        """
        SELECT codename, pathway, sequence
        FROM beyonders
        WHERE is_dangerous = TRUE
        ORDER BY sequence;
        """,
    )

    run_query(
        cur,
        "Test 4: Beyonders and Their Sealed Artifacts",
        """
        SELECT b.codename, a.name, a.danger_level
        FROM beyonders b
        JOIN sealed_artifacts a ON a.owner_id = b.beyonder_id
        ORDER BY a.danger_level DESC;
        """,
    )

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()