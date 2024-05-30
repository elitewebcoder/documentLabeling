import { Feature } from "ol";
import { Extent } from "ol/extent";
import Polygon from "ol/geom/Polygon";
import ImageLayer from "ol/layer/Image";
import Layer from "ol/layer/Layer";
import VectorLayer from "ol/layer/Vector";
import Projection from "ol/proj/Projection";
import ImageSource from "ol/source/ImageStatic";
import VectorSource from "ol/source/Vector";
import { LAYER_NAME } from "../consts/constants";
import { IRegion } from "../types/customModelTypes";

export type Dimension = {
    width: number;
    height: number;
};

export const degreeToRadians = (degree: number) => {
    // convert degree to radians
    return (degree * Math.PI * 2) / 360;
};

export const makeLayerFilter = (layerName: any) => {
    return {
        layerFilter: (layer: Layer) => layer.get(LAYER_NAME) === layerName,
    };
};

export const makeVectorLayer = (layerName: any, options: any = {}): Layer => {
    return new VectorLayer({
        [LAYER_NAME]: layerName,
        source: new VectorSource(),
        ...options,
    } as any);
};

export const makeImageLayer = (layerName: any, uri: any, projection: any, imageExtent: any, options = {}): Layer => {
    return new ImageLayer({
        [LAYER_NAME]: layerName,
        source: makeImageSource(uri, projection, imageExtent),
        ...options,
    } as any);
};

export const makeImageSource = (url: string, projection: Projection, imageExtent: Extent) => {
    return new ImageSource({ url, projection, imageExtent });
};

export const convertRegionToFeature = (region: IRegion, imageExtent: Extent, isOcrProposal: boolean = false) => {
    const coordinates: Array<[number, number]> = [];
    const boundingBox = region.id.split(",").map(parseFloat);
    const imageWidth = imageExtent[2] - imageExtent[0];
    const imageHeight = imageExtent[3] - imageExtent[1];
    for (let i = 0; i < boundingBox.length; i += 2) {
        coordinates.push([Math.round(boundingBox[i] * imageWidth), Math.round((1 - boundingBox[i + 1]) * imageHeight)]);
    }
    const feature = new Feature({
        geometry: new Polygon([coordinates]),
    });
    feature.setProperties({
        id: region.id,
        text: region.value,
        highlighted: false,
        isOcrProposal,
    });
    feature.setId(region.id);

    return feature;
};

export const createRegionIdFromPolygon = (polygon: number[], page: number): string => {
    return polygon.join(",") + ":" + page;
};

export const convertToImageMapCoordinates = (polygon: number[], canvasSize: Dimension, documentSize: Dimension) => {
    const { width: canvasWidth, height: canvasHeight } = canvasSize;
    const { width: ocrWidth, height: ocrHeight } = documentSize;

    const coordinates: number[][] = [];
    for (let i = 0; i < polygon.length; i += 2) {
        coordinates.push([(polygon[i] / ocrWidth) * canvasWidth, (1 - polygon[i + 1] / ocrHeight) * canvasHeight]);
    }
    return coordinates;
};

export const getBoundingBoxFromFeatureId = (id: string): any => id.split(",").map(parseFloat);

export const delay = (ms: number) => {
    return new Promise<void>((resolve) => {
        setTimeout(() => {
            resolve();
        }, ms);
    });
};

export const getPixelWidthFromPercent = (widthInPercentage: number): number => {
    const totalWindowWidth = document.documentElement.clientWidth;
    const paneWidthInPixel = (totalWindowWidth / 100) * widthInPercentage;
    return paneWidthInPixel;
};

export const loadCanvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject("Failed to create blob for canvas.");
            }
        });
    });
};

export const loadUrlToArrayBuffer = async (url: string): Promise<ArrayBuffer> => {
    return await fetch(url).then((r) => r.arrayBuffer());
};

export const debounce = (func: any, timeout = 300) => {
    return (...args: any[]) => {
        return setTimeout(() => {
            func.apply(this, args);
        }, timeout);
    };
};
