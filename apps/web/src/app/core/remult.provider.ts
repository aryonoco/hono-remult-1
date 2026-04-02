import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  type EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { remult } from 'remult';

import { devAuthInterceptor } from './dev-auth.interceptor';

export function provideRemult(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideHttpClient(withInterceptors([devAuthInterceptor])),
    provideAppInitializer(async () => {
      const httpClient: HttpClient = inject(HttpClient);
      remult.apiClient.httpClient = httpClient;
      await remult.initUser();
    }),
  ]);
}
