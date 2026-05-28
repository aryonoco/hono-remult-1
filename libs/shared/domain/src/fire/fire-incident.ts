import { Entity, Fields } from 'remult';

import { Roles } from '../auth/roles';

@Entity<FireIncident>('fireIncidents', {
  allowApiRead: Roles.admin,
  allowApiInsert: Roles.admin,
  allowApiUpdate: Roles.admin,
  allowApiDelete: Roles.admin,
})
export class FireIncident {
  @Fields.id()
  id = '';

  @Fields.integer()
  districtId = 0;

  @Fields.string({ allowApiUpdate: false })
  createdBy = '';

  @Fields.createdAt()
  createdAt?: Date;

  @Fields.updatedAt()
  updatedAt?: Date;
}
