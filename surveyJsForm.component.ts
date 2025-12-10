import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { SurveyModule } from 'survey-angular-ui';
import { Model } from 'survey-core';
import { SurveyTusUploadService, UploadResult } from '../../services/survey-tus-upload.service';
import { environment } from '../../../environments/environment';

// Import SurveyJS theme (adjust based on your setup)
// import 'survey-core/defaultV2.min.css';

interface ApplicationResponse {
  applicationId: string;
  status: string;
  message: string;
  documentsExpected: number;
}

@Component({
  selector: 'app-survey-form',
  standalone: true,
  imports: [CommonModule, SurveyModule],
  template: `
    <div class="survey-container">
      <!-- Survey Form -->
      <survey *ngIf="!isSubmitted()" [model]="surveyModel"></survey>
      
      <!-- Post-Submission: Upload Progress -->
      <div class="submission-status" *ngIf="isSubmitted()">
        <div class="success-message">
          <h2>✓ Application Submitted</h2>
          <p>Application ID: <strong>{{ applicationId() }}</strong></p>
        </div>
        
        <!-- Upload Progress -->
        <div class="upload-progress" *ngIf="uploadService.isUploading() || uploadComplete()">
          <h3>Document Upload Progress</h3>
          
          <!-- Overall Progress Bar -->
          <div class="overall-progress">
            <div class="progress-bar">
              <div 
                class="progress-fill" 
                [style.width.%]="uploadService.totalProgress()">
              </div>
            </div>
            <span class="progress-text">{{ uploadService.totalProgress() }}%</span>
          </div>
          
          <!-- Upload Summary -->
          <div class="upload-summary">
            <span>Total: {{ uploadService.uploadSummary().total }}</span>
            <span class="uploading">Uploading: {{ uploadService.uploadSummary().uploading }}</span>
            <span class="complete">Complete: {{ uploadService.uploadSummary().complete }}</span>
            <span class="failed" *ngIf="uploadService.uploadSummary().failed > 0">
              Failed: {{ uploadService.uploadSummary().failed }}
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
                <div class="file-progress-fill" [style.width.%]="item.percentage"></div>
              </div>
            </div>
          </div>
          
          <!-- Cancel Button -->
          <button 
            *ngIf="uploadService.isUploading()"
            (click)="cancelUploads()"
            class="cancel-btn">
            Cancel Uploads
          </button>
        </div>
        
        <!-- Upload Complete -->
        <div class="upload-complete" *ngIf="uploadComplete()">
          <h3 [class.success]="uploadResult()?.allSuccessful">
            {{ uploadResult()?.allSuccessful 
              ? '✓ All Documents Uploaded Successfully' 
              : '⚠ Upload Complete with Some Errors' }}
          </h3>
          <button (click)="startNew()" class="new-btn">Submit Another Application</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .survey-container { max-width: 800px; margin: 2rem auto; padding: 1rem; }
    .success-message { background: #dcfce7; border: 1px solid #22c55e; padding: 1rem; border-radius: 4px; margin-bottom: 1rem; }
    .success-message h2 { margin: 0 0 0.5rem; color: #16a34a; }
    .upload-progress { background: #f8fafc; padding: 1.5rem; border-radius: 4px; border: 1px solid #e2e8f0; }
    .overall-progress { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
    .progress-bar { flex: 1; height: 24px; background: #e2e8f0; border-radius: 12px; overflow: hidden; }
    .progress-fill { height: 100%; background: #2563eb; transition: width 0.3s; }
    .progress-text { font-weight: 600; min-width: 50px; }
    .upload-summary { display: flex; gap: 1rem; font-size: 0.875rem; margin-bottom: 1rem; }
    .upload-summary .uploading { color: #2563eb; }
    .upload-summary .complete { color: #16a34a; }
    .upload-summary .failed { color: #dc2626; }
    .file-progress-list { max-height: 250px; overflow-y: auto; }
    .file-progress-item { padding: 0.5rem; border-bottom: 1px solid #e2e8f0; }
    .file-progress-item.complete { background: #f0fdf4; }
    .file-progress-item.error { background: #fef2f2; }
    .file-info { display: flex; justify-content: space-between; margin-bottom: 0.25rem; }
    .file-name { font-size: 0.875rem; }
    .file-status { font-size: 0.75rem; text-transform: uppercase; color: #64748b; }
    .file-progress-bar { height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }
    .file-progress-fill { height: 100%; background: #2563eb; }
    .cancel-btn { margin-top: 1rem; background: #dc2626; color: white; padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer; }
    .upload-complete h3.success { color: #16a34a; }
    .new-btn { margin-top: 1rem; background: #2563eb; color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 4px; cursor: pointer; }
  `]
})
export class SurveyFormComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  uploadService = inject(SurveyTusUploadService);

  surveyModel!: Model;
  
  // State
  isSubmitted = signal(false);
  applicationId = signal<string | null>(null);
  uploadComplete = signal(false);
  uploadResult = signal<UploadResult | null>(null);

  // Computed from service
  fileProgressArray = () => Array.from(this.uploadService.fileProgress().values());

  ngOnInit(): void {
    this.initializeSurvey();
  }

  ngOnDestroy(): void {
    this.uploadService.reset();
  }

  private initializeSurvey(): void {
    // Define your survey JSON - this is an example, use your existing survey
    const surveyJson = {
      title: "Application Form",
      pages: [
        {
          name: "page1",
          elements: [
            {
              type: "text",
              name: "applicantName",
              title: "Applicant Name",
              isRequired: true
            },
            {
              type: "text",
              name: "email",
              title: "Email",
              inputType: "email",
              isRequired: true
            },
            {
              type: "file",
              name: "supportingDocuments",
              title: "Supporting Documents",
              description: "Upload any supporting documents (PDF, Word, Images)",
              allowMultiple: true,
              acceptedTypes: ".pdf,.doc,.docx,.jpg,.jpeg,.png",
              maxSize: 52428800, // 50MB per file
              waitForUpload: false, // Important: don't wait for upload
              storeDataAsText: false // Don't store base64 in survey data
            },
            {
              type: "file",
              name: "identityDocument",
              title: "Identity Document",
              description: "Upload a copy of your ID",
              allowMultiple: false,
              acceptedTypes: ".pdf,.jpg,.jpeg,.png",
              maxSize: 10485760, // 10MB
              waitForUpload: false,
              storeDataAsText: false
            }
          ]
        }
      ]
    };

    this.surveyModel = new Model(surveyJson);

    // Hook into SurveyJS file upload - intercept and store locally
    this.surveyModel.onUploadFiles.add((sender, options) => {
      console.log(`[Survey] Files selected for ${options.name}:`, options.files.map(f => f.name));
      
      this.uploadService.storeFilesFromSurvey(
        options.name,
        options.files,
        options.callback
      );
    });

    // Hook into SurveyJS file clear/remove
    this.surveyModel.onClearFiles.add((sender, options) => {
      console.log(`[Survey] Clearing files for ${options.name}`);
      
      if (options.fileName) {
        // Single file removal
        this.uploadService.removeStoredFile(options.name, options.fileName, options.callback);
      } else {
        // Clear all files for question
        this.uploadService.clearQuestionFiles(options.name);
        options.callback('success', null);
      }
    });

    // Handle survey completion
    this.surveyModel.onComplete.add((sender, options) => {
      this.handleSurveyComplete(sender.data);
    });
  }

  private async handleSurveyComplete(surveyData: any): Promise<void> {
    console.log('[Survey] Complete, data:', surveyData);
    console.log('[Survey] Stored files:', this.uploadService.totalStoredCount());

    try {
      // Step 1: Submit application data (quick operation)
      const response = await this.http.post<ApplicationResponse>(
        `${environment.bffApiUrl}/api/applications`,
        {
          applicantName: surveyData.applicantName,
          email: surveyData.email,
          documentCount: this.uploadService.totalStoredCount()
          // Add other survey fields as needed
        }
      ).toPromise();

      if (!response) {
        throw new Error('No response from server');
      }

      // Step 2: Show success and start uploads
      this.applicationId.set(response.applicationId);
      this.isSubmitted.set(true);

      // Step 3: Upload files in background (UI not frozen!)
      if (this.uploadService.totalStoredCount() > 0) {
        this.uploadService.uploadAllStoredFiles(response.applicationId).subscribe({
          next: (result) => {
            console.log('[Survey] Upload result:', result);
            this.uploadResult.set(result);
            this.uploadComplete.set(true);
          },
          error: (err) => {
            console.error('[Survey] Upload error:', err);
            this.uploadComplete.set(true);
          }
        });
      } else {
        // No files to upload
        this.uploadComplete.set(true);
      }

    } catch (error) {
      console.error('[Survey] Submission error:', error);
      // Handle error - you might want to show an error message
      // and allow the user to retry
    }
  }

  cancelUploads(): void {
    this.uploadService.cancelAllUploads();
  }

  startNew(): void {
    this.isSubmitted.set(false);
    this.applicationId.set(null);
    this.uploadComplete.set(false);
    this.uploadResult.set(null);
    this.uploadService.reset();
    this.initializeSurvey(); // Reinitialize survey
  }

  getDisplayFileName(fileKey: string): string {
    const lastDash = fileKey.lastIndexOf('-');
    return lastDash > 0 ? fileKey.substring(0, lastDash) : fileKey;
  }
}