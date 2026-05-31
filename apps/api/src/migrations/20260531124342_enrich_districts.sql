-- Modify "districts" table
ALTER TABLE "districts" ADD COLUMN "roseName" character varying NOT NULL DEFAULT '', ADD COLUMN "regionRoseName" character varying NOT NULL DEFAULT '', ADD COLUMN "ifisId" integer NULL, ADD COLUMN "deecaCostCentre" integer NULL, ADD COLUMN "pvCostCentre" integer NULL;
