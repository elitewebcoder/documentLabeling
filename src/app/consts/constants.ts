export const constants = {
    defaultSplitPaneSizes: {
        analyzeSplitPaneSize: [70, 30],
        labelSplitPaneSize: [80, 20],
        labelTableSplitPaneSize: [65, 35],
    },
    dynamicTableImgSrc: "/images/customModels/dynamic-table.png",
    fixedTableImgSrc: "/images/customModels/fixed-table.png",
    fieldsSchema: "https://schema.cognitiveservices.azure.com/formrecognizer/2021-03-01/fields.json",
    labelsSchema: "https://schema.cognitiveservices.azure.com/formrecognizer/2021-03-01/labels.json",
    fieldsFile: "fields.json",
    labelFileExtension: ".labels.json",
    ocrFileExtension: ".ocr.json",
};

export const SERVER_SITE_URL = "http://localhost:4000";

export enum LoadingOverlayWeights {
    ExtraLight = 0,
    Light = 10,
    Default = 20,
    SemiHeavy = 30,
    Heavy = 40,
    ExtraHeavy = 50,
}

export enum KeyEventType {
    KeyDown = "keydown",
    KeyUp = "keyup",
}

export enum KeyEventCode {
    Shift = "Shift",
    Escape = "Escape",
}

export const inlineLabelMenuHeight = 180;

export const LAYER_NAME = "name";
export const IMAGE_LAYER_NAME = "imageLayer";
export const TEXT_VECTOR_LAYER_NAME = "textVectorLayer";
export const POD_VECTOR_LAYER_NAME = "podVectorLayer";
export const TABLE_BORDER_VECTOR_LAYER_NAME = "tableBorderVectorLayer";
export const TABLE_ICON_VECTOR_LAYER_NAME = "tableIconVectorLayer";
export const TABLE_ICON_BORDER_VECTOR_LAYER_NAME = "tableIconBorderVectorLayer";
export const CHECKBOX_VECTOR_LAYER_NAME = "checkboxBorderVectorLayer";
export const LABEL_VECTOR_LAYER_NAME = "labelledVectorLayer";
export const DRAWN_REGION_LABEL_VECTOR_LAYER_NAME = "drawnRegionLabelledVectorLayer";
export const DRAWN_REGION_VECTOR_LAYER_NAME = "drawnRegionVectorLayer";

export const SELECTED_PROPERTY = "selected";
export const SELECTION_MARK_STATE = "selectionMarkState";
export const HIGHLIGHTED_PROPERTY = "highlighted";
export const FIELD_PROPERTY = "field";
export const COLOR_PROPERTY = "color";
export const BACKGROUND_COLOR_PROPERTY = "backgroundColor";
export const DASHED_PROPERTY = "dashed";
export const DISABLEHIGHLIGHT_PROPERTY = "disableHighlight";
