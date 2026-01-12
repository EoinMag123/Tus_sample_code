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
});zxc