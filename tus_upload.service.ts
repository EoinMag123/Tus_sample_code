import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, from, of } from 'rxjs';
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

export interface StoredFile {
  file: File;
  questionName: string;  // SurveyJS question name
  previewUrl?: string;   // For showing preview in survey
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
export class SurveyTusUploadService {
  private http = inject(HttpClient);

  // Store files collected from SurveyJS (not uploaded yet)
  private _storedFiles = signal<StoredFile[]>([]);
  
  // Upload progress signals
  private _fileProgress = signal<Map<string, FileUploadProgress>>(new Map());
  private _isUploading = signal<boolean>(false);
  private _currentApplicationId = signal<string | null>(null);

  // Public readonly signals
  readonly storedFiles = this._storedFiles.asReadonly();
  readonly fileProgress = this._fileProgress.asReadonly();
  readonly isUploading = this._isUploading.asReadonly();
  readonly currentApplicationId = this._currentApplicationId.asReadonly();

  // Computed: total stored file size
  readonly totalStoredSize = computed(() => {
    return this._storedFiles().reduce((sum, sf) => sum + sf.file.size, 0);
  });

  // Computed: total stored file count
  readonly totalStoredCount = computed(() => this._storedFiles().length);

  // Computed: overall upload progress
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

  // Computed: upload summary
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
  private readonly tusEndpoint = `${environment.bffApiUrl}/api/tus`;

  /**
   * Called by SurveyJS onUploadFiles callback
   * Stores files locally instead of uploading immediately
   * Returns fake URLs so SurveyJS shows the files as "uploaded"
   */
  storeFilesFromSurvey(
    questionName: string,
    files: File[],
    callback: (status: string, data: any) => void
  ): void {
    const newStoredFiles: StoredFile[] = [];
    const fakeUploadedFiles: any[] = [];

    files.forEach((file, index) => {
      // Create a local object URL for preview
      const previewUrl = URL.createObjectURL(file);
      
      newStoredFiles.push({
        file,
        questionName,
        previewUrl
      });

      // Return fake "uploaded" file info to SurveyJS
      // This makes SurveyJS think the file is uploaded and shows it in the UI
      fakeUploadedFiles.push({
        file: file,
        content: previewUrl  // SurveyJS uses this for preview
      });
    });

    // Add to stored files
    this._storedFiles.update(current => [...current, ...newStoredFiles]);

    // Tell SurveyJS the "upload" succeeded
    callback('success', fakeUploadedFiles);
  }

  /**
   * Called by SurveyJS onClearFiles callback
   * Removes files from local storage
   */
  removeStoredFile(questionName: string, fileName: string, callback: (status: string, data: any) => void): void {
    this._storedFiles.update(current => {
      const fileToRemove = current.find(
        sf => sf.questionName === questionName && sf.file.name === fileName
      );
      
      // Revoke the object URL to free memory
      if (fileToRemove?.previewUrl) {
        URL.revokeObjectURL(fileToRemove.previewUrl);
      }

      return current.filter(
        sf => !(sf.questionName === questionName && sf.file.name === fileName)
      );
    });

    callback('success', null);
  }

  /**
   * Clear all stored files for a specific question
   */
  clearQuestionFiles(questionName: string): void {
    this._storedFiles.update(current => {
      // Revoke URLs for files being removed
      current
        .filter(sf => sf.questionName === questionName)
        .forEach(sf => {
          if (sf.previewUrl) URL.revokeObjectURL(sf.previewUrl);
        });

      return current.filter(sf => sf.questionName !== questionName);
    });
  }

  /**
   * Get all stored files (for submission)
   */
  getAllStoredFiles(): File[] {
    return this._storedFiles().map(sf => sf.file);
  }

  /**
   * Get stored files for a specific question
   */
  getFilesForQuestion(questionName: string): File[] {
    return this._storedFiles()
      .filter(sf => sf.questionName === questionName)
      .map(sf => sf.file);
  }

  /**
   * Main upload method - call this after survey is complete and you have an Application ID
   */
  uploadAllStoredFiles(applicationId: string): Observable<UploadResult> {
    const files = this.getAllStoredFiles();
    
    if (files.length === 0) {
      return of({
        applicationId,
        successful: [],
        failed: [],
        allSuccessful: true
      });
    }

    // Reset upload state
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

    // Create indexed file array
    const indexedFiles = files.map((file, index) => ({
      file,
      key: `${file.name}-${index}`,
      index
    }));

    return from(indexedFiles).pipe(
      mergeMap(
        ({ file, key, index }) => this.createTusUploadObservable(file, key, applicationId, index),
        4 // Concurrent upload limit
      ),
      scan((acc, progress) => {
        const newMap = new Map(acc);
        newMap.set(progress.fileName, progress);
        return newMap;
      }, new Map<string, FileUploadProgress>()),
      tap((progressMap) => {
        this._fileProgress.set(progressMap);
      }),
      last(),
      switchMap((finalProgressMap) => {
        const results = Array.from(finalProgressMap.values());
        const successful = results.filter(r => r.status === 'complete');
        const failed = results.filter(r => r.status === 'error');

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
              return of({ applicationId, successful, failed, allSuccessful: false });
            })
          );
        }

        return of({ applicationId, successful, failed, allSuccessful: false });
      }),
      takeUntil(this.cancelSubject),
      finalize(() => {
        this._isUploading.set(false);
        // Clear stored files after upload attempt
        this.clearAllStoredFiles();
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
   * Creates TUS upload observable for a single file
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
        retryDelays: [0, 1000, 3000, 5000, 10000],
        chunkSize: 5 * 1024 * 1024, // 5MB chunks
        metadata: {
          filename: file.name,
          filetype: file.type || 'application/octet-stream',
          applicationId: applicationId,
          fileIndex: fileIndex.toString(),
          fileKey: fileKey
        },
        onError: (error) => {
          console.error(`Upload error for ${file.name}:`, error);
          observer.next({
            fileName: fileKey,
            bytesUploaded: 0,
            bytesTotal: file.size,
            percentage: 0,
            status: 'error',
            error: error.message || 'Upload failed'
          });
          observer.complete();
          this.activeUploads.delete(fileKey);
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          observer.next({
            fileName: fileKey,
            bytesUploaded,
            bytesTotal,
            percentage: Math.round((bytesUploaded / bytesTotal) * 100),
            status: 'uploading'
          });
        },
        onSuccess: () => {
          observer.next({
            fileName: fileKey,
            bytesUploaded: file.size,
            bytesTotal: file.size,
            percentage: 100,
            status: 'complete'
          });
          observer.complete();
          this.activeUploads.delete(fileKey);
        }
      });

      this.activeUploads.set(fileKey, upload);

      upload.findPreviousUploads().then((previousUploads) => {
        if (previousUploads.length > 0) {
          upload.resumeFromPreviousUpload(previousUploads[0]);
        }
        upload.start();
      }).catch(() => {
        upload.start();
      });

      return () => {
        if (this.activeUploads.has(fileKey)) {
          upload.abort();
          this.activeUploads.delete(fileKey);
        }
      };
    });
  }

  /**
   * Notify backend that uploads are complete
   */
  private notifyUploadsComplete(
    applicationId: string,
    successCount: number,
    failedCount: number
  ): Observable<void> {
    return this.http.post<void>(
      `${environment.bffApiUrl}/api/applications/${applicationId}/documents-complete`,
      { successCount, failedCount, completedAt: new Date().toISOString() }
    );
  }

  /**
   * Cancel all active uploads
   */
  cancelAllUploads(): void {
    this.cancelSubject.next();
    this.activeUploads.forEach((upload) => upload.abort());
    this.activeUploads.clear();
    this._isUploading.set(false);
  }

  /**
   * Clear all stored files (call on form reset)
   */
  clearAllStoredFiles(): void {
    // Revoke all object URLs
    this._storedFiles().forEach(sf => {
      if (sf.previewUrl) URL.revokeObjectURL(sf.previewUrl);
    });
    this._storedFiles.set([]);
  }

  /**
   * Full reset
   */
  reset(): void {
    this.cancelAllUploads();
    this.clearAllStoredFiles();
    this._fileProgress.set(new Map());
    this._currentApplicationId.set(null);
  }



  /**
 * Called by SurveyJS onUploadFiles - now uploads immediately
 */
uploadFilesFromSurvey(
  batchId: string,
  questionName: string,
  files: File[],
  callback: (status: string, data: any) => void
): void {
  const fakeUploadedFiles: any[] = [];

  files.forEach((file, index) => {
    const fileKey = `${questionName}-${file.name}-${index}`;
    const previewUrl = URL.createObjectURL(file);

    // Track this file
    this._storedFiles.update(current => [...current, {
      file,
      questionName,
      previewUrl
    }]);

    // Initialize progress for this file
    this._fileProgress.update(current => {
      const newMap = new Map(current);
      newMap.set(fileKey, {
        fileName: file.name,
        bytesUploaded: 0,
        bytesTotal: file.size,
        percentage: 0,
        status: 'uploading'
      });
      return newMap;
    });

    // Start upload immediately with batchId (not applicationId)
    this.uploadSingleFile(file, fileKey, batchId, index);

    // Return fake "uploaded" to SurveyJS so it shows the file
    fakeUploadedFiles.push({
      file: file,
      content: previewUrl
    });
  });

  // Tell SurveyJS files are "uploaded" (they're uploading in background)
  callback('success', fakeUploadedFiles);
}

/**
 * Upload a single file immediately using TUS
 */
private uploadSingleFile(
  file: File,
  fileKey: string,
  batchId: string,
  fileIndex: number
): void {
  const upload = new tus.Upload(file, {
    endpoint: this.tusEndpoint,
    retryDelays: [0, 1000, 3000, 5000, 10000],
    chunkSize: 5 * 1024 * 1024,
    metadata: {
      filename: file.name,
      filetype: file.type || 'application/octet-stream',
      batchId: batchId,  // Using batchId instead of applicationId
      fileIndex: fileIndex.toString(),
      fileKey: fileKey
    },
    onError: (error) => {
      console.error(`Upload error for ${file.name}:`, error);
      this._fileProgress.update(current => {
        const newMap = new Map(current);
        newMap.set(fileKey, {
          fileName: file.name,
          bytesUploaded: 0,
          bytesTotal: file.size,
          percentage: 0,
          status: 'error',
          error: error.message || 'Upload failed'
        });
        return newMap;
      });
      this.activeUploads.delete(fileKey);
    },
    onProgress: (bytesUploaded, bytesTotal) => {
      this._fileProgress.update(current => {
        const newMap = new Map(current);
        newMap.set(fileKey, {
          fileName: file.name,
          bytesUploaded,
          bytesTotal,
          percentage: Math.round((bytesUploaded / bytesTotal) * 100),
          status: 'uploading'
        });
        return newMap;
      });
    },
    onSuccess: () => {
      console.log(`Upload complete for ${file.name}`);
      this._fileProgress.update(current => {
        const newMap = new Map(current);
        newMap.set(fileKey, {
          fileName: file.name,
          bytesUploaded: file.size,
          bytesTotal: file.size,
          percentage: 100,
          status: 'complete'
        });
        return newMap;
      });
      this.activeUploads.delete(fileKey);
    }
  });

  this.activeUploads.set(fileKey, upload);
  upload.start();
}
}