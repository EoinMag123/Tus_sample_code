using Microsoft.VisualStudio.TestTools.UnitTesting;
using Moq;
using Moq.Protected;
using System;
using System.Collections.Generic;
using System.Configuration;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Http;
using System.Web.Http.Controllers;
using System.Web.Http.Hosting;
using System.Web.Http.Routing;

namespace YourNamespace.Tests
{
    [TestClass]
    public class TusProxyControllerTests
    {
        private Mock<HttpMessageHandler> _mockHttpMessageHandler;
        private HttpClient _httpClient;
        private TusProxyController _controller;
        private const string EilBaseUrl = "https://eil.example.com";

        [TestInitialize]
        public void Setup()
        {
            _mockHttpMessageHandler = new Mock<HttpMessageHandler>();
            _httpClient = new HttpClient(_mockHttpMessageHandler.Object);

            // Create controller and inject mocked HttpClient via reflection
            _controller = new TusProxyController();
            
            // Set the static HttpClient field via reflection
            var httpClientField = typeof(TusProxyController)
                .GetField("_httpClient", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);
            httpClientField?.SetValue(null, _httpClient);

            // Set the EilBaseUrl field via reflection
            var eilBaseUrlField = typeof(TusProxyController)
                .GetField("_eilBaseUrl", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
            eilBaseUrlField?.SetValue(_controller, EilBaseUrl);
        }

        [TestCleanup]
        public void Cleanup()
        {
            _httpClient?.Dispose();
            _controller?.Dispose();
        }

        private void SetupControllerRequest(HttpMethod method, string url, HttpContent content = null, Dictionary<string, string> headers = null)
        {
            var config = new HttpConfiguration();
            var request = new HttpRequestMessage(method, $"http://localhost/api/tus/{url}");
            
            if (content != null)
            {
                request.Content = content;
            }

            if (headers != null)
            {
                foreach (var header in headers)
                {
                    request.Headers.TryAddWithoutValidation(header.Key, header.Value);
                }
            }

            request.Properties[HttpPropertyKeys.HttpConfigurationKey] = config;
            
            _controller.Request = request;
        }

        private void SetupMockResponse(HttpStatusCode statusCode, HttpContent content = null, Dictionary<string, string> headers = null)
        {
            var response = new HttpResponseMessage(statusCode);
            
            if (content != null)
            {
                response.Content = content;
            }

            if (headers != null)
            {
                foreach (var header in headers)
                {
                    response.Headers.TryAddWithoutValidation(header.Key, header.Value);
                }
            }

            _mockHttpMessageHandler
                .Protected()
                .Setup<Task<HttpResponseMessage>>(
                    "SendAsync",
                    ItExpr.IsAny<HttpRequestMessage>(),
                    ItExpr.IsAny<CancellationToken>()
                )
                .ReturnsAsync(response);
        }

        #region POST Tests

        [TestMethod]
        public async Task ProxyTus_Post_ForwardsRequestToEil()
        {
            // Arrange
            SetupControllerRequest(HttpMethod.Post, "");
            SetupMockResponse(HttpStatusCode.Created);

            // Act
            var result = await _controller.ProxyTus("");

            // Assert
            Assert.AreEqual(HttpStatusCode.Created, result.StatusCode);
            VerifyRequestWasSent(HttpMethod.Post, $"{EilBaseUrl}/api/tus/");
        }

        [TestMethod]
        public async Task ProxyTus_Post_WithBody_ForwardsContent()
        {
            // Arrange
            var content = new ByteArrayContent(new byte[] { 0x00, 0x01, 0x02 });
            content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
            content.Headers.ContentLength = 3;
            
            SetupControllerRequest(HttpMethod.Post, "", content);
            SetupMockResponse(HttpStatusCode.Created);

            // Act
            var result = await _controller.ProxyTus("");

            // Assert
            Assert.AreEqual(HttpStatusCode.Created, result.StatusCode);
            VerifyRequestWasSentWithContent(HttpMethod.Post);
        }

        [TestMethod]
        public async Task ProxyTus_Post_WithTusHeaders_ForwardsHeaders()
        {
            // Arrange
            var headers = new Dictionary<string, string>
            {
                { "Tus-Resumable", "1.0.0" },
                { "Upload-Length", "1000" },
                { "Upload-Metadata", "filename dGVzdC50eHQ=" }
            };
            
            SetupControllerRequest(HttpMethod.Post, "", null, headers);
            SetupMockResponse(HttpStatusCode.Created);

            // Act
            var result = await _controller.ProxyTus("");

            // Assert
            Assert.AreEqual(HttpStatusCode.Created, result.StatusCode);
            VerifyRequestContainsHeaders(headers);
        }

        #endregion

        #region PATCH Tests

        [TestMethod]
        public async Task ProxyTus_Patch_ForwardsRequestToEil()
        {
            // Arrange
            var fileId = "abc123";
            SetupControllerRequest(new HttpMethod("PATCH"), fileId);
            SetupMockResponse(HttpStatusCode.NoContent);

            // Act
            var result = await _controller.ProxyTus(fileId);

            // Assert
            Assert.AreEqual(HttpStatusCode.NoContent, result.StatusCode);
            VerifyRequestWasSent(new HttpMethod("PATCH"), $"{EilBaseUrl}/api/tus/{fileId}");
        }

        [TestMethod]
        public async Task ProxyTus_Patch_WithChunkData_ForwardsContent()
        {
            // Arrange
            var fileId = "abc123";
            var chunkData = new byte[1024];
            new Random().NextBytes(chunkData);
            var content = new ByteArrayContent(chunkData);
            content.Headers.ContentType = new MediaTypeHeaderValue("application/offset+octet-stream");
            
            var headers = new Dictionary<string, string>
            {
                { "Tus-Resumable", "1.0.0" },
                { "Upload-Offset", "0" }
            };
            
            SetupControllerRequest(new HttpMethod("PATCH"), fileId, content, headers);
            SetupMockResponse(HttpStatusCode.NoContent);

            // Act
            var result = await _controller.ProxyTus(fileId);

            // Assert
            Assert.AreEqual(HttpStatusCode.NoContent, result.StatusCode);
        }

        #endregion

        #region HEAD Tests

        [TestMethod]
        public async Task ProxyTus_Head_ForwardsRequestToEil()
        {
            // Arrange
            var fileId = "abc123";
            var responseHeaders = new Dictionary<string, string>
            {
                { "Upload-Offset", "500" },
                { "Upload-Length", "1000" }
            };
            
            SetupControllerRequest(HttpMethod.Head, fileId);
            SetupMockResponse(HttpStatusCode.OK, null, responseHeaders);

            // Act
            var result = await _controller.ProxyTus(fileId);

            // Assert
            Assert.AreEqual(HttpStatusCode.OK, result.StatusCode);
            VerifyRequestWasSent(HttpMethod.Head, $"{EilBaseUrl}/api/tus/{fileId}");
        }

        [TestMethod]
        public async Task ProxyTus_Head_ReturnsUploadOffset()
        {
            // Arrange
            var fileId = "abc123";
            var responseHeaders = new Dictionary<string, string>
            {
                { "Upload-Offset", "500" },
                { "Upload-Length", "1000" },
                { "Tus-Resumable", "1.0.0" }
            };
            
            SetupControllerRequest(HttpMethod.Head, fileId);
            SetupMockResponse(HttpStatusCode.OK, null, responseHeaders);

            // Act
            var result = await _controller.ProxyTus(fileId);

            // Assert
            Assert.IsTrue(result.Headers.Contains("Upload-Offset"));
        }

        #endregion

        #region OPTIONS Tests

        [TestMethod]
        public async Task ProxyTus_Options_ForwardsRequestToEil()
        {
            // Arrange
            var responseHeaders = new Dictionary<string, string>
            {
                { "Tus-Resumable", "1.0.0" },
                { "Tus-Version", "1.0.0" },
                { "Tus-Extension", "creation,termination" }
            };
            
            SetupControllerRequest(HttpMethod.Options, "");
            SetupMockResponse(HttpStatusCode.NoContent, null, responseHeaders);

            // Act
            var result = await _controller.ProxyTus("");

            // Assert
            Assert.AreEqual(HttpStatusCode.NoContent, result.StatusCode);
            VerifyRequestWasSent(HttpMethod.Options, $"{EilBaseUrl}/api/tus/");
        }

        [TestMethod]
        public async Task ProxyTus_Options_ReturnsTusCapabilities()
        {
            // Arrange
            var responseHeaders = new Dictionary<string, string>
            {
                { "Tus-Resumable", "1.0.0" },
                { "Tus-Version", "1.0.0" },
                { "Tus-Extension", "creation,termination" },
                { "Tus-Max-Size", "1073741824" }
            };
            
            SetupControllerRequest(HttpMethod.Options, "");
            SetupMockResponse(HttpStatusCode.NoContent, null, responseHeaders);

            // Act
            var result = await _controller.ProxyTus("");

            // Assert
            Assert.IsTrue(result.Headers.Contains("Tus-Resumable"));
            Assert.IsTrue(result.Headers.Contains("Tus-Version"));
        }

        #endregion

        #region DELETE Tests

        [TestMethod]
        public async Task ProxyTus_Delete_ForwardsRequestToEil()
        {
            // Arrange
            var fileId = "abc123";
            SetupControllerRequest(HttpMethod.Delete, fileId);
            SetupMockResponse(HttpStatusCode.NoContent);

            // Act
            var result = await _controller.ProxyTus(fileId);

            // Assert
            Assert.AreEqual(HttpStatusCode.NoContent, result.StatusCode);
            VerifyRequestWasSent(HttpMethod.Delete, $"{EilBaseUrl}/api/tus/{fileId}");
        }

        [TestMethod]
        public async Task ProxyTus_Delete_NonExistentFile_Returns404()
        {
            // Arrange
            var fileId = "nonexistent";
            SetupControllerRequest(HttpMethod.Delete, fileId);
            SetupMockResponse(HttpStatusCode.NotFound);

            // Act
            var result = await _controller.ProxyTus(fileId);

            // Assert
            Assert.AreEqual(HttpStatusCode.NotFound, result.StatusCode);
        }

        #endregion

        #region Header Handling Tests

        [TestMethod]
        public async Task ProxyTus_DoesNotForwardHostHeader()
        {
            // Arrange
            var headers = new Dictionary<string, string>
            {
                { "Host", "original-host.com" },
                { "Tus-Resumable", "1.0.0" }
            };
            
            SetupControllerRequest(HttpMethod.Post, "", null, headers);
            SetupMockResponse(HttpStatusCode.Created);

            // Act
            var result = await _controller.ProxyTus("");

            // Assert
            VerifyHostHeaderNotForwarded();
        }

        [TestMethod]
        public async Task ProxyTus_ForwardsContentTypeHeader()
        {
            // Arrange
            var content = new ByteArrayContent(new byte[] { 0x00 });
            content.Headers.ContentType = new MediaTypeHeaderValue("application/offset+octet-stream");
            
            SetupControllerRequest(new HttpMethod("PATCH"), "abc123", content);
            SetupMockResponse(HttpStatusCode.NoContent);

            // Act
            var result = await _controller.ProxyTus("abc123");

            // Assert
            VerifyContentTypeForwarded("application/offset+octet-stream");
        }

        [TestMethod]
        public async Task ProxyTus_ForwardsContentLengthHeader()
        {
            // Arrange
            var data = new byte[500];
            var content = new ByteArrayContent(data);
            content.Headers.ContentLength = 500;
            
            SetupControllerRequest(new HttpMethod("PATCH"), "abc123", content);
            SetupMockResponse(HttpStatusCode.NoContent);

            // Act
            var result = await _controller.ProxyTus("abc123");

            // Assert
            VerifyContentLengthForwarded(500);
        }

        #endregion

        #region Error Handling Tests

        [TestMethod]
        public async Task ProxyTus_EilReturns500_Returns500()
        {
            // Arrange
            SetupControllerRequest(HttpMethod.Post, "");
            SetupMockResponse(HttpStatusCode.InternalServerError);

            // Act
            var result = await _controller.ProxyTus("");

            // Assert
            Assert.AreEqual(HttpStatusCode.InternalServerError, result.StatusCode);
        }

        [TestMethod]
        public async Task ProxyTus_EilReturns404_Returns404()
        {
            // Arrange
            SetupControllerRequest(HttpMethod.Head, "nonexistent");
            SetupMockResponse(HttpStatusCode.NotFound);

            // Act
            var result = await _controller.ProxyTus("nonexistent");

            // Assert
            Assert.AreEqual(HttpStatusCode.NotFound, result.StatusCode);
        }

        [TestMethod]
        public async Task ProxyTus_EilReturns413_Returns413()
        {
            // Arrange
            SetupControllerRequest(HttpMethod.Post, "");
            SetupMockResponse(HttpStatusCode.RequestEntityTooLarge);

            // Act
            var result = await _controller.ProxyTus("");

            // Assert
            Assert.AreEqual(HttpStatusCode.RequestEntityTooLarge, result.StatusCode);
        }

        #endregion

        #region Path Handling Tests

        [TestMethod]
        public async Task ProxyTus_EmptyPath_ForwardsToBaseUrl()
        {
            // Arrange
            SetupControllerRequest(HttpMethod.Post, "");
            SetupMockResponse(HttpStatusCode.Created);

            // Act
            var result = await _controller.ProxyTus("");

            // Assert
            VerifyRequestWasSent(HttpMethod.Post, $"{EilBaseUrl}/api/tus/");
        }

        [TestMethod]
        public async Task ProxyTus_WithFileId_ForwardsCorrectPath()
        {
            // Arrange
            var fileId = "abc123def456";
            SetupControllerRequest(HttpMethod.Head, fileId);
            SetupMockResponse(HttpStatusCode.OK);

            // Act
            var result = await _controller.ProxyTus(fileId);

            // Assert
            VerifyRequestWasSent(HttpMethod.Head, $"{EilBaseUrl}/api/tus/{fileId}");
        }

        [TestMethod]
        public async Task ProxyTus_NullPath_HandlesGracefully()
        {
            // Arrange
            SetupControllerRequest(HttpMethod.Options, "");
            SetupMockResponse(HttpStatusCode.NoContent);

            // Act
            var result = await _controller.ProxyTus(null);

            // Assert
            Assert.AreEqual(HttpStatusCode.NoContent, result.StatusCode);
        }

        #endregion

        #region Verification Helpers

        private void VerifyRequestWasSent(HttpMethod method, string url)
        {
            _mockHttpMessageHandler
                .Protected()
                .Verify(
                    "SendAsync",
                    Times.Once(),
                    ItExpr.Is<HttpRequestMessage>(req =>
                        req.Method == method &&
                        req.RequestUri.ToString() == url),
                    ItExpr.IsAny<CancellationToken>()
                );
        }

        private void VerifyRequestWasSentWithContent(HttpMethod method)
        {
            _mockHttpMessageHandler
                .Protected()
                .Verify(
                    "SendAsync",
                    Times.Once(),
                    ItExpr.Is<HttpRequestMessage>(req =>
                        req.Method == method &&
                        req.Content != null),
                    ItExpr.IsAny<CancellationToken>()
                );
        }

        private void VerifyRequestContainsHeaders(Dictionary<string, string> expectedHeaders)
        {
            _mockHttpMessageHandler
                .Protected()
                .Verify(
                    "SendAsync",
                    Times.Once(),
                    ItExpr.Is<HttpRequestMessage>(req =>
                        ContainsExpectedHeaders(req, expectedHeaders)),
                    ItExpr.IsAny<CancellationToken>()
                );
        }

        private bool ContainsExpectedHeaders(HttpRequestMessage request, Dictionary<string, string> expectedHeaders)
        {
            foreach (var header in expectedHeaders)
            {
                if (!request.Headers.Contains(header.Key))
                    return false;
            }
            return true;
        }

        private void VerifyHostHeaderNotForwarded()
        {
            _mockHttpMessageHandler
                .Protected()
                .Verify(
                    "SendAsync",
                    Times.Once(),
                    ItExpr.Is<HttpRequestMessage>(req =>
                        !req.Headers.Contains("Host")),
                    ItExpr.IsAny<CancellationToken>()
                );
        }

        private void VerifyContentTypeForwarded(string expectedContentType)
        {
            _mockHttpMessageHandler
                .Protected()
                .Verify(
                    "SendAsync",
                    Times.Once(),
                    ItExpr.Is<HttpRequestMessage>(req =>
                        req.Content != null &&
                        req.Content.Headers.ContentType != null &&
                        req.Content.Headers.ContentType.MediaType == expectedContentType),
                    ItExpr.IsAny<CancellationToken>()
                );
        }

        private void VerifyContentLengthForwarded(long expectedLength)
        {
            _mockHttpMessageHandler
                .Protected()
                .Verify(
                    "SendAsync",
                    Times.Once(),
                    ItExpr.Is<HttpRequestMessage>(req =>
                        req.Content != null &&
                        req.Content.Headers.ContentLength == expectedLength),
                    ItExpr.IsAny<CancellationToken>()
                );
        }

        #endregion
    }
}