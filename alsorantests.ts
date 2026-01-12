import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { Model } from 'survey-core';

// Import your component - adjust path as needed
import { SurveyFormComponent } from './survey-form.component';
import { SurveyTusUploadService } from '../services/survey-tus-upload.service';

describe('SurveyFormComponent - setupFileUploads onClearFiles', () => {
  let component: SurveyFormComponent;
  let fixture: ComponentFixture<SurveyFormComponent>;
  let mockUploadService: jasmine.SpyObj<SurveyTusUploadService>;
  let surveyModel: Model;

  beforeEach(async () => {
    mockUploadService = jasmine.createSpyObj('SurveyTusUploadService', [
      'storeFilesFromSurvey',
      'removeStoredFile',
      'clearQuestionFiles',
      'uploadFilesFromSurvey',
      'reset',
      'waitForUploadsToComplete',
      'notifyUploadsComplete',
      'hasActiveUploads'
    ], {
      storedFiles: signal([]),
      fileProgress: signal(new Map())
    });

    await TestBed.configureTestingModule({
      imports: [SurveyFormComponent],
      providers: [
        { provide: SurveyTusUploadService, useValue: mockUploadService },
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SurveyFormComponent);
    component = fixture.componentInstance;

    // Create a survey model for testing
    surveyModel = new Model({
      elements: [
        {
          type: 'file',
          name: 'supportingDocuments',
          title: 'Supporting Documents'
        },
        {
          type: 'file',
          name: 'identityDocument',
          title: 'Identity Document'
        }
      ]
    });

    // Call setupFileUploads to register the handlers
    component.setupFileUploads(surveyModel);
  });

  describe('onClearFiles handler', () => {
    describe('when fileName is provided (single file removal)', () => {
      it('should call removeStoredFile with correct parameters', () => {
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
        surveyModel.onClearFiles.fire(surveyModel, options);

        // Assert
        expect(mockUploadService.removeStoredFile).toHaveBeenCalledWith(
          questionName,
          fileName,
          callbackSpy
        );
      });

      it('should not call clearQuestionFiles', () => {
        // Arrange
        const options = {
          name: 'supportingDocuments',
          fileName: 'test.txt',
          callback: jasmine.createSpy('callback')
        };

        // Act
        surveyModel.onClearFiles.fire(surveyModel, options);

        // Assert
        expect(mockUploadService.clearQuestionFiles).not.toHaveBeenCalled();
      });

      it('should not call the callback directly', () => {
        // Arrange
        const callbackSpy = jasmine.createSpy('callback');
        const options = {
          name: 'supportingDocuments',
          fileName: 'test.txt',
          callback: callbackSpy
        };

        // Act
        surveyModel.onClearFiles.fire(surveyModel, options);

        // Assert - callback is passed to removeStoredFile, not called directly
        expect(callbackSpy).not.toHaveBeenCalled();
      });

      it('should handle different file names', () => {
        // Arrange
        const testCases = [
          'document.pdf',
          'image.jpg',
          'file with spaces.txt',
          'special-chars_123.docx'
        ];

        testCases.forEach(fileName => {
          mockUploadService.removeStoredFile.calls.reset();

          const options = {
            name: 'supportingDocuments',
            fileName: fileName,
            callback: jasmine.createSpy('callback')
          };

          // Act
          surveyModel.onClearFiles.fire(surveyModel, options);

          // Assert
          expect(mockUploadService.removeStoredFile).toHaveBeenCalledWith(
            'supportingDocuments',
            fileName,
            jasmine.any(Function)
          );
        });
      });

      it('should handle different question names', () => {
        // Arrange
        const questionNames = ['supportingDocuments', 'identityDocument'];

        questionNames.forEach(questionName => {
          mockUploadService.removeStoredFile.calls.reset();

          const options = {
            name: questionName,
            fileName: 'test.txt',
            callback: jasmine.createSpy('callback')
          };

          // Act
          surveyModel.onClearFiles.fire(surveyModel, options);

          // Assert
          expect(mockUploadService.removeStoredFile).toHaveBeenCalledWith(
            questionName,
            'test.txt',
            jasmine.any(Function)
          );
        });
      });
    });

    describe('when fileName is null (clear all files)', () => {
      it('should call clearQuestionFiles with correct question name', () => {
        // Arrange
        const questionName = 'supportingDocuments';
        const callbackSpy = jasmine.createSpy('callback');

        const options = {
          name: questionName,
          fileName: null,
          callback: callbackSpy
        };

        // Act
        surveyModel.onClearFiles.fire(surveyModel, options);

        // Assert
        expect(mockUploadService.clearQuestionFiles).toHaveBeenCalledWith(questionName);
      });

      it('should call callback with success', () => {
        // Arrange
        const callbackSpy = jasmine.createSpy('callback');

        const options = {
          name: 'supportingDocuments',
          fileName: null,
          callback: callbackSpy
        };

        // Act
        surveyModel.onClearFiles.fire(surveyModel, options);

        // Assert
        expect(callbackSpy).toHaveBeenCalledWith('success', null);
      });

      it('should not call removeStoredFile', () => {
        // Arrange
        const options = {
          name: 'supportingDocuments',
          fileName: null,
          callback: jasmine.createSpy('callback')
        };

        // Act
        surveyModel.onClearFiles.fire(surveyModel, options);

        // Assert
        expect(mockUploadService.removeStoredFile).not.toHaveBeenCalled();
      });

      it('should call clearQuestionFiles before callback', () => {
        // Arrange
        const callOrder: string[] = [];
        
        mockUploadService.clearQuestionFiles.and.callFake(() => {
          callOrder.push('clearQuestionFiles');
        });

        const callbackSpy = jasmine.createSpy('callback').and.callFake(() => {
          callOrder.push('callback');
        });

        const options = {
          name: 'supportingDocuments',
          fileName: null,
          callback: callbackSpy
        };

        // Act
        surveyModel.onClearFiles.fire(surveyModel, options);

        // Assert
        expect(callOrder).toEqual(['clearQuestionFiles', 'callback']);
      });
    });

    describe('when fileName is undefined (clear all files)', () => {
      it('should call clearQuestionFiles', () => {
        // Arrange
        const questionName = 'identityDocument';
        const callbackSpy = jasmine.createSpy('callback');

        const options = {
          name: questionName,
          fileName: undefined,
          callback: callbackSpy
        };

        // Act
        surveyModel.onClearFiles.fire(surveyModel, options);

        // Assert
        expect(mockUploadService.clearQuestionFiles).toHaveBeenCalledWith(questionName);
      });

      it('should call callback with success', () => {
        // Arrange
        const callbackSpy = jasmine.createSpy('callback');

        const options = {
          name: 'identityDocument',
          fileName: undefined,
          callback: callbackSpy
        };

        // Act
        surveyModel.onClearFiles.fire(surveyModel, options);

        // Assert
        expect(callbackSpy).toHaveBeenCalledWith('success', null);
      });

      it('should not call removeStoredFile', () => {
        // Arrange
        const options = {
          name: 'identityDocument',
          fileName: undefined,
          callback: jasmine.createSpy('callback')
        };

        // Act
        surveyModel.onClearFiles.fire(surveyModel, options);

        // Assert
        expect(mockUploadService.removeStoredFile).not.toHaveBeenCalled();
      });
    });

    describe('when fileName is empty string', () => {
      it('should treat empty string as falsy and call clearQuestionFiles', () => {
        // Arrange
        const questionName = 'supportingDocuments';
        const callbackSpy = jasmine.createSpy('callback');

        const options = {
          name: questionName,
          fileName: '',
          callback: callbackSpy
        };

        // Act
        surveyModel.onClearFiles.fire(surveyModel, options);

        // Assert
        expect(mockUploadService.clearQuestionFiles).toHaveBeenCalledWith(questionName);
        expect(callbackSpy).toHaveBeenCalledWith('success', null);
      });
    });

    describe('edge cases', () => {
      it('should handle multiple consecutive clear calls', () => {
        // Arrange
        const callback1 = jasmine.createSpy('callback1');
        const callback2 = jasmine.createSpy('callback2');

        // Act
        surveyModel.onClearFiles.fire(surveyModel, {
          name: 'supportingDocuments',
          fileName: 'file1.txt',
          callback: callback1
        });

        surveyModel.onClearFiles.fire(surveyModel, {
          name: 'supportingDocuments',
          fileName: 'file2.txt',
          callback: callback2
        });

        // Assert
        expect(mockUploadService.removeStoredFile).toHaveBeenCalledTimes(2);
      });

      it('should handle clear calls for different questions', () => {
        // Arrange
        const callback1 = jasmine.createSpy('callback1');
        const callback2 = jasmine.createSpy('callback2');

        // Act
        surveyModel.onClearFiles.fire(surveyModel, {
          name: 'supportingDocuments',
          fileName: null,
          callback: callback1
        });

        surveyModel.onClearFiles.fire(surveyModel, {
          name: 'identityDocument',
          fileName: null,
          callback: callback2
        });

        // Assert
        expect(mockUploadService.clearQuestionFiles).toHaveBeenCalledWith('supportingDocuments');
        expect(mockUploadService.clearQuestionFiles).toHaveBeenCalledWith('identityDocument');
        expect(callback1).toHaveBeenCalledWith('success', null);
        expect(callback2).toHaveBeenCalledWith('success', null);
      });

      it('should handle mixed single file and clear all operations', () => {
        // Arrange
        const callback1 = jasmine.createSpy('callback1');
        const callback2 = jasmine.createSpy('callback2');

        // Act - single file removal
        surveyModel.onClearFiles.fire(surveyModel, {
          name: 'supportingDocuments',
          fileName: 'file1.txt',
          callback: callback1
        });

        // Act - clear all
        surveyModel.onClearFiles.fire(surveyModel, {
          name: 'identityDocument',
          fileName: null,
          callback: callback2
        });

        // Assert
        expect(mockUploadService.removeStoredFile).toHaveBeenCalledTimes(1);
        expect(mockUploadService.clearQuestionFiles).toHaveBeenCalledTimes(1);
      });
    });
  });
});