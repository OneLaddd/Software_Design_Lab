-- Insert all data

INSERT INTO organizations (name, org_type) VALUES
    ('Daydream Inc.', 'Corporation'),
    ('Supernatural Disaster Management Bureau', 'Government Bureau'),
    ('Independent / Unaffiliated', 'None');

INSERT INTO characters (name, alias, is_supernatural, org_id) VALUES
    ('Kim Soleum', 'Roe Deer', 0, 1),
    ('Lee Jaheon', 'Group D Leader', 0, 1),
    ('Baek Saheon', 'Viper', 0, 3),
    ('Agent Choi', NULL, 0, 2),
    ('Braun', 'Good Friend', 1, 3);

INSERT INTO darknesses (code, title, rank, host_entity_id) VALUES
    ('1793P', 'Looky Mart', 'B-Class', NULL),
    ('A88', 'Tamra Express Disaster', 'C-Class', NULL),
    ('43', 'Brauns Tuesday Quiz Show', 'D-Class', 5),
    ('104', 'Chorus of Living Sacrifices', 'A-Class', NULL);

INSERT INTO expeditions (darkness_id, expedition_date, outcome, points_earned) VALUES
    (1, '2025-03-04', 'Fatal', 0),
    (2, '2025-04-11', 'Cleared', 1000),
    (3, '2025-05-02', 'Cleared', 100),
    (4, '2025-06-19', 'Escaped', 100000);

INSERT INTO participants (expedition_id, character_id, survived) VALUES
    (1, 1, 1),  -- Kim Soleum survives Looky Mart
    (1, 4, 0),  -- Agent Choi dies in Looky Mart
    (2, 1, 1),  -- Kim Soleum on Tamra Express
    (2, 3, 1),  -- Baek Saheon on Tamra Express
    (3, 1, 1),  -- Kim Soleum on Braun's Quiz Show
    (3, 5, 1),  -- Braun hosts his own show
    (4, 1, 1),  -- Kim Soleum in Chorus of Living Sacrifices which derived from the brauns quiz
    (4, 5, 1);  -- Braun is the owner so...