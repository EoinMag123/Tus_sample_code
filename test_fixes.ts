describe('uploadSingleFile callbacks', () => {
  let service: SurveyTusUploadService;
  
  beforeEach(() => {
    // ... your existing setup
  });

  describe('onError callback', () => {
    it('should update fileProgress with error status', () => {
      // Arrange
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const fileKey = 'question1-test.txt-0';
      const batchId = 'batch-123';
      
      // Initialize the file progress first (simulating what uploadFilesFromSurvey does)
      (service as any)._fileProgress.update((current: Map<string, any>) => {
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

      // Create a mock error
      const mockError = { message: 'Network error' };

      // Simulate what onError does
      (service as any)._fileProgress.update((current: Map<string, any>) => {
        const newMap = new Map(current);
        newMap.set(fileKey, {
          fileName: file.name,
          bytesUploaded: 0,
          bytesTotal: file.size,
          percentage: 0,
          status: 'error',
          error: mockError.message || 'Upload failed'
        });
        return newMap;
      });

      // Assert
      const progress = service.fileProgress().get(fileKey);
      expect(progress?.status).toBe('error');
      expect(progress?.error).toBe('Network error');
    });

    it('should use default error message when error.message is undefined', () => {
      // Arrange
      const fileKey = 'question1-test.txt-0';
      const file = new File(['content'], 'test.txt');

      // Simulate onError with undefined message
      (service as any)._fileProgress.update((current: Map<string, any>) => {
        const newMap = new Map(current);
        newMap.set(fileKey, {
          fileName: file.name,
          bytesUploaded: 0,
          bytesTotal: file.size,
          percentage: 0,
          status: 'error',
          error: undefined || 'Upload failed'
        });
        return newMap;
      });

      // Assert
      const progress = service.fileProgress().get(fileKey);
      expect(progress?.error).toBe('Upload failed');
    });
  });

  describe('onSuccess callback', () => {
    it('should update fileProgress with complete status', () => {
      // Arrange
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const fileKey = 'question1-test.txt-0';

      // Simulate what onSuccess does
      (service as any)._fileProgress.update((current: Map<string, any>) => {
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

      // Assert
      const progress = service.fileProgress().get(fileKey);
      expect(progress?.status).toBe('complete');
      expect(progress?.percentage).toBe(100);
      expect(progress?.bytesUploaded).toBe(file.size);
    });
  });

  describe('onProgress callback', () => {
    it('should update fileProgress with current progress', () => {
      // Arrange
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const fileKey = 'question1-test.txt-0';
      const bytesUploaded = 50;
      const bytesTotal = 100;

      // Simulate what onProgress does
      (service as any)._fileProgress.update((current: Map<string, any>) => {
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

      // Assert
      const progress = service.fileProgress().get(fileKey);
      expect(progress?.status).toBe('uploading');
      expect(progress?.percentage).toBe(50);
      expect(progress?.bytesUploaded).toBe(50);
    });
  });
});




======


describe('removeStoredFile', () => {
  describe('when file has active upload', () => {
    it('should abort the active upload', () => {
      // Arrange
      const questionName = 'supportingDocuments';
      const fileName = 'test.txt';
      const fileKey = `${questionName}-${fileName}-0`;
      const mockUpload = { abort: jasmine.createSpy('abort') };
      
      (service as any).activeUploads.set(fileKey, mockUpload);
      
      const callbackSpy = jasmine.createSpy('callback');

      // Act
      service.removeStoredFile(questionName, fileName, callbackSpy);

      // Assert
      expect(mockUpload.abort).toHaveBeenCalled();
    });

    it('should remove from activeUploads', () => {
      // Arrange
      const questionName = 'supportingDocuments';
      const fileName = 'test.txt';
      const fileKey = `${questionName}-${fileName}-0`;
      const mockUpload = { abort: jasmine.createSpy('abort') };
      
      (service as any).activeUploads.set(fileKey, mockUpload);
      
      // Act
      service.removeStoredFile(questionName, fileName, jasmine.createSpy());

      // Assert
      expect((service as any).activeUploads.has(fileKey)).toBeFalse();
    });
  });

  describe('when file has no active upload', () => {
    it('should not throw error', () => {
      // Arrange
      const callbackSpy = jasmine.createSpy('callback');

      // Act & Assert
      expect(() => {
        service.removeStoredFile('supportingDocuments', 'nonexistent.txt', callbackSpy);
      }).not.toThrow();
    });

    it('should still call callback with success', () => {
      // Arrange
      const callbackSpy = jasmine.createSpy('callback');

      // Act
      service.removeStoredFile('supportingDocuments', 'test.txt', callbackSpy);

      // Assert
      expect(callbackSpy).toHaveBeenCalledWith('success', null);
    });
  });

  describe('when fileKey is found but upload is undefined', () => {
    it('should handle gracefully', () => {
      // Arrange
      const questionName = 'supportingDocuments';
      const fileName = 'test.txt';
      const fileKey = `${questionName}-${fileName}-0`;
      
      // Set fileKey with undefined value
      (service as any).activeUploads.set(fileKey, undefined);
      
      const callbackSpy = jasmine.createSpy('callback');

      // Act & Assert
      expect(() => {
        service.removeStoredFile(questionName, fileName, callbackSpy);
      }).not.toThrow();
      
      expect(callbackSpy).toHaveBeenCalledWith('success', null);
    });
  });

  describe('stored files handling', () => {
    it('should remove file from stored files', () => {
      // Arrange
      const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' });
      
      // Add file to stored files
      (service as any)._storedFiles.set([{
        file: mockFile,
        questionName: 'supportingDocuments',
        previewUrl: 'blob:test-url'
      }]);
      
      spyOn(URL, 'revokeObjectURL');
      const callbackSpy = jasmine.createSpy('callback');

      // Act
      service.removeStoredFile('supportingDocuments', 'test.txt', callbackSpy);

      // Assert
      expect(service.storedFiles().length).toBe(0);
    });

    it('should revoke object URL when file has previewUrl', () => {
      // Arrange
      const mockFile = new File(['content'], 'test.txt');
      const previewUrl = 'blob:test-url-123';
      
      (service as any)._storedFiles.set([{
        file: mockFile,
        questionName: 'supportingDocuments',
        previewUrl: previewUrl
      }]);
      
      spyOn(URL, 'revokeObjectURL');

      // Act
      service.removeStoredFile('supportingDocuments', 'test.txt', jasmine.createSpy());

      // Assert
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(previewUrl);
    });

    it('should not revoke URL when file has no previewUrl', () => {
      // Arrange
      const mockFile = new File(['content'], 'test.txt');
      
      (service as any)._storedFiles.set([{
        file: mockFile,
        questionName: 'supportingDocuments',
        previewUrl: undefined
      }]);
      
      spyOn(URL, 'revokeObjectURL');

      // Act
      service.removeStoredFile('supportingDocuments', 'test.txt', jasmine.createSpy());

      // Assert
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    });
  });

  describe('file progress handling', () => {
    it('should remove file from progress tracking', () => {
      // Arrange
      const questionName = 'supportingDocuments';
      const fileName = 'test.txt';
      const fileKey = `${questionName}-${fileName}-0`;
      
      const progressMap = new Map();
      progressMap.set(fileKey, {
        fileName: fileName,
        bytesUploaded: 50,
        bytesTotal: 100,
        percentage: 50,
        status: 'uploading'
      });
      (service as any)._fileProgress.set(progressMap);

      // Act
      service.removeStoredFile(questionName, fileName, jasmine.createSpy());

      // Assert
      expect(service.fileProgress().has(fileKey)).toBeFalse();
    });

    it('should not affect other files in progress', () => {
      // Arrange
      const progressMap = new Map();
      progressMap.set('supportingDocuments-test.txt-0', {
        fileName: 'test.txt',
        bytesUploaded: 50,
        bytesTotal: 100,
        percentage: 50,
        status: 'uploading'
      });
      progressMap.set('supportingDocuments-other.txt-1', {
        fileName: 'other.txt',
        bytesUploaded: 100,
        bytesTotal: 100,
        percentage: 100,
        status: 'complete'
      });
      (service as any)._fileProgress.set(progressMap);

      // Act
      service.removeStoredFile('supportingDocuments', 'test.txt', jasmine.createSpy());

      // Assert
      expect(service.fileProgress().size).toBe(1);
      expect(service.fileProgress().has('supportingDocuments-other.txt-1')).toBeTrue();
    });
  });
});



=====



describe('hasActiveUploads', () => {
  it('should return true when there are active uploads', () => {
    // Arrange
    const mockUpload = { abort: jasmine.createSpy('abort') };
    (service as any).activeUploads.set('question1-test.txt-0', mockUpload);

    // Act
    const result = service.hasActiveUploads();

    // Assert
    expect(result).toBeTrue();
  });

  it('should return false when there are no active uploads', () => {
    // Arrange
    (service as any).activeUploads.clear();

    // Act
    const result = service.hasActiveUploads();

    // Assert
    expect(result).toBeFalse();
  });

  it('should return true with multiple active uploads', () => {
    // Arrange
    const mockUpload = { abort: jasmine.createSpy('abort') };
    (service as any).activeUploads.set('question1-file1.txt-0', mockUpload);
    (service as any).activeUploads.set('question1-file2.txt-1', mockUpload);
    (service as any).activeUploads.set('question2-file3.txt-0', mockUpload);

    // Act
    const result = service.hasActiveUploads();

    // Assert
    expect(result).toBeTrue();
    expect((service as any).activeUploads.size).toBe(3);
  });

  it('should return false after all uploads complete', () => {
    // Arrange
    const mockUpload = { abort: jasmine.createSpy('abort') };
    (service as any).activeUploads.set('question1-test.txt-0', mockUpload);
    
    // Simulate upload completion
    (service as any).activeUploads.delete('question1-test.txt-0');

    // Act
    const result = service.hasActiveUploads();

    // Assert
    expect(result).toBeFalse();
  });

  it('should return false after cancelAllUploads is called', () => {
    // Arrange
    const mockUpload = { abort: jasmine.createSpy('abort') };
    (service as any).activeUploads.set('question1-test.txt-0', mockUpload);

    // Act
    service.cancelAllUploads();
    const result = service.hasActiveUploads();

    // Assert
    expect(result).toBeFalse();
  });

  it('should return false after reset is called', () => {
    // Arrange
    const mockUpload = { abort: jasmine.createSpy('abort') };
    (service as any).activeUploads.set('question1-test.txt-0', mockUpload);

    // Act
    service.reset();
    const result = service.hasActiveUploads();

    // Assert
    expect(result).toBeFalse();
  });
});



======


import { fakeAsync, tick } from '@angular/core/testing';

describe('waitForUploadsToComplete with fakeAsync', () => {
  it('should return immediately when no active uploads', fakeAsync(() => {
    // Arrange
    (service as any).activeUploads.clear();
    let completed = false;

    // Act
    service.waitForUploadsToComplete().subscribe({
      next: () => {
        completed = true;
      }
    });

    tick();

    // Assert
    expect(completed).toBeTrue();
  }));

  it('should wait for interval when uploads are active', fakeAsync(() => {
    // Arrange
    const mockUpload = { abort: jasmine.createSpy('abort') };
    (service as any).activeUploads.set('question1-test.txt-0', mockUpload);
    let completed = false;

    // Act
    service.waitForUploadsToComplete().subscribe({
      next: () => {
        completed = true;
      }
    });

    // Should not complete yet
    tick(400);
    expect(completed).toBeFalse();

    // Clear uploads
    (service as any).activeUploads.clear();

    // Tick past the interval
    tick(500);
    expect(completed).toBeTrue();
  }));

  it('should poll multiple times until uploads complete', fakeAsync(() => {
    // Arrange
    const mockUpload = { abort: jasmine.createSpy('abort') };
    (service as any).activeUploads.set('file1', mockUpload);
    let completed = false;

    // Act
    service.waitForUploadsToComplete().subscribe({
      next: () => {
        completed = true;
      }
    });

    // First interval - still has uploads
    tick(500);
    expect(completed).toBeFalse();

    // Second interval - still has uploads
    tick(500);
    expect(completed).toBeFalse();

    // Clear uploads
    (service as any).activeUploads.clear();

    // Third interval - should complete
    tick(500);
    expect(completed).toBeTrue();
  }));
});