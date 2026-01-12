import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Model } from 'survey-core';

// Import your component - adjust path as needed
import { SurveyFormComponent } from './survey-form.component';
import { SurveyTusUploadService } from '../services/survey-tus-upload.service';

describe('SurveyFormComponent - File Upload Hooks', () => {
  let component: SurveyFormComponent;
  let fixture: ComponentFixture<SurveyFormComponent>;
  let mockUploadService: jasmine.SpyObj<SurveyTusUploadService>;

  beforeEach(async () => {
    // Create spy object for upload service
    mockUploadService = jasmine.createSpyObj('SurveyTusUploadService', [
      'storeFilesFromSurvey',
      'removeStoredFile',
      'clearQuestionFiles',
      'uploadFilesFromSurvey',
      'reset'
    ]);

    await TestBed.configureTestingModule({
      imports: [SurveyFormComponent], // Adjust if not standalone
      providers: [
        { provide: SurveyTusUploadService, useValue: mockUploadService },
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SurveyFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('onUploadFiles handler', () => {
    it('should call uploadService.storeFilesFromSurvey when files are selected', () => {
      // Arrange
      const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' });
      const questionName = 'supportingDocuments';
      const callbackSpy = jasmine.createSpy('callback');

      const options = {
        name: questionName,
        files: [mockFile],
        callback: callbackSpy
      };

      // Act - trigger the onUploadFiles event
      component.surveyModel.onUploadFiles.fire(component.surveyModel, options);

      // Assert
      expect(mockUploadService.storeFilesFromSurvey).toHaveBeenCalledWith(
        questionName,
        [mockFile],
        callbackSpy
      );
    });

    it('should call uploadService.storeFilesFromSurvey with multiple files', () => {
      // Arrange
      const mockFile1 = new File(['content1'], 'test1.txt', { type: 'text/plain' });
      const mockFile2 = new File(['content2'], 'test2.txt', { type: 'text/plain' });
      const questionName = 'supportingDocuments';
      const callbackSpy = jasmine.createSpy('callback');

      const options = {
        name: questionName,
        files: [mockFile1, mockFile2],
        callback: callbackSpy
      };

      // Act
      component.surveyModel.onUploadFiles.fire(component.surveyModel, options);

      // Assert
      expect(mockUploadService.storeFilesFromSurvey).toHaveBeenCalledWith(
        questionName,
        [mockFile1, mockFile2],
        callbackSpy
      );
    });

    it('should pass correct question name to uploadService', () => {
      // Arrange
      const mockFile = new File(['content'], 'id.jpg', { type: 'image/jpeg' });
      const questionName = 'identityDocument';
      const callbackSpy = jasmine.createSpy('callback');

      const options = {
        name: questionName,
        files: [mockFile],
        callback: callbackSpy
      };

      // Act
      component.surveyModel.onUploadFiles.fire(component.surveyModel, options);

      // Assert
      expect(mockUploadService.storeFilesFromSurvey).toHaveBeenCalledWith(
        'identityDocument',
        jasmine.any(Array),
        jasmine.any(Function)
      );
    });

    it('should handle empty files array', () => {
      // Arrange
      const questionName = 'supportingDocuments';
      const callbackSpy = jasmine.createSpy('callback');

      const options = {
        name: questionName,
        files: [],
        callback: callbackSpy
      };

      // Act
      component.surveyModel.onUploadFiles.fire(component.surveyModel, options);

      // Assert
      expect(mockUploadService.storeFilesFromSurvey).toHaveBeenCalledWith(
        questionName,
        [],
        callbackSpy
      );
    });
  });

  describe('onClearFiles handler', () => {
    it('should call removeStoredFile when single file is removed', () => {
      // Arrange
      const questionName = 'supportingDocuments';
      const fileName = 'test.txt';
      const callbackSpy = jasmine.createSpy('callback');

      const options = {
        name: questionName,
        fileName: fileName,
        callback: callbackSpy
      };

      // Act
      component.surveyModel.onClearFiles.fire(component.surveyModel, options);

      // Assert
      expect(mockUploadService.removeStoredFile).toHaveBeenCalledWith(
        questionName,
        fileName,
        callbackSpy
      );
    });

    it('should call clearQuestionFiles when all files are cleared', () => {
      // Arrange
      const questionName = 'supportingDocuments';
      const callbackSpy = jasmine.createSpy('callback');

      const options = {
        name: questionName,
        fileName: null,  // null means clear all
        callback: callbackSpy
      };

      // Act
      component.surveyModel.onClearFiles.fire(component.surveyModel, options);

      // Assert
      expect(mockUploadService.clearQuestionFiles).toHaveBeenCalledWith(questionName);
      expect(callbackSpy).toHaveBeenCalledWith('success', null);
    });

    it('should call clearQuestionFiles when fileName is undefined', () => {
      // Arrange
      const questionName = 'identityDocument';
      const callbackSpy = jasmine.createSpy('callback');

      const options = {
        name: questionName,
        fileName: undefined,
        callback: callbackSpy
      };

      // Act
      component.surveyModel.onClearFiles.fire(component.surveyModel, options);

      // Assert
      expect(mockUploadService.clearQuestionFiles).toHaveBeenCalledWith(questionName);
      expect(callbackSpy).toHaveBeenCalledWith('success', null);
    });

    it('should not call removeStoredFile when clearing all files', () => {
      // Arrange
      const questionName = 'supportingDocuments';
      const callbackSpy = jasmine.createSpy('callback');

      const options = {
        name: questionName,
        fileName: null,
        callback: callbackSpy
      };

      // Act
      component.surveyModel.onClearFiles.fire(component.surveyModel, options);

      // Assert
      expect(mockUploadService.removeStoredFile).not.toHaveBeenCalled();
    });

    it('should not call clearQuestionFiles when removing single file', () => {
      // Arrange
      const questionName = 'supportingDocuments';
      const callbackSpy = jasmine.createSpy('callback');

      const options = {
        name: questionName,
        fileName: 'test.txt',
        callback: callbackSpy
      };

      // Act
      component.surveyModel.onClearFiles.fire(component.surveyModel, options);

      // Assert
      expect(mockUploadService.clearQuestionFiles).not.toHaveBeenCalled();
    });

    it('should pass correct callback to removeStoredFile', () => {
      // Arrange
      const questionName = 'supportingDocuments';
      const fileName = 'document.pdf';
      const callbackSpy = jasmine.createSpy('callback');

      const options = {
        name: questionName,
        fileName: fileName,
        callback: callbackSpy
      };

      // Act
      component.surveyModel.onClearFiles.fire(component.surveyModel, options);

      // Assert
      expect(mockUploadService.removeStoredFile).toHaveBeenCalledWith(
        questionName,
        fileName,
        callbackSpy
      );
    });
  });

  describe('onComplete handler', () => {
    it('should call handleSurveyComplete when survey is completed', () => {
      // Arrange
      spyOn(component, 'handleSurveyComplete');
      
      const surveyData = {
        applicantName: 'John Doe',
        email: 'john@example.com'
      };

      // Create a mock sender with data property
      const mockSender = {
        data: surveyData
      };

      // Act
      component.surveyModel.onComplete.fire(mockSender as any, {});

      // Assert
      expect(component.handleSurveyComplete).toHaveBeenCalledWith(surveyData);
    });

    it('should pass all survey data to handleSurveyComplete', () => {
      // Arrange
      spyOn(component, 'handleSurveyComplete');
      
      const surveyData = {
        applicantName: 'Jane Smith',
        email: 'jane@example.com',
        supportingDocuments: [{ name: 'doc.pdf' }],
        identityDocument: [{ name: 'id.jpg' }]
      };

      const mockSender = {
        data: surveyData
      };

      // Act
      component.surveyModel.onComplete.fire(mockSender as any, {});

      // Assert
      expect(component.handleSurveyComplete).toHaveBeenCalledWith(surveyData);
    });

    it('should handle empty survey data', () => {
      // Arrange
      spyOn(component, 'handleSurveyComplete');
      
      const surveyData = {};

      const mockSender = {
        data: surveyData
      };

      // Act
      component.surveyModel.onComplete.fire(mockSender as any, {});

      // Assert
      expect(component.handleSurveyComplete).toHaveBeenCalledWith({});
    });
  });

  describe('integration - multiple operations', () => {
    it('should handle upload then clear sequence', () => {
      // Arrange
      const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' });
      const questionName = 'supportingDocuments';
      const uploadCallback = jasmine.createSpy('uploadCallback');
      const clearCallback = jasmine.createSpy('clearCallback');

      // Act - Upload file
      component.surveyModel.onUploadFiles.fire(component.surveyModel, {
        name: questionName,
        files: [mockFile],
        callback: uploadCallback
      });

      // Act - Clear file
      component.surveyModel.onClearFiles.fire(component.surveyModel, {
        name: questionName,
        fileName: 'test.txt',
        callback: clearCallback
      });

      // Assert
      expect(mockUploadService.storeFilesFromSurvey).toHaveBeenCalledTimes(1);
      expect(mockUploadService.removeStoredFile).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple file uploads to different questions', () => {
      // Arrange
      const mockFile1 = new File(['content1'], 'doc.pdf', { type: 'application/pdf' });
      const mockFile2 = new File(['content2'], 'id.jpg', { type: 'image/jpeg' });
      const callback1 = jasmine.createSpy('callback1');
      const callback2 = jasmine.createSpy('callback2');

      // Act
      component.surveyModel.onUploadFiles.fire(component.surveyModel, {
        name: 'supportingDocuments',
        files: [mockFile1],
        callback: callback1
      });

      component.surveyModel.onUploadFiles.fire(component.surveyModel, {
        name: 'identityDocument',
        files: [mockFile2],
        callback: callback2
      });

      // Assert
      expect(mockUploadService.storeFilesFromSurvey).toHaveBeenCalledTimes(2);
      expect(mockUploadService.storeFilesFromSurvey).toHaveBeenCalledWith(
        'supportingDocuments',
        [mockFile1],
        callback1
      );
      expect(mockUploadService.storeFilesFromSurvey).toHaveBeenCalledWith(
        'identityDocument',
        [mockFile2],
        callback2
      );
    });
  });

  describe('ngOnDestroy', () => {
    it('should call uploadService.reset on destroy', () => {
      // Act
      component.ngOnDestroy();

      // Assert
      expect(mockUploadService.reset).toHaveBeenCalled();
    });
  });
});