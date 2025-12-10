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

        /// <summary>
        /// Register expected upload count for an application
        /// </summary>
        public void RegisterExpectedUploads(string applicationId, int expectedCount)
        {
            var state = _applicationUploads.GetOrAdd(applicationId, _ => new ApplicationUploadState());
            state.ExpectedCount = expectedCount;
            state.StartedAt = DateTime.UtcNow;
            
            System.Diagnostics.Debug.WriteLine(
                $"[DocumentTracker] Registered {expectedCount} expected uploads for {applicationId}");
        }

        /// <summary>
        /// Get all uploaded documents for an application
        /// </summary>
        public IEnumerable<UploadedDocument> GetUploadedDocuments(string applicationId)
        {
            if (_applicationUploads.TryGetValue(applicationId, out var state))
            {
                return state.CompletedUploads.ToArray();
            }
            return Enumerable.Empty<UploadedDocument>();
        }

        /// <summary>
        /// Get upload count for an application
        /// </summary>
        public int GetUploadCount(string applicationId)
        {
            if (_applicationUploads.TryGetValue(applicationId, out var state))
            {
                return state.CompletedUploads.Count;
            }
            return 0;
        }

        /// <summary>
        /// Get expected upload count
        /// </summary>
        public int GetExpectedCount(string applicationId)
        {
            if (_applicationUploads.TryGetValue(applicationId, out var state))
            {
                return state.ExpectedCount;
            }
            return 0;
        }

        /// <summary>
        /// Check if all expected uploads are complete
        /// </summary>
        public bool AreAllUploadsComplete(string applicationId)
        {
            if (_applicationUploads.TryGetValue(applicationId, out var state))
            {
                return state.ExpectedCount > 0 && state.CompletedUploads.Count >= state.ExpectedCount;
            }
            return false;
        }

        /// <summary>
        /// Clear tracking data for an application
        /// </summary>
        public void ClearApplicationUploads(string applicationId)
        {
            _applicationUploads.TryRemove(applicationId, out _);
        }
    }

    public class ApplicationUploadState
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