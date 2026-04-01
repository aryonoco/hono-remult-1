import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';

// biome-ignore lint/suspicious/noConsole: bootstrap error must be reported to the console
bootstrapApplication(App, appConfig).catch((err) => console.error(err));
