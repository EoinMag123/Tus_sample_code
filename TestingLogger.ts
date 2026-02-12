    [TestMethod]
        public void DeleteDirectoryWithRetry_WhenAllAttemptsFail_LogsError()
        {
            // Arrange — create a file and hold it open so deletion always fails
            var filePath = Path.Combine(_testDir, "locked.txt");
            File.WriteAllText(filePath, "test");

            using (var lockHandle = new FileStream(
                filePath,
                FileMode.Open,
                FileAccess.ReadWrite,
                FileShare.None)) // exclusive lock
            {
                var maxAttempts = 3;
                var delayMs = 50; // keep test fast

                // Act
                Startup.DeleteDirectoryWithRetry(_testDir, maxAttempts, delayMs);

                // Assert — verify the final error log was called
                _mockLogger.Verify(
                    l => l.Error(
                        It.Is<string>(msg => msg.Contains("All") && msg.Contains("attempts")),
                        It.Is<int>(n => n == maxAttempts),
                        It.Is<string>(p => p == _testDir)),
                    Times.Once,
                    "Expected a final Error log after all retry attempts were exhausted.");
            }
        }