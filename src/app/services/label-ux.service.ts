import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  VisibleAnalyzedElementEnum,
  CanvasState,
  ICanvas,
  DocumentsState,
  IDocument,
  DocumentStatus,
  PredictionsState,
  PortalState,
} from '../types/customModelTypes';
import { documentLoaders, getLoader } from '../utils/documentLoader';
import { AnalyzeResponse } from '../models/analyzeResult';
import { LoadingOverlayWeights } from '../consts/constants';

@Injectable({
  providedIn: 'root',
})
export class LabelUXService {
  private initialCanvasState: CanvasState = {
    canvas: { imageUrl: '', width: 0, height: 0, angle: 0 },
    documentSelectIndex: 0,
    visibleAnalyzedElement: { [VisibleAnalyzedElementEnum.Words]: true },
    hoveredBoundingBoxIds: [],
    hoveredLabelName: '',
    shouldResizeImageMap: false,
  };
  private canvasState = new BehaviorSubject<CanvasState>(
    this.initialCanvasState
  );

  private initialDocumentState: DocumentsState = {
    documents: [],
    currentDocument: null,
  };
  private documentsState = new BehaviorSubject<DocumentsState>(
    this.initialDocumentState
  );

  private initialPredictionsState: PredictionsState = {
    predictions: {},
  };
  private predictionsState = new BehaviorSubject<PredictionsState>(
    this.initialPredictionsState
  );

  private initialPortalState: PortalState = { loadingOverlays: [] };
  private portalState = new BehaviorSubject<PortalState>(
    this.initialPortalState
  );

  // Observable for components to subscribe
  canvasState$ = this.canvasState.asObservable();
  documentsState$ = this.documentsState.asObservable();
  predictionsState$ = this.predictionsState.asObservable();
  portalState$ = this.portalState.asObservable();

  constructor() {}

  // Canvas
  setAngle(angle: number) {
    const currentState = this.canvasState.value;
    this.canvasState.next({
      ...currentState,
      canvas: { ...currentState.canvas, angle: angle },
    });
  }

  setVisibleAnalyzedElement(
    element: VisibleAnalyzedElementEnum,
    value: boolean
  ) {
    const currentState = this.canvasState.value;
    const updatedElements = {
      ...currentState.visibleAnalyzedElement,
      [element]: value,
    };
    this.canvasState.next({
      ...currentState,
      visibleAnalyzedElement: updatedElements,
    });
  }

  setHoveredBoundingBoxIds(ids: string[]) {
    const currentState = this.canvasState.value;
    this.canvasState.next({ ...currentState, hoveredBoundingBoxIds: ids });
  }

  setHoveredLabelName(name: string) {
    const currentState = this.canvasState.value;
    this.canvasState.next({ ...currentState, hoveredLabelName: name });
  }

  setDocumentSelectIndex(index: number) {
    const currentState = this.canvasState.value;
    this.canvasState.next({ ...currentState, documentSelectIndex: index });
  }

  setShouldResizeImageMap(shouldResize: boolean) {
    const currentState = this.canvasState.value;
    this.canvasState.next({
      ...currentState,
      shouldResizeImageMap: shouldResize,
    });
  }

  // Document
  async addDocuments(docsToAdd: IDocument[]): Promise<void> {
    const addedDocs = await Promise.all(
      docsToAdd.map(async (doc) => (await getLoader(doc)).loadDocumentMeta())
    );
    const { currentDocument, documents } = this.documentsState.value;
    addedDocs.forEach((doc) => {
      const iDoc = documents.findIndex((d) => d.name === doc.name);
      if (iDoc >= 0) {
        documents[iDoc] = {
          ...doc,
          states: {
            ...documents[iDoc].states,
            loadingStatus: DocumentStatus.Loaded,
          },
        };
      }
    });
    this.documentsState.next({ currentDocument, documents });
  }

  async setCurrentDocument(document: IDocument): Promise<void> {
    const { currentDocument, documents } = this.documentsState.value;

    const selectedDocIndex = documents.findIndex(
      (doc) => doc.name === document.name
    );
    if (selectedDocIndex > -1) {
      const selectedDoc = {
        ...documents[selectedDocIndex],
        states: {
          ...documents[selectedDocIndex].states,
          loadingStatus: DocumentStatus.Loading,
        },
      };
      documents.splice(selectedDocIndex, 1, selectedDoc);
      this.documentsState.next({ currentDocument, documents });
    }

    const loader = await getLoader(document);
    const documentPage = await loader.loadDocumentPage(document.currentPage);

    const selectedDocument: IDocument = {
      ...document,
      states: {
        ...document.states,
        loadingStatus: DocumentStatus.Loaded,
      },
    };
    const updatedDocuments = [...documents];
    if (selectedDocIndex > -1) {
      updatedDocuments[selectedDocIndex].states.loadingStatus =
        DocumentStatus.Loaded;
    }

    this.documentsState.next({
      currentDocument: selectedDocument,
      documents: updatedDocuments,
    });
    this.canvasState.next({
      ...this.initialCanvasState,
      canvas: documentPage,
    });
  }

  async setCurrentPage(pageNumber: number): Promise<void> {
    const currentState = this.documentsState.value;
    if (currentState.currentDocument) {
      const loader = await getLoader(currentState.currentDocument);
      const documentPage = await loader.loadDocumentPage(pageNumber);

      const updatedDocument = {
        ...currentState.currentDocument,
        currentPage: pageNumber,
      };
      this.documentsState.next({
        ...currentState,
        currentDocument: updatedDocument,
      });

      const currentCanvasState = this.canvasState.value;
      this.canvasState.next({
        ...currentCanvasState,
        canvas: documentPage,
        hoveredBoundingBoxIds: [],
        hoveredLabelName: '',
      });
    }
  }

  deleteDocument(docName: string): void {
    const currentState = this.documentsState.value;
    const updatedDocuments = currentState.documents.filter(
      (doc) => doc.name !== docName
    );
    this.documentsState.next({ ...currentState, documents: updatedDocuments });
  }

  setDocumentStatus(
    docName: string,
    status: DocumentStatus,
    type: 'analyzing' | 'labeling'
  ): void {
    const currentState = this.documentsState.value;
    const documents = currentState.documents.map((doc) => {
      if (doc.name === docName) {
        const updatedStates =
          type === 'analyzing'
            ? { analyzingStatus: status }
            : { labelingStatus: status };
        return { ...doc, states: { ...doc.states, ...updatedStates } };
      }
      return doc;
    });
    this.documentsState.next({ ...currentState, documents });
  }

  clearCurrentDocument(): void {
    const currentState = this.documentsState.value;
    this.canvasState.next(this.initialCanvasState);
    this.documentsState.next({ ...currentState, currentDocument: null });
  }

  setDocumentAnalyzingStatus(name: string, status: any): void {
    const { documents, currentDocument } = this.documentsState.value;
    const documentIdx = documents.findIndex(
      (document) => document.name === name
    );
    if (documentIdx > -1) {
      documents[documentIdx].states.analyzingStatus = status;
    }
    if (currentDocument?.name === name) {
      currentDocument!.states.analyzingStatus = status;
    }
    this.documentsState.next({ currentDocument, documents });
  }
  setDocumentLabelingStatus(name: string, status: any): void {
    const { documents, currentDocument } = this.documentsState.value;
    const documentIdx = documents.findIndex(
      (document) => document.name === name
    );
    if (documentIdx > -1) {
      documents[documentIdx].states.labelingStatus = status;
    }
    if (currentDocument?.name === name) {
      currentDocument!.states.labelingStatus = status;
    }
    this.documentsState.next({ currentDocument, documents });
  }

  // Predictions
  setDocumentPrediction(name: string, analyzeResponse: AnalyzeResponse): void {
    const currentState = this.predictionsState.value;
    const newPredictions = {
      ...currentState.predictions,
      [name]: { name, analyzeResponse },
    };
    this.predictionsState.next({ predictions: newPredictions });
  }

  resetPredictions(): void {
    const { documents, currentDocument } = this.documentsState.value;
    documents.forEach((document) => {
      document.states = { ...document.states, analyzingStatus: undefined };
    });
    if (currentDocument) {
      currentDocument.states = {
        ...currentDocument.states,
        analyzingStatus: undefined,
      };
    }
    this.predictionsState.next({ predictions: {} });
    this.documentsState.next({ documents, currentDocument });
  }

  // Portal
  addLoadingOverlay(
    name: string,
    message: string,
    weight?: LoadingOverlayWeights
  ): void {
    const { loadingOverlays } = this.portalState.value;
    const addedOverlay = {
      name,
      message: message || 'Loading...',
      weight: weight || LoadingOverlayWeights.Default,
    };
    const isOverlayExist =
      loadingOverlays.findIndex(
        (overlay) => overlay.name === addedOverlay.name
      ) !== -1;

    if (!isOverlayExist) {
      this.portalState.next({
        loadingOverlays: [...loadingOverlays, addedOverlay],
      });
    }
  }

  removeLoadingOverlayByName(name: string): void {
    const { loadingOverlays } = this.portalState.value;
    const updatedLoadingOverlays = loadingOverlays.filter(
      (overlay) => name !== overlay.name
    );
    this.portalState.next({ loadingOverlays: updatedLoadingOverlays });
  }
}
