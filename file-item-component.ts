import { Component, Input } from "@angular/core";
import { AngularComponentFactory } from "../../component-factory";
import { Question } from "survey-core";
import { QuestionFileModel } from "survey-core";

@Component({
  selector: "sv-ng-file-item",
  templateUrl: "./file-item.component.html"
})
export class FileItemComponent {
  @Input() question!: QuestionFileModel;
  @Input() item!: any;
  @Input() data!: any;

  // Add your file service injection
  constructor(private fileService: YourFileService) {}

  get question(): QuestionFileModel {
    return this.data.question;
  }

  // Modified to handle server-stored files
  downloadFile(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    const documentId = this.item.documentId;

    // If no documentId, this is likely a newly uploaded file with content
    if (!documentId) {
      // Fall back to original behavior for new uploads
      if (this.item.content) {
        const link = document.createElement('a');
        link.href = this.item.content;
        link.download = this.item.name;
        link.click();
      }
      return;
    }

    // Fetch from server using documentId
    this.fileService.download(documentId).subscribe({
      next: (fileBlob: Blob) => {
        const url = URL.createObjectURL(fileBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.item.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
      error: (error) => {
        console.error('File download failed:', error);
        // Optionally show error to user
      }
    });
  }

  removeFile(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.question.doRemoveFile(this.item);
  }

  // Check if this is a server-stored file vs new upload
  get isServerFile(): boolean {
    return !!this.item.documentId && !this.item.content;
  }

  // Get file display properties
  get fileClass(): string {
    return this.question.cssClasses.fileSign;
  }

  get fileName(): string {
    return this.item.name;
  }

  get canRemove(): boolean {
    return !this.question.isReadOnly;
  }
}