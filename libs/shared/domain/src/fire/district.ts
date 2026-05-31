import { Allow, Entity, Fields, Validators } from 'remult';

import { Roles } from '../auth/roles';
import { LIMITS } from './helpers';

@Entity<District>('districts', {
  id: 'id',
  allowApiRead: Allow.authenticated,
  allowApiInsert: Roles.admin,
  allowApiUpdate: Roles.admin,
  allowApiDelete: Roles.admin,
  defaultOrderBy: { name: 'asc' },
})
export class District {
  @Fields.integer({ validate: Validators.range([LIMITS.districtIdMin, LIMITS.districtIdMax]) })
  id = 0;

  @Fields.string({ validate: [Validators.required, Validators.maxLength(LIMITS.shortText)] })
  name = '';

  @Fields.integer({ validate: Validators.required })
  regionId = 0;

  @Fields.string({ validate: [Validators.required, Validators.maxLength(LIMITS.shortText)] })
  regionName = '';

  // ROSE (the DEECA Resource and Operational Support Environment) names are the
  // formal, upper-case identifiers the department uses in operational systems —
  // e.g. "OTWAY FIRE DISTRICT" / "BARWON SOUTH WEST REGION". Reference metadata
  // on this admin-only entity, so not form-required, but always populated by the
  // seed so the showcase data matches what operators see in source systems.
  @Fields.string({ validate: Validators.maxLength(LIMITS.mediumText) })
  roseName = '';

  @Fields.string({ validate: Validators.maxLength(LIMITS.mediumText) })
  regionRoseName = '';

  // External reference codes. Nullable because they identify the district in
  // other corporate systems rather than constraining the domain: IFIS (the fire
  // information system) id, and the DEECA / Parks Victoria cost-centre numbers.
  @Fields.integer({ allowNull: true, validate: Validators.min(0) })
  ifisId?: number;

  @Fields.integer({ allowNull: true, validate: Validators.min(0) })
  deecaCostCentre?: number;

  @Fields.integer({ allowNull: true, validate: Validators.min(0) })
  pvCostCentre?: number;

  @Fields.boolean()
  isActive = true;
}

export const districtSchemaExtras: readonly string[] = [
  'ALTER TABLE "districts" ADD CONSTRAINT "districts_name_key" UNIQUE ("name")',
] as const;
