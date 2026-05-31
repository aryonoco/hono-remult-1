import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { type ThemeMode, ThemeService } from '../../../core/theme.service';

const THEME_ICONS: Readonly<Record<ThemeMode, string>> = {
  light: 'light_mode',
  dark: 'dark_mode',
  system: 'brightness_auto',
};

const THEME_LABELS: Readonly<Record<ThemeMode, string>> = {
  light: 'Switch to dark theme',
  dark: 'Switch to system theme',
  system: 'Switch to light theme',
};

@Component({
  selector: 'app-theme-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  template: `
    <button matIconButton [attr.aria-label]="label()" (click)="theme.cycle()">
      <mat-icon>{{ icon() }}</mat-icon>
    </button>
  `,
})
export class ThemeToggleComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly icon = computed(() => THEME_ICONS[this.theme.theme()]);
  protected readonly label = computed(() => THEME_LABELS[this.theme.theme()]);
}
