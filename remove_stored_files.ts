removeStoredFile(
  questionName: string,
  fileName: string,
  callback: (status: string, data: any) => void
): void {
  // Find the fileKey for this file
  const fileKey = Array.from(this.activeUploads.keys())
    .find(key => key.includes(fileName) && key.includes(questionName))
    || Array.from(this.tusFileIds.keys())
      .find(key => key.includes(fileName) && key.includes(questionName));

  // Cancel active upload if exists
  if (fileKey && this.activeUploads.has(fileKey)) {
    const upload = this.activeUploads.get(fileKey);
    if (upload) {
      console.log(`[TUS Service] Aborting upload for ${fileName}`);
      upload.abort();
      this.activeUploads.delete(fileKey);
    }
  }

  // Delete from server if we have a TUS file ID
  if (fileKey && this.tusFileIds.has(fileKey)) {
    const tusFileId = this.tusFileIds.get(fileKey);
    console.log(`[TUS Service] Deleting file from server: ${tusFileId}`);
    
    this.http.delete(`${this.tusEndpoint}/${tusFileId}`).subscribe({
      next: () => console.log(`[TUS Service] Server file deleted: ${tusFileId}`),
      error: (err) => console.error(`[TUS Service] Failed to delete server file:`, err)
    });
    
    this.tusFileIds.delete(fileKey);
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