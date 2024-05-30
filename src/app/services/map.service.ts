import { Injectable } from '@angular/core';
import { Image as ImageLayer, Vector as VectorLayer } from 'ol/layer';
import { ImageStatic as ImageSource, Vector as VectorSource } from 'ol/source';
import Projection from 'ol/proj/Projection';
import Style from 'ol/style/Style';

@Injectable({
  providedIn: 'root'
})
export class MapService {

  constructor() { }

  createImageLayer(uri: string, projection: Projection, extent: [number, number, number, number]): ImageLayer<ImageSource> {
    return new ImageLayer({
      source: new ImageSource({
        url: uri,
        projection: projection,
        imageExtent: extent
      })
    });
  }

  // Add more utility functions as needed to support vector layers, styles, etc.
}
