import * as pdfjsLib from "pdfjs-dist";
import { ICanvas, DocumentStatus, IDocument, IRawDocument } from "../../types/customModelTypes";
import { loadCanvasToBlob } from "../../utils";
import { IDocumentLoader } from ".";
pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/pdf.worker.js';

export class PdfLoader implements IDocumentLoader {
    private readonly PDF_SCALE = 2;

    private document: IRawDocument;
    private pdf: any;

    constructor(document: IRawDocument) {
        this.document = document;
    }

    public async setup(): Promise<void> {
        this.pdf = await pdfjsLib.getDocument({
            url: this.document.url,
            cMapUrl: "/fonts/pdfjs-dist/cmaps/",
            cMapPacked: true,
        }).promise;
    }

    public async loadDocumentMeta(): Promise<IDocument> {
        const firstPage = await this.loadDocumentPage(1, 1);
        return {
            ...this.document,
            thumbnail: firstPage.imageUrl,
            numPages: this.pdf.numPages,
            currentPage: 1,
            states: { loadingStatus: DocumentStatus.Loaded },
        };
    }

    public async loadDocumentPage(pageNumber: number, scale = this.PDF_SCALE): Promise<ICanvas> {
        const page = await this.pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale });

        // Prepare canvas using PDF page dimensions.
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // Render PDF page into canvas context.
        const renderContext = {
            canvasContext: context,
            viewport,
        };
        await page.render(renderContext).promise;

        const blob = await loadCanvasToBlob(canvas);
        return { imageUrl: window.URL.createObjectURL(blob), width: canvas.width, height: canvas.height, angle: 0 };
    }
}
