import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TusUploadService, UploadResult } from '../../services/tus-upload.service';
import { environment } from '../../../environments/environment';

interface ApplicationResponse {
  applicationId: string;
  status: string;
  message: string;
  documentsExpected: number;
  tusEndpoint: string;
}

@Component({
  selector: 'app-application-form',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="application-form-container">
      <h1>Application Form</h1>
      
      <!-- Form Section -->
      <form [formGroup]="form" (ngSubmit)="onSubmit()" *ngIf="!isSubmitted()">
        <div class="form-group">
          <label for="applicantName">Applicant Name</label>
          <input id="applicantName" type="text" formControlName="applicantName" />
        </div>
        
        <div class="form-group">
          <label for="email">Email</label>
          <input id="email" type="email" formControlName="email" />
        </div>
        
        <!-- File Upload Section -->
        <div class="form-group">
          <label>Documents</label>
          <input 
            type="file" 
            multiple 
            (change)="onFilesSelected($event)"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          />
          <p class="hint">Select multiple files (PDF, Word, Images). Max 200MB total.</p>
        </div>
        
        <!-- Selected Files Preview -->
        <div class="selected-files" *ngIf="selectedFiles().length > 0">
          <h3>Selected Files ({{ selectedFiles().length }})</h3>
          <ul>
            <li *ngFor="let file of selectedFiles()">
              {{ file.name }} ({{ formatFileSize(file.size) }})
            </li>
          </ul>
          <p class="total-size">Total: {{ formatFileSize(totalFileSize()) }}</p>
        </div>
        
        <button 
          type="submit" 
          [disabled]="form.invalid || isSubmitting()"
          class="submit-btn">
          {{ isSubmitting() ? 'Submitting...' : 'Submit Application' }}
        </button>
      </form>
      
      <!-- Post-Submission Status -->
      <div class="submission-status" *ngIf="isSubmitted()">
        <div class="success-message">
          <h2>✓ Application Submitted</h2>
          <p>Application ID: <strong>{{ applicationId() }}</strong></p>
        </div>
        
        <!-- Upload Progress Section -->
        <div class="upload-progress" *ngIf="tusUploadService.isUploading() || hasUploadResults()">
          <h3>Document Upload Progress</h3>
          
          <!-- Overall Progress Bar -->
          <div class="overall-progress">
            <div class="progress-bar">
              <div 
                class="progress-fill" 
                [style.width.%]="tusUploadService.totalProgress()">
              </div>
            </div>
            <span class="progress-text">{{ tusUploadService.totalProgress() }}%</span>
          </div>
          
          <!-- Upload Summary -->
          <div class="upload-summary">
            <span>Total: {{ tusUploadService.uploadSummary().total }}</span>
            <span class="pending">Pending: {{ tusUploadService.uploadSummary().pending }}</span>
            <span class="uploading">Uploading: {{ tusUploadService.uploadSummary().uploading }}</span>
            <span class="complete">Complete: {{ tusUploadService.uploadSummary().complete }}</span>
            <span class="failed" *ngIf="tusUploadService.uploadSummary().failed > 0">
              Failed: {{ tusUploadService.uploadSummary().failed }}
            </span>
          </div>
          
          <!-- Individual File Progress -->
          <div class="file-progress-list">
            <div 
              *ngFor="let item of fileProgressArray()" 
              class="file-progress-item"
              [class.complete]="item.status === 'complete'"
              [class.error]="item.status === 'error'"
              [class.uploading]="item.status === 'uploading'">
              <div class="file-info">
                <span class="file-name">{{ getDisplayFileName(item.fileName) }}</span>
                <span class="file-status">{{ item.status }}</span>
              </div>
              <div class="file-progress-bar">
                <div 
                  class="file-progress-fill" 
                  [style.width.%]="item.percentage">
                </div>
              </div>
              <span class="file-percentage">{{ item.percentage }}%</span>
            </div>
          </div>
          
          <!-- Cancel Button -->
          <button 
            *ngIf="tusUploadService.isUploading()"
            (click)="cancelUploads()"
            class="cancel-btn">
            Cancel Uploads
          </button>
        </div>
        
        <!-- Upload Complete Message -->
        <div class="upload-complete" *ngIf="uploadComplete()">
          <h3 [class.success]="uploadResult()?.allSuccessful" [class.partial]="!uploadResult()?.allSuccessful">
            {{ uploadResult()?.allSuccessful ? '✓ All Documents Uploaded' : '⚠ Upload Complete with Errors' }}
          </h3>
          <p *ngIf="uploadResult()?.failed?.length">
            {{ uploadResult()?.failed?.length }} file(s) failed to upload.
          </p>
          <button (click)="startNewApplication()" class="new-app-btn">
            Submit Another Application
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .application-form-container {
      max-width: 600px;
      margin: 2rem auto;
      padding: 2rem;
      font-family: system-ui, -apple-system, sans-serif;
    }
    
    .form-group {
      margin-bottom: 1.5rem;
    }
    
    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
    }
    
    .form-group input[type="text"],
    .form-group input[type="email"] {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 1rem;
    }
    
    .hint {
      font-size: 0.875rem;
      color: #666;
      margin-top: 0.25rem;
    }
    
    .selected-files {
      background: #f5f5f5;
      padding: 1rem;
      border-radius: 4px;
      margin-bottom: 1.5rem;
    }
    
    .selected-files h3 {
      margin: 0 0 0.5rem 0;
      font-size: 1rem;
    }
    
    .selected-files ul {
      margin: 0;
      padding-left: 1.25rem;
    }
    
    .selected-files li {
      font-size: 0.875rem;
      color: #444;
    }
    
    .total-size {
      margin: 0.5rem 0 0 0;
      font-weight: 500;
    }
    
    .submit-btn {
      background: #2563eb;
      color: white;
      padding: 0.75rem 1.5rem;
      border: none;
      border-radius: 4px;
      font-size: 1rem;
      cursor: pointer;
    }
    
    .submit-btn:disabled {
      background: #9ca3af;
      cursor: not-allowed;
    }
    
    .success-message {
      background: #dcfce7;
      border: 1px solid #22c55e;
      padding: 1rem;
      border-radius: 4px;
      margin-bottom: 1.5rem;
    }
    
    .success-message h2 {
      margin: 0 0 0.5rem 0;
      color: #16a34a;
    }
    
    .upload-progress {
      background: #f8fafc;
      padding: 1.5rem;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }
    
    .upload-progress h3 {
      margin: 0 0 1rem 0;
    }
    
    .overall-progress {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    
    .progress-bar {
      flex: 1;
      height: 24px;
      background: #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
    }
    
    .progress-fill {
      height: 100%;
      background: #2563eb;
      transition: width 0.3s ease;
    }
    
    .progress-text {
      font-weight: 600;
      min-width: 50px;
    }
    
    .upload-summary {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }
    
    .upload-summary .pending { color: #64748b; }
    .upload-summary .uploading { color: #2563eb; }
    .upload-summary .complete { color: #16a34a; }
    .upload-summary .failed { color: #dc2626; }
    
    .file-progress-list {
      max-height: 300px;
      overflow-y: auto;
    }
    
    .file-progress-item {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 0.5rem;
      padding: 0.75rem;
      border-bottom: 1px solid #e2e8f0;
    }
    
    .file-progress-item.complete { background: #f0fdf4; }
    .file-progress-item.error { background: #fef2f2; }
    .file-progress-item.uploading { background: #eff6ff; }
    
    .file-info {
      display: flex;
      justify-content: space-between;
      grid-column: 1 / -1;
    }
    
    .file-name {
      font-size: 0.875rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .file-status {
      font-size: 0.75rem;
      text-transform: uppercase;
      color: #64748b;
    }
    
    .file-progress-bar {
      height: 8px;
      background: #e2e8f0;
      border-radius: 4px;
      overflow: hidden;
    }
    
    .file-progress-fill {
      height: 100%;
      background: #2563eb;
      transition: width 0.2s ease;
    }
    
    .file-percentage {
      font-size: 0.75rem;
      text-align: right;
    }
    
    .cancel-btn {
      margin-top: 1rem;
      background: #dc2626;
      color: white;
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    
    .upload-complete {
      margin-top: 1.5rem;
      padding: 1rem;
      border-radius: 4px;
    }
    
    .upload-complete h3.success {
      color: #16a34a;
    }
    
    .upload-complete h3.partial {
      color: #d97706;
    }
    
    .new-app-btn {
      margin-top: 1rem;
      background: #2563eb;
      color: white;
      padding: 0.75rem 1.5rem;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
  `]
})
export class ApplicationFormComponent {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  tusUploadService = inject(TusUploadService);

  // Form
  form: FormGroup = this.fb.group({
    applicantName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]]
  });

  // State signals
  selectedFiles = signal<File[]>([]);
  isSubmitting = signal(false);
  isSubmitted = signal(false);
  applicationId = signal<string | null>(null);
  uploadComplete = signal(false);
  uploadResult = signal<UploadResult | null>(null);

  // Computed
  totalFileSize = computed(() => {
    return this.selectedFiles().reduce((sum, file) => sum + file.size, 0);
  });

  fileProgressArray = computed(() => {
    return Array.from(this.tusUploadService.fileProgress().values());
  });

  hasUploadResults = computed(() => {
    return this.tusUploadService.fileProgress().size > 0;
  });

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.selectedFiles.set(Array.from(input.files));
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;

    this.isSubmitting.set(true);

    try {
      // Step 1: Submit the application (quick operation)
      const response = await this.http.post<ApplicationResponse>(
        `${environment.bffApiUrl}/api/applications`,
        {
          applicantName: this.form.value.applicantName,
          email: this.form.value.email,
          documentCount: this.selectedFiles().length
        }
      ).toPromise();

      if (!response) {
        throw new Error('No response from server');
      }

      // Step 2: Mark as submitted and show progress UI
      this.applicationId.set(response.applicationId);
      this.isSubmitted.set(true);
      this.isSubmitting.set(false);

      // Step 3: Start document uploads in background (UI not frozen!)
      if (this.selectedFiles().length > 0) {
        this.tusUploadService.processDocuments(
          this.selectedFiles(),
          response.applicationId
        ).subscribe({
          next: (result) => {
            console.log('Upload result:', result);
            this.uploadResult.set(result);
            this.uploadComplete.set(true);
          },
          error: (err) => {
            console.error('Upload failed:', err);
            this.uploadComplete.set(true);
          }
        });
      } else {
        // No documents to upload
        this.uploadComplete.set(true);
      }

    } catch (error) {
      console.error('Submission error:', error);
      this.isSubmitting.set(false);
      // Handle error (show message to user)
    }
  }

  cancelUploads(): void {
    this.tusUploadService.cancelAllUploads();
  }

  startNewApplication(): void {
    this.form.reset();
    this.selectedFiles.set([]);
    this.isSubmitted.set(false);
    this.applicationId.set(null);
    this.uploadComplete.set(false);
    this.uploadResult.set(null);
    this.tusUploadService.reset();
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getDisplayFileName(fileKey: string): string {
    // Remove the index suffix we added for tracking
    const lastDash = fileKey.lastIndexOf('-');
    if (lastDash > 0) {
      return fileKey.substring(0, lastDash);
    }
    return fileKey;
  }
}