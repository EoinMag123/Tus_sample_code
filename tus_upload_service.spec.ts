import { TestBed, fakeAsync, tick, flush } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SurveyTusUploadService, FileUploadProgress, StoredFile } from './tus_upload_service';
import { environment } from '../../environments/environment';
import * as tus from 'tus-js-client';

// Mock tus.Upload
class MockTusUpload {
  options: any;
  url: string | null = null;
  
  constructor(file: File, options: any) {
    this.options = options;
  }
  
  start(): void {
    // Simulate immediate progress
    setTimeout(() => {
      if (this.options.onProgress) {
        this.options.onProgress(50, 100);
      }
    }, 10);
    
    // Simulate completion
    setTimeout(() => {
      this.url = `${this.options.endpoint}/mock-file-id-123`;
      if (this.options.onSuccess) {
        this.options.onSuccess();
      }
    }, 20);
  }
  
  abort(): void {
    // Do nothing
  }
  
  findPreviousUploads(): Promise<any[]> {
    return Promise.resolve([]);
  }
}

// Mock tus.Upload that fails
class MockTusUploadError {
  options: any;
  
  constructor(file: File, options: any) {
    this.options = options;
  }
  
  start(): void {
    setTimeout(() => {
      if (this.options.onError) {
        this.options.onError(new Error('Upload failed'));
      }
    }, 10);
  }
  
  abort(): void {}
  
  findPreviousUploads(): Promise<any[]> {
    return Promise.resolve([]);
  }
}

describe('SurveyTusUploadService', () => {
  let service: SurveyTusUploadService;
  let httpMock: HttpTestingController;
  let originalTusUpload: any;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SurveyTusUploadService]
    });

    service = TestBed.inject(SurveyTusUploadService);
    httpMock = TestBed.inject(HttpTestingController);
    
    // Store original tus.Upload
    originalTusUpload = tus.Upload;
  });

  afterEach(() => {
    httpMock.verify();
    // Restore original tus.Upload
    (tus as any).Upload = originalTusUpload;
    service.reset();
  });

  describe('initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should initialize with empty stored files', () => {
      expect(service.storedFiles().length).toBe(0);
    });

    it('should initialize with empty file progress', () => {
      expect(service.fileProgress().size).toBe(0);
    });

    it('should initialize with isUploading as false', () => {
      expect(service.isUploading()).toBeFalse();
    });

    it('should initialize with null currentApplicationId', () => {
      expect(service.currentApplicationId()).toBeNull();
    });
  });

  describe('computed signals', () => {
    it('should calculate totalStoredSize correctly', () => {
      const mockFile1 = new File(['content1'], 'file1.txt', { type: 'text/plain' });
      const mockFile2 = new File(['content22'], 'file2.txt', { type: 'text/plain' });
      
      // Manually add to stored files for testing
      (service as any)._storedFiles.set([
        { file: mockFile1, questionName: 'q1' },
        { file: mockFile2, questionName: 'q2' }
      ]);
      
      expect(service.totalStoredSize()).toBe(mockFile1.size + mockFile2.size);
    });

    it('should calculate totalStoredCount correctly', () => {
      const mockFile1 = new File(['content1'], 'file1.txt');
      const mockFile2 = new File(['content2'], 'file2.txt');
      
      (service as any)._storedFiles.set([
        { file: mockFile1, questionName: 'q1' },
        { file: mockFile2, questionName: 'q2' }
      ]);
      
      expect(service.totalStoredCount()).toBe(2);
    });

    it('should calculate totalProgress correctly', () => {
      const progressMap = new Map<string, FileUploadProgress>();
      progressMap.set('file1', {
        fileName: 'file1.txt',
        bytesUploaded: 50,
        bytesTotal: 100,
        percentage: 50,
        status: 'uploading'
      });
      progressMap.set('file2', {
        fileName: 'file2.txt',
        bytesUploaded: 100,
        bytesTotal: 100,
        percentage: 100,
        status: 'complete'
      });
      
      (service as any)._fileProgress.set(progressMap);
      
      // (50 + 100) / (100 + 100) = 75%
      expect(service.totalProgress()).toBe(75);
    });

    it('should return 0 for totalProgress when no files', () => {
      expect(service.totalProgress()).toBe(0);
    });

    it('should calculate uploadSummary correctly', () => {
      const progressMap = new Map<string, FileUploadProgress>();
      progressMap.set('file1', { fileName: 'file1', bytesUploaded: 0, bytesTotal: 100, percentage: 0, status: 'pending' });
      progressMap.set('file2', { fileName: 'file2', bytesUploaded: 50, bytesTotal: 100, percentage: 50, status: 'uploading' });
      progressMap.set('file3', { fileName: 'file3', bytesUploaded: 100, bytesTotal: 100, percentage: 100, status: 'complete' });
      progressMap.set('file4', { fileName: 'file4', bytesUploaded: 0, bytesTotal: 100, percentage: 0, status: 'error' });
      
      (service as any)._fileProgress.set(progressMap);
      
      const summary = service.uploadSummary();
      expect(summary.total).toBe(4);
      expect(summary.pending).toBe(1);
      expect(summary.uploading).toBe(1);
      expect(summary.complete).toBe(1);
      expect(summary.failed).toBe(1);
    });
  });

  describe('storeFilesFromSurvey', () => {
    it('should store files and call callback with success', () => {
      const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' });
      const callbackSpy = jasmine.createSpy('callback');
      
      service.storeFilesFromSurvey('question1', [mockFile], callbackSpy);
      
      expect(service.storedFiles().length).toBe(1);
      expect(service.storedFiles()[0].file).toBe(mockFile);
      expect(service.storedFiles()[0].questionName).toBe('question1');
      expect(service.storedFiles()[0].previewUrl).toBeTruthy();
      expect(callbackSpy).toHaveBeenCalledWith('success', jasmine.any(Array));
    });

    it('should store multiple files', () => {
      const mockFile1 = new File(['content1'], 'test1.txt');
      const mockFile2 = new File(['content2'], 'test2.txt');
      const callbackSpy = jasmine.createSpy('callback');
      
      service.storeFilesFromSurvey('question1', [mockFile1, mockFile2], callbackSpy);
      
      expect(service.storedFiles().length).toBe(2);
    });

    it('should create object URLs for preview', () => {
      const mockFile = new File(['content'], 'test.txt');
      const callbackSpy = jasmine.createSpy('callback');
      
      spyOn(URL, 'createObjectURL').and.returnValue('blob:mock-url');
      
      service.storeFilesFromSurvey('question1', [mockFile], callbackSpy);
      
      expect(URL.createObjectURL).toHaveBeenCalledWith(mockFile);
      expect(service.storedFiles()[0].previewUrl).toBe('blob:mock-url');
    });
  });

  describe('removeStoredFile', () => {
    it('should remove a specific file', () => {
      const mockFile1 = new File(['content1'], 'test1.txt');
      const mockFile2 = new File(['content2'], 'test2.txt');
      
      service.storeFilesFromSurvey('question1', [mockFile1], jasmine.createSpy());
      service.storeFilesFromSurvey('question1', [mockFile2], jasmine.createSpy());
      
      expect(service.storedFiles().length).toBe(2);
      
      const callbackSpy = jasmine.createSpy('callback');
      service.removeStoredFile('question1', 'test1.txt', callbackSpy);
      
      expect(service.storedFiles().length).toBe(1);
      expect(service.storedFiles()[0].file.name).toBe('test2.txt');
      expect(callbackSpy).toHaveBeenCalledWith('success', null);
    });

    it('should revoke object URL when removing file', () => {
      const mockFile = new File(['content'], 'test.txt');
      spyOn(URL, 'createObjectURL').and.returnValue('blob:mock-url');
      spyOn(URL, 'revokeObjectURL');
      
      service.storeFilesFromSurvey('question1', [mockFile], jasmine.createSpy());
      service.removeStoredFile('question1', 'test.txt', jasmine.createSpy());
      
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('should not fail when removing non-existent file', () => {
      const callbackSpy = jasmine.createSpy('callback');
      
      expect(() => {
        service.removeStoredFile('question1', 'nonexistent.txt', callbackSpy);
      }).not.toThrow();
      
      expect(callbackSpy).toHaveBeenCalledWith('success', null);
    });
  });

  describe('clearQuestionFiles', () => {
    it('should clear all files for a specific question', () => {
      const mockFile1 = new File(['content1'], 'test1.txt');
      const mockFile2 = new File(['content2'], 'test2.txt');
      const mockFile3 = new File(['content3'], 'test3.txt');
      
      service.storeFilesFromSurvey('question1', [mockFile1, mockFile2], jasmine.createSpy());
      service.storeFilesFromSurvey('question2', [mockFile3], jasmine.createSpy());
      
      expect(service.storedFiles().length).toBe(3);
      
      service.clearQuestionFiles('question1');
      
      expect(service.storedFiles().length).toBe(1);
      expect(service.storedFiles()[0].questionName).toBe('question2');
    });

    it('should revoke all object URLs for cleared files', () => {
      const mockFile1 = new File(['content1'], 'test1.txt');
      const mockFile2 = new File(['content2'], 'test2.txt');
      
      spyOn(URL, 'createObjectURL').and.returnValues('blob:url1', 'blob:url2');
      spyOn(URL, 'revokeObjectURL');
      
      service.storeFilesFromSurvey('question1', [mockFile1, mockFile2], jasmine.createSpy());
      service.clearQuestionFiles('question1');
      
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    });
  });

  describe('getAllStoredFiles', () => {
    it('should return all stored files', () => {
      const mockFile1 = new File(['content1'], 'test1.txt');
      const mockFile2 = new File(['content2'], 'test2.txt');
      
      service.storeFilesFromSurvey('question1', [mockFile1], jasmine.createSpy());
      service.storeFilesFromSurvey('question2', [mockFile2], jasmine.createSpy());
      
      const files = service.getAllStoredFiles();
      
      expect(files.length).toBe(2);
      expect(files).toContain(mockFile1);
      expect(files).toContain(mockFile2);
    });

    it('should return empty array when no files stored', () => {
      expect(service.getAllStoredFiles()).toEqual([]);
    });
  });

  describe('getFilesForQuestion', () => {
    it('should return files for a specific question', () => {
      const mockFile1 = new File(['content1'], 'test1.txt');
      const mockFile2 = new File(['content2'], 'test2.txt');
      const mockFile3 = new File(['content3'], 'test3.txt');
      
      service.storeFilesFromSurvey('question1', [mockFile1, mockFile2], jasmine.createSpy());
      service.storeFilesFromSurvey('question2', [mockFile3], jasmine.createSpy());
      
      const files = service.getFilesForQuestion('question1');
      
      expect(files.length).toBe(2);
      expect(files).toContain(mockFile1);
      expect(files).toContain(mockFile2);
    });

    it('should return empty array for question with no files', () => {
      expect(service.getFilesForQuestion('nonexistent')).toEqual([]);
    });
  });

  describe('uploadFilesFromSurvey', () => {
    beforeEach(() => {
      (tus as any).Upload = MockTusUpload;
    });

    it('should start upload immediately and call callback', () => {
      const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' });
      const callbackSpy = jasmine.createSpy('callback');
      
      service.uploadFilesFromSurvey('batch-123', 'question1', [mockFile], callbackSpy);
      
      expect(callbackSpy).toHaveBeenCalledWith('success', jasmine.any(Array));
    });

    it('should add file to stored files', () => {
      const mockFile = new File(['content'], 'test.txt');
      
      service.uploadFilesFromSurvey('batch-123', 'question1', [mockFile], jasmine.createSpy());
      
      expect(service.storedFiles().length).toBe(1);
      expect(service.storedFiles()[0].file).toBe(mockFile);
    });

    it('should initialize file progress with uploading status', () => {
      const mockFile = new File(['content'], 'test.txt');
      
      service.uploadFilesFromSurvey('batch-123', 'question1', [mockFile], jasmine.createSpy());
      
      const progress = service.fileProgress();
      expect(progress.size).toBe(1);
      
      const fileProgress = Array.from(progress.values())[0];
      expect(fileProgress.status).toBe('uploading');
      expect(fileProgress.percentage).toBe(0);
    });

    it('should track active uploads', () => {
      const mockFile = new File(['content'], 'test.txt');
      
      service.uploadFilesFromSurvey('batch-123', 'question1', [mockFile], jasmine.createSpy());
      
      expect((service as any).activeUploads.size).toBe(1);
    });

    it('should update progress on upload success', fakeAsync(() => {
      const mockFile = new File(['content'], 'test.txt');
      
      service.uploadFilesFromSurvey('batch-123', 'question1', [mockFile], jasmine.createSpy());
      
      tick(30); // Wait for mock upload to complete
      
      const progress = Array.from(service.fileProgress().values())[0];
      expect(progress.status).toBe('complete');
      expect(progress.percentage).toBe(100);
    }));

    it('should remove from active uploads on completion', fakeAsync(() => {
      const mockFile = new File(['content'], 'test.txt');
      
      service.uploadFilesFromSurvey('batch-123', 'question1', [mockFile], jasmine.createSpy());
      
      expect((service as any).activeUploads.size).toBe(1);
      
      tick(30);
      
      expect((service as any).activeUploads.size).toBe(0);
    }));

    it('should handle upload errors', fakeAsync(() => {
      (tus as any).Upload = MockTusUploadError;
      
      const mockFile = new File(['content'], 'test.txt');
      
      service.uploadFilesFromSurvey('batch-123', 'question1', [mockFile], jasmine.createSpy());
      
      tick(20);
      
      const progress = Array.from(service.fileProgress().values())[0];
      expect(progress.status).toBe('error');
      expect(progress.error).toBe('Upload failed');
    }));

    it('should handle multiple files', () => {
      const mockFile1 = new File(['content1'], 'test1.txt');
      const mockFile2 = new File(['content2'], 'test2.txt');
      
      service.uploadFilesFromSurvey('batch-123', 'question1', [mockFile1, mockFile2], jasmine.createSpy());
      
      expect(service.storedFiles().length).toBe(2);
      expect(service.fileProgress().size).toBe(2);
      expect((service as any).activeUploads.size).toBe(2);
    });
  });

  describe('cancelAllUploads', () => {
    beforeEach(() => {
      (tus as any).Upload = MockTusUpload;
    });

    it('should abort all active uploads', () => {
      const mockFile1 = new File(['content1'], 'test1.txt');
      const mockFile2 = new File(['content2'], 'test2.txt');
      
      service.uploadFilesFromSurvey('batch-123', 'question1', [mockFile1, mockFile2], jasmine.createSpy());
      
      expect((service as any).activeUploads.size).toBe(2);
      
      service.cancelAllUploads();
      
      expect((service as any).activeUploads.size).toBe(0);
    });

    it('should set isUploading to false', () => {
      (service as any)._isUploading.set(true);
      
      service.cancelAllUploads();
      
      expect(service.isUploading()).toBeFalse();
    });
  });

  describe('clearAllStoredFiles', () => {
    it('should clear all stored files', () => {
      const mockFile1 = new File(['content1'], 'test1.txt');
      const mockFile2 = new File(['content2'], 'test2.txt');
      
      service.storeFilesFromSurvey('question1', [mockFile1], jasmine.createSpy());
      service.storeFilesFromSurvey('question2', [mockFile2], jasmine.createSpy());
      
      expect(service.storedFiles().length).toBe(2);
      
      service.clearAllStoredFiles();
      
      expect(service.storedFiles().length).toBe(0);
    });

    it('should revoke all object URLs', () => {
      const mockFile1 = new File(['content1'], 'test1.txt');
      const mockFile2 = new File(['content2'], 'test2.txt');
      
      spyOn(URL, 'createObjectURL').and.returnValues('blob:url1', 'blob:url2');
      spyOn(URL, 'revokeObjectURL');
      
      service.storeFilesFromSurvey('question1', [mockFile1, mockFile2], jasmine.createSpy());
      service.clearAllStoredFiles();
      
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    });
  });

  describe('reset', () => {
    beforeEach(() => {
      (tus as any).Upload = MockTusUpload;
    });

    it('should cancel all uploads', () => {
      spyOn(service, 'cancelAllUploads').and.callThrough();
      
      service.reset();
      
      expect(service.cancelAllUploads).toHaveBeenCalled();
    });

    it('should clear all stored files', () => {
      spyOn(service, 'clearAllStoredFiles').and.callThrough();
      
      service.reset();
      
      expect(service.clearAllStoredFiles).toHaveBeenCalled();
    });

    it('should clear file progress', () => {
      const progressMap = new Map<string, FileUploadProgress>();
      progressMap.set('file1', { fileName: 'file1', bytesUploaded: 100, bytesTotal: 100, percentage: 100, status: 'complete' });
      (service as any)._fileProgress.set(progressMap);
      
      service.reset();
      
      expect(service.fileProgress().size).toBe(0);
    });

    it('should clear currentApplicationId', () => {
      (service as any)._currentApplicationId.set('app-123');
      
      service.reset();
      
      expect(service.currentApplicationId()).toBeNull();
    });
  });

  describe('uploadAllStoredFiles', () => {
    beforeEach(() => {
      (tus as any).Upload = MockTusUpload;
    });

    it('should return immediately if no files stored', (done) => {
      service.uploadAllStoredFiles('app-123').subscribe(result => {
        expect(result.applicationId).toBe('app-123');
        expect(result.allSuccessful).toBeTrue();
        expect(result.successful).toEqual([]);
        expect(result.failed).toEqual([]);
        done();
      });
    });

    it('should set isUploading to true during upload', () => {
      const mockFile = new File(['content'], 'test.txt');
      service.storeFilesFromSurvey('question1', [mockFile], jasmine.createSpy());
      
      service.uploadAllStoredFiles('app-123').subscribe();
      
      expect(service.isUploading()).toBeTrue();
    });

    it('should set currentApplicationId', () => {
      const mockFile = new File(['content'], 'test.txt');
      service.storeFilesFromSurvey('question1', [mockFile], jasmine.createSpy());
      
      service.uploadAllStoredFiles('app-123').subscribe();
      
      expect(service.currentApplicationId()).toBe('app-123');
    });

    it('should upload all stored files', fakeAsync(() => {
      const mockFile1 = new File(['content1'], 'test1.txt');
      const mockFile2 = new File(['content2'], 'test2.txt');
      
      service.storeFilesFromSurvey('question1', [mockFile1, mockFile2], jasmine.createSpy());
      
      let result: any;
      service.uploadAllStoredFiles('app-123').subscribe(r => result = r);
      
      tick(100);
      
      // Handle the HTTP call for notifyUploadsComplete
      const req = httpMock.expectOne(`${environment.bffApiUrl}/api/applications/app-123/documents-complete`);
      req.flush({});
      
      tick(100);
      
      expect(result).toBeDefined();
      expect(result.successful.length).toBe(2);
    }));

    it('should call notifyUploadsComplete on success', fakeAsync(() => {
      const mockFile = new File(['content'], 'test.txt');
      service.storeFilesFromSurvey('question1', [mockFile], jasmine.createSpy());
      
      service.uploadAllStoredFiles('app-123').subscribe();
      
      tick(100);
      
      const req = httpMock.expectOne(`${environment.bffApiUrl}/api/applications/app-123/documents-complete`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.successCount).toBe(1);
      expect(req.request.body.failedCount).toBe(0);
      
      req.flush({});
    }));
  });

  describe('integration scenarios', () => {
    beforeEach(() => {
      (tus as any).Upload = MockTusUpload;
    });

    it('should handle complete workflow: store, upload, clear', fakeAsync(() => {
      const mockFile = new File(['content'], 'test.txt');
      
      // Store file
      service.storeFilesFromSurvey('question1', [mockFile], jasmine.createSpy());
      expect(service.storedFiles().length).toBe(1);
      
      // Upload
      service.uploadAllStoredFiles('app-123').subscribe();
      tick(100);
      
      const req = httpMock.expectOne(`${environment.bffApiUrl}/api/applications/app-123/documents-complete`);
      req.flush({});
      
      tick(100);
      
      // After upload, files should be cleared
      expect(service.storedFiles().length).toBe(0);
    }));

    it('should handle immediate upload workflow', fakeAsync(() => {
      const mockFile = new File(['content'], 'test.txt');
      
      // Upload immediately
      service.uploadFilesFromSurvey('batch-123', 'question1', [mockFile], jasmine.createSpy());
      
      // File should be stored
      expect(service.storedFiles().length).toBe(1);
      
      // Should be uploading
      expect((service as any).activeUploads.size).toBe(1);
      
      // Wait for completion
      tick(30);
      
      // Upload complete
      expect((service as any).activeUploads.size).toBe(0);
      const progress = Array.from(service.fileProgress().values())[0];
      expect(progress.status).toBe('complete');
    }));

    it('should handle file removal during upload', fakeAsync(() => {
      // Use a slow mock upload
      (tus as any).Upload = class SlowMockUpload {
        options: any;
        aborted = false;
        
        constructor(file: File, options: any) {
          this.options = options;
        }
        
        start() {
          setTimeout(() => {
            if (!this.aborted && this.options.onProgress) {
              this.options.onProgress(50, 100);
            }
          }, 100);
        }
        
        abort() {
          this.aborted = true;
        }
        
        findPreviousUploads() {
          return Promise.resolve([]);
        }
      };
      
      const mockFile = new File(['content'], 'test.txt');
      
      service.uploadFilesFromSurvey('batch-123', 'question1', [mockFile], jasmine.createSpy());
      
      expect((service as any).activeUploads.size).toBe(1);
      
      // Remove file during upload
      service.removeStoredFile('question1', 'test.txt', jasmine.createSpy());
      
      expect(service.storedFiles().length).toBe(0);
      
      flush();
    }));
  });
});
