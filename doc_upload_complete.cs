[RoutePrefix("api/applications")]
public class ApplicationsController : ApiController
{
    [HttpPost]
    [Route("{applicationId}/documents-complete")]
    public IHttpActionResult DocumentsComplete(string applicationId, [FromBody] DocumentsCompleteRequest request)
    {
        try
        {
            System.Diagnostics.Debug.WriteLine($"[EIL] Documents complete - ApplicationId: {applicationId}, BatchId: {request.BatchId}");

            // 1. Associate files - rename folder from batchId to applicationId
            var batchFolder = Path.Combine(TusConfig.BufferPath, request.BatchId);
            var applicationFolder = Path.Combine(TusConfig.BufferPath, applicationId);

            if (Directory.Exists(batchFolder))
            {
                if (Directory.Exists(applicationFolder))
                {
                    Directory.Delete(applicationFolder, true);
                }
                
                Directory.Move(batchFolder, applicationFolder);
                System.Diagnostics.Debug.WriteLine($"[EIL] Renamed folder: {request.BatchId} → {applicationId}");
            }
            else
            {
                System.Diagnostics.Debug.WriteLine($"[EIL] Warning: Batch folder not found: {batchFolder}");
            }

            // 2. TODO: Trigger Compass upload here
            // TriggerCompassUpload(applicationId);

            return Ok(new
            {
                applicationId = applicationId,
                status = "complete",
                message = "Files associated successfully"
            });
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[EIL] Error: {ex.Message}");
            return InternalServerError(ex);
        }
    }
}

public class DocumentsCompleteRequest
{
    public string BatchId { get; set; }
    public int SuccessCount { get; set; }
    public int FailedCount { get; set; }
    public string CompletedAt { get; set; }
}