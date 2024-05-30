import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

import { LabelUXService } from 'src/app/services/label-ux.service';
import { DocumentStatus, IDocument } from 'src/app/types/customModelTypes';

@Component({
  selector: 'app-document-gallery',
  templateUrl: './document-gallery.component.html',
  styleUrls: ['./document-gallery.component.scss']
})
export class DocumentGalleryComponent implements OnInit {
  @Input() hideAddButton = false;
  @Input() shouldConfirmDeleteDocument = false;
  @Output() onDocumentDeleted: EventEmitter<IDocument> = new EventEmitter();

  displayedDocuments: IDocument[] = [];
  isDeleteModelOpen = false;
  documentToDeleted: any = undefined;

  currentDocument?: IDocument;

  constructor(
    readonly uxService: LabelUXService,
  ) { }

  ngOnInit(): void {
    this.uxService.documentsState$.subscribe(({ documents, currentDocument }) => {
      if (this.displayedDocuments !== documents) {
        this.displayedDocuments = documents;
      }
      if (currentDocument) {
        this.currentDocument = currentDocument;
      }
      if (
        documents &&
        documents[0] &&
        documents[0].states.loadingStatus === DocumentStatus.Loaded &&
        !currentDocument
      ) {
        this.uxService.setCurrentDocument(documents[0]);
      }
    })
  }

  handleDocumentClick(name: string) {
    const selectedDoc = this.displayedDocuments.find((doc) => doc.name === name);
    if (selectedDoc) {
      this.uxService.setCurrentDocument(selectedDoc);
    }
  }

  setCurrentDocumentToNextOrPreviousDocument(docIndexToDelete: number) {
    let nextDocument: IDocument;
    if (this.displayedDocuments.length === 1) {
        this.uxService.clearCurrentDocument();
        return;
    }
    if (docIndexToDelete + 1 === this.displayedDocuments.length) {
        nextDocument = this.displayedDocuments[docIndexToDelete - 1];
    } else {
        nextDocument = this.displayedDocuments[docIndexToDelete + 1];
    }
    this.uxService.setCurrentDocument(nextDocument);
  }

  handleDocumentDelete(docNameToDelete: string, index: number) {
    if (this.currentDocument?.name === docNameToDelete) {
        this.setCurrentDocumentToNextOrPreviousDocument(index);
    }
    const docToDelete = this.displayedDocuments.find((doc: IDocument) => doc.name === docNameToDelete);

    if (docToDelete) {
        this.uxService.deleteDocument(docToDelete.name);
        if (this.onDocumentDeleted) {
          this.onDocumentDeleted.emit(docToDelete);
        }
    }
  }

  handleConfirmDocumentDeletion() {
    const { name, index } = this.documentToDeleted!;
    this.handleDocumentDelete(name, index);
    this.documentToDeleted = undefined;
    this.isDeleteModelOpen = false;
  }

  handleDocumentDeleteClicked(name: string, index: number) {
    this.documentToDeleted = { name, index };
    this.isDeleteModelOpen = true;
  }

}
