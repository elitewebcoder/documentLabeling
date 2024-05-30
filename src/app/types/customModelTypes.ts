import {
  Labels,
  Field,
  Definitions,
  LabelValueCandidate,
  FieldType,
} from "../models/customModels";
import { LoadingOverlayWeights } from "../consts/constants";
import { AnalyzeResponse } from "../models/analyzeResult";
import { DocumentLoaderFactory, IDocumentLoader } from "../utils/documentLoader";

// CustomModel
export enum FieldLocation {
  field,
  definition,
}

export type MessageDescriptorArguments = {
  [name: string]: string;
};

export interface ICustomModelError {
  name: string;
  message: string;
  messageArguments?: MessageDescriptorArguments;
}

export type CustomModelState = {
  definitions: Definitions;
  fields: Field[];
  colorForFields: Record<string, string>[];
  labels: Labels;

  orders: {
    [documentName: string]: { [orderId: string]: number };
  };
  labelValueCandidates: LabelValueCandidate[];
  labelError: ICustomModelError | null;
  hideInlineLabelMenu: boolean;
};

// Document
export enum DocumentStatus {
  Loading = "Loading",
  Loaded = "Loaded",
  Analyzing = "Analyzing",
  Analyzed = "Analyzed",
  AnalyzeFailed = "AnalyzeFailed",
  Labeled = "Labeled",
}

export interface IDocumentStates {
  loadingStatus: DocumentStatus;
  analyzingStatus?: DocumentStatus;
  labelingStatus?: DocumentStatus;
}

export interface IRawDocument {
  name: string;
  type: string;
  url: string;
}

export interface IDocument extends IRawDocument {
  thumbnail: string;
  numPages: number;
  currentPage: number;
  states: IDocumentStates;
  expirationTime?: number;
}

export type DocumentsState = { documents: IDocument[]; currentDocument: IDocument | null };

const documentLoaders = new Map<string, IDocumentLoader>();

const getLoader = async (document: IRawDocument): Promise<IDocumentLoader> => {
    let loader = documentLoaders.get(document.url);
    if (!loader) {
        loader = await DocumentLoaderFactory.makeLoader(document);
        documentLoaders.set(document.url, loader);
    }

    return loader;
};

// Prediction
export interface IPrediction {
  name: string;
  analyzeResponse: AnalyzeResponse;
}

export interface IPredictionPayload {
  targetDocument: IDocument;
  endpoint: string;
  key: string;
}

export type PredictionsState = {
  predictions: { [name: string]: IPrediction };
};

// Canvas
export interface ICanvas {
  imageUrl: string;
  width: number;
  height: number;
  angle: number;
}

export enum VisibleAnalyzedElementEnum {
  KeyValuePairs = "KeyValuePairs",
  Entities = "Entities",
  PagedLabelResult = "PagedLabelResult",
  Lines = "Lines",
  Words = "Words",
  Paragraphs = "Paragraphs",
  SelectionMarks = "SelectionMarks",
  Tables = "Tables",
}

export type VisibleAnalyzedElement = {
  [VisibleAnalyzedElementEnum.KeyValuePairs]?: boolean;
  [VisibleAnalyzedElementEnum.Entities]?: boolean;
  [VisibleAnalyzedElementEnum.PagedLabelResult]?: boolean;
  [VisibleAnalyzedElementEnum.Lines]?: boolean;
  [VisibleAnalyzedElementEnum.Words]: boolean;
  [VisibleAnalyzedElementEnum.Paragraphs]?: boolean;
  [VisibleAnalyzedElementEnum.Tables]?: boolean;
  [VisibleAnalyzedElementEnum.SelectionMarks]?: boolean;
};

export interface loadDocumentPagePayload {
  document: IRawDocument;
  pageNumber: number;
}

export type CanvasState = {
  canvas: ICanvas;
  visibleAnalyzedElement: VisibleAnalyzedElement;
  hoveredBoundingBoxIds: string[];
  hoveredLabelName: string;
  documentSelectIndex: number;
  shouldResizeImageMap: boolean;
};

export interface ILoadingOverlay {
  name: string;
  message: string;
  weight: LoadingOverlayWeights;
}

export type PortalState = {
  loadingOverlays: ILoadingOverlay[];
};

/**
 * @name - Feature Category
 * @description - Defines types of feature
 * @member Checkbox - Checkbox
 * @member DrawnRegion - User drawn region
 * @member Label - User label
 * @member Text - OCR text
 */
export enum FeatureCategory {
  Checkbox = "checkbox",
  DrawnRegion = "region",
  Label = "label",
  Text = "text",
}

/**
* @name - Region Type
* @description - Defines the region type within the asset metadata
* @member Point - Specifies a vertex
* @member Polygon - Specifies a region as a multi-point polygon
* @member Polyline - Specifies a region as a multi-point line
* @member Square - Specifies a region as a square
* @member Rectangle - Specifies a region as a rectangle
*/
export enum RegionType {
  Point = "POINT",
  Polygon = "POLYGON",
  Polyline = "POLYLINE",
  Rectangle = "RECTANGLE",
  Square = "SQUARE",
}

/**
* @name - Region
* @description - Defines a region within an asset
* @member id - Unique identifier for this region
* @member type - Defines the type of region
* @member category - Defines the feature category
* @member tags - Defines a list of tags applied to a region
* @member points - Defines a list of points that define a region
* @member boundingBox - Defines a list of points that forms a bounding box
* @member value - Defines a normalized value for this region
* @member pageNumber - Defines a page number for this region
* @member isTableRegion - Defines a flag determine if the region belongs to a table
* @member changed - Defines a flag if this region had been changed
*/
export interface IRegion {
  id: string;
  type: RegionType;
  category: FeatureCategory;
  tags: string[];
  points?: IPoint[];
  boundingBox?: IBoundingBox;
  value?: string;
  pageNumber: number;
  isTableRegion?: boolean;
  changed?: boolean;
}

/**
* @name - Bounding Box
* @description - Defines the tag usage within a bounding box region
* @member left - Defines the left x boundary for the start of the bounding box
* @member top - Defines the top y boundary for the start of the boudning box
* @member width - Defines the width of the bounding box
* @member height - Defines the height of the bounding box
*/
export interface IBoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
* @name - Point
* @description - Defines a point / coordinate within a region
* @member x - The x value relative to the asset
* @member y - The y value relative to the asset
*/
export interface IPoint {
  x: number;
  y: number;
}

export const supportedFieldTypesByCategory = {
  [FeatureCategory.Text]: [FieldType.String, FieldType.Date, FieldType.Time, FieldType.Integer, FieldType.Number],
  [FeatureCategory.Checkbox]: [FieldType.SelectionMark],
  [FeatureCategory.DrawnRegion]: [
      FieldType.String,
      FieldType.Date,
      FieldType.Time,
      FieldType.Integer,
      FieldType.Number,
      FieldType.SelectionMark,
      FieldType.Signature,
  ],
  [FeatureCategory.Label]: [
      FieldType.String,
      FieldType.Date,
      FieldType.Time,
      FieldType.Integer,
      FieldType.Number,
      FieldType.SelectionMark,
      FieldType.Signature,
  ],
};
