import type { HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';

import { DevAuthService } from './dev-auth.service';

export const devAuthInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  const devAuth: DevAuthService = inject(DevAuthService);
  const userId: string | undefined = devAuth.currentUserId;

  if (userId) {
    return next(req.clone({ setHeaders: { 'X-Dev-User': userId } }));
  }

  return next(req);
};
