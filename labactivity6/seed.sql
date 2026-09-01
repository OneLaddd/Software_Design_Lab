INSERT INTO organizations (name, org_type, headquarters) VALUES
('Tarot Club',        'Secret Society', 'Backlund'),
('Church of Storms',  'Church',         'Feysac'),
('Loen Kingdom',      'Kingdom',        'Backlund'),
('Nighthawk Gang',    'Gang',           'Backlund'),
('Feysac',            'Nation',         'Rewsburg');

INSERT INTO beyonders (codename, true_name, pathway, sequence, organization_id, location, is_dangerous) VALUES
('Fool',           'Klein Moretti',                     'Door',       4, (SELECT organization_id FROM organizations WHERE name = 'Tarot Club'),       'Backlund',  TRUE),
('Justice',        NULL,                                 'Warrior',    4, (SELECT organization_id FROM organizations WHERE name = 'Tarot Club'),       'Backlund',  TRUE),
('Hanged Man',     'Alger Wilson',                       'Spectator',  4, (SELECT organization_id FROM organizations WHERE name = 'Tarot Club'),       'Backlund',  TRUE),
('Sun',            'Zhuo Buyi',                          'Warrior',    4, (SELECT organization_id FROM organizations WHERE name = 'Feysac'),           'Rewsburg',  TRUE),
('Twilight Girl',  'Rosina Wall',                        'Spectator',  5, (SELECT organization_id FROM organizations WHERE name = 'Tarot Club'),       'Backlund',  FALSE),
('Clown',          'William Sherlock Shelley Hathaway',  'Spectator',  3, (SELECT organization_id FROM organizations WHERE name = 'Tarot Club'),       'Backlund',  TRUE),
('Steamite',       'Melisa Ruen',                        'Visionary',  6, (SELECT organization_id FROM organizations WHERE name = 'Loen Kingdom'),     'Backlund',  FALSE),
('Demoness',       'Justina',                            'Demoness',   3, (SELECT organization_id FROM organizations WHERE name = 'Nighthawk Gang'),   'Backlund',  TRUE);

INSERT INTO sealed_artifacts (name, danger_level, owner_id, description) VALUES
('Grey Fog Serum',        5, (SELECT beyonder_id FROM beyonders WHERE codename = 'Fool'),       'Potion granting the Seer Pathway; extremely volatile if misused.'),
('Tarot Deck of Fate',    3, (SELECT beyonder_id FROM beyonders WHERE codename = 'Fool'),       'A relic used for divination within the Tarot Club.'),
('Corrupted Rulebook',    4, (SELECT beyonder_id FROM beyonders WHERE codename = 'Hanged Man'), 'A Spectator-pathway item that alters memory when read.'),
('Twin Iron Sabers',      2, (SELECT beyonder_id FROM beyonders WHERE codename = 'Sun'),        'Blessed weapons wielded by a high-Sequence Warrior.');