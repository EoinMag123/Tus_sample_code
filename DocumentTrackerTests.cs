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
            var expectedPath = System.IO.Path.Combine(TusConfig.BufferPath, applicationId, $"{fileI