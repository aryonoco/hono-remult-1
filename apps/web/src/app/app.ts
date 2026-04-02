import { Component, DestroyRef, inject, type OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { Task } from '@workspace/shared-domain';
import { ResultAsync } from 'neverthrow';
import type { Repository } from 'remult';
import { remult } from 'remult';

import { DevUserSwitcherComponent } from './shared/components/dev-user-switcher';

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, FormsModule, DevUserSwitcherComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly taskRepo: Repository<Task> = remult.repo(Task);
  protected readonly tasks = signal<Task[]>([]);
  protected readonly error = signal<string | null>(null);
  protected newTaskTitle = '';

  constructor() {
    const unsubscribe = remult.subscribeAuth(() => {
      this.loadTasks().catch((err: unknown) => {
        this.error.set(toErrorMessage(err));
      });
    });
    this.destroyRef.onDestroy(unsubscribe);
  }

  async ngOnInit(): Promise<void> {
    await this.loadTasks();
  }

  protected async addTask(): Promise<void> {
    if (!this.newTaskTitle.trim()) {
      return;
    }
    const result = await ResultAsync.fromPromise(
      this.taskRepo.insert({ title: this.newTaskTitle.trim() }),
      toErrorMessage,
    );
    if (result.isErr()) {
      this.error.set(result.error);
      return;
    }
    this.newTaskTitle = '';
    await this.loadTasks();
  }

  protected async toggleCompleted(task: Task): Promise<void> {
    const result = await ResultAsync.fromPromise(
      this.taskRepo.update(task.id, { completed: !task.completed }),
      toErrorMessage,
    );
    if (result.isErr()) {
      this.error.set(result.error);
      return;
    }
    await this.loadTasks();
  }

  protected async deleteTask(task: Task): Promise<void> {
    const result = await ResultAsync.fromPromise(this.taskRepo.delete(task.id), toErrorMessage);
    if (result.isErr()) {
      this.error.set(result.error);
      return;
    }
    await this.loadTasks();
  }

  private async loadTasks(): Promise<void> {
    const result = await ResultAsync.fromPromise(
      this.taskRepo.find({ orderBy: { createdAt: 'desc' } }),
      toErrorMessage,
    );
    if (result.isErr()) {
      this.error.set(result.error);
      return;
    }
    this.error.set(null);
    this.tasks.set(result.value);
  }
}
