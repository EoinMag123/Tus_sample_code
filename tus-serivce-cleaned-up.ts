import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, interval, of } from 'rxjs';
import { filter, take, map } from 'rxjs/operators';
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
  questionName: string;
  previewUrl?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SurveyTusUploadService {
  private http = inject(HttpClient);

  private _storedFiles = signal<StoredFile[]>([]);
  private _fileProgress = signal<Map<string, FileUploadProgress>>(new Map());

  private activeUploads: Map<string, tus.Upload> = new Map();
  private readonly tusEndpoint = `${environment.bffApiUrl}/api/tus`;

  /**
   * Called by SurveyJS onUploadFiles - uploads immediately
   */
  uploadFilesFromSurvey(
    batchId: string,
    questionName: string,
    files: File[],
    callback: (status: string, data: any) => void
  ): void {
    if (!files || files.length === 0) {
      callback('success', []);
      return;
    }

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

      // Start upload immediately with batchId
      this.uploadSingleFile(file, fileKey, batchId, index);

      // Return fake "uploaded" to SurveyJS so it shows the file
      fakeUploadedFiles.push({
        file: file,
        name: file.name,
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
        batchId: batchId,
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

  /**
   * Called by SurveyJS onClearFiles - removes file and aborts upload if active
   */
  removeStoredFile(
    questionName: string,
    fileName: string,
    callback: (status: string, data: any) => void
  ): void {
    // Find the fileKey for this file
    const fileKey = Array.from(this.activeUploads.keys())
      .find(key => key.includes(fileName) && key.includes(questionName));

    // Cancel the active upload if it exists
    if (fileKey) {
      const upload = this.activeUploads.get(fileKey);
      if (upload) {
        console.log(`[TUS Service] Aborting upload for ${fileName}`);
        upload.abort();
        this.activeUploads.delete(fileKey);
      }
    }

    // Remove from stored files
    this._storedFiles.update(current => {
      const fileToRemove = current.find(
        sf => sf.questionName === questionName && sf.file.name === fileName
      );

      if (fileToRemove?.previewUrl) {
        URL.revokeObjectURL(fileToRemove.previewUrl);
      }

      return current.filter(
        sf => !(sf.questionName === questionName && sf.file.name === fileName)
      );
    });

    // Remove from progress tracking
    this._fileProgress.update(current => {
      const newMap = new Map(current);
      for (const [key] of newMap) {
        if (key.includes(fileName) && key.includes(questionName)) {
          newMap.delete(key);
          break;
        }
      }
      return newMap;
    });

    callback('success', null);
  }

  /**
   * Clear all stored files for a specific question
   */
  clearQuestionFiles(questionName: string): void {
    this._storedFiles.update(current => {
      current
        .filter(sf => sf.questionName === questionName)
        .forEach(sf => {
          if (sf.previewUrl) URL.revokeObjectURL(sf.previewUrl);
        });

      return current.filter(sf => sf.questionName !== questionName);
    });
  }

  /**
   * Check if any uploads are still in progress
   */
  hasActiveUploads(): boolean {
    return this.activeUploads.size > 0;
  }

  /**
   * Returns an observable that emits once when all uploads are complete
   */
  waitForUploadsToComplete(): Observable<void> {
    if (this.activeUploads.size === 0) {
      return of(undefined);
    }

    return interval(500).pipe(
      filter(() => this.activeUploads.size === 0),
      take(1),
      map(() => undefined)
    );
  }

  /**
   * Notify backend that all uploads are complete and ready for processing
   */
  notifyUploadsComplete(batchId: string, applicationId: string): Observable<any> {
    const files = Array.from(this._fileProgress().values());
    const successCount = files.filter(f => f.status === 'complete').length;
    const failedCount = files.filter(f => f.status === 'error').length;

    return this.http.post(
      `${environment.bffApiUrl}/api/applications/${applicationId}/documents-complete`,
      {
        batchId: batchId,
        successCount: successCount,
        failedCount: failedCount,
        completedAt: new Date().toISOString()
      }
    );
  }

  /**
   * Cancel all active uploads
   */
  cancelAllUploads(): void {
    this.activeUploads.forEach((upload) => upload.abort());
    this.activeUploads.clear();
  }

  /**
   * Full reset - cancel uploads and clear state
   */
  reset(): void {
    this.cancelAllUploads();
    
    this._storedFiles().forEach(sf => {
      if (sf.previewUrl) URL.revokeObjectURL(sf.previewUrl);
    });
    
    this._storedFiles.set([]);
    this._fileProgress.set(new Map());
  }
}