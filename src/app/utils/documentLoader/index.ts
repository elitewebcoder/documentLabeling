import { ICanvas, IDocument, IRawDocument } from "../../types/customModelTypes";
import { ImageLoader } from "./imageLoader";
import { PdfLoader } from "./pdfLoader";
import { TiffLoader } from "./tiffLoader";

export enum DocumentMimeType {
    JPEG = "image/jpeg",
    PDF = "application/pdf",
    PNG = "image/png",
    TIFF = "image/tiff",
    UNKNOWN = "unknown",
}

export interface IDocumentLoader {
    setup(): Promise<void>;
    loadDocumentMeta(): Promise<IDocument>;
    loadDocumentPage(pageNumber: number): Promise<ICanvas>;
}

export class DocumentLoaderFactory {
    static async makeLoader(document: IRawDocument): Promise<IDocumentLoader> {
        let docLoader;
        switch (document.type) {
            case DocumentMimeType.PDF:
                docLoader = PdfLoader;
                break;
            case DocumentMimeType.TIFF:
                docLoader = TiffLoader;
                break;
            case DocumentMimeType.JPEG:
            case DocumentMimeType.PNG:
                docLoader = ImageLoader;
                break;
            default:
                docLoader = PdfLoader;
                break;
        }

        const loader = new docLoader(document);
        await loader.setup();
        return loader;
    }
}

export const isSupportedFile = (filePath: string): boolean => {
    const extensions = [".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".tif"];
    const path = filePath.toLowerCase();
    return extensions.some((ext) => path.endsWith(ext));
};

export const getDocumentType = (filePath: string): DocumentMimeType => {
    switch (filePath.toLowerCase().split(".").pop()) {
        case "pdf":
            return DocumentMimeType.PDF;
        case "jpg":
        case "jpeg":
            return DocumentMimeType.JPEG;
        case "png":
            return DocumentMimeType.PNG;
        case "tiff":
        case "tif":
            return DocumentMimeType.TIFF;
        default:
            return DocumentMimeType.UNKNOWN;
    }
};

export const documentLoaders = new Map<string, IDocumentLoader>();

export const getLoader = async (document: IRawDocument): Promise<IDocumentLoader> => {
    let loader = documentLoaders.get(document.url);
    if (!loader) {
        loader = await DocumentLoaderFactory.makeLoader(document);
        documentLoaders.set(document.url, loader);
    }

    return loader;
};
