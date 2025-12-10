import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, from, of, EMPTY } from 'rxjs';
import {
  mergeMap,
  scan,
  tap,
  last,
  switchMap,
  catchError,
  finalize,
  takeUntil
} from 'rxjs/operators';
import * as tus from 'tus-js-client';
import { environment } from '../../environments/environment';

export interface FileUploadProgress {
  fileName: string;
  bytesUploaded: number;
  bytesTotal: number;
  percentage: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  error?: string;
}

export interface UploadResult {
  applicationId: string;
  successful: FileUploadProgress[];
  failed: FileUploadProgress[];
  allSuccessful: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class TusUploadService {
  // Signals for reactive UI updates
  private _fileProgress = signal<Map<string, FileUploadProgress>>(new Map());
  private _isUploading = signal<boolean>(false);
  private _currentApplicationId = signal<string | null>(null);

  // Public readonly signals
  readonly fileProgress = this._fileProgress.asReadonly();
  readonly isUploading = this._isUploading.asReadonly();
  readonly currentApplicationId = this._currentApplicationId.asReadonly();

  // Computed signal for overall progress
  readonly totalProgress = computed(() => {
    const progressMap = this._fileProgress();
    if (progressMap.size === 0) return 0;

    let totalBytes = 0;
    let uploadedBytes = 0;

    progressMap.forEach((progress) => {
      totalBytes += progress.bytesTotal;
      uploadedBytes += progress.bytesUploaded;
    });

    return totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;
  });

  // Computed signal for upload summary
  readonly uploadSummary = computed(() => {
    const progressMap = this._fileProgress();
    const files = Array.from(progressMap.values());
    return {
      total: files.length,
      pending: files.filter(f => f.status === 'pending').length,
      uploading: files.filter(f => f.status === 'uploading').length,
      complete: files.filter(f => f.status === 'complete').length,
      failed: files.filter(f => f.status === 'error').length
    };
  });

  private cancelSubject = new Subject<void>();
  private activeUploads: Map<string, tus.Upload> = new Map();

  // TUS endpoint - adjust based on your BFF URL
  private readonly tusEndpoint = `${environment.bffApiUrl}/api/tus`;

  constructor(private http: HttpClient) {}

  /**
   * Main method to process all document uploads for an application
   * This does NOT block the UI - progress is tracked via signals
   */
  processDocuments(files: File[], applicationId: string): Observable<UploadResult> {
    if (!files || files.length === 0) {
      return of({
        applicationId,
        successful: [],
        failed: [],
        allSuccessful: true
      });
    }

    // Reset state
    this._isUploading.set(true);
    this._currentApplicationId.set(applicationId);
    this._fileProgress.set(new Map());
    this.activeUploads.clear();

    // Initialize progress for all files
    const initialProgress = new Map<string, FileUploadProgress>();
    files.forEach((file, index) => {
      const fileKey = `${file.name}-${index}`;
      initialProgress.set(fileKey, {
        fileName: file.name,
        bytesUploaded: 0,
        bytesTotal: file.size,
        percentage: 0,
        status: 'pending'
      });
    });
    this._fileProgress.set(initialProgress);

    // Create indexed file array for tracking
    const indexedFiles = files.map((file, index) => ({
      file,
      key: `${file.name}-${index}`,
      index
    }));

    return from(indexedFiles).pipe(
      // Process up to 4 files concurrently
      mergeMap(
        ({ file, key, index }) => this.createTusUploadObservable(file, key, applicationId, index),
        4 // Concurrency limit
      ),
      // Aggregate progress updates
      scan((acc, progress) => {
        const newMap = new Map(acc);
        newMap.set(progress.fileName, progress);
        return newMap;
      }, new Map<string, FileUploadProgress>()),
      // Update the signal with each progress update
      tap((progressMap) => {
        this._fileProgress.set(progressMap);
      }),
      // Wait for all uploads to complete
      last(),
      // Notify backend that all uploads are complete
      switchMap((finalProgressMap) => {
        const results = Array.from(finalProgressMap.values());
        const successful = results.filter(r => r.status === 'complete');
        const failed = results.filter(r => r.status === 'error');

        // Only notify completion if at least some uploads succeeded
        if (successful.length > 0) {
          return this.notifyUploadsComplete(applicationId, successful.length, failed.length).pipe(
            switchMap(() => of({
              applicationId,
              successful,
              failed,
              allSuccessful: failed.length === 0
            })),
            catchError((error) => {
              console.error('Failed to notify upload completion:', error);
              return of({
                applicationId,
                successful,
                failed,
                allSuccessful: false
              });
            })
          );
        }

        return of({
          applicationId,
          successful,
          failed,
          allSuccessful: false
        });
      }),
      takeUntil(this.cancelSubject),
      finalize(() => {
        this._isUploading.set(false);
      }),
      catchError((error) => {
        console.error('Upload process error:', error);
        this._isUploading.set(false);
        return of({
          applicationId,
          successful: [],
          failed: Array.from(this._fileProgress().values()),
          allSuccessful: false
        });
      })
    );
  }

  /**
   * Creates an Observable wrapper around tus-js-client for a single file
   */
  private createTusUploadObservable(
    file: File,
    fileKey: string,
    applicationId: string,
    fileIndex: number
  ): Observable<FileUploadProgress> {
    return new Observable<FileUploadProgress>((observer) => {
      const upload = new tus.Upload(file, {
        endpoint: this.tusEndpoint,
        retryDelays: [0, 1000, 3000, 5000, 10000], // Retry with backoff
        chunkSize: 5 * 1024 * 1024, // 5MB chunks - adjust as needed
        metadata: {
          filename: file.name,
          filetype: file.type || 'application/octet-stream',
          applicationId: applicationId,
          fileIndex: fileIndex.toString(),
          fileKey: fileKey
        },
        // Important: Include credentials if your BFF requires auth
        headers: {
          // Add any auth headers your BFF needs
          // 'Authorization': `Bearer ${this.getAuthToken()}`
        },
        onError: (error) => {
          console.error(`Upload error for ${file.name}:`, error);
          const errorProgress: FileUploadProgress = {
            fileName: fileKey,
            bytesUploaded: 0,
            bytesTotal: file.size,
            percentage: 0,
            status: 'error',
            error: error.message || 'Upload failed'
          };
          observer.next(errorProgress);
          observer.complete();
          this.activeUploads.delete(fileKey);
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          const progress: FileUploadProgress = {
            fileName: fileKey,
            bytesUploaded,
            bytesTotal,
            percentage: Math.round((bytesUploaded / bytesTotal) * 100),
            status: 'uploading'
          };
          observer.next(progress);
        },
        onSuccess: () => {
          const completeProgress: FileUploadProgress = {
            fileName: fileKey,
            bytesUploaded: file.size,
            bytesTotal: file.size,
            percentage: 100,
            status: 'complete'
          };
          observer.next(completeProgress);
          observer.complete();
          this.activeUploads.delete(fileKey);
        },
        onBeforeRequest: (req) => {
          // You can modify the request here if needed
          // For example, add custom headers
        }
      });

      // Store reference for potential cancellation
      this.activeUploads.set(fileKey, upload);

      // Check for previous uploads (resumability)
      upload.findPreviousUploads().then((previousUploads) => {
        if (previousUploads.length > 0) {
          // Resume from the most recent upload
          upload.resumeFromPreviousUpload(previousUploads[0]);
        }
        upload.start();
      }).catch(() => {
        // If we can't check for previous uploads, just start fresh
        upload.start();
      });

      // Cleanup on unsubscribe
      return () => {
        if (this.activeUploads.has(fileKey)) {
          upload.abort();
          this.activeUploads.delete(fileKey);
        }
      };
    });
  }

  /**
   * Notify the BFF that all uploads for an application are complete
   */
  private notifyUploadsComplete(
    applicationId: string,
    successCount: number,
    failedCount: number
  ): Observable<void> {
    return this.http.post<void>(
      `${environment.bffApiUrl}/api/applications/${applicationId}/documents-complete`,
      {
        successCount,
        failedCount,
        completedAt: new Date().toISOString()
      }
    );
  }

  /**
   * Cancel all active uploads
   */
  cancelAllUploads(): void {
    this.cancelSubject.next();
    this.activeUploads.forEach((upload, key) => {
      upload.abort();
    });
    this.activeUploads.clear();
    this._isUploading.set(false);
  }

  /**
   * Cancel a specific file upload
   */
  cancelUpload(fileKey: string): void {
    const upload = this.activeUploads.get(fileKey);
    if (upload) {
      upload.abort();
      this.activeUploads.delete(fileKey);

      // Update progress to show cancelled
      const currentProgress = new Map(this._fileProgress());
      const fileProgress = currentProgress.get(fileKey);
      if (fileProgress) {
        currentProgress.set(fileKey, {
          ...fileProgress,
          status: 'error',
          error: 'Cancelled by user'
        });
        this._fileProgress.set(currentProgress);
      }
    }
  }

  /**
   * Reset the service state
   */
  reset(): void {
    this.cancelAllUploads();
    this._fileProgress.set(new Map());
    this._currentApplicationId.set(null);
  }
}