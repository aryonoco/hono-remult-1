-- Expand the district reference data from the original 5 showcase districts
-- to the full DEECA statewide set of 16 fire districts across 6 regions, and
-- backfill the enrichment columns added by 20260531124342_enrich_districts.
--
-- Codes, ROSE names and external ids are the authoritative DEECA district
-- reference values. Region codes use the canonical region numbering (so
-- Grampians = 10).
-- The original 5 rows (Otway 12, Far South West 14, Mallee 22, Latrobe 47,
-- Yarra 53) were inserted by 20260528125802_seed_districts and are updated in
-- place here. See docs/03-fixtures-overview.md.

-- Backfill the five existing districts with their enrichment attributes.
UPDATE "districts" SET "roseName" = 'OTWAY FIRE DISTRICT',          "regionRoseName" = 'BARWON SOUTH WEST REGION', "ifisId" = 10,     "deecaCostCentre" = 5374, "pvCostCentre" = 617 WHERE "id" = 12;
UPDATE "districts" SET "roseName" = 'FAR SOUTH WEST FIRE DISTRICT', "regionRoseName" = 'BARWON SOUTH WEST REGION', "ifisId" = 12,     "deecaCostCentre" = 5364, "pvCostCentre" = 601 WHERE "id" = 14;
UPDATE "districts" SET "roseName" = 'MALLEE FIRE DISTRICT',         "regionRoseName" = 'LODDON MALLEE REGION',     "ifisId" = 14,     "deecaCostCentre" = 6392, "pvCostCentre" = 624 WHERE "id" = 22;
UPDATE "districts" SET "roseName" = 'LATROBE FIRE DISTRICT',        "regionRoseName" = 'GIPPSLAND REGION',         "ifisId" = 28,     "deecaCostCentre" = 4650, "pvCostCentre" = 404 WHERE "id" = 47;
UPDATE "districts" SET "roseName" = 'YARRA FIRE DISTRICT',          "regionRoseName" = 'PORT PHILLIP REGION',      "ifisId" = 987740, "deecaCostCentre" = 1310, "pvCostCentre" = 402 WHERE "id" = 53;

-- Insert the remaining eleven districts.
INSERT INTO "districts"
  ("id", "name", "regionId", "regionName", "roseName", "regionRoseName", "ifisId", "deecaCostCentre", "pvCostCentre", "isActive")
VALUES
  (13, 'Wimmera',           10, 'Grampians',     'WIMMERA FIRE DISTRICT',          'GRAMPIANS REGION',     11,     5394, 610, true),
  (15, 'Midlands',          10, 'Grampians',     'MIDLANDS FIRE DISTRICT',         'GRAMPIANS REGION',     739098, 5384, 644, true),
  (21, 'Murray Goldfields',  7, 'Loddon Mallee', 'MURRAY GOLDFIELDS FIRE DISTRICT','LODDON MALLEE REGION', 13,     6391, 638, true),
  (34, 'Ovens',              3, 'Hume',          'OVENS FIRE DISTRICT',            'HUME REGION',          18,     3374, 501, true),
  (36, 'Upper Murray',       3, 'Hume',          'UPPER MURRAY FIRE DISTRICT',     'HUME REGION',          20,     3353, 514, true),
  (37, 'Goulburn',           3, 'Hume',          'GOULBURN FIRE DISTRICT',         'HUME REGION',          628857, 3368, 509, true),
  (38, 'Murrindindi',        3, 'Hume',          'MURRINDINDI FIRE DISTRICT',      'HUME REGION',          628856, 3399, 519, true),
  (41, 'Tambo',              4, 'Gippsland',     'TAMBO FIRE DISTRICT',            'GIPPSLAND REGION',     22,     4610, 540, true),
  (44, 'Macalister',         4, 'Gippsland',     'MACALISTER FIRE DISTRICT',       'GIPPSLAND REGION',     25,     4620, 536, true),
  (45, 'Snowy',              4, 'Gippsland',     'SNOWY FIRE DISTRICT',            'GIPPSLAND REGION',     26,     4640, 547, true),
  (52, 'Metropolitan',       5, 'Port Phillip',  'METROPOLITAN FIRE DISTRICT',     'PORT PHILLIP REGION',  32,     1330, 401, true);
