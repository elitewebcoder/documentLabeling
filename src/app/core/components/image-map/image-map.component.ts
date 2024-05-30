import { Component, OnInit, Input, ViewChild, ElementRef, OnDestroy, HostListener, SimpleChanges, OnChanges } from '@angular/core';
import { Map, View, Feature, Overlay, Collection, MapBrowserEvent } from 'ol';
import { Vector as VectorLayer, Tile as TileLayer } from 'ol/layer';
import { Vector as VectorSource, OSM } from 'ol/source';
import { defaults as defaultInteractions, Draw, Modify, Snap, Interaction, DragBox, DragPan } from 'ol/interaction';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import Projection from 'ol/proj/Projection';
import { Extent, getCenter } from 'ol/extent';
import { DrawEvent } from 'ol/interaction/Draw';
import { Polygon } from 'ol/geom';
import { isEqual } from 'lodash';

import { MapService } from '../../../services/map.service';
import { LabelUXService } from 'src/app/services/label-ux.service';
import { CustomModelService } from 'src/app/services/custom-model.service';
import { Label, LabelType, LabelValueCandidate, Labels } from 'src/app/models/customModels';
import {
  convertToImageMapCoordinates,
  createRegionIdFromPolygon,
  debounce,
  degreeToRadians,
  getBoundingBoxFromFeatureId,
  makeImageLayer,
  makeImageSource,
  makeLayerFilter,
  makeVectorLayer,
} from 'src/app/utils';
import { FeatureCategory, IDocument, IRegion, VisibleAnalyzedElementEnum, supportedFieldTypesByCategory } from 'src/app/types/customModelTypes';
import {
  CHECKBOX_VECTOR_LAYER_NAME,
  DRAWN_REGION_LABEL_VECTOR_LAYER_NAME,
  DRAWN_REGION_VECTOR_LAYER_NAME,
  FIELD_PROPERTY,
  HIGHLIGHTED_PROPERTY,
  IMAGE_LAYER_NAME,
  KeyEventCode,
  LABEL_VECTOR_LAYER_NAME,
  POD_VECTOR_LAYER_NAME,
  SELECTED_PROPERTY,
  TABLE_BORDER_VECTOR_LAYER_NAME,
  TABLE_ICON_BORDER_VECTOR_LAYER_NAME,
  TABLE_ICON_VECTOR_LAYER_NAME,
  TEXT_VECTOR_LAYER_NAME,
  inlineLabelMenuHeight,
} from 'src/app/consts/constants';
import { getColorByFieldKey, getFieldKeyFromLabel } from 'src/app/utils/customModel';
import { AnalyzeResultAdapterFactory } from 'src/app/adapters/analyzeResultAdapter';
import { Coordinate } from 'ol/coordinate';
import GeometryType from 'ol/geom/GeometryType';
import { checkboxStyler, customLabelStyler, defaultStyler, drawRegionStyler, modifyStyler, tableBorderFeatureStyler, tableIconStyler } from 'src/app/utils/styler';
import { never, shiftKeyOnly } from 'ol/events/condition';
import PointerInteraction from 'ol/interaction/Pointer';

@Component({
  selector: 'app-image-map',
  templateUrl: './image-map.component.html',
  styleUrls: ['./image-map.component.scss']
})
export class ImageMapComponent implements OnInit, OnDestroy, OnChanges {
  @Input() imageUri: string = '';
  @Input() imageWidth: number = 0;
  @Input() imageHeight: number = 0;
  @Input() imageAngle: number = 0;
  @ViewChild('mapElement', { static: true }) mapElement: ElementRef | undefined;

  private map!: Map;
  private imageLayer!: any;
  private textLayer!: any;
  private podLayer!: any;
  private tableBorderLayer!: any;
  private tableIconLayer!: any;
  private tableIconBorderLayer!: any;
  private checkboxLayer!: any;
  private labelLayer!: any;
  private drawnRegionLayer!: any;
  private drawnLabelLayer!: any;

  private dragPan!: DragPan;
  private draw!: Draw;
  private dragBox!: DragBox;
  private modify!: Modify;
  private snap!: Snap;

  private drawnFeatures: Collection<Feature> = new Collection([], { unique: true });

  private mousePositionX: number = 0;
  private mousePositionY: number = 0;
  private hoveredDrawRegionFeature: Feature | null = null;

  private readonly menuShiftX: number = -125;
  private readonly menuDownShiftY: number = 10;
  private readonly menuUpShiftY: number = -30;
  private readonly menuBottomOffset: number = 20;

  private readonly deleteIconBottomOffset: number = 20;
  private readonly deleteIconLeftOffset: number = -4;

  // For Custom Model
  selectedFeatures: Feature[] = [];
  ignoreOpenPopupFirstClick: boolean = false;
  isDebouncing: boolean = false;
  isHoveringOnDeleteRegionIcon: boolean = false;
  deleteDrawnRegionDebouncer: ReturnType<typeof setTimeout> = setTimeout(() => {});

  groupSelectMode = false;
  isPointerOnImage = false;
  isDrawing = false;
  isVertexDragging = false;
  isSnapped = false;

  // Inline Label Menu
  showInlineLabelMenu = false;
  menuPositionTop = 0;
  menuPositionLeft = 0;
  enabledTypesForInlineMenu = [];

  // Region Icon
  showDeleteRegionIcon = false;
  currentRegionPositionTop = 0;
  currentRegionPositionLeft = 0;

  currentDocument: IDocument | null = null;
  labels?: Labels;
  colorForFields: any = [];

  hoveredLabelName = "";

  initializedMap = false;

  // OCR
  visibleAnalyzedElement: any;
  hoveredBoundingBoxIds: string[] = [];
  documentSelectIndex: number = 0;

  predictions: any;

  // Image Map
  imageExtent = [0, 0, this.imageWidth, this.imageHeight];
  modifyStartFeatureCoordinates: any = {};
  isSwiping: boolean = false;

  isInitEditorMap = true;
  drawRegionMode = false;

  private imageLayerFilter = makeLayerFilter(IMAGE_LAYER_NAME);
  private textLayerFilter = makeLayerFilter(TEXT_VECTOR_LAYER_NAME);
  private podLayerFilter = makeLayerFilter(POD_VECTOR_LAYER_NAME);
  private checkboxLayerFilter = makeLayerFilter(CHECKBOX_VECTOR_LAYER_NAME);
  private tableIconVectorLayerFilter = makeLayerFilter(TABLE_ICON_VECTOR_LAYER_NAME);
  private tableBorderVectorLayerFilter = makeLayerFilter(TABLE_BORDER_VECTOR_LAYER_NAME);
  private labelVectorLayerFilter = makeLayerFilter(LABEL_VECTOR_LAYER_NAME);
  private drawnLabelVectorLayerFilter = makeLayerFilter(DRAWN_REGION_LABEL_VECTOR_LAYER_NAME);
  private drawnRegionVectorLayerFilter = makeLayerFilter(DRAWN_REGION_VECTOR_LAYER_NAME);

  private hasFeatureSelectedByPointer: boolean = false;

  constructor(
    private mapService: MapService,
    readonly uxService: LabelUXService,
    readonly customModelService: CustomModelService
  ) {
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerMoveOnFeatures = this.handlePointerMoveOnFeatures.bind(this);
    this.handleDoubleClick = this.handleDoubleClick.bind(this);
  }

  ngOnInit(): void {
    // TODO: editor, layout, predict
    this.initEditorMap();

    this.uxService.documentsState$.subscribe(({ currentDocument }) => {
      if (currentDocument && !isEqual(currentDocument, this.currentDocument)) {
        this.currentDocument = currentDocument;
        this.updateDrawLabels(this.labels);
        this.clearLayout();

        if (
          this.predictions[currentDocument.name] &&
          this.predictions[currentDocument.name].analyzeResponse.analyzeResult
        ) {
            this.drawLayout(currentDocument.currentPage);
        }
      }
    });
    this.uxService.predictionsState$.subscribe(({ predictions }) => {
      if (predictions && !isEqual(predictions, this.predictions)) {
        this.predictions = predictions;

        if (this.currentDocument) {
          if (
            predictions[this.currentDocument.name] &&
            predictions[this.currentDocument.name].analyzeResponse.analyzeResult
          ) {
              this.clearLayout();
              this.drawLayout(this.currentDocument.currentPage);
          }
        }
      }
    });
    this.uxService.canvasState$.subscribe(({
      hoveredLabelName,
      visibleAnalyzedElement,
      hoveredBoundingBoxIds,
      documentSelectIndex,
    }) => {
      if (hoveredLabelName !== this.hoveredLabelName) {
        this.updateHoveredFeature(this.hoveredLabelName, hoveredLabelName);
        this.hoveredLabelName = hoveredLabelName;
      }

      if (documentSelectIndex !== this.documentSelectIndex) {
        this.documentSelectIndex = documentSelectIndex;
      }
      if (!isEqual(visibleAnalyzedElement, this.visibleAnalyzedElement)) {
        this.visibleAnalyzedElement = visibleAnalyzedElement;

        if (
          this.currentDocument &&
          this.predictions &&
          this.predictions[this.currentDocument.name] &&
          this.predictions[this.currentDocument.name].analyzeResponse.analyzeResult
        ) {
            this.clearLayout();
            this.drawLayout(this.currentDocument.currentPage);
        }
      }
      if (!isEqual(hoveredBoundingBoxIds, this.hoveredBoundingBoxIds)) {
        this.hoveredBoundingBoxIds = hoveredBoundingBoxIds;
      }
    });
    this.customModelService.customModelState$.subscribe(({ labels, colorForFields }) => {
      if (!isEqual(labels, this.labels)) {
        this.labels = labels;
        if (this.currentDocument) {
          this.updateDrawLabels(labels);
        }
      }
      if (!isEqual(colorForFields, this.colorForFields)) {
        this.colorForFields = colorForFields;
        if (this.currentDocument) {
          this.updateDrawLabels(this.labels);
        }
      }
    });
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.setTarget(undefined);
      this.initializedMap = false;
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes["imageWidth"] || changes["imageHeight"]) {
      this.imageExtent = [0, 0, this.imageWidth, this.imageHeight];
    }
    if (changes["imageUri"].currentValue !== changes["imageUri"].previousValue || changes["imageAngle"]) {
      console.log("------ image url ----", this.imageUri);
      this.imageExtent = [0, 0, this.imageWidth, this.imageHeight];
      this.setImage(this.imageUri, this.imageExtent);
      this.updateSize();
    }
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyDown = (keyEvent: any) => {
    if (!this.initializedMap) {
      return;
    }
    switch (keyEvent.key) {
      case KeyEventCode.Shift:
        this.groupSelectMode = true;
        break;

      case KeyEventCode.Escape:
        if (this.isDrawing) {
          this.cancelDrawing();
        } else if (this.isVertexDragging) {
          this.cancelModify();
        }
        break;
    }
  }

  @HostListener('document:keyup', ['$event'])
  handleKeyUp = (keyEvent: any) => {
    if (!this.initializedMap) {
      return;
    }

    if (keyEvent.key === KeyEventCode.Shift) {
      this.groupSelectMode = false;
    }
  }

  handleDrawRegion() {
    // Toggle draw region mode.
    this.drawRegionMode = !this.drawRegionMode;
    if (!this.isInitEditorMap) {
      return;
    }
    if (this.drawRegionMode) {
      this.removeInteraction(this.dragBox);
      this.initializeDraw();
      this.addInteraction(this.draw);
      this.initializeModify();
      this.addInteraction(this.modify);
      this.addInteraction(this.snap);
      if (this.isPointerOnImage) {
        if (this.isSnapped) {
          this.removeInteraction(this.draw);
        }
        if (this.isDrawing) {
          this.removeInteraction(this.snap);
        }
      } else {
        this.removeInteraction(this.draw);
        this.removeInteraction(this.modify);
        this.removeInteraction(this.snap);
      }
    } else {
      this.removeInteraction(this.draw);
      this.addInteraction(this.dragBox);
      this.initializeModify();
      this.addInteraction(this.modify);
      this.addInteraction(this.snap);
      if (!this.isPointerOnImage) {
        this.removeInteraction(this.modify);
        this.removeInteraction(this.dragBox);
      }
    }
  }

  initEditorMap() {
    const projection = this.createProjection(this.imageExtent);
    const layers = this.initializeEditorLayers(projection);
    this.initializeMap(projection, layers);

    this.map.on("pointerdown" as any, this.handlePointerDown);
    this.map.on("pointermove", this.handlePointerMove);
    this.map.on("pointermove", this.handlePointerMoveOnFeatures);
    this.map.on("pointerup" as any, this.handlePointerUp);
    this.map.on("dblclick", this.handleDoubleClick);

    this.initializeDefaultSelectionMode();
    this.initializeDragPan();

    setTimeout(() => {
      this.initializedMap = true;
      this.removeInteraction(this.draw);
      this.addInteraction(this.dragBox);
      this.initializeModify();
      this.addInteraction(this.modify);
      this.addInteraction(this.snap);
    }, 1500);
  }
  initLayoutMap() {
    const projection = this.createProjection(this.imageExtent);
    const layers = this.initializeEditorLayers(projection);
    this.initializeMap(projection, layers);

    this.map.on("pointerdown" as any, this.handlePointerDown);
    this.map.on("pointermove", this.handlePointerMove);
    this.map.on("pointermove", this.handlePointerMoveOnFeatures);
    this.map.on("pointerup" as any, this.handlePointerUp);
    this.map.on("dblclick", this.handleDoubleClick);

    this.initializeDefaultSelectionMode();
    this.initializeDragPan();

    setTimeout(() => {
      this.initializedMap = true;
    }, 1500);
  }
  initPredictMap() {
    const projection = this.createProjection(this.imageExtent);
    const layers = this.initializePredictLayers(projection);
    this.initializeMap(projection, layers);
    this.initializeDragPan();

    setTimeout(() => {
      this.initializedMap = true;
    }, 1500);
  }

  resetAllLayerVisibility() {
    this.toggleCheckboxFeatureVisibility(true);
    this.toggleLabelFeatureVisibility(true);
    this.toggleTableFeatureVisibility(true);
    this.toggleTextFeatureVisibility(true);
    this.togglePodFeatureVisibility(true);
    this.toggleDrawnRegionsFeatureVisibility(true);
  }

  /**
   * Hide/Display table features
   */
  toggleTableFeatureVisibility(visible: boolean = false) {
    this.tableBorderLayer.setVisible(visible || !this.tableBorderLayer.getVisible());
    this.tableIconLayer.setVisible(visible || !this.tableIconLayer.getVisible());
    this.tableIconBorderLayer.setVisible(visible || !this.tableIconBorderLayer.getVisible());
  }

  toggleLabelFeatureVisibility(visible: boolean = false) {
    this.labelLayer.setVisible(visible || !this.labelLayer.getVisible());
    let drawnLabelLayerVisibility = this.drawnLabelLayer.getVisible();
    this.drawnLabelLayer.setVisible(visible || !drawnLabelLayerVisibility);
    drawnLabelLayerVisibility = this.drawnLabelLayer.getVisible();
    const drawnLabelFeatures = this.getAllDrawnLabelFeatures();
    if (!drawnLabelLayerVisibility) {
        drawnLabelFeatures?.forEach((feature: any) => {
            this.removeFromDrawnFeatures(feature);
        });
    } else {
        drawnLabelFeatures?.forEach((feature: any) => {
            this.pushToDrawnFeatures(feature);
        });
    }
  }

  toggleDrawnRegionsFeatureVisibility(visible: boolean = false) {
    let drawnRegionLayerVisibility = this.drawnRegionLayer.getVisible();
    this.drawnRegionLayer.setVisible(visible || !drawnRegionLayerVisibility);
    drawnRegionLayerVisibility = this.drawnRegionLayer.getVisible();
    const drawnRegionFeatures = this.getAllDrawnRegionFeatures();
    if (!drawnRegionLayerVisibility) {
        drawnRegionFeatures?.forEach((feature: any) => {
            this.removeFromDrawnFeatures(feature);
        });
    } else {
        drawnRegionFeatures?.forEach((feature: any) => {
            this.pushToDrawnFeatures(feature);
        });
    }
  }

  /**
   * Hide/Display checkbox features
   */
  toggleCheckboxFeatureVisibility(visible: boolean = false) {
    this.checkboxLayer.setVisible(visible || !this.checkboxLayer.getVisible());
  }

  /**
   * Hide/Display text features
   */
  toggleTextFeatureVisibility(visible: boolean = false) {
    this.textLayer.setVisible(visible || !this.textLayer.getVisible());
  }

  togglePodFeatureVisibility(visible: boolean = false) {
    this.podLayer.setVisible(visible || !this.podLayer.getVisible());
  }

  addFeature(feature: Feature) {
    this.textLayer.getSource().addFeature(feature);
  }

  addCheckboxFeature(feature: Feature) {
    this.checkboxLayer.getSource().addFeature(feature);
  }

  addPodFeature(feature: Feature) {
    this.podLayer.getSource().addFeature(feature);
  }

  addLabelFeature(feature: Feature) {
    this.labelLayer.getSource().addFeature(feature);
  }

  addDrawnLabelFeature(feature: Feature) {
    this.drawnLabelLayer.getSource().addFeature(feature);
  }

  addTableBorderFeature(feature: Feature) {
    this.tableBorderLayer.getSource().addFeature(feature);
  }

  addTableIconFeature(feature: Feature) {
    this.tableIconLayer.getSource().addFeature(feature);
  }

  addTableIconBorderFeature(feature: Feature) {
    this.tableIconBorderLayer.getSource().addFeature(feature);
  }

  /**
     * Add features to the map
     */
  addFeatures(features: Feature[]) {
    this.textLayer.getSource().addFeatures(features);
  }

  addCheckboxFeatures(features: Feature[]) {
    this.checkboxLayer.getSource().addFeatures(features);
  }

  addPodFeatures(features: Feature[]) {
    this.podLayer.getSource().addFeatures(features);
  }

  addLabelFeatures(features: Feature[]) {
    this.labelLayer.getSource().addFeatures(features);
  }

  addDrawnLabelFeatures(features: Feature[]) {
    this.drawnLabelLayer.getSource().addFeatures(features);
  }

  addTableBorderFeatures(features: Feature[]) {
    this.tableBorderLayer.getSource().addFeatures(features);
  }

  addTableIconFeatures(features: Feature[]) {
    this.tableIconLayer.getSource().addFeatures(features);
  }

  addTableIconBorderFeatures(features: Feature[]) {
    this.tableIconBorderLayer.getSource().addFeatures(features);
  }

  addDrawnRegionFeatures(features: Feature[]) {
    this.drawnRegionLayer.getSource().addFeatures(features);
  }

  /**
   * Add interaction to the map
   */
  addInteraction(interaction: Interaction) {
    if (
      undefined ===
      this.map
        .getInteractions()
        .getArray()
        .find((existingInteraction) => {
          return interaction.constructor === existingInteraction.constructor;
        })
    ) {
      this.map.addInteraction(interaction);
    }
  }

  /**
   * Get all features from the map
   */
  getAllFeatures() {
    return this.textLayer.getSource().getFeatures();
  }

  getAllCheckboxFeatures() {
    return this.checkboxLayer.getSource().getFeatures();
  };

  getAllLabelFeatures() {
    return this.labelLayer.getSource().getFeatures();
  };

  getAllPodFeatures() {
    return this.podLayer.getSource().getFeatures();
  };

  getAllDrawnLabelFeatures() {
    return this.drawnLabelLayer.getSource().getFeatures();
  };

  getAllDrawnRegionFeatures() {
    return this.drawnRegionLayer.getSource().getFeatures();
  };

  getFeatureByID(featureID: any) {
    return this.textLayer.getSource().getFeatureById(featureID);
  };

  getCheckboxFeatureByID(featureID: any) {
    return this.checkboxLayer.getSource().getFeatureById(featureID);
  };

  getTableBorderFeatureByID (featureID: any) {
    return this.tableBorderLayer.getSource().getFeatureById(featureID);
  };

  getTableIconFeatureByID(featureID: any) {
    return this.tableIconLayer.getSource().getFeatureById(featureID);
  };

  getTableIconBorderFeatureByID(featureID: any) {
    return this.tableIconBorderLayer.getSource().getFeatureById(featureID);
  };

  getDrawnRegionFeatureByID(featureID: any) {
    return this.drawnRegionLayer.getSource().getFeatureById(featureID);
  }

  getPodFeatureByID(featureID: any) {
    return this.podLayer.getSource().getFeatureById(featureID);
  }

  getLabelFeatureByID(featureID: any) {
    return this.labelLayer.getSource().getFeatureById(featureID);
  }

  getOcrContentFeatureByID() {
    return this.podLayer.getSource().getFeaturesById();
  }

  getDrawnLabelFeatureByID(featureID: any) {
    return this.drawnLabelLayer.getSource().getFeatureById(featureID);
  }

  /**
   * Remove specific feature object from the map
   */
  removeFeature(feature: Feature) {
    if (feature && this.getFeatureByID(feature.getId())) {
      this.textLayer.getSource().removeFeature(feature);
    }
  }

  removeCheckboxFeature(feature: Feature) {
    if (feature && this.getCheckboxFeatureByID(feature.getId())) {
      this.checkboxLayer.getSource().removeFeature(feature);
    }
  }

  removeLabelFeature(feature: Feature) {
    if (feature && this.getLabelFeatureByID(feature.getId())) {
      this.labelLayer.getSource().removeFeature(feature);
    }
  }

  removeDrawnLabelFeature(feature: Feature) {
    if (feature && this.getDrawnLabelFeatureByID(feature.getId())) {
      this.drawnLabelLayer.getSource().removeFeature(feature);
    }
  }

  removeDrawnRegionFeature(feature: Feature) {
    if (feature && this.getDrawnRegionFeatureByID(feature.getId())) {
      this.drawnRegionLayer.getSource().removeFeature(feature);
    }
  }

  /**
   * Remove all features from the map
   */
  removeAllFeatures() {
    // TODO: after integrate table wrapper
    // if (handleTableToolTipChange) {
    //   handleTableToolTipChange("none", 0, 0, 0, 0, 0, 0, null);
    // }
    this.textLayer?.getSource().clear();
    this.tableBorderLayer?.getSource().clear();
    this.tableIconLayer?.getSource().clear();
    this.tableIconBorderLayer?.getSource().clear();
    this.checkboxLayer?.getSource().clear();
    this.podLayer?.getSource().clear();
    this.labelLayer?.getSource().clear();
    if (this.isInitEditorMap) {
      this.clearDrawnRegions();
    }
  }

  clearDrawnRegions() {
    this.drawnRegionLayer?.getSource().clear();
    this.drawnLabelLayer?.getSource().clear();

    this.drawnFeatures = new Collection([], { unique: true });

    this.drawnRegionLayer.getSource().on("addfeature", (evt: any) => {
      this.pushToDrawnFeatures(evt.feature);
    });
    this.drawnRegionLayer.getSource().on("removefeature", (evt: any) => {
      this.removeFromDrawnFeatures(evt.feature);
    });
    this.drawnLabelLayer.getSource().on("addfeature", (evt: any) => {
      this.pushToDrawnFeatures(evt.feature);
    });
    this.drawnLabelLayer.getSource().on("removefeature", (evt: any) => {
      this.removeFromDrawnFeatures(evt.feature);
    });

    this.removeInteraction(this.snap);
    this.initializeSnap();
    this.addInteraction(this.snap);
    this.removeInteraction(this.modify);
    this.initializeModify();
    this.addInteraction(this.modify);
  }

  removeAllTextFeatures() {
    this.textLayer.getSource().clear();
  }

  removeAllCheckboxFeatures() {
    this.checkboxLayer.getSource().clear();
  }

  removeAllPodFeatures() {
    this.podLayer.getSource().clear();
  }

  removeAllLabelFeatures() {
    this.labelLayer.getSource().clear();
  }

  removeAllTableBorderFeatures() {
    this.tableBorderLayer.getSource().clear();
  }

  removeAllTableIconFeatures() {
    this.tableIconLayer.getSource().clear();
  }

  removeAllTableIconBorderFeatures() {
    this.tableIconBorderLayer.getSource().clear();
  }

  removeAllDrawnLabelFeatures() {
    this.getAllDrawnLabelFeatures().forEach((feature: any) => {
      this.removeFromDrawnFeatures(feature);
    });
    this.drawnLabelLayer?.getSource().clear();
  }

  removeAllDrawnRegionFeature() {
    this.drawnRegionLayer.getSource().clear();
  }

  /**
   * Remove interaction from the map
   */
  removeInteraction(interaction: Interaction) {
    const existingInteraction = this.map
      .getInteractions()
      .getArray()
      .find((existingInteraction) => {
        return interaction.constructor === existingInteraction.constructor;
      });

    if (existingInteraction !== undefined) {
      this.map.removeInteraction(existingInteraction);
    }
  }

  updateSize() {
    if (this.map) {
      this.map.updateSize();
    }
  }

  /**
   * Get the image extent [minX, minY, maxX, maxY]
   */
  getImageExtent() {
    return this.imageExtent;
  }

  /**
   * Get features at specific extent
   */
  getFeaturesInExtent(extent: Extent): Feature[] {
    const features: Feature[] = [];
    this.textLayer.getSource().forEachFeatureInExtent(extent, (feature: any) => {
      features.push(feature);
    });
    return features;
  }

  getCoordinatePixelPosition(coordinate?: Coordinate) {
    if (!coordinate) {
      return [0, 0];
    }
    return this.map.getPixelFromCoordinate(coordinate);
  }

  zoomIn() {
    this.map.getView().setZoom((this.map?.getView().getZoom() || 0) + 0.3);
  }

  zoomOut() {
    this.map.getView().setZoom((this.map?.getView().getZoom() || 0) - 0.3);
  }

  getZoom() {
    return this.map?.getView().getZoom();
  }

  resetZoom() {
    this.map.getView().setZoom(0);
  }

  resetCenter() {
    this.map.getView().setCenter(getCenter(this.imageExtent));
  }

  setImage(imageUri: string, imageExtent: Extent) {
    const projection = this.createProjection(imageExtent);
    if (this.imageLayer) {
      this.imageLayer.setSource(makeImageSource(imageUri, projection, imageExtent));
      const mapView = this.createMapView(projection, imageExtent);
      this.map.setView(mapView);
    }
  }

  createProjection(imageExtent: Extent) {
    return new Projection({
      code: "xkcd-image",
      units: "pixels",
      extent: imageExtent,
    });
  }

  createMapView(projection: Projection, imageExtent: Extent) {
    const minZoom = this.getMinimumZoom();
    const rotation = this.imageAngle ? degreeToRadians((this.imageAngle + 360) % 360) : 0;

    return new View({
      projection,
      center: getCenter(imageExtent),
      rotation,
      zoom: minZoom,
      minZoom,
    });
  }

  getMinimumZoom() {
    // In openlayers, the image will be projected into 256x256 pixels,
    // and image will be 2x larger at each zoom level.
    // https://openlayers.org/en/latest/examples/min-zoom.html
    const containerAspectRatio = this.mapElement ? this.mapElement.nativeElement.clientHeight / this.mapElement.nativeElement.clientWidth : 1;
    const imageAspectRatio = this.imageHeight / this.imageWidth;
    if (imageAspectRatio > containerAspectRatio) {
      // Fit to width
      return Math.LOG2E * Math.log(this.mapElement!.nativeElement.clientHeight / 256);
    } else {
      // Fit to height
      return Math.LOG2E * Math.log(this.mapElement!.nativeElement.clientWidth / 256);
    }
  }

  handlePointerDown(event: MapBrowserEvent<UIEvent>) {
    const enableFeatureSelection = !this.drawRegionMode && !this.groupSelectMode
    if (this.isSnapped) {
        this.handleVertexDragging(true);
        return;
    }

    if (!enableFeatureSelection) {
        return;
    }

    if (!this.map) {
      return;
    }

    const eventPixel = this.map.getEventPixel(event.originalEvent);

    const filter = this.getLayerFilterAtPixel(eventPixel);

    const isPixelOnFeature = !!filter && filter.layerfilter !== this.podLayerFilter;
    if (isPixelOnFeature && !this.isSnapped) {
        this.setDragPanInteraction(false);
    }

    if (filter) {
        this.map.forEachFeatureAtPixel(
            eventPixel,
            (feature: any) => {
              this.handleFeatureSelect(feature, true, filter.category);
            },
            filter.layerfilter
        );
    }

    this.hasFeatureSelectedByPointer = isPixelOnFeature;
  }

  handleFeatureDoubleClick(..._args: any[]) {
    /** noop */
  }

  handleDoubleClick(event: MapBrowserEvent<UIEvent>) {
    if (!this.map) {
      return;
    }

    const eventPixel = this.map.getEventPixel(event.originalEvent);

    const filter = this.getLayerFilterAtPixel(eventPixel);
    if (filter) {
        this.map.forEachFeatureAtPixel(
            eventPixel,
            (feature: any) => {
                this.handleFeatureDoubleClick(feature, true, filter.category);
            },
            filter.layerfilter
        );
    }
  }

  getLayerFilterAtPixel(eventPixel: any) {
    const isPointerOnLabelledFeature = this.map.hasFeatureAtPixel(eventPixel, this.labelVectorLayerFilter);
    if (isPointerOnLabelledFeature) {
      return {
        layerfilter: this.labelVectorLayerFilter,
        category: FeatureCategory.Label,
      };
    }
    const isPointerOnCheckboxFeature = this.map.hasFeatureAtPixel(eventPixel, this.checkboxLayerFilter);
    if (isPointerOnCheckboxFeature) {
      return {
        layerfilter: this.checkboxLayerFilter,
        category: FeatureCategory.Checkbox,
      };
    }
    const isPointerOnTextFeature = this.map.hasFeatureAtPixel(eventPixel, this.textLayerFilter);
    if (isPointerOnTextFeature) {
      return {
        layerfilter: this.textLayerFilter,
        category: FeatureCategory.Text,
      };
    }
    const isPointerOnPodFeature = this.map.hasFeatureAtPixel(eventPixel, this.podLayerFilter);
    if (isPointerOnPodFeature) {
      return {
        layerfilter: this.podLayerFilter,
        category: FeatureCategory.Label,
      };
    }
    const isPointerOnDrawnRegionFeature = this.map.hasFeatureAtPixel(eventPixel, this.drawnRegionVectorLayerFilter);
    if (isPointerOnDrawnRegionFeature) {
      return {
        layerfilter: this.drawnRegionVectorLayerFilter,
        category: FeatureCategory.DrawnRegion,
      };
    }
    const isPointerOnDrawnLabelFeature = this.map.hasFeatureAtPixel(eventPixel, this.drawnLabelVectorLayerFilter);
    if (isPointerOnDrawnLabelFeature) {
      return {
        layerfilter: this.drawnLabelVectorLayerFilter,
        category: FeatureCategory.DrawnRegion,
      };
    }

    return null;
  }

  // TODO
  handleTableToolTipChange(..._args: any[]) {}

  onLabelFeatureHovered() {}

  handlePointerMoveOnFeatures(event: MapBrowserEvent<UIEvent>) {
    if (!this.map) {
      return;
    }

    const eventPixel = this.map.getEventPixel(event.originalEvent);

    // handle table tooltip
    // const isPointerOnTableIconFeature = this.map.hasFeatureAtPixel(eventPixel, this.tableIconVectorLayerFilter);

    // if (isPointerOnTableIconFeature) {
    //     const features = this.map.getFeaturesAtPixel(eventPixel, this.tableIconVectorLayerFilter);
    //     if (features.length > 0) {
    //         const feature = features[0];
    //         if (feature && hoveringFeature !== feature.get("id")) {
    //             const geometry = feature.getGeometry() as Point;
    //             const coordinates = geometry.getCoordinates();
    //             const topRight = this.map.getPixelFromCoordinate(coordinates);
    //             const xThreshold = 20;
    //             const yThreshold = 20;
    //             const top = topRight[1];
    //             const left = topRight[0] - xThreshold;
    //             if (coordinates && coordinates.length > 0) {
    //                 this.handleTableToolTipChange(
    //                     "block",
    //                     xThreshold,
    //                     yThreshold,
    //                     top,
    //                     left,
    //                     feature.get("rows"),
    //                     feature.get("columns"),
    //                     feature.get("id")
    //                 );
    //             }
    //         }
    //     }
    // } else {
    //   if (hoveringFeature !== null) {
    //     this.handleTableToolTipChange("none", 0, 0, 0, 0, 0, 0, null);
    //   }
    // }

    // if (onLabelFeatureHovered) {
    //     const isPointerOnLabelledFeature = this.map.hasFeatureAtPixel(eventPixel, this.labelVectorLayerFilter);
    //     const isPointerInTableFeature = this.map.hasFeatureAtPixel(eventPixel, this.tableBorderVectorLayerFilter);
    //     if (isPointerOnLabelledFeature) {
    //         const features = this.map.getFeaturesAtPixel(eventPixel, this.labelVectorLayerFilter);
    //         onLabelFeatureHovered(event.originalEvent, features);
    //         if (handleTableToolTipChange && isPointerInTableFeature) {
    //             const tableBorderFeatures = this.map.getFeaturesAtPixel(
    //                 eventPixel,
    //                 this.tableBorderVectorLayerFilter
    //             );
    //             handleTableToolTipChange("none", 0, 0, 0, 0, 0, 0, tableBorderFeatures[0].get("id"));
    //         }
    //     } else {
    //         onLabelFeatureHovered(event.originalEvent, []);
    //     }
    // }

    // Currently not used
    // if (onOcrFeatureHovered) {
    //     const isPointerOnTextFeature = this.map.hasFeatureAtPixel(eventPixel, this.textLayerFilter);
    //     const isPointerOnCheckboxFeature = this.map.hasFeatureAtPixel(eventPixel, this.checkboxLayer);
    //     if (isPointerOnTextFeature) {
    //         const features = this.map.getFeaturesAtPixel(eventPixel, this.textLayerFilter);
    //         onOcrFeatureHovered(event.originalEvent, features);
    //     } else if (isPointerOnCheckboxFeature) {
    //         const features = this.map.getFeaturesAtPixel(eventPixel, this.checkboxLayerFilter);
    //         onOcrFeatureHovered(event.originalEvent, features);
    //     } else {
    //         onOcrFeatureHovered(event.originalEvent, []);
    //     }
    // }

    // if (onPodFeatureHovered) {
    //     const isPointerOnPodFeature = this.map.hasFeatureAtPixel(eventPixel, this.podLayerFilter);
    //     if (isPointerOnPodFeature) {
    //         const features = this.map.getFeaturesAtPixel(eventPixel, this.podLayerFilter);
    //         onPodFeatureHovered(event.originalEvent, features);
    //     } else {
    //         onPodFeatureHovered(event.originalEvent, []);
    //     }
    // }

    const isPointerOnDrawRegionFeature = this.map.hasFeatureAtPixel(
      eventPixel,
      this.drawnRegionVectorLayerFilter
    );
    if (isPointerOnDrawRegionFeature) {
        const features = this.map.getFeaturesAtPixel(eventPixel, this.drawnRegionVectorLayerFilter);
        this.handleDrawnRegionFeatureHovered(event.originalEvent, features);
    } else {
        this.handleDrawnRegionFeatureHovered(event.originalEvent, []);
    }
  }

  handlePointerMove = (event: MapBrowserEvent<UIEvent>) => {
    if (this.shouldIgnorePointerMove) {
      return;
    }

    // disable vertical scrolling for iOS Safari
    event.preventDefault();

    if (!this.map) {
      return;
    }

    const eventPixel = this.map.getEventPixel(event.originalEvent);
    this.map.forEachFeatureAtPixel(
      eventPixel,
      (feature: any) => {
        this.handleFeatureSelect(feature, false /*isTaggle*/, FeatureCategory.Text);
        this.hasFeatureSelectedByPointer = true;
      },
      this.textLayerFilter
    );
  }

  handlePointerUp() {
    const enableFeatureSelection = !this.drawRegionMode && !this.groupSelectMode;
    if (this.isDrawing) {
      this.handleDrawing(false);
      return;
    }

    if (this.isVertexDragging) {
      this.handleVertexDragging(false);
      return;
    }

    if (!enableFeatureSelection) {
      return;
    }

    this.setDragPanInteraction(true);
    this.removeInteraction(this.modify);
    this.initializeModify();
    this.addInteraction(this.modify);

    if (this.hasFeatureSelectedByPointer) {
      this.handleFinishFeatureSelect();
    }
  }

  setDragPanInteraction(dragPanEnabled: boolean) {
    if (dragPanEnabled) {
      this.addInteraction(this.dragPan);
      this.setSwiping(false);
    } else {
      this.removeInteraction(this.dragPan);
      this.setSwiping(true);
    }
  }

  setSwiping(swiping: boolean) {
    this.isSwiping = swiping;
  }

  get shouldIgnorePointerMove() {
    const enableFeatureSelection = !this.drawRegionMode && !this.groupSelectMode
    if (!enableFeatureSelection) {
      return true;
    }

    if (!this.isSwiping) {
      return true;
    }

    if (!this.initializedMap) {
      return true;
    }

    return false;
  }

  cancelDrawing() {
    this.removeInteraction(this.draw);
    this.initializeDraw();
    this.addInteraction(this.draw);
  }

  cancelModify() {
    Object.entries(this.modifyStartFeatureCoordinates).forEach((featureCoordinate) => {
      let feature = this.getDrawnRegionFeatureByID(featureCoordinate[0]);
      if (!feature) {
        feature = this.getDrawnLabelFeatureByID(featureCoordinate[0]);
      }
      if ((feature.getGeometry() as any).flatCoordinates.join(",") !== featureCoordinate[1]) {
        const oldFlattenedCoordinates = (featureCoordinate[1] as string).split(",").map(parseFloat);
        const oldCoordinates: any[] = [];
        for (let i = 0; i < oldFlattenedCoordinates.length; i += 2) {
          oldCoordinates.push([oldFlattenedCoordinates[i], oldFlattenedCoordinates[i + 1]]);
        }
        (feature.getGeometry() as Polygon).setCoordinates([oldCoordinates]);
      }
    });
    this.modifyStartFeatureCoordinates = {};
    this.removeInteraction(this.modify);
    this.initializeModify();
    this.addInteraction(this.modify);

    this.handleSnapped(false);
  }

  initializeDefaultSelectionMode() {
    this.initializeSnapCheck();
    this.initializePointerOnImageCheck();
    this.initializeDragBox();
    this.initializeModify();
    this.initializeSnap();
    this.initializeDraw();
    this.addInteraction(this.dragBox);
    this.addInteraction(this.modify);
    this.addInteraction(this.snap);
  }

  initializeDraw() {
    const boundingExtent = (coordinates: any) => {
      const extent = createEmpty();
      coordinates.forEach((coordinate: any) => {
        extentCoordinate(extent, coordinate);
      });
      return extent;
    };

    const createEmpty = () => {
      return [Infinity, Infinity, -Infinity, -Infinity];
    };

    const extentCoordinate = (extent: any, coordinate: any) => {
      if (coordinate[0] < extent[0]) {
        extent[0] = coordinate[0];
      }
      if (coordinate[0] > extent[2]) {
        extent[2] = coordinate[0];
      }
      if (coordinate[1] < extent[1]) {
        extent[1] = coordinate[1];
      }
      if (coordinate[1] > extent[3]) {
        extent[3] = coordinate[1];
      }
    };

    this.draw = new Draw({
      type: GeometryType.CIRCLE,
      source: this.drawnRegionLayer.getSource(),
      style: drawRegionStyler as any,
      geometryFunction: (coordinates, optGeometry) => {
        const extent = boundingExtent(/** @type {LineCoordType} */ coordinates);
        const boxCoordinates = [
          [
            [extent[0], extent[3]],
            [extent[2], extent[3]],
            [extent[2], extent[1]],
            [extent[0], extent[1]],
          ],
        ];
        let geometry = optGeometry;
        if (geometry) {
          geometry.setCoordinates(boxCoordinates);
        } else {
          geometry = new Polygon(boxCoordinates);
        }
        return geometry;
      },
      stopClick: true,
      freehand: true,
    });

    this.draw.on("drawstart", (_drawEvent) => {
      this.handleDrawing(true);
    });

    this.draw.on("drawend", (drawEvent: DrawEvent) => {
      this.handleRegionDrawn(drawEvent.feature);
    });
  }

  initializeModify() {
    this.modify = new Modify({
      deleteCondition: never,
      insertVertexCondition: never,
      style: modifyStyler,
      features: this.drawnFeatures,
    });

    (this.modify as any).handleUpEvent_old = (this.modify as any).handleUpEvent;
    (this.modify as any).handleUpEvent = function (evt: any) {
      try {
        this.handleUpEvent_old(evt);
      } catch (ex) {
        // do nothing
      }
    };

    this.modify.on("modifystart", (modifyEvent) => {
      const features = modifyEvent.features.getArray();
      let featureCoordinates: any[] = [];
      features.forEach((feature) => {
        (feature.getGeometry() as Polygon).getCoordinates()[0].forEach((coordinate) => {
          featureCoordinates.push(coordinate[0]);
          featureCoordinates.push(coordinate[1]);
        });
        this.modifyStartFeatureCoordinates[feature.getId()!] = featureCoordinates.join(",");
        featureCoordinates = [];
      });
    });

    this.modify.on("modifyend", (modifyEvent) => {
      const features = modifyEvent.features.getArray();
      this.handleFeatureModify(features);
    });
  }

  initializeSnap() {
    this.snap = new Snap({
      edge: false,
      vertex: true,
      features: this.drawnFeatures,
    });
  }

  initializeDragPan() {
    this.dragPan = new DragPan();
    this.setDragPanInteraction(true);
  }

  handleRegionSelectByGroup(_arg: any) {
    /** nothing */
  }

  initializeDragBox() {
    this.dragBox = new DragBox({
        condition: shiftKeyOnly,
        className: "ol-dragbox-style",
    });

    this.dragBox.on("boxend", () => {
      const featureMap: any = {};
      const extent = this.dragBox.getGeometry().getExtent();
      const regionsToAdd: IRegion[] = [];
      if (this.labelLayer.getVisible()) {
        this.labelLayer.getSource().forEachFeatureInExtent(extent, (feature: any) => {
          this.handleFeatureSelectByGroup(feature); // selectedRegion from this function
          // if (selectedRegion) {
          //   featureMap[feature.get("id")] = true;
          //   // regionsToAdd.push(selectedRegion);
          // }
        });
      }
      if (this.textLayer.getVisible()) {
        this.textLayer.getSource().forEachFeatureInExtent(extent, (feature: any) => {
          this.handleFeatureSelectByGroup(feature); // selectedRegion from this function
          // if (selectedRegion && !Object.prototype.hasOwnProperty.call(featureMap, feature.get("id"))) {
          //     regionsToAdd.push(selectedRegion);
          // }
        });
      }
      if (this.checkboxLayer.getVisible()) {
        this.checkboxLayer.getSource().forEachFeatureInExtent(extent, (feature: any) => {
          this.handleFeatureSelectByGroup(feature); // selectedRegion from this function
          // if (selectedRegion && !Object.prototype.hasOwnProperty.call(featureMap, feature.get("id"))) {
          //   regionsToAdd.push(selectedRegion);
          // }
        });
      }

      if (regionsToAdd.length > 0) {
        this.handleRegionSelectByGroup(regionsToAdd);
      }

      this.handleFinishFeatureSelect();
    });
  }

  initializeSnapCheck() {
    const snapCheck = new Interaction({
      handleEvent: (evt: MapBrowserEvent<UIEvent>) => {
        if (!this.isVertexDragging) {
          this.handleSnapped(this.snap.snapTo(evt.pixel, evt.coordinate, evt.map) !== null && this.isPointerOnImage!);
        }
        return true;
      },
    });
    this.addInteraction(snapCheck);
  }

  initializePointerOnImageCheck() {
    const checkIfPointerOnMap = new PointerInteraction({
      handleEvent: (evt: MapBrowserEvent<UIEvent>) => {
        if (!this.map) {
          return true;
        }
        const eventPixel = this.map.getEventPixel(evt.originalEvent);
        const test = this.map.forEachLayerAtPixel(
          eventPixel,
          () => {
            return true;
          },
          this.imageLayerFilter
        );

        if (!test && this.isPointerOnImage) {
          this.handleIsPointerOnImage(false);
        } else if (!this.isPointerOnImage && Boolean(test)) {
            this.handleIsPointerOnImage(true);
        }
        return true;
      },
    });
    this.addInteraction(checkIfPointerOnMap);
  }

  get mapCursor() {
    if (this.isInitEditorMap) {
      if (this.isVertexDragging) {
        return "grabbing";
      } else if (this.isSnapped) {
        return "grab";
      } else if (this.groupSelectMode || this.drawRegionMode) {
        if (this.isPointerOnImage) {
          return "crosshair";
        } else {
          return "default";
        }
      } else {
        return "default";
      }
    } else {
      return "default";
    }
  }

  getResolutionForZoom(zoom: number) {
    if (this.map && this.map.getView()) {
      return this.map.getView().getResolutionForZoom(zoom);
    } else {
      return null;
    }
  }

  pushToDrawnFeatures(feature: any) {
    const itemAlreadyExists = this.drawnFeatures.getArray().indexOf(feature) !== -1;
    if (!itemAlreadyExists) {
      this.drawnFeatures.push(feature);
    }
  }

  removeFromDrawnFeatures(feature: any) {
    const itemAlreadyExists = this.drawnFeatures.getArray().indexOf(feature) !== -1;
    if (itemAlreadyExists) {
      this.drawnFeatures.remove(feature);
    }
  }

  handlePointerEnterImageMap() {
    this.setDragPanInteraction(true);
  }
  handlePointerLeaveImageMap() {
    if (this.isInitEditorMap) {
      if (this.isDrawing) {
        this.cancelDrawing();
      }
      this.handleIsPointerOnImage(false);
    }
  }

  initializeEditorLayers(projection: Projection) {
    this.initializeImageLayer(projection);
    this.initializeTextLayer();
    this.initializeTableLayers();
    this.initializeCheckboxLayers();
    this.initializePodLayer();
    this.initializeLabelLayer();
    this.initializeDrawnRegionLabelLayer();
    this.initializeDrawnRegionLayer();
    return [
      this.imageLayer,
      this.textLayer,
      this.tableBorderLayer,
      this.tableIconBorderLayer,
      this.tableIconLayer,
      this.checkboxLayer,
      this.podLayer,
      this.drawnRegionLayer,
      this.labelLayer,
      this.drawnLabelLayer,
    ];
  }

  initializePredictLayers(projection: Projection) {
    this.initializeImageLayer(projection);
    this.initializeTextLayer();
    this.initializePodLayer();
    this.initializeLabelLayer();
    return [this.imageLayer, this.textLayer, this.labelLayer];
  }

  initializeImageLayer(projection: Projection) {
    this.imageLayer = makeImageLayer(IMAGE_LAYER_NAME, this.imageUri, projection, this.imageExtent);
  }

  initializeTextLayer() {
    this.textLayer = makeVectorLayer(TEXT_VECTOR_LAYER_NAME, {
      style: defaultStyler,
    });
  }

  initializeTableLayers() {
    this.tableBorderLayer = makeVectorLayer(TABLE_BORDER_VECTOR_LAYER_NAME, {
      style: tableBorderFeatureStyler,
    });

    this.tableIconLayer = makeVectorLayer(TABLE_ICON_VECTOR_LAYER_NAME, {
      style: tableIconStyler,
      updateWhileAnimating: true,
      updateWhileInteracting: true,
    });

    this.tableIconBorderLayer = makeVectorLayer(TABLE_ICON_BORDER_VECTOR_LAYER_NAME, {
      style: undefined,
    });
  }

  initializeCheckboxLayers() {
    this.checkboxLayer = makeVectorLayer(CHECKBOX_VECTOR_LAYER_NAME, {
      style: checkboxStyler,
    });
  }

  initializeDrawnRegionLayer() {
    const source = new VectorSource();
    source.on("addfeature", (evt) => {
      this.pushToDrawnFeatures(evt.feature);
    });

    source.on("removefeature", (evt) => {
      this.removeFromDrawnFeatures(evt.feature);
    });

    this.drawnRegionLayer = makeVectorLayer(DRAWN_REGION_VECTOR_LAYER_NAME, {
      style: drawRegionStyler,
      source,
    });
  }

  initializePodLayer() {
    this.podLayer = makeVectorLayer(POD_VECTOR_LAYER_NAME, {
      style: undefined,
    });
  }

  initializeLabelLayer() {
    this.labelLayer = makeVectorLayer(LABEL_VECTOR_LAYER_NAME, {
      style: customLabelStyler,
    });
  }

  initializeDrawnRegionLabelLayer() {
    const source = new VectorSource();
    source.on("addfeature", (evt) => {
      if (this.drawnLabelLayer.getVisible()) {
        this.pushToDrawnFeatures(evt.feature);
      }
    });
    source.on("removefeature", (evt) => {
      this.removeFromDrawnFeatures(evt.feature);
    });

    this.drawnLabelLayer = makeVectorLayer(DRAWN_REGION_LABEL_VECTOR_LAYER_NAME, {
      style: customLabelStyler,
      source,
    });
  }

  getAnalyzeResult() {
    return this.predictions[this.currentDocument!.name].analyzeResponse.analyzeResult;
  }

  clearLayout() {
    if (this.initializedMap) {
      this.removeAllTextFeatures();
      this.removeAllCheckboxFeatures();
    }
  }
  drawLayout(targetPage: number) {
    const analyzeResultAdapter = AnalyzeResultAdapterFactory.create(this.getAnalyzeResult());
    const documentPage = analyzeResultAdapter.getDocumentPage(targetPage);
    const imageExtent = this.getImageExtent() as Extent;
    const textFeatures: Feature[] = [];
    const lineFeatures: Feature[] = [];
    const selectionMarkFeatures: Feature[] = [];

    if (!documentPage) {
        return;
    }

    const { pageNumber, width, height, words, selectionMarks, lines } = documentPage;
    const ocrExtent: Extent = [0, 0, width, height];

    if (this.visibleAnalyzedElement[VisibleAnalyzedElementEnum.Lines]) {
        const feature = this.createPrebuiltLineFeatures(lines, imageExtent, ocrExtent, pageNumber);
        lineFeatures.push(...feature);
    }

    if (this.visibleAnalyzedElement[VisibleAnalyzedElementEnum.Words]) {
        words.forEach((word) => {
            const { content, polygon } = word;
            textFeatures.push(
                this.createFeature(content, polygon, imageExtent, ocrExtent, pageNumber, FeatureCategory.Text)
            );
        });
    }

    (selectionMarks || []).forEach((selectionMark) => {
        const { state, polygon } = selectionMark;
        selectionMarkFeatures.push(
            this.createFeature(
                state,
                polygon,
                imageExtent,
                ocrExtent,
                pageNumber,
                FeatureCategory.Checkbox,
                selectionMark
            )
        );
    });

    if (textFeatures.length > 0) {
        this.addFeatures(textFeatures);
    }

    if (lineFeatures.length > 0) {
        this.addFeatures(lineFeatures);
    }

    if (selectionMarkFeatures.length > 0) {
        this.addCheckboxFeatures(selectionMarkFeatures);
    }
  }
  createPrebuiltLineFeatures(lines: any, imageExtent: Extent, ocrExtent: Extent, page: number) {
    if (!lines) {
        return [];
    }
    const features: Feature[] = [];
    const canvasSize = {
        width: imageExtent[2] - imageExtent[0],
        height: imageExtent[3] - imageExtent[1],
    };
    const documentSize = {
        width: ocrExtent[2] - ocrExtent[0],
        height: ocrExtent[3] - ocrExtent[1],
    };
    lines.forEach((lineItem: any) => {
        const featureId = createRegionIdFromPolygon(lineItem.polygon, page);
        const coordinates: number[][] = convertToImageMapCoordinates(
            lineItem.polygon,
            canvasSize,
            documentSize
        );
        const feature = new Feature({
            geometry: new Polygon([coordinates]),
            id: featureId,
            [FIELD_PROPERTY]: lineItem,
        });
        feature.setId(featureId);
        features.push(feature);
    });

    return features;
  }
  createFeature(
    text: string,
    polygon: number[],
    imageExtent: Extent,
    ocrExtent: Extent,
    page: number,
    category: FeatureCategory,
    fieldItem?: any
  ) {
    const coordinates: any[] = [];
    const polygonPoints: number[] = [];

    // An array of numbers representing an extent: [minx, miny, maxx, maxy]
    const imageWidth = imageExtent[2] - imageExtent[0];
    const imageHeight = imageExtent[3] - imageExtent[1];
    const ocrWidth = ocrExtent[2] - ocrExtent[0];
    const ocrHeight = ocrExtent[3] - ocrExtent[1];

    for (let i = 0; i < polygon.length; i += 2) {
      coordinates.push([
        Math.round((polygon[i] / ocrWidth) * imageWidth),
        Math.round((1 - polygon[i + 1] / ocrHeight) * imageHeight),
      ]);
      polygonPoints.push(polygon[i] / ocrWidth);
      polygonPoints.push(polygon[i + 1] / ocrHeight);
    }

    const featureId = createRegionIdFromPolygon(polygonPoints, page);
    const feature = new Feature({
      geometry: new Polygon([coordinates]),
      id: featureId,
      text,
      polygon: polygon,
      highlighted: false,
      isOcrProposal: true,
      category,
      [FIELD_PROPERTY]: fieldItem,
    });
    feature.setId(featureId);

    return feature;
  }

  updateDrawLabels(labels: any) {
    if (!this.currentDocument) {
      return;
    }
    this.showInlineLabelMenu = false;
    this.clearSelectedFeatures();
    this.clearLabels();
    this.clearRegions();
    if (labels[this.currentDocument.name]?.length > 0) {
        this.drawLabels(this.currentDocument.currentPage);
    }
  }

  initializeMap(projection: any, layers: any) {
    this.map = new Map({
        controls: [],
        interactions: defaultInteractions({
            shiftDragZoom: false,
            doubleClickZoom: false,
            pinchRotate: false,
        }),
        target: this.mapElement?.nativeElement,
        layers,
        view: this.createMapView(projection, this.imageExtent),
    });
  }

  isFeatureSelected(feature: Feature): boolean {
    return this.selectedFeatures.includes(feature);
  }

  // WithCustomLabel
  makeLabelValueCandidate = (feature: Feature): LabelValueCandidate => {
    // TODO: This part is subject to change depending on AssignField requirements.
    // We will have to revisit this part if the info is not sufficient in the future.
    return {
        boundingBoxes: [getBoundingBoxFromFeatureId(feature.get("id"))],
        page: this.currentDocument!.currentPage,
        text: feature.get("text"),
        category: feature.get("category") || FeatureCategory.Text,
        alreadyAssignedLabelName: feature.get("alreadyAssignedLabelName"),
    };
  }

  updateEnabledTypesForInlineMenu() {
    const selectedCategories = this.selectedFeatures.map(
        (f: Feature) => f.getProperties()['category'] as FeatureCategory
    );
    const categories = Array.from(new Set(selectedCategories)) as FeatureCategory[];
    let supportedFieldTypes: any;

    if (this.selectedFeatures.length === 1 && categories.includes(FeatureCategory.Checkbox)) {
      supportedFieldTypes = supportedFieldTypesByCategory[FeatureCategory.Checkbox];
    } else if (categories.includes(FeatureCategory.DrawnRegion)) {
      supportedFieldTypes = supportedFieldTypesByCategory[FeatureCategory.DrawnRegion];
    } else if (categories.includes(FeatureCategory.Label)) {
      supportedFieldTypes = supportedFieldTypesByCategory[FeatureCategory.Label];
    } else {
      supportedFieldTypes = supportedFieldTypesByCategory[FeatureCategory.Text];
    }

    this.enabledTypesForInlineMenu = supportedFieldTypes;
  }

  handleFinishFeatureSelect() {
    this.customModelService.setLabelValueCandidates(this.selectedFeatures.map(this.makeLabelValueCandidate));
    this.showInlineLabelMenu = false;
    if (this.selectedFeatures.length > 0) {
        this.ignoreOpenPopupFirstClick = true;
        const bottomPosition =
            this.mousePositionY + this.menuDownShiftY + inlineLabelMenuHeight + this.menuBottomOffset;
        const top =
            bottomPosition > document.body.offsetHeight
                ? this.mousePositionY - inlineLabelMenuHeight + this.menuUpShiftY - 90
                : this.mousePositionY + this.menuDownShiftY - 112;

        this.menuPositionLeft = this.mousePositionX + this.menuShiftX - 200;
        this.menuPositionTop = top;
        this.showInlineLabelMenu = true;
    }
    this.updateEnabledTypesForInlineMenu();
  }

  clearSelectedFeatures() {
    this.selectedFeatures.forEach((feature) => feature.set(SELECTED_PROPERTY, false));
    this.selectedFeatures = [];
    this.customModelService.setLabelValueCandidates([]);
  }
  removeSelectedFeature(feature: Feature) {
    this.selectedFeatures.splice(this.selectedFeatures.indexOf(feature), 1);
    feature.set(SELECTED_PROPERTY, false);
  }
  addSelectedFeature(feature: Feature) {
    this.selectedFeatures.push(feature);
    feature.set(SELECTED_PROPERTY, true);
  }

  private makeFeature(
    text: string,
    boundingBox: number[],
    imageExtent: Extent,
    color: string,
    page: number,
    labelName: string,
    category: FeatureCategory
  ) {
      const coordinates: number[][] = [];
      const imageWidth = imageExtent[2] - imageExtent[0];
      const imageHeight = imageExtent[3] - imageExtent[1];

      for (let i = 0; i < boundingBox.length; i += 2) {
          coordinates.push([
              Math.round(boundingBox[i] * imageWidth),
              Math.round((1 - boundingBox[i + 1]) * imageHeight),
          ]);
      }

      const featureId = createRegionIdFromPolygon(boundingBox, page);
      const feature = new Feature({
          geometry: new Polygon([coordinates]),
          id: featureId,
          text,
          boundingbox: boundingBox,
          highlighted: false, // for highlight when mouse hovering.
          color,
          isLabelFeature: true, // for distinguish label v.s OCR bbox.
          alreadyAssignedLabelName: labelName,
          category,
      });

      return feature;
  }
  private getColorForLabel(label: Label): string {
    return getColorByFieldKey(this.colorForFields, getFieldKeyFromLabel(label));
  }
  private getFeatureCoordinates(feature: any) {
    return feature.getGeometry().getCoordinates()[0];
  }
  private getFeatureIdAndBoundingBox(featureCoordinates: any[]): any {
    const imageExtent = this.getImageExtent();
    const imageWidth = imageExtent[2] - imageExtent[0];
    const imageHeight = imageExtent[3] - imageExtent[1];
    const boundingBox: number[] = [];
    featureCoordinates.forEach((coordinate, index) => {
      boundingBox.push(coordinate[0] / imageWidth);
      boundingBox.push(1 - coordinate[1] / imageHeight);
    });
    const featureId = createRegionIdFromPolygon(boundingBox, this.currentDocument!.currentPage);
    return { featureId, boundingBox };
  }

  handleFeatureSelect(feature: Feature, isToggle: boolean = true, category: FeatureCategory) {
    const isSelected = this.isFeatureSelected(feature);
    if (isToggle && isSelected) {
        this.removeSelectedFeature(feature);
    } else if (!isSelected) {
        this.addSelectedFeature(feature);
    }
  }
  handleFeatureSelectByGroup(feature: Feature) {
    if (this.isFeatureSelected(feature)) {
        this.removeSelectedFeature(feature);
    } else {
        this.addSelectedFeature(feature);
    }
  }
  setDeleteRegionIconPosition(feature: Feature) {
    const featureCoordinates = this.getFeatureCoordinates(feature);
    const positions = featureCoordinates.map((coord: any) => this.getCoordinatePixelPosition(coord));
    this.currentRegionPositionTop = positions[1][1] - this.deleteIconBottomOffset;
    this.currentRegionPositionLeft = positions[1][0] - this.deleteIconLeftOffset;
  }
  handleDeleteDrawnRegionDebouncer() {
    this.isDebouncing = true;
    const deleteDrawnRegionDebounce = debounce(() => {
        this.showDeleteRegionIcon = false;
        this.isDebouncing = false;
    });
    this.deleteDrawnRegionDebouncer = deleteDrawnRegionDebounce();
  }
  handleDrawnRegionFeatureHovered(event: UIEvent, features: any[]) {
    if (this.isSnapped) {
      return;
    }

    const feature = features[0];
    if (feature) {
      this.isHoveringOnDeleteRegionIcon = false;
      const { isLabelFeature } = feature.getProperties();
      if (isLabelFeature) {
        return;
      }
      clearTimeout(this.deleteDrawnRegionDebouncer);
      this.isDebouncing = false;
      this.hoveredDrawRegionFeature = feature;
      this.setDeleteRegionIconPosition(feature);
      this.showDeleteRegionIcon = true;
    } else {
      if (!this.isDebouncing && !this.isHoveringOnDeleteRegionIcon && this.showDeleteRegionIcon) {
        this.handleDeleteDrawnRegionDebouncer();
      }
    }
  }
  handleIsPointerOnImage(isPointerOnImage: boolean) {
    if (!isPointerOnImage && this.isPointerOnImage && this.isVertexDragging) {
      this.cancelModify();
    }
    if (this.isPointerOnImage !== isPointerOnImage) {
      this.isPointerOnImage = isPointerOnImage;
    }
  }

  handleMouseMove(event: MouseEvent) {
    const { clientX, clientY } = event;
    this.mousePositionX = clientX;
    this.mousePositionY = clientY;
  }
  handleClick() {
    if (this.showInlineLabelMenu) {
      if (this.ignoreOpenPopupFirstClick) {
        this.ignoreOpenPopupFirstClick = false;
        return;
      }
      this.showInlineLabelMenu = false;
    }
  }
  handleRegionDrawn(feature: Feature) {
    if (!this.currentDocument) {
      return;
    }
    const featureCoordinates = this.getFeatureCoordinates(feature);
    const { featureId, boundingBox } = this.getFeatureIdAndBoundingBox(featureCoordinates);
    feature.setProperties({
        id: featureId,
        boundingbox: boundingBox,
        text: "",
        highlighted: false,
        isOcrProposal: false,
        page: this.currentDocument.currentPage,
        category: FeatureCategory.DrawnRegion,
    });
    feature.setId(featureId);
    this.handleFeatureSelect(feature, false, FeatureCategory.DrawnRegion);
    this.handleFinishFeatureSelect();
  }
  handleDrawing(isDrawing: boolean) {
    if (this.isDrawing !== isDrawing) {
      this.isDrawing = isDrawing;
    }
  }
  handleVertexDragging(isDragging: boolean) {
    if (this.isVertexDragging !== isDragging) {
      this.isVertexDragging = isDragging;
    }
  }
  handleSnapped(isSnapped: boolean) {
    if (this.isSnapped !== isSnapped) {
      this.isSnapped = isSnapped;
    }
  }
  clearLabels() {
    if (this.initializedMap) {
      this.removeAllLabelFeatures();
    }
  }
  clearRegions() {
    if (this.initializedMap) {
      this.removeAllDrawnRegionFeature();
    }
  }
  clearDrawnRegion() {
    if (!this.initializedMap) return
    this.removeDrawnRegionFeature(this.hoveredDrawRegionFeature!);
    if (this.isFeatureSelected(this.hoveredDrawRegionFeature!)) {
        this.removeSelectedFeature(this.hoveredDrawRegionFeature!);
        this.customModelService.setLabelValueCandidates(this.selectedFeatures.map(this.makeLabelValueCandidate));
    }

    this.showInlineLabelMenu = false;
    this.showDeleteRegionIcon = false;
    this.isHoveringOnDeleteRegionIcon = false;
    this.hoveredDrawRegionFeature = null;
  }
  updateHoveredFeature(prevHoveredLabelName: string, hoveredLabelName: string) {
    if (!this.initializedMap) return
    const labelFeatures = this.getAllLabelFeatures() || [];
    const regionFeatures = this.getAllDrawnRegionFeatures() || [];
    const allFeatures = labelFeatures.concat(regionFeatures);

    const oldFeatures = allFeatures.filter((f: any) => f.get("alreadyAssignedLabelName") === prevHoveredLabelName);
    oldFeatures.forEach((f: any) => f.set(HIGHLIGHTED_PROPERTY, false));

    const newFeatures = allFeatures.filter((f: any) => f.get("alreadyAssignedLabelName") === hoveredLabelName);
    newFeatures.forEach((f: any) => f.set(HIGHLIGHTED_PROPERTY, true));
  }
  async handleFeatureModify(features: any[]) {
    if (!this.initializedMap) return
    features.forEach(async (feature) => {
      const originalFeatureId = feature.getId();
      const featureCoordinates = feature.getGeometry().getCoordinates()[0];
      if (this.modifyStartFeatureCoordinates[originalFeatureId] !== featureCoordinates.join(",")) {
        const { featureId, boundingBox } = this.getFeatureIdAndBoundingBox(featureCoordinates);
        const labelName = features[0].get("alreadyAssignedLabelName");
        if (labelName) {
          const oldCandidate = this.makeLabelValueCandidate(feature);
          feature.setProperties({ id: featureId, boundingbox: boundingBox });
          feature.setId(featureId);
          const newCandidate = this.makeLabelValueCandidate(feature);
          await this.customModelService.updateLabel(labelName, oldCandidate, newCandidate);
        } else {
          feature.setProperties({ id: featureId, boundingbox: boundingBox });
          feature.setId(featureId);
        }
      }
      return null;
    });

    if (this.initializedMap) {
      this.modifyStartFeatureCoordinates = {};
    }
  }

  drawLabels = (targetPage: number) => {
    if (!this.currentDocument || !this.labels || !this.initializedMap) {
      return;
    }
    const currentLabels = this.labels[this.currentDocument.name];

    // An array of numbers representing an extent: [minx, miny, maxx, maxy]
    const imageExtent = this.getImageExtent() as Extent;
    const labelFeatures: Feature[] = [];
    const regionFeatures: Feature[] = [];
    const isRegionLabel = (label: Label): boolean => !!label.labelType && label.labelType === LabelType.Region;

    currentLabels.forEach((label) => {
        const color = this.getColorForLabel(label);
        if (isRegionLabel(label)) {
            label.value
                .filter((v) => v.page === targetPage)
                .forEach((value) => {
                    const { text, boundingBoxes } = value;
                    boundingBoxes.forEach((bbox) => {
                        regionFeatures.push(
                            this.makeFeature(
                                text,
                                bbox,
                                imageExtent,
                                color,
                                targetPage,
                                label.label,
                                FeatureCategory.DrawnRegion
                            )
                        );
                    });
                });
        } else {
            label.value
                .filter((v) => v.page === targetPage)
                .forEach((value) => {
                    const { text, boundingBoxes } = value;
                    boundingBoxes.forEach((bbox) => {
                        labelFeatures.push(
                            this.makeFeature(
                                text,
                                bbox,
                                imageExtent,
                                color,
                                targetPage,
                                label.label,
                                FeatureCategory.Label
                            )
                        );
                    });
                });
        }
    });

    if (labelFeatures.length > 0) {
        this.addLabelFeatures(labelFeatures);
    }

    if (regionFeatures.length > 0) {
        this.addDrawnRegionFeatures(regionFeatures);
    }
  }

  handleMouseEnterIntoDeleteRegion() {
    this.isHoveringOnDeleteRegionIcon = true;
    clearTimeout(this.deleteDrawnRegionDebouncer);
  }

  // With Table


}
