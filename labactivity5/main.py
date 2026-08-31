import sqlite3

DB_FILE = "database.db"

def run_test_queries(conn):
    cur = conn.cursor()

    print("\nTEST CASE 1: Simple select all darknesses and their rank")
    cur.execute("SELECT title, rank FROM darknesses ORDER BY title")
    for row in cur.fetchall():
        print(row)

    print("\nTEST CASE 2: join every expedition with its darkness title and participants")
    cur.execute("""
        SELECT d.title, e.expedition_date, e.outcome, c.name, p.survived
        FROM expeditions e
        JOIN darknesses d ON e.darkness_id = d.darkness_id
        JOIN participants p ON e.expedition_id = p.expedition_id
        JOIN characters c ON p.character_id = c.character_id
        ORDER BY d.title, c.name
    """)
    for row in cur.fetchall():
        print(row)

    print("\nTEST CASE 3: Aggregate total points earned per character")
    cur.execute("""
        SELECT c.name, SUM(e.points_earned) AS total_points
        FROM characters c
        JOIN participants p ON c.character_id = p.character_id
        JOIN expeditions e ON p.expedition_id = e.expedition_id
        GROUP BY c.name
        ORDER BY total_points DESC
    """)
    for row in cur.fetchall():
        print(row)

if __name__ == "__main__":
    connection = sqlite3.connect(DB_FILE)
    run_test_queries(connection)
    connection.close()