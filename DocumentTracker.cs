using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;

namespace YourNamespace
{
    /// <summary>
    /// Tracks uploaded documents per application
    /// Thread-safe singleton for use across the application
    /// In production, replace with database-backed storage
    /// </summary>
    public class DocumentTracker
    {
        private static readonly Lazy<DocumentTracker> _instance = 
            new Lazy<DocumentTracker>(() => new DocumentTracker());
        
        public static DocumentTracker Instance => _instance.Value;

        private readonly ConcurrentDictionary<string, ApplicationUploadState> _applicationUploads 
            = new ConcurrentDictionary<string, ApplicationUploadState>();

        private DocumentTracker() { }

        /// <summary>
        /// Track a completed file upload
        /// </summary>
        public void TrackCompletedUpload(string applicationId, string fileId, string filename, string filetype)
        {
            var state = _applicationUploads.GetOrAdd(applicationId, _ => new ApplicationUploadState());
            
            var document = new UploadedDocument
            {
                FileId = fileId,
                Filename = filename,
                FileType = filetype,
                UploadedAt = DateTime.UtcNow,
                LocalPath = System.IO.Path.Combine(TusConfig.BufferPath, applicationId, $"{fileId}_{filename}")
            };
            
            state.CompletedUploads.Add(document);
            
            System.Diagnostics.Debug.WriteLine(
                $"[DocumentTracker] Tracked: {filename} for app {applicationId} ({state.CompletedUploads.Count}/{state.ExpectedCount})");
        }


       
    }

    public class DoucmentUploadState
    {
        public int ExpectedCount { get; set; }
        public ConcurrentBag<UploadedDocument> CompletedUploads { get; } = new ConcurrentBag<UploadedDocument>();
        public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    }

    public class UploadedDocument
    {
        public string FileId { get; set; }
        public string Filename { get; set; }
        public string FileType { get; set; }
        public DateTime UploadedAt { get; set; }
        public string LocalPath { get; set; }
    }
}