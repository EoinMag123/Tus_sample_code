// In BFF - just forward TUS requests to EIL
[RoutePrefix("api/tus")]
public class TusProxyController : ApiController
{
    private static readonly HttpClient _httpClient = new HttpClient();
    private readonly string _eilBaseUrl = ConfigurationManager.AppSettings["EilBaseUrl"];

    [Route("{*path}")]
    [AcceptVerbs("POST", "PATCH", "HEAD", "OPTIONS", "DELETE")]
    public async Task<HttpResponseMessage> ProxyTus(string path = "")
    {
        // Forward the request to EIL
        var eilUrl = $"{_eilBaseUrl}/api/tus/{path}";
        
        var request = new HttpRequestMessage(
            new HttpMethod(Request.Method.Method),
            eilUrl
        );

        // Copy headers (important for TUS)
        foreach (var header in Request.Headers)
        {
            if (!header.Key.Equals("Host", StringComparison.OrdinalIgnoreCase))
            {
                request.Headers.TryAddWithoutValidation(header.Key, header.Value);
            }
        }

        // Copy body for POST/PATCH
        if (Request.Content != null)
        {
            request.Content = new StreamContent(await Request.Content.ReadAsStreamAsync());
            if (Request.Content.Headers.ContentType != null)
            {
                request.Content.Headers.ContentType = Request.Content.Headers.ContentType;
            }
            if (Request.Content.Headers.ContentLength != null)
            {
                request.Content.Headers.ContentLength = Request.Content.Headers.ContentLength;
            }
        }

        // Forward to EIL
        var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);

        return response;
    }
}