-- Create "tasks" table
CREATE TABLE "tasks" (
  "id" character varying NOT NULL DEFAULT '',
  "title" character varying NOT NULL DEFAULT '',
  "completed" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NULL,
  "createdBy" character varying NOT NULL DEFAULT '',
  PRIMARY KEY ("id")
);
