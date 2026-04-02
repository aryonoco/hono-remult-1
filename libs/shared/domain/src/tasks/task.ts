import { Allow, Entity, Fields, type LifecycleEvent, type Remult, remult } from 'remult';

import { Roles } from '../auth/roles';

@Entity('tasks', {
  allowApiRead: Allow.authenticated,
  allowApiInsert: Allow.authenticated,
  allowApiUpdate: (task: Task | undefined, c: Remult | undefined) => {
    if (!(task && c)) {
      return false;
    }
    return task.createdBy === c.user?.id || c.isAllowed(Roles.admin);
  },
  allowApiDelete: Roles.admin,
  apiPrefilter: () => {
    if (remult.isAllowed(Roles.admin)) {
      return {};
    }
    const userId: string = remult.user?.id ?? '';
    return { createdBy: userId };
  },
  saving: (task: Task, e: LifecycleEvent<Task>) => {
    if (e.isNew) {
      task.createdBy = remult.user?.id ?? '';
    }
  },
})
export class Task {
  @Fields.id()
  id = '';

  @Fields.string()
  title = '';

  @Fields.boolean()
  completed = false;

  @Fields.createdAt()
  createdAt?: Date;

  @Fields.string({ allowApiUpdate: false })
  createdBy = '';
}
