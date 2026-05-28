import { Entity, Fields } from 'remult';

import { Roles } from '../auth/roles';

@Entity<SituationReport>('situationReports', {
  allowApiRead: Roles.admin,
  allowApiInsert: Roles.admin,
  allowApiUpdate: Roles.admin,
  allowApiDelete: Roles.admin,
})
export class SituationReport {
  @Fields.id()
  id = '';

  @Fields.string()
  fireIncidentId = '';

  @Fields.integer({ allowApiUpdate: false })
  reportNumber = 0;

  @Fields.integer({ allowApiUpdate: false })
  districtId = 0;

  @Fields.boolean({ allowApiUpdate: false })
  isParentDeleted = false;

  @Fields.string({ allowApiUpdate: false })
  submittedBy = '';

  @Fields.date({ allowApiUpdate: false })
  submittedAt?: Date;

  @Fields.createdAt()
  createdAt?: Date;
}
