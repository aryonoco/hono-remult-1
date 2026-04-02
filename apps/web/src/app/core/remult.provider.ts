import { HttpClient, provideHttpClient } from '@angular/common/http';
import {
  type EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { remult } from 'remult';

export function provideRemult(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideHttpClient(),
    provideAppInitializer(() => {
      const httpClient: HttpClient = inject(HttpClient);
      remult.apiClient.httpClient = httpClient;
    }),
  ]);
}
