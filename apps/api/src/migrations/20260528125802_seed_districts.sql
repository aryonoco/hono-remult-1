-- Seed Victorian fire districts for the showcase. Three (Otway 12,
-- Latrobe 47, Mallee 22) have direct user affiliation in DEV_USERS;
-- the remaining two (Far South West 14, Yarra 53) exist as unstaffed
-- districts to exercise the StateOfficer/Admin "create in any district"
-- path. See docs/02-fire-showcase-overview.md lines 153-172, 191.
INSERT INTO "districts" ("id", "name", "regionId", "regionName", "isActive") VALUES
  (12, 'Otway', 8, 'Barwon South West', true),
  (14, 'Far South West', 8, 'Barwon South West', true),
  (22, 'Mallee', 7, 'Loddon Mallee', true),
  (47, 'Latrobe', 4, 'Gippsland', true),
  (53, 'Yarra', 5, 'Port Phillip', true);
