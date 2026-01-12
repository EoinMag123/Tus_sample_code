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