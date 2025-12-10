import { Injectable, inject } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptorFn,
  HttpHandlerFn
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';

/**
 * Service to track loading state
 * Your existing loading service - adjust as needed
 */
@Injectable({
  providedIn: 'root'
})
export class LoadingService {
  private activeRequests = 0;
  
  private _isLoading = false;
  get isLoading(): boolean {
    return this._isLoading;
  }
  
  show(): void {
    this.activeRequests++;
    this._isLoading = true;
  }
  
  hide(): void {
    this.activeRequests--;
    if (this.activeRequests <= 0) {
      this.activeRequests = 0;
      this._isLoading = false;
    }
  }
}

/**
 * URLs/patterns that should NOT trigger the loading indicator
 * TUS uploads are handled separately with their own progress UI
 */
const NON_BLOCKING_URL_PATTERNS = [
  '/api/tus',           // TUS upload endpoint
  'tus-resumable',      // TUS protocol header indicator
];

/**
 * Check if a request should bypass the loading indicator
 */
function shouldBypassLoading(request: HttpRequest<unknown>): boolean {
  // Check URL patterns
  const urlBypass = NON_BLOCKING_URL_PATTERNS.some(pattern => 
    request.url.toLowerCase().includes(pattern.toLowerCase())
  );
  
  // Check for TUS-specific headers
  const hasTusHeader = request.headers.has('Tus-Resumable') || 
                       request.headers.has('Upload-Offset') ||
                       request.headers.has('Upload-Length');
  
  // Check for custom header that can be set to bypass loading
  const hasSkipHeader = request.headers.has('X-Skip-Loading');
  
  return urlBypass || hasTusHeader || hasSkipHeader;
}

/**
 * Class-based interceptor (for older Angular versions or module-based setup)
 */
@Injectable()
export class LoadingInterceptor implements HttpInterceptor {
  constructor(private loadingService: LoadingService) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    // Skip loading indicator for TUS and other non-blocking requests
    if (shouldBypassLoading(request)) {
      return next.handle(request);
    }

    // Show loading for all other requests
    this.loadingService.show();

    return next.handle(request).pipe(
      finalize(() => {
        this.loadingService.hide();
      })
    );
  }
}

/**
 * Functional interceptor (for Angular 15+ standalone setup)
 * Use this if you're using the new functional interceptor pattern
 */
export const loadingInterceptorFn: HttpInterceptorFn = (
  request: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const loadingService = inject(LoadingService);
  
  // Skip loading indicator for TUS and other non-blocking requests
  if (shouldBypassLoading(request)) {
    console.log('[LoadingInterceptor] Bypassing loading for:', request.url);
    return next(request);
  }

  // Show loading for all other requests
  loadingService.show();

  return next(request).pipe(
    finalize(() => {
      loadingService.hide();
    })
  );
};

/**
 * Helper to add skip-loading header to a request
 * Use this for any request that shouldn't trigger loading UI
 */
export function skipLoading<T>(request: HttpRequest<T>): HttpRequest<T> {
  return request.clone({
    setHeaders: {
      'X-Skip-Loading': 'true'
    }
  });
}