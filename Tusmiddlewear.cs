using Microsoft.Owin;
using Microsoft.Owin.Cors;
using Owin;
using System;
using System.Collections.Generic;
using System.Configuration;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.Web.Http;
using tusdotnet;
using tusdotnet.Models;
using tusdotnet.Models.Configuration;
using tusdotnet.Stores;

[assembly: OwinStartup(typeof(YourEilNamespace.Startup))]

namespace YourEilNamespace
{
    public class Startup
    {
        public void Configuration(IAppBuilder app)
        {
            var tusBufferPath = ConfigurationManager.AppSettings["TusBufferPath"]
                ?? Path.Combine(Path.GetTempPath(), "tus-uploads");

            Directory.CreateDirectory(tusBufferPath);
            TusConfig.BufferPath = tusBufferPath;

            System.Diagnostics.Debug.WriteLine($"=== EIL OWIN Startup running, TUS path: {tusBufferPath} ===");

            // CORS (if BFF needs it - may not be needed for server-to-server)
            app.UseCors(CorsOptions.AllowAll);

            // TUS middleware - handles /api/tus/*
            app.UseTus(httpContext => new DefaultTusConfiguration
            {
                Store = new TusDiskStore(tusBufferPath),
                UrlPath = "/api/tus",
                MaxAllowedUploadSizeInBytes = 500 * 1024 * 1024,

                Events = new Events
                {
                    OnFileCompleteAsync = async eventContext =>
                    {
                        var file = await eventContext.GetFileAsync();
                        var metadata = await file.GetMetadataAsync(eventContext.CancellationToken);

                        var batchId = GetMetadataValue(metadata, "batchId");
                        var filename = GetMetadataValue(metadata, "filename");
                        var filetype = GetMetadataValue(metadata, "filetype");

                        System.Diagnostics.Debug.WriteLine($"[EIL TUS] File complete: {filename}, BatchId: {batchId}");

                        // Track the upload by batchId
                        DocumentTracker.Instance.TrackCompletedUpload(batchId, file.Id, filename, filetype);

                        // Move to batch folder
                        var batchDir = Path.Combine(tusBufferPath, batchId ?? "unknown");
                        Directory.CreateDirectory(batchDir);

                        var tusFilePath = Path.Combine(tusBufferPath, file.Id);
                        var finalPath = Path.Combine(batchDir, $"{file.Id}_{SanitizeFilename(filename)}");

                        if (File.Exists(tusFilePath))
                        {
                            if (File.Exists(finalPath)) File.Delete(finalPath);
                            File.Move(tusFilePath, finalPath);

                            // Cleanup TUS metadata files
                            var metaFile = tusFilePath + ".metadata";
                            if (File.Exists(metaFile)) File.Delete(metaFile);

                            var lengthFile = tusFilePath + ".uploadlength";
                            if (File.Exists(lengthFile)) File.Delete(lengthFile);
                        }
                    },

                    OnCreateCompleteAsync = eventContext =>
                    {
                        var batchId = GetMetadataValue(eventContext.Metadata, "batchId");
                        var filename = GetMetadataValue(eventContext.Metadata, "filename");
                        System.Diagnostics.Debug.WriteLine($"[EIL TUS] Upload started: {filename}, BatchId: {batchId}");
                        return Task.FromResult(0);
                    }
                }
            });

            // Web API
            var config = new HttpConfiguration();
            config.MapHttpAttributeRoutes();
            config.Routes.MapHttpRoute("DefaultApi", "api/{controller}/{id}", new { id = RouteParameter.Optional });
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
            if (string.IsNullOrEmpty(filename)) return "unnamed";
            var invalid = Path.GetInvalidFileNameChars();
            var sb = new StringBuilder();
            foreach (var c in filename)
            {
                sb.Append(Array.IndexOf(invalid, c) >= 0 ? '_' : c);
            }
            return sb.ToString();
        }
    }

    public static class TusConfig
    {
        public static string BufferPath { get; set; }
    }
}