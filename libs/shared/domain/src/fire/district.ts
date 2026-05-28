import { Allow, Entity, Fields } from 'remult';

import { Roles } from '../auth/roles';

@Entity<District>('districts', {
  id: 'id',
  allowApiRead: Allow.authenticated,
  allowApiInsert: Roles.admin,
  allowApiUpdate: Roles.admin,
  allowApiDelete: Roles.admin,
  defaultOrderBy: { name: 'asc' },
})
export class District {
  @Fields.integer()
  id = 0;

  @Fields.string()
  name = '';

  @Fields.integer()
  regionId = 0;

  @Fields.string()
  regionName = '';

  @Fields.boolean()
  isActive = true;
}

export const districtSchemaExtras: readonly string[] = [
  'ALTER TABLE "districts" ADD CONSTRAINT "districts_name_key" UNIQUE ("name")',
] as const;
