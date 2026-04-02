import { Component, type OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { Task } from '@workspace/shared-domain';
import type { Repository } from 'remult';
import { remult } from 'remult';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private readonly taskRepo: Repository<Task> = remult.repo(Task);
  protected readonly tasks = signal<Task[]>([]);
  protected newTaskTitle = '';

  async ngOnInit(): Promise<void> {
    await this.loadTasks();
  }

  protected async addTask(): Promise<void> {
    if (!this.newTaskTitle.trim()) {
      return;
    }
    await this.taskRepo.insert({ title: this.newTaskTitle.trim() });
    this.newTaskTitle = '';
    await this.loadTasks();
  }

  protected async toggleCompleted(task: Task): Promise<void> {
    await this.taskRepo.update(task.id, { completed: !task.completed });
    await this.loadTasks();
  }

  protected async deleteTask(task: Task): Promise<void> {
    await this.taskRepo.delete(task.id);
    await this.loadTasks();
  }

  private async loadTasks(): Promise<void> {
    const result: Task[] = await this.taskRepo.find({
      orderBy: { createdAt: 'desc' },
    });
    this.tasks.set(result);
  }
}
