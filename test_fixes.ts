// Add these PUBLIC methods to your service

handleUploadError(fileKey: string, fileName: string, fileSize: number, error: any): void {
  console.error(`Upload error for ${fileName}:`, error);
  this._fileProgress.update(current => {
    const newMap = new Map(current);
    newMap.set(fileKey, {
      fileName: fileName,
      bytesUploaded: 0,
      bytesTotal: fileSize,
      percentage: 0,
      status: 'error',
      error: error?.message || 'Upload failed'
    });
    return newMap;
  });
  this.activeUploads.delete(fileKey);
}

handleUploadProgress(fileKey: string, fileName: string, bytesUploaded: number, bytesTotal: number): void {
  this._fileProgress.update(current => {
    const newMap = new Map(current);
    newMap.set(fileKey, {
      fileName: fileName,
      bytesUploaded,
      bytesTotal,
      percentage: Math.round((bytesUploaded / bytesTotal) * 100),
      status: 'uploading'
    });
    return newMap;
  });
}

handleUploadSuccess(fileKey: string, fileName: string, fileSize: number): void {
  console.log(`Upload complete for ${fileName}`);
  this._fileProgress.update(current => {
    const newMap = new Map(current);
    newMap.set(fileKey, {
      fileName: fileName,
      bytesUploaded: fileSize,
      bytesTotal: fileSize,
      percentage: 100,
      status: 'complete'
    });
    return newMap;
  });
  this.activeUploads.delete(fileKey);
}



//////



    onError: (error) => {
      this.handleUploadError(fileKey, file.name, file.size, error);
    },
    onProgress: (bytesUploaded, bytesTotal) => {
      this.handleUploadProgress(fileKey, file.name, bytesUploaded, bytesTotal);
    },
    onSuccess: () => {
      this.handleUploadSuccess(fileKey, file.name, file.size);
    }







    /////////


    describe('handleUploadError', () => {
  it('should update fileProgress with error status', () => {
    // Arrange
    const fileKey = 'question1-test.txt-0';
    const fileName = 'test.txt';
    const fileSize = 100;
    const error = { message: 'Network error' };

    // Act
    service.handleUploadError(fileKey, fileName, fileSize, error);

    // Assert
    const progress = service.fileProgress().get(fileKey);
    expect(progress?.status).toBe('error');
    expect(progress?.error).toBe('Network error');
    expect(progress?.bytesUploaded).toBe(0);
    expect(progress?.bytesTotal).toBe(fileSize);
    expect(progress?.percentage).toBe(0);
  });

  it('should use default error message when error.message is undefined', () => {
    // Arrange
    const fileKey = 'question1-test.txt-0';

    // Act
    service.handleUploadError(fileKey, 'test.txt', 100, {});

    // Assert
    const progress = service.fileProgress().get(fileKey);
    expect(progress?.error).toBe('Upload failed');
  });

  it('should use default error message when error is null', () => {
    // Arrange
    const fileKey = 'question1-test.txt-0';

    // Act
    service.handleUploadError(fileKey, 'test.txt', 100, null);

    // Assert
    const progress = service.fileProgress().get(fileKey);
    expect(progress?.error).toBe('Upload failed');
  });

  it('should remove from activeUploads', () => {
    // Arrange
    const fileKey = 'question1-test.txt-0';
    const mockUpload = { abort: jasmine.createSpy('abort') };
    (service as any).activeUploads.set(fileKey, mockUpload);

    // Act
    service.handleUploadError(fileKey, 'test.txt', 100, { message: 'error' });

    // Assert
    expect((service as any).activeUploads.has(fileKey)).toBeFalse();
  });
});

describe('handleUploadProgress', () => {
  it('should update fileProgress with current progress', () => {
    // Arrange
    const fileKey = 'question1-test.txt-0';
    const fileName = 'test.txt';

    // Act
    service.handleUploadProgress(fileKey, fileName, 50, 100);

    // Assert
    const progress = service.fileProgress().get(fileKey);
    expect(progress?.status).toBe('uploading');
    expect(progress?.bytesUploaded).toBe(50);
    expect(progress?.bytesTotal).toBe(100);
    expect(progress?.percentage).toBe(50);
  });

  it('should calculate percentage correctly', () => {
    // Arrange
    const fileKey = 'question1-test.txt-0';

    // Act
    service.handleUploadProgress(fileKey, 'test.txt', 75, 300);

    // Assert
    const progress = service.fileProgress().get(fileKey);
    expect(progress?.percentage).toBe(25);
  });

  it('should round percentage to nearest integer', () => {
    // Arrange
    const fileKey = 'question1-test.txt-0';

    // Act
    service.handleUploadProgress(fileKey, 'test.txt', 33, 100);

    // Assert
    const progress = service.fileProgress().get(fileKey);
    expect(progress?.percentage).toBe(33);
  });

  it('should handle 0 bytes uploaded', () => {
    // Arrange
    const fileKey = 'question1-test.txt-0';

    // Act
    service.handleUploadProgress(fileKey, 'test.txt', 0, 100);

    // Assert
    const progress = service.fileProgress().get(fileKey);
    expect(progress?.percentage).toBe(0);
    expect(progress?.bytesUploaded).toBe(0);
  });

  it('should handle 100% progress', () => {
    // Arrange
    const fileKey = 'question1-test.txt-0';

    // Act
    service.handleUploadProgress(fileKey, 'test.txt', 100, 100);

    // Assert
    const progress = service.fileProgress().get(fileKey);
    expect(progress?.percentage).toBe(100);
    expect(progress?.status).toBe('uploading'); // Still uploading until onSuccess
  });
});

describe('handleUploadSuccess', () => {
  it('should update fileProgress with complete status', () => {
    // Arrange
    const fileKey = 'question1-test.txt-0';
    const fileName = 'test.txt';
    const fileSize = 100;

    // Act
    service.handleUploadSuccess(fileKey, fileName, fileSize);

    // Assert
    const progress = service.fileProgress().get(fileKey);
    expect(progress?.status).toBe('complete');
    expect(progress?.percentage).toBe(100);
    expect(progress?.bytesUploaded).toBe(fileSize);
    expect(progress?.bytesTotal).toBe(fileSize);
  });

  it('should remove from activeUploads', () => {
    // Arrange
    const fileKey = 'question1-test.txt-0';
    const mockUpload = { abort: jasmine.createSpy('abort') };
    (service as any).activeUploads.set(fileKey, mockUpload);

    // Act
    service.handleUploadSuccess(fileKey, 'test.txt', 100);

    // Assert
    expect((service as any).activeUploads.has(fileKey)).toBeFalse();
  });

  it('should handle large file sizes', () => {
    // Arrange
    const fileKey = 'question1-large.zip-0';
    const fileSize = 500 * 1024 * 1024; // 500MB

    // Act
    service.handleUploadSuccess(fileKey, 'large.zip', fileSize);

    // Assert
    const progress = service.fileProgress().get(fileKey);
    expect(progress?.bytesUploaded).toBe(fileSize);
    expect(progress?.bytesTotal).toBe(fileSize);
  });
});