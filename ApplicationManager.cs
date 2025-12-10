using System;
using System.Collections.Concurrent;

namespace YourNamespace
{
    /// <summary>
    /// Manages application state for POC
    /// In production, this would call your EIL/CRM
    /// </summary>
    public class ApplicationManager
    {
        private static readonly Lazy<ApplicationManager> _instance = 
            new Lazy<ApplicationManager>(() => new ApplicationManager());
        
        public static ApplicationManager Instance => _instance.Value;

        private readonly ConcurrentDictionary<string, ApplicationState> _applications 
            = new ConcurrentDictionary<string, ApplicationState>();

        private ApplicationManager() { }

        /// <summary>
        /// Create a new application (returns ID)
        /// In production, this would call your EIL to create in CRM
        /// </summary>
        public string CreateApplication(string applicantName, string email, int documentCount)
        {
            // Generate application ID - in production this comes from CRM
            var applicationId = $"APP-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N").Substring(0, 8).ToUpper()}";
            
            var state = new ApplicationState
            {
                ApplicationId = applicationId,
                ApplicantName = applicantName,
                Email = email,
                Status = ApplicationStatusType.Pending,
                CreatedAt = DateTime.UtcNow,
                ExpectedDocuments = documentCount
            };
            
            _applications[applicationId] = state;
            
            // Register expected documents with tracker
            if (documentCount > 0)
            {
                DocumentTracker.Instance.RegisterExpectedUploads(applicationId, documentCount);
            }
            
            System.Diagnostics.Debug.WriteLine(
                $"[ApplicationManager] Created {applicationId} with {documentCount} expected documents");
            
            return applicationId;
        }

        /// <summary>
        /// Update status to Submitted after documents are uploaded
        /// </summary>
        public void UpdateStatusToSubmitted(string applicationId)
        {
            if (_applications.TryGetValue(applicationId, out var state))
            {
                state.Status = ApplicationStatusType.Submitted;
                state.SubmittedAt = DateTime.UtcNow;
                state.UploadedDocuments = DocumentTracker.Instance.GetUploadCount(applicationId);
                
                System.Diagnostics.Debug.WriteLine(
                    $"[ApplicationManager] Updated {applicationId} to Submitted ({state.UploadedDocuments}/{state.ExpectedDocuments} docs)");
                
                // In production, this is where you'd:
                // 1. Call EIL to update CRM status
                // 2. Queue documents for transfer to Compass
                // 3. Trigger any workflows
            }
        }

        /// <summary>
        /// Get application state
        /// </summary>
        public ApplicationState GetApplication(string applicationId)
        {
            _applications.TryGetValue(applicationId, out var state);
            return state;
        }

        /// <summary>
        /// Check if application exists
        /// </summary>
        public bool ApplicationExists(string applicationId)
        {
            return _applications.ContainsKey(applicationId);
        }
    }

    public class ApplicationState
    {
        public string ApplicationId { get; set; }
        public string ApplicantName { get; set; }
        public string Email { get; set; }
        public ApplicationStatusType Status { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? SubmittedAt { get; set; }
        public int ExpectedDocuments { get; set; }
        public int UploadedDocuments { get; set; }
    }

    public enum ApplicationStatusType
    {
        Pending,
        Submitted,
        Processing,
        Complete,
        Failed
    }
}