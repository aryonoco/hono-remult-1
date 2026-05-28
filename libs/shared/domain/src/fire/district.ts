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

  @Fields.boolean()
  isActive = true;
}

export const districtSchemaExtras: readonly string[] = [
  'ALTER TABLE "districts" ADD CONSTRAINT "districts_name_key" UNIQUE ("name")',
] as const;
