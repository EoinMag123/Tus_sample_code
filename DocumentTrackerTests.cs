using Microsoft.VisualStudio.TestTools.UnitTesting;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using YourNamespace;

namespace YourNamespace.Tests
{
    [TestClass]
    public class DocumentTrackerTests
    {
        private DocumentTracker _tracker;

        [TestInitialize]
        public void Setup()
        {
            // Get the singleton instance
            _tracker = DocumentTracker.Instance;
            
            // Clear any existing state using reflection (since it's a singleton)
            var field = typeof(DocumentTracker)
                .GetField("_applicationUploads", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
            var dictionary = field?.GetValue(_tracker) as System.Collections.Concurrent.ConcurrentDictionary<string, ApplicationUploadState>;
            dictionary?.Clear();
        }

        #region Singleton Tests

        [TestMethod]
        public void Instance_ShouldReturnSameInstance()
        {
            // Act
            var instance1 = DocumentTracker.Instance;
            var instance2 = DocumentTracker.Instance;

            // Assert
            Assert.AreSame(instance1, instance2);
        }

        [TestMethod]
        public void Instance_ShouldNotBeNull()
        {
            // Act
            var instance = DocumentTracker.Instance;

            // Assert
            Assert.IsNotNull(instance);
        }

        #endregion

        #region TrackCompletedUpload Tests

        [TestMethod]
        public void TrackCompletedUpload_ShouldAddDocument()
        {
            // Arrange
            var applicationId = "app-123";
            var fileId = "file-456";
            var filename = "test.pdf";
            var filetype = "application/pdf";

            // Act
            _tracker.TrackCompletedUpload(applicationId, fileId, filename, filetype);

            // Assert - use reflection to verify internal state
            var uploads = GetCompletedUploads(applicationId);
            Assert.AreEqual(1, uploads.Count);
            Assert.AreEqual(fileId, uploads[0].FileId);
            Assert.AreEqual(filename, uploads[0].Filename);
            Assert.AreEqual(filetype, uploads[0].FileType);
        }

        [TestMethod]
        public void TrackCompletedUpload_ShouldSetUploadedAtToUtcNow()
        {
            // Arrange
            var applicationId = "app-123";
            var beforeTime = DateTime.UtcNow;

            // Act
            _tracker.TrackCompletedUpload(applicationId, "file-1", "test.pdf", "application/pdf");

            // Assert
            var uploads = GetCompletedUploads(applicationId);
            var afterTime = DateTime.UtcNow;
            
            Assert.IsTrue(uploads[0].UploadedAt >= beforeTime);
            Assert.IsTrue(uploads[0].UploadedAt <= afterTime);
        }

        [TestMethod]
        public void TrackCompletedUpload_ShouldSetLocalPath()
        {
            // Arrange
            var applicationId = "app-123";
            var fileId = "file-456";
            var filename = "test.pdf";
            var expectedPath = System.IO.Path.Combine(TusConfig.BufferPath, applicationId, $"{fileId}_{filename}");

            // Act
            _tracker.TrackCompletedUpload(applicationId, fileId, filename, "application/pdf");

            // Assert
            var uploads = GetCompletedUploads(applicationId);
            Assert.AreEqual(expectedPath, uploads[0].LocalPath);
        }

        [TestMethod]
        public void TrackCompletedUpload_MultipleFiles_ShouldTrackAll()
        {
            // Arrange
            var applicationId = "app-123";

            // Act
            _tracker.TrackCompletedUpload(applicationId, "file-1", "test1.pdf", "application/pdf");
            _tracker.TrackCompletedUpload(applicationId, "file-2", "test2.pdf", "application/pdf");
            _tracker.TrackCompletedUpload(applicationId, "file-3", "test3.pdf", "application/pdf");

            // Assert
            var uploads = GetCompletedUploads(applicationId);
            Assert.AreEqual(3, uploads.Count);
        }

        [TestMethod]
        public void TrackCompletedUpload_DifferentApplications_ShouldTrackSeparately()
        {
            // Arrange
            var appId1 = "app-123";
            var appId2 = "app-456";

            // Act
            _tracker.TrackCompletedUpload(appId1, "file-1", "test1.pdf", "application/pdf");
            _tracker.TrackCompletedUpload(appId1, "file-2", "test2.pdf", "application/pdf");
            _tracker.TrackCompletedUpload(appId2, "file-3", "test3.pdf", "application/pdf");

            // Assert
            var uploads1 = GetCompletedUploads(appId1);
            var uploads2 = GetCompletedUploads(appId2);
            
            Assert.AreEqual(2, uploads1.Count);
            Assert.AreEqual(1, uploads2.Count);
        }

        [TestMethod]
        public void TrackCompletedUpload_SameFileTwice_ShouldAddBoth()
        {
            // Arrange
            var applicationId = "app-123";
            var filename = "test.pdf";

            // Act
            _tracker.TrackCompletedUpload(applicationId, "file-1", filename, "application/pdf");
            _tracker.TrackCompletedUpload(applicationId, "file-2", filename, "application/pdf");

            // Assert
            var uploads = GetCompletedUploads(applicationId);
            Assert.AreEqual(2, uploads.Count);
        }

        [TestMethod]
        public void TrackCompletedUpload_WithDifferentFileTypes_ShouldTrackCorrectly()
        {
            // Arrange
            var applicationId = "app-123";

            // Act
            _tracker.TrackCompletedUpload(applicationId, "file-1", "doc.pdf", "application/pdf");
            _tracker.TrackCompletedUpload(applicationId, "file-2", "image.jpg", "image/jpeg");
            _tracker.TrackCompletedUpload(applicationId, "file-3", "data.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

            // Assert
            var uploads = GetCompletedUploads(applicationId);
            Assert.AreEqual(3, uploads.Count);
            Assert.IsTrue(uploads.Any(u => u.FileType == "application/pdf"));
            Assert.IsTrue(uploads.Any(u => u.FileType == "image/jpeg"));
            Assert.IsTrue(uploads.Any(u => u.FileType == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
        }

        [TestMethod]
        public void TrackCompletedUpload_WithEmptyFilename_ShouldStillTrack()
        {
            // Arrange
            var applicationId = "app-123";

            // Act
            _tracker.TrackCompletedUpload(applicationId, "file-1", "", "application/pdf");

            // Assert
            var uploads = GetCompletedUploads(applicationId);
            Assert.AreEqual(1, uploads.Count);
            Assert.AreEqual("", uploads[0].Filename);
        }

        [TestMethod]
        public void TrackCompletedUpload_WithNullFilename_ShouldStillTrack()
        {
            // Arrange
            var applicationId = "app-123";

            // Act
            _tracker.TrackCompletedUpload(applicationId, "file-1", null, "application/pdf");

            // Assert
            var uploads = GetCompletedUploads(applicationId);
            Assert.AreEqual(1, uploads.Count);
            Assert.IsNull(uploads[0].Filename);
        }

        #endregion

        #region Thread Safety Tests

        [TestMethod]
        public async Task TrackCompletedUpload_ConcurrentCalls_ShouldBeThreadSafe()
        {
            // Arrange
            var applicationId = "app-concurrent";
            var tasks = new List<Task>();
            var numberOfUploads = 100;

            // Act
            for (int i = 0; i < numberOfUploads; i++)
            {
                var index = i;
                tasks.Add(Task.Run(() =>
                {
                    _tracker.TrackCompletedUpload(applicationId, $"file-{index}", $"test{index}.pdf", "application/pdf");
                }));
            }

            await Task.WhenAll(tasks);

            // Assert
            var uploads = GetCompletedUploads(applicationId);
            Assert.AreEqual(numberOfUploads, uploads.Count);
        }

        [TestMethod]
        public async Task TrackCompletedUpload_ConcurrentDifferentApplications_ShouldBeThreadSafe()
        {
            // Arrange
            var tasks = new List<Task>();
            var numberOfApps = 10;
            var uploadsPerApp = 10;

            // Act
            for (int appIndex = 0; appIndex < numberOfApps; appIndex++)
            {
                var appId = $"app-{appIndex}";
                for (int fileIndex = 0; fileIndex < uploadsPerApp; fileIndex++)
                {
                    var fIndex = fileIndex;
                    tasks.Add(Task.Run(() =>
                    {
                        _tracker.TrackCompletedUpload(appId, $"file-{fIndex}", $"test{fIndex}.pdf", "application/pdf");
                    }));
                }
            }

            await Task.WhenAll(tasks);

            // Assert
            for (int appIndex = 0; appIndex < numberOfApps; appIndex++)
            {
                var uploads = GetCompletedUploads($"app-{appIndex}");
                Assert.AreEqual(uploadsPerApp, uploads.Count);
            }
        }

        #endregion

        #region Helper Methods

        private List<UploadedDocument> GetCompletedUploads(string applicationId)
        {
            var field = typeof(DocumentTracker)
                .GetField("_applicationUploads", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
            var dictionary = field?.GetValue(_tracker) as System.Collections.Concurrent.ConcurrentDictionary<string, ApplicationUploadState>;
            
            if (dictionary != null && dictionary.TryGetValue(applicationId, out var state))
            {
                return state.CompletedUploads.ToList();
            }
            
            return new List<UploadedDocument>();
        }

        #endregion
    }

    #region ApplicationUploadState Tests

    [TestClass]
    public class ApplicationUploadStateTests
    {
        [TestMethod]
        public void Constructor_ShouldInitializeEmptyCompletedUploads()
        {
            // Act
            var state = new ApplicationUploadState();

            // Assert
            Assert.IsNotNull(state.CompletedUploads);
            Assert.AreEqual(0, state.CompletedUploads.Count);
        }

        [TestMethod]
        public void Constructor_ShouldSetStartedAtToUtcNow()
        {
            // Arrange
            var beforeTime = DateTime.UtcNow;

            // Act
            var state = new ApplicationUploadState();

            // Assert
            var afterTime = DateTime.UtcNow;
            Assert.IsTrue(state.StartedAt >= beforeTime);
            Assert.IsTrue(state.StartedAt <= afterTime);
        }

        [TestMethod]
        public void ExpectedCount_ShouldBeSettable()
        {
            // Arrange
            var state = new ApplicationUploadState();

            // Act
            state.ExpectedCount = 5;

            // Assert
            Assert.AreEqual(5, state.ExpectedCount);
        }

        [TestMethod]
        public void CompletedUploads_ShouldAcceptDocuments()
        {
            // Arrange
            var state = new ApplicationUploadState();
            var doc = new UploadedDocument
            {
                FileId = "file-1",
                Filename = "test.pdf"
            };

            // Act
            state.CompletedUploads.Add(doc);

            // Assert
            Assert.AreEqual(1, state.CompletedUploads.Count);
        }
    }

    #endregion

    #region UploadedDocument Tests

    [TestClass]
    public class UploadedDocumentTests
    {
        [TestMethod]
        public void Properties_ShouldBeSettable()
        {
            // Arrange
            var uploadedAt = DateTime.UtcNow;

            // Act
            var doc = new UploadedDocument
            {
                FileId = "file-123",
                Filename = "test.pdf",
                FileType = "application/pdf",
                UploadedAt = uploadedAt,
                LocalPath = "/path/to/file"
            };

            // Assert
            Assert.AreEqual("file-123", doc.FileId);
            Assert.AreEqual("test.pdf", doc.Filename);
            Assert.AreEqual("application/pdf", doc.FileType);
            Assert.AreEqual(uploadedAt, doc.UploadedAt);
            Assert.AreEqual("/path/to/file", doc.LocalPath);
        }

        [TestMethod]
        public void DefaultValues_ShouldBeNull()
        {
            // Act
            var doc = new UploadedDocument();

            // Assert
            Assert.IsNull(doc.FileId);
            Assert.IsNull(doc.Filename);
            Assert.IsNull(doc.FileType);
            Assert.IsNull(doc.LocalPath);
            Assert.AreEqual(default(DateTime), doc.UploadedAt);
        }
    }

    #endregion
}