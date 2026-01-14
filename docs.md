# Resumable File Uploads with TUS

This document outlines the architecture and rationale for our chunked file upload system, which handles document transfers from the Angular frontend to Compass storage via our Backend for Frontend (BFF) and Enterprise Integration Layer (EIL).

---

### What is TUS?

**TUS** is an open-source, HTTP-based protocol for **resumable file uploads**. Standard file uploads are fragile; if a network connection drops or a server times out midway through a 500MB file, the entire process must restart from zero.

TUS solves this by breaking files into smaller "chunks" and maintaining a stateful connection between the client and server. If an interruption occurs, the client can query the server to find out how many bytes were successfully received and resume exactly where it left off.

### Why We Use It

* **Reliability:** Essential for users on unstable connections or when uploading large documents.
* **Progress Tracking:** Provides accurate, real-time feedback to the user as chunks are confirmed by the server.
* **Reduced Server Strain:** Instead of holding a massive file in memory during a single long-lived request, the server processes smaller, manageable segments.
* **Resumability:** Users can pause an upload or even close their browser and return later to finish the transfer without data loss.

---

### System Architecture

The implementation follows a "Proxy-to-EIL" pattern to ensure security and centralize file processing.

#### 1. Frontend (Angular)

We use the `tus-js-client` within an Angular service to manage the upload lifecycle. This service:

* Initializes the TUS upload with the necessary metadata (e.g., file name, application ID).
* Handles the immediate upload of files as they are selected in the UI.
* Reports progress via signals and notifies the backend once a batch of documents is complete.

#### 2. Backend for Frontend (BFF Proxy)

Our .NET Web API acts as a thin proxy. Its primary job is to forward TUS-specific HTTP verbs (`POST`, `PATCH`, `HEAD`, `OPTIONS`, `DELETE`) directly to the EIL.

* **Header Preservation:** It carefully copies TUS headers (like `Upload-Offset` and `Upload-Length`) to ensure the protocol handshake remains intact between the client and the EIL.
* **CORS Management:** The BFF handles the initial CORS preflight requests, ensuring the frontend is authorized to communicate with the upload endpoints.

#### 3. Enterprise Integration Layer (EIL)

The EIL is the actual TUS server. It manages the physical chunk assembly and coordinates post-upload tasks:

* **Virus Scanning:** Every completed file is scanned before it is allowed further into the network.
* **Storage Transfer:** Once validated, files are moved from the temporary TUS buffer to permanent **Compass storage**.
* **Tracking:** A `DocumentTracker` service maintains a thread-safe record of which files have been successfully processed for a given application ID.

---

### Summary of the Flow

1. **Angular** asks the **BFF** to start an upload.
2. **BFF** proxies the request to the **EIL**, which creates a unique upload URL.
3. **Angular** sends file chunks to the **BFF**, which streams them to the **EIL**.
4. If the connection breaks, **Angular** asks the **BFF** (and thus the **EIL**) for the current offset and resumes.
5. Once the **EIL** has the full file, it scans it and saves it to **Compass**.

---

**Would you like me to help you create a sequence diagram that mirrors this flow for your documentation?**