
CREATE TABLE organizations (
    org_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    org_type    TEXT NOT NULL 
);

CREATE TABLE characters (
    character_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    alias           TEXT,   
    is_supernatural INTEGER NOT NULL DEFAULT 0, 
    org_id          INTEGER,
    FOREIGN KEY (org_id) REFERENCES organizations(org_id)
);

CREATE TABLE darknesses (
    darkness_id INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT UNIQUE,      
    title       TEXT NOT NULL,  
    rank        TEXT NOT NULL,      
    host_entity_id INTEGER,
    FOREIGN KEY (host_entity_id) REFERENCES characters(character_id)
);


CREATE TABLE expeditions (
    expedition_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    darkness_id     INTEGER NOT NULL,
    expedition_date TEXT NOT NULL, 
    outcome         TEXT NOT NULL,     
    points_earned   INTEGER DEFAULT 0,
    FOREIGN KEY (darkness_id) REFERENCES darknesses(darkness_id)
);


CREATE TABLE participants (
    expedition_id   INTEGER NOT NULL,
    character_id    INTEGER NOT NULL,
    survived        INTEGER NOT NULL DEFAULT 1, 
    PRIMARY KEY (expedition_id, character_id),
    FOREIGN KEY (expedition_id) REFERENCES expeditions(expedition_id),
    FOREIGN KEY (character_id) REFERENCES characters(character_id)
);