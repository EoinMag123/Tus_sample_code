using Microsoft.Owin;
using Microsoft.Owin.Cors;
using Owin;
using System;
using System.Configuration;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.Web.Cors;
using System.Web.Http;
using tusdotnet;
using tusdotnet.Models;
using tusdotnet.Models.Configuration;
using tusdotnet.Stores;

[assembly: OwinStartup(typeof(YourNamespace.Startup))]

namespace YourNamespace
{
    public class Startup
    {
        public void Configuration(IAppBuilder app)
        {
            // Get TUS buffer path from web.config or use default
            var tusBufferPath = ConfigurationManager.AppSettings["TusBufferPath"] 
                ?? Path.Combine(Path.GetTempPath(), "tus-uploads");
            
            // Ensure directory exists
            Directory.CreateDirectory(tusBufferPath);

            // Store configuration in a static holder for access elsewhere
            TusConfig.BufferPath = tusBufferPath;

            // Configure CORS - MUST come before TUS middleware
            var corsPolicy = new CorsPolicy
            {
                AllowAnyMethod = true,
                AllowAnyHeader = true,
                SupportsCredentials = true
            };
            
            // Add your Angular origins
            corsPolicy.Origins.Add("http://localhost:4200");
            corsPolicy.Origins.Add("https://localhost:4200");
            
            // Expose TUS-specific headers
            corsPolicy.ExposedHeaders.Add("Upload-Offset");
            corsPolicy.ExposedHeaders.Add("Upload-Length");
            corsPolicy.ExposedHeaders.Add("Upload-Metadata");
            corsPolicy.ExposedHeaders.Add("Tus-Resumable");
            corsPolicy.ExposedHeaders.Add("Tus-Version");
            corsPolicy.ExposedHeaders.Add("Tus-Extension");
            corsPolicy.ExposedHeaders.Add("Tus-Max-Size");
            corsPolicy.ExposedHeaders.Add("Location");

            var corsOptions = new CorsOptions
            {
                PolicyProvider = new CorsPolicyProvider
                {
                    PolicyResolver = context => Task.FromResult(corsPolicy)
                }
            };

            app.UseCors(corsOptions);

            // Configure TUS middleware (OWIN-based)
            app.UseTus(httpContext => new DefaultTusConfiguration
            {
                // File storage location
                Store = new TusDiskStore(tusBufferPath),
                
                // URL path for TUS uploads - must match Angular endpoint
                UrlPath = "/api/tus",
                
                // Max file size (500MB)
                MaxAllowedUploadSizeInBytes = 500L * 1024 * 1024,
                
                // TUS events
                Events = new Events
                {
                    OnFileCompleteAsync = async eventContext =>
                    {
                        var file = await eventContext.GetFileAsync();
                        var metadata = await file.GetMetadataAsync(eventContext.CancellationToken);
                        
                        var applicationId = GetMetadataValue(metadata, "applicationId");
                        var filename = GetMetadataValue(metadata, "filename");
                        var filetype = GetMetadataValue(metadata, "filetype");
                        var fileKey = GetMetadataValue(metadata, "fileKey");

                        System.Diagnostics.Debug.WriteLine($"[TUS] File upload complete:");
                        System.Diagnostics.Debug.WriteLine($"      File ID: {file.Id}");
                        System.Diagnostics.Debug.WriteLine($"      Application ID: {applicationId}");
                        System.Diagnostics.Debug.WriteLine($"      Filename: {filename}");

                        // Track the upload
                        if (!string.IsNullOrEmpty(applicationId))
                        {
                            DocumentTracker.Instance.TrackCompletedUpload(
                                applicationId,
                                file.Id,
                                filename,
                                filetype
                            );
                        }

                        // Move file to application-specific folder
                        var finalDir = Path.Combine(tusBufferPath, applicationId ?? "unknown");
                        Directory.CreateDirectory(finalDir);
                        
                        var finalPath = Path.Combine(finalDir, $"{file.Id}_{SanitizeFilename(filename)}");
                        var tusFilePath = Path.Combine(tusBufferPath, file.Id);
                        
                        if (File.Exists(tusFilePath))
                        {
                            // Move the file
                            if (File.Exists(finalPath))
                                File.Delete(finalPath);
                            File.Move(tusFilePath, finalPath);
                            
                            System.Diagnostics.Debug.WriteLine($"      Moved to: {finalPath}");
                            
                            // Clean up TUS metadata file
                            var metadataFile = tusFilePath + ".metadata";
                            if (File.Exists(metadataFile))
                                File.Delete(metadataFile);
                                
                            // Also clean up any .uploadlength or .chunkstart files
                            var uploadLengthFile = tusFilePath + ".uploadlength";
                            if (File.Exists(uploadLengthFile))
                                File.Delete(uploadLengthFile);
                        }
                    },

                    OnCreateCompleteAsync = eventContext =>
                    {
                        var metadata = eventContext.Metadata;
                        var applicationId = GetMetadataValue(metadata, "applicationId");
                        var filename = GetMetadataValue(metadata, "filename");
                        
                        System.Diagnostics.Debug.WriteLine($"[TUS] Upload started - File: {filename}, App: {applicationId}");
                        
                        return Task.FromResult(0);
                    },

                    OnBeforeCreateAsync = eventContext =>
                    {
                        var metadata = eventContext.Metadata;
                        var applicationId = GetMetadataValue(metadata, "applicationId");
                        
                        if (string.IsNullOrEmpty(applicationId))
                        {
                            eventContext.FailRequest("Application ID is required in metadata");
                        }
                        
                        return Task.FromResult(0);
                    }
                }
            });

            // Configure Web API
            var config = new HttpConfiguration();
            
            // Enable attribute routing
            config.MapHttpAttributeRoutes();
            
            // Convention-based routing
            config.Routes.MapHttpRoute(
                name: "DefaultApi",
                routeTemplate: "api/{controller}/{id}",
                defaults: new { id = RouteParameter.Optional }
            );

            // Use Web API
            app.UseWebApi(config);
        }

        private static string GetMetadataValue(Dictionary<string, Metadata> metadata, string key)
        {
            if (metadata != null && metadata.TryGetValue(key, out var value))
            {
                return value.GetString(Encoding.UTF8);
            }
            return string.Empty;
        }

        private static string SanitizeFilename(string filename)
        {
            if (string.IsNullOrEmpty(filename))
                return "unnamed";
                
            var invalid = Path.GetInvalidFileNameChars();
            var sanitized = new StringBuilder();
            foreach (var c in filename)
            {
                sanitized.Append(Array.IndexOf(invalid, c) >= 0 ? '_' : c);
            }
            return sanitized.ToString();
        }
    }

    /// <summary>
    /// Static configuration holder for TUS settings
    /// In a more complex app, use an IoC container
    /// </summary>
    public static class TusConfig
    {
        public static string BufferPath { get; set; }
    }
}