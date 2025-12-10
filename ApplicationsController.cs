using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Web.Http;

namespace YourNamespace.Controllers
{
    /// <summary>
    /// Applications API Controller for Web API 2
    /// Handles application submission and document upload completion
    /// </summary>
    [RoutePrefix("api/applications")]
    public class ApplicationsController : ApiController
    {
        /// <summary>
        /// Submit a new application (quick operation - returns immediately)
        /// POST api/applications
        /// </summary>
        [HttpPost]
        [Route("")]
        public IHttpActionResult SubmitApplication([FromBody] ApplicationRequest request)
        {
            try
            {
                if (request == null)
                {
                    return BadRequest("Request body is required");
                }

                if (string.IsNullOrWhiteSpace(request.ApplicantName))
                {
                    return BadRequest("Applicant name is required");
                }

                // Create the application (in production, this calls your EIL/CRM)
                var applicationId = ApplicationManager.Instance.CreateApplication(
                    request.ApplicantName,
                    request.Email,
                    request.DocumentCount
                );

                // Return immediately with the application ID
                // Documents will be uploaded separately via TUS
                var response = new ApplicationResponse
                {
                    ApplicationId = applicationId,
                    Status = "Pending",
                    Message = "Application submitted. Document upload can begin.",
                    DocumentsExpected = request.DocumentCount,
                    TusEndpoint = GetTusEndpoint()
                };

                return Ok(response);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[ApplicationsController] Error: {ex.Message}");
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// Called by Angular when all document uploads are complete
        /// POST api/applications/{applicationId}/documents-complete
        /// </summary>
        [HttpPost]
        [Route("{applicationId}/documents-complete")]
        public IHttpActionResult DocumentsComplete(string applicationId, [FromBody] DocumentsCompleteRequest request)
        {
            try
            {
                System.Diagnostics.Debug.WriteLine(
                    $"[ApplicationsController] Documents complete for {applicationId}: " +
                    $"Success={request?.SuccessCount}, Failed={request?.FailedCount}");

                // Check application exists
                var appState = ApplicationManager.Instance.GetApplication(applicationId);
                if (appState == null)
                {
                    return NotFound();
                }

                // Get uploaded documents
                var uploadedDocs = DocumentTracker.Instance.GetUploadedDocuments(applicationId).ToList();

                // Update status to Submitted
                ApplicationManager.Instance.UpdateStatusToSubmitted(applicationId);

                // Get updated state
                var updatedState = ApplicationManager.Instance.GetApplication(applicationId);

                var response = new DocumentsCompleteResponse
                {
                    ApplicationId = applicationId,
                    Status = updatedState?.Status.ToString() ?? "Unknown",
                    DocumentsUploaded = uploadedDocs.Count,
                    SuccessCount = request?.SuccessCount ?? uploadedDocs.Count,
                    FailedCount = request?.FailedCount ?? 0,
                    Message = (request?.FailedCount ?? 0) > 0
                        ? $"Application submitted with {request.FailedCount} failed uploads"
                        : "Application submitted successfully with all documents",
                    UploadedFiles = uploadedDocs.Select(d => new UploadedFileInfo
                    {
                        FileId = d.FileId,
                        Filename = d.Filename,
                        UploadedAt = d.UploadedAt
                    }).ToList()
                };

                return Ok(response);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[ApplicationsController] Error: {ex.Message}");
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// Get application status including upload progress
        /// GET api/applications/{applicationId}/status
        /// </summary>
        [HttpGet]
        [Route("{applicationId}/status")]
        public IHttpActionResult GetStatus(string applicationId)
        {
            var appState = ApplicationManager.Instance.GetApplication(applicationId);
            if (appState == null)
            {
                return NotFound();
            }

            var uploadCount = DocumentTracker.Instance.GetUploadCount(applicationId);
            var uploadedDocs = DocumentTracker.Instance.GetUploadedDocuments(applicationId);

            var response = new ApplicationStatusResponse
            {
                ApplicationId = applicationId,
                Status = appState.Status.ToString(),
                CreatedAt = appState.CreatedAt,
                SubmittedAt = appState.SubmittedAt,
                ExpectedDocuments = appState.ExpectedDocuments,
                UploadedDocuments = uploadCount,
                IsComplete = appState.Status == ApplicationStatusType.Submitted,
                UploadedFiles = uploadedDocs.Select(d => new UploadedFileInfo
                {
                    FileId = d.FileId,
                    Filename = d.Filename,
                    UploadedAt = d.UploadedAt
                }).ToList()
            };

            return Ok(response);
        }

        /// <summary>
        /// Get uploaded documents for an application
        /// GET api/applications/{applicationId}/documents
        /// </summary>
        [HttpGet]
        [Route("{applicationId}/documents")]
        public IHttpActionResult GetDocuments(string applicationId)
        {
            if (!ApplicationManager.Instance.ApplicationExists(applicationId))
            {
                return NotFound();
            }

            var docs = DocumentTracker.Instance.GetUploadedDocuments(applicationId);
            var response = docs.Select(d => new UploadedFileInfo
            {
                FileId = d.FileId,
                Filename = d.Filename,
                UploadedAt = d.UploadedAt
            }).ToList();

            return Ok(response);
        }

        private string GetTusEndpoint()
        {
            var request = Request.RequestUri;
            return $"{request.Scheme}://{request.Authority}/api/tus";
        }
    }

    #region Request/Response DTOs

    public class ApplicationRequest
    {
        public string ApplicantName { get; set; }
        public string Email { get; set; }
        public int DocumentCount { get; set; }
    }

    public class ApplicationResponse
    {
        public string ApplicationId { get; set; }
        public string Status { get; set; }
        public string Message { get; set; }
        public int DocumentsExpected { get; set; }
        public string TusEndpoint { get; set; }
    }

    public class DocumentsCompleteRequest
    {
        public int SuccessCount { get; set; }
        public int FailedCount { get; set; }
        public string CompletedAt { get; set; }
    }

    public class DocumentsCompleteResponse
    {
        public string ApplicationId { get; set; }
        public string Status { get; set; }
        public int DocumentsUploaded { get; set; }
        public int SuccessCount { get; set; }
        public int FailedCount { get; set; }
        public string Message { get; set; }
        public List<UploadedFileInfo> UploadedFiles { get; set; }
    }

    public class ApplicationStatusResponse
    {
        public string ApplicationId { get; set; }
        public string Status { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? SubmittedAt { get; set; }
        public int ExpectedDocuments { get; set; }
        public int UploadedDocuments { get; set; }
        public bool IsComplete { get; set; }
        public List<UploadedFileInfo> UploadedFiles { get; set; }
    }

    public class UploadedFileInfo
    {
        public string FileId { get; set; }
        public string Filename { get; set; }
        public DateTime UploadedAt { get; set; }
    }

    #endregion
}