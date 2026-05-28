import { Entity, Fields } from 'remult';

import { Roles } from '../auth/roles';

@Entity<FinalReport>('finalReports', {
  allowApiRead: Roles.admin,
  allowApiInsert: Roles.admin,
  allowApiUpdate: Roles.admin,
  allowApiDelete: Roles.admin,
})
export class FinalReport {
  @Fields.id()
  id = '';

  @Fields.string()
  fireIncidentId = '';

  @Fields.integer({ allowApiUpdate: false })
  districtId = 0;

  @Fields.boolean({ allowApiUpdate: false })
  isParentDeleted = false;

  @Fields.boolean()
  isSignedOff = false;

  @Fields.date({ allowApiUpdate: false })
  signedOffAt?: Date;

  @Fields.string({ allowApiUpdate: false })
  signedOffBy = '';

  @Fields.date({ allowApiUpdate: false })
  signOffRemovedAt?: Date;

  @Fields.string({ allowApiUpdate: false })
  signOffRemovedBy = '';

  @Fields.string({ allowApiUpdate: false })
  createdBy = '';

  @Fields.createdAt()
  createdAt?: Date;

  @Fields.updatedAt()
  updatedAt?: Date;
}

export const finalReportSchemaExtras: readonly string[] = [
  'ALTER TABLE "finalReports" ADD CONSTRAINT "finalReports_fireIncidentId_key" UNIQUE ("fireIncidentId")',
] as const;
