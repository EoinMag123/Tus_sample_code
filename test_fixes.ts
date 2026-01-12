describe('clearQuestionFiles', () => {
  it('should remove all files for the specified question', () => {
    // Arrange
    const file1 = new File(['content1'], 'file1.txt');
    const file2 = new File(['content2'], 'file2.txt');
    const file3 = new File(['content3'], 'file3.txt');
    
    (service as any)._storedFiles.set([
      { file: file1, questionName: 'question1', previewUrl: 'blob:url1' },
      { file: file2, questionName: 'question1', previewUrl: 'blob:url2' },
      { file: file3, questionName: 'question2', previewUrl: 'blob:url3' }
    ]);

    // Act
    service.clearQuestionFiles('question1');

    // Assert
    expect(service.storedFiles().length).toBe(1);
    expect(service.storedFiles()[0].questionName).toBe('question2');
  });

  it('should revoke object URLs for removed files', () => {
    // Arrange
    const file1 = new File(['content1'], 'file1.txt');
    const file2 = new File(['content2'], 'file2.txt');
    
    (service as any)._storedFiles.set([
      { file: file1, questionName: 'question1', previewUrl: 'blob:url1' },
      { file: file2, questionName: 'question1', previewUrl: 'blob:url2' }
    ]);
    
    spyOn(URL, 'revokeObjectURL');

    // Act
    service.clearQuestionFiles('question1');

    // Assert
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url1');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url2');
  });

  it('should not revoke URL when previewUrl is undefined', () => {
    // Arrange
    const file1 = new File(['content1'], 'file1.txt');
    
    (service as any)._storedFiles.set([
      { file: file1, questionName: 'question1', previewUrl: undefined }
    ]);
    
    spyOn(URL, 'revokeObjectURL');

    // Act
    service.clearQuestionFiles('question1');

    // Assert
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('should not revoke URL when previewUrl is null', () => {
    // Arrange
    const file1 = new File(['content1'], 'file1.txt');
    
    (service as any)._storedFiles.set([
      { file: file1, questionName: 'question1', previewUrl: null }
    ]);
    
    spyOn(URL, 'revokeObjectURL');

    // Act
    service.clearQuestionFiles('question1');

    // Assert
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('should not affect files from other questions', () => {
    // Arrange
    const file1 = new File(['content1'], 'file1.txt');
    const file2 = new File(['content2'], 'file2.txt');
    
    (service as any)._storedFiles.set([
      { file: file1, questionName: 'question1', previewUrl: 'blob:url1' },
      { file: file2, questionName: 'question2', previewUrl: 'blob:url2' }
    ]);
    
    spyOn(URL, 'revokeObjectURL');

    // Act
    service.clearQuestionFiles('question1');

    // Assert
    expect(service.storedFiles().length).toBe(1);
    expect(service.storedFiles()[0].questionName).toBe('question2');
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url1');
  });

  it('should handle empty stored files', () => {
    // Arrange
    (service as any)._storedFiles.set([]);
    spyOn(URL, 'revokeObjectURL');

    // Act & Assert - should not throw
    expect(() => service.clearQuestionFiles('question1')).not.toThrow();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('should handle non-existent question name', () => {
    // Arrange
    const file1 = new File(['content1'], 'file1.txt');
    
    (service as any)._storedFiles.set([
      { file: file1, questionName: 'question1', previewUrl: 'blob:url1' }
    ]);
    
    spyOn(URL, 'revokeObjectURL');

    // Act
    service.clearQuestionFiles('nonExistentQuestion');

    // Assert - nothing should be removed
    expect(service.storedFiles().length).toBe(1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('should handle mixed files with and without previewUrl', () => {
    // Arrange
    const file1 = new File(['content1'], 'file1.txt');
    const file2 = new File(['content2'], 'file2.txt');
    const file3 = new File(['content3'], 'file3.txt');
    
    (service as any)._storedFiles.set([
      { file: file1, questionName: 'question1', previewUrl: 'blob:url1' },
      { file: file2, questionName: 'question1', previewUrl: undefined },
      { file: file3, questionName: 'question1', previewUrl: 'blob:url3' }
    ]);
    
    spyOn(URL, 'revokeObjectURL');

    // Act
    service.clearQuestionFiles('question1');

    // Assert
    expect(service.storedFiles().length).toBe(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url1');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url3');
  });
});