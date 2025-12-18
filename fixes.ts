it('should abort all active uploads', () => {
  const mockFile1 = new File(['content1'], 'test1.txt');
  const mockFile2 = new File(['content2'], 'test2.txt');
  
  // Create mock upload objects
  const mockUpload1 = { abort: jasmine.createSpy('abort1') };
  const mockUpload2 = { abort: jasmine.createSpy('abort2') };
  
  let uploadCount = 0;
  
  // Spy on uploadSingleFile and simulate adding to activeUploads
  spyOn<any>(service, 'uploadSingleFile').and.callFake((file: File, key: string) => {
    const mockUpload = uploadCount === 0 ? mockUpload1 : mockUpload2;
    (service as any).activeUploads.set(key, mockUpload);
    uploadCount++;
  });
  
  service.uploadFilesFromSurvey('batch-123', 'question1', [mockFile1, mockFile2], jasmine.createSpy());
  
  expect((service as any).activeUploads.size).toBe(2);
  
  service.cancelAllUploads();
  
  expect((service as any).activeUploads.size).toBe(0);
  expect(mockUpload1.abort).toHaveBeenCalled();
  expect(mockUpload2.abort).toHaveBeenCalled();
});