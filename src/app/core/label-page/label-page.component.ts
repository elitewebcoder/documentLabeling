import { Component, OnInit } from '@angular/core';
import { take } from 'rxjs';
import urljoin from "url-join";

import { LabelUXService } from 'src/app/services/label-ux.service';
import { CustomModelService } from 'src/app/services/custom-model.service';
import { IStorageProviderError, StorageProvider } from 'src/app/services/assetService/storageProvider';
import { SERVER_SITE_URL, constants } from 'src/app/consts/constants';
import { DocumentStatus, ICanvas, IDocument, IRawDocument } from 'src/app/types/customModelTypes';
import { getDocumentType, isSupportedFile } from 'src/app/utils/documentLoader';
import { isLabelFieldWithCorrectFormat } from 'src/app/utils/customModel/schemaValidation/fieldsValidator';
import { isEqual } from 'lodash';

const composeFileUrl = (filePath: string): string => {
  return urljoin(`${SERVER_SITE_URL}/files/${filePath}`);
}

@Component({
  selector: 'app-label-page',
  templateUrl: './label-page.component.html',
  styleUrls: ['./label-page.component.scss']
})
export class LabelPageComponent implements OnInit {
  storageProvider: StorageProvider;

  isLoadingFields = true;
  isLoadingLabels = true;
  isInvalidFieldsFormatModalOpen = false;
  isTablePaneOpen = false;
  errorMessage: any = undefined;
  splitPaneSizes = constants.defaultSplitPaneSizes;
  showEmptyFolderMessage = false;

  prevDocumentName = '';
  prevLabelsLength = 0;

  canvas?: ICanvas;

  private loadingOverlayName = "customModelLabelPage";

  constructor(
    readonly uxService: LabelUXService,
    readonly customModelService: CustomModelService,
  ) {
    this.storageProvider = new StorageProvider();
  }

  ngOnInit(): void {
    this.initializeDocuments();

    this.uxService.documentsState$.subscribe(({ currentDocument }) => {
      if (currentDocument) {
        if (currentDocument.name !== this.prevDocumentName) {
          this.prevDocumentName = currentDocument.name;

          this.customModelService.customModelState$
            .pipe(
              take(1)
            )
            .subscribe(({ labels }) => {
              if (!labels[currentDocument.name]) {
                this.getAndSetLabels(currentDocument);
              }
            });
          
          this.uxService.predictionsState$
            .pipe(
              take(1)
            )
            .subscribe(({ predictions }) => {
              if (!predictions[currentDocument.name]) {
                this.getAndSetOcr(currentDocument);
              }
            });
        }

        if (!this.isLoadingLabels) {
          // Remove current loading overlay  when the first document is loaded with labels.
          this.uxService.removeLoadingOverlayByName(this.loadingOverlayName)
        }
      }
    });
    this.uxService.canvasState$.subscribe(({ canvas }) => {
      if (canvas && !isEqual(canvas, this.canvas)) {
        this.canvas = canvas;
      }
    });

    this.customModelService.customModelState$.subscribe(({ labels }) => {
      if (labels) {
        this.uxService.documentsState$.pipe(
          take(1)
        ).subscribe(({ currentDocument }) => {
          if (currentDocument) {
            if (labels[currentDocument.name]?.length !== this.prevLabelsLength) {
              if (labels[currentDocument.name]?.length !== 0 && this.prevLabelsLength === 0) {
                this.uxService.setDocumentLabelingStatus(currentDocument.name, DocumentStatus.Labeled);
              }

              if (labels[currentDocument.name]?.length === 0 && this.prevLabelsLength !== 0) {
                this.uxService.setDocumentLabelingStatus(currentDocument.name, undefined);
              }
              this.prevLabelsLength = labels[currentDocument.name]?.length || 0;
            }
          }
        });
      }
    });
  }

  async initializeDocuments(): Promise<void> {
    this.uxService.addLoadingOverlay(this.loadingOverlayName, "Loading documents...");
    await this.getAndSetDocuments();
    await this.getAndSetFields();
    this.uxService.removeLoadingOverlayByName(this.loadingOverlayName);
  }

  makeRawDocument(filePath: string): IRawDocument {
    const path = encodeURIComponent(filePath);
    return {
      name: filePath.split("/").pop()!,
      type: getDocumentType(filePath),
      url: composeFileUrl(path),
    };
  }

  async getAndSetDocuments(): Promise<void> {
    try {
        const filePaths = await this.storageProvider.listFilesInFolder();
        const documents: IRawDocument[] = filePaths.filter(isSupportedFile).map(this.makeRawDocument);
        const showEmptyFolderMessage = documents.length === 0;
        if (!showEmptyFolderMessage) {
            const chunkSize = 3;
            for (let i = 0, j = documents.length; i < j; i += chunkSize) {
              const documentChunk: any = documents.slice(i, i + chunkSize);
              await this.uxService.addDocuments(documentChunk);
              documentChunk.forEach((document: any) => {
                  const { name } = document;
                  const ocrFileName = `${name}${constants.ocrFileExtension}`;
                  const labelFileName = `${name}${constants.labelFileExtension}`;

                  if (filePaths.includes(ocrFileName)) {
                    this.uxService.setDocumentAnalyzingStatus(name, DocumentStatus.Analyzed);
                  }
                  if (filePaths.includes(labelFileName)) {
                    this.uxService.setDocumentLabelingStatus(name, DocumentStatus.Labeled);
                  }
              });
            }
        }
        this.showEmptyFolderMessage = showEmptyFolderMessage;
    } catch (err) {
      this.errorMessage = err as IStorageProviderError;
    }
  }

  async getAndSetFields(): Promise<void> {
    this.isLoadingFields = true;
    try {
      const rawFields = await this.storageProvider.readText(constants.fieldsFile, true);

      if (rawFields) {
          const parsedFields = JSON.parse(rawFields);
        if (!isLabelFieldWithCorrectFormat(parsedFields)) {
          this.isInvalidFieldsFormatModalOpen = true;
        } else {
          const { fields, definitions } = parsedFields;
          this.customModelService.setDefinitions(definitions);
          this.customModelService.setFields(fields);
        }
      }
    } catch (err: any) {
      this.errorMessage = err as IStorageProviderError;
    } finally {
      this.isLoadingFields = false;
    }
  }

  async getAndSetLabels(currentDocument: IDocument): Promise<void> {
    this.isLoadingLabels = true;
    try {
      const labels = await this.storageProvider.readText(
          `${currentDocument?.name}${constants.labelFileExtension}`,
          true
      );
      if (labels) {
        this.customModelService.setLabelsByName(currentDocument.name, JSON.parse(labels).labels);
      } else {
        this.customModelService.setLabelsByName(currentDocument.name, []);
      }
    } catch (err) {
      this.errorMessage = err as IStorageProviderError;
    } finally {
      this.isLoadingLabels = false;
    }
  }

  async getAndSetOcr(currentDocument: IDocument): Promise<void> {
    const { name } = currentDocument;
    const ocrFilePath = `${name}${constants.ocrFileExtension}`;

    try {
      if (await this.storageProvider.isFileExists(ocrFilePath, true)) {
        // If OCR file exists, we fetch it from storage.
        const layoutResponse = JSON.parse((await this.storageProvider.readText(ocrFilePath, true)) || "");
        this.uxService.setDocumentPrediction(name, layoutResponse);
      }

      this.uxService.setDocumentAnalyzingStatus(name, DocumentStatus.Analyzed);
    } catch (err: any) {
      this.errorMessage = err as IStorageProviderError;
    }
  }

  handleSplitPaneSizesChange(sizes: number[]): void {
    if (this.isTablePaneOpen) {
      this.splitPaneSizes = { ...this.splitPaneSizes, labelTableSplitPaneSize: sizes };
    } else {
      this.splitPaneSizes = { ...this.splitPaneSizes, labelSplitPaneSize: sizes };
    }
  }

  async deleteDocumentInStorage(doc: IDocument): Promise<void> {
    const { name } = doc;
    const ocrFileName = `${name}${constants.ocrFileExtension}`;
    const labelFileName = `${name}${constants.labelFileExtension}`;

    this.customModelService.deleteLabelByName(doc.name);
    try {
      await this.storageProvider.deleteFile(name);
      await this.storageProvider.deleteFile(ocrFileName, true);
      await this.storageProvider.deleteFile(labelFileName, true);
    } catch (err) {
      this.errorMessage = err as IStorageProviderError;
    }
  }

  async handleDeleteLabelFieldsJsonFile(): Promise<void> {
    try {
      await this.storageProvider.deleteFile(constants.fieldsFile, true);
    } catch (err) {
      this.errorMessage = err as IStorageProviderError;
    } finally {
      this.isInvalidFieldsFormatModalOpen = false;
    }
  }

  handleCloseIncorrectLabelFieldsFormatModal() {
    this.isInvalidFieldsFormatModalOpen = false;
  }

  handelSetIsTablePanelOpen(state: boolean) {
    this.isTablePaneOpen = state;
  }

  handleCloseStorageErrorModal() {
    this.errorMessage = undefined;
  }

}
