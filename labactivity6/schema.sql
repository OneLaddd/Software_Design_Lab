DROP TABLE IF EXISTS sealed_artifacts;
DROP TABLE IF EXISTS beyonders;
DROP TABLE IF EXISTS organizations;


CREATE TABLE organizations (
    organization_id SERIAL PRIMARY KEY,
    name             VARCHAR(60) NOT NULL UNIQUE, 
    org_type         VARCHAR(30),    
    headquarters     VARCHAR(60)
);

CREATE TABLE beyonders (
    beyonder_id     SERIAL PRIMARY KEY,
    codename        VARCHAR(50) NOT NULL,    
    true_name       VARCHAR(50),             
    pathway         VARCHAR(30) NOT NULL,
    sequence        SMALLINT NOT NULL CHECK (sequence BETWEEN 0 AND 9),
    organization_id INT REFERENCES organizations(organization_id),
    location        VARCHAR(60),
    is_dangerous    BOOLEAN DEFAULT FALSE
);

CREATE TABLE sealed_artifacts (
    artifact_id     SERIAL PRIMARY KEY,
    name            VARCHAR(60) NOT NULL, 
    danger_level    SMALLINT CHECK (danger_level BETWEEN 1 AND 5),
    owner_id        INT REFERENCES beyonders(beyonder_id),
    description     VARCHAR(200)
);