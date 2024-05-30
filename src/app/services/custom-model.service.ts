import { Injectable } from '@angular/core';
import { BehaviorSubject, take } from 'rxjs';

import { CustomModelState, FeatureCategory, FieldLocation } from '../types/customModelTypes';
import { CustomModelAssetService } from './assetService/customModelAssetService';
import {
  Definitions,
  Field,
  FieldFormat,
  FieldType,
  HeaderType,
  Label,
  LabelType,
  LabelValue,
  LabelValueCandidate,
  TableType,
  VisualizationHint,
} from '../models/customModels';
import { AnalyzeResponse } from '../models/analyzeResult';
import {
  buildRegionOrders,
  compareOrder,
  decodeLabelString,
  encodeLabelString,
  getAllDocumentLabels,
  getFieldKeyFromLabel,
  getTableFieldKeyFromLabel,
  makeLabelValue,
  uniqueByKeepFirst,
  validateAssignment,
} from '../utils/customModel';
import { LabelUXService } from './label-ux.service';

@Injectable({
  providedIn: 'root'
})
export class CustomModelService {
  private assetService = new CustomModelAssetService()

  private initialState: CustomModelState = {
    definitions: {},
    fields: [],
    colorForFields: [],
    labels: {},
    orders: {},
    labelValueCandidates: [],
    labelError: null,
    hideInlineLabelMenu: false,
  };

  private customModelState = new BehaviorSubject<CustomModelState>(this.initialState);

  customModelState$ = this.customModelState.asObservable();

  constructor(
    public uxService: LabelUXService,
  ) { }

  setHideInlineLabelMenu(hideInlineLabelMenu: boolean): void {
    const currentState = this.customModelState.value;
    this.customModelState.next({ ...currentState, hideInlineLabelMenu });
  }

  setDefinitions(definitions: Definitions): void {
    const currentState = this.customModelState.value;
    this.customModelState.next({ ...currentState, definitions });
  }

  setFields(fields: Field[]): void {
    const currentState = this.customModelState.value;
    this.customModelState.next({ ...currentState, fields });
  }

  setColorForFields(colorForFields: any[]): void {
    const currentState = this.customModelState.value;
    this.customModelState.next({ ...currentState, colorForFields });
  }

  setColorForFieldsByName(fieldName: string, newFieldName: string): void {
    const currentState = this.customModelState.value;
    const getDynamicKey = (obj: Record<string, string>) => Object.keys(obj)[0];
    const colorForFieldsCopy = [...currentState.colorForFields];
    const originalFieldIndex = colorForFieldsCopy.findIndex(
        (colorMap) => getDynamicKey(colorMap) === fieldName
    );
    const originalFieldColor = colorForFieldsCopy[originalFieldIndex][fieldName];
    colorForFieldsCopy.splice(originalFieldIndex, 1, {
        [newFieldName]: originalFieldColor,
    });
    this.customModelState.next({ ...currentState, colorForFields: colorForFieldsCopy });
  }

  setLabelsByName(name: string, newLabels: any): void {
    const currentState = this.customModelState.value;
    const { labels } = currentState;
    labels[name] = newLabels;
    this.customModelState.next({ ...currentState, labels: {...labels} });
  }

  setLabelValueCandidates(labelValueCandidates: any): void {
    const currentState = this.customModelState.value;
    this.customModelState.next({ ...currentState, labelValueCandidates });
  }

  deleteLabelByName(labelNameToDelete: string): void {
    const currentState = this.customModelState.value;
    const { labels } = currentState;
    delete labels[labelNameToDelete];
    this.customModelState.next({ ...currentState, labels: {...labels} });
  }

  clearLabelError(): void {
    const currentState = this.customModelState.value;
    this.customModelState.next({ ...currentState, labelError: null });
  }

  async addField(field: Field): Promise<void> {
    const currentState = this.customModelState.value;
    try {
      const { fields, definitions } = currentState;
      const updatedFields = fields.concat(field);
      await this.assetService.updateFields(updatedFields, definitions);
      fields.push(field);
      this.customModelState.next({ ...currentState, fields });
    } catch (err: any) {
      this.customModelState.next({ ...currentState, labelError: { name: err.code, message: err.message } });
    }
  }

  async updateFieldsOrder(updatedFields: Field[]): Promise<void> {
    const currentState = this.customModelState.value;
    try {
      const { definitions } = currentState;
      await this.assetService.updateFields(updatedFields, definitions);
      this.customModelState.next({ ...currentState, fields: updatedFields });
    } catch (err: any) {
      this.customModelState.next({ ...currentState, labelError: { name: err.code, message: err.message } });
    }
  }

  async switchSubType(fieldKey: string, fieldType: FieldType): Promise<void> {
    const currentState = this.customModelState.value;
    try {
      const { fields, definitions } = currentState;

      // Find the target field and switch its type.
      const fieldIndex = fields.findIndex((field) => field.fieldKey === fieldKey)!;
      const updatedField = { ...fields[fieldIndex] };
      updatedField.fieldType = fieldType;
      
      // Update to origin fields.
      const updatedFields = fields.slice();
      updatedFields.splice(fieldIndex, 1, updatedField);
      await this.assetService.updateFields(updatedFields, definitions);

      fields[fieldIndex] = updatedField;
      this.customModelState.next({ ...currentState, fields });
    } catch (err: any) {
      this.customModelState.next({ ...currentState, labelError: { name: err.code, message: err.message } });
    }
  }

  async switchTableFieldsSubType(tableFieldKey: string, headerField: Field, newType: FieldType): Promise<void> {
    const currentState = this.customModelState.value;
    try {
      const { fields, definitions } = currentState;
      const { fieldKey, fieldType } = headerField;
      if (fieldType === newType) {
        this.customModelState.next({ ...currentState, definitions });
        return;
      }

      const assetService = new CustomModelAssetService();
      const updatedDefinitions = { ...definitions };
      const originTableFieldIndex = fields.findIndex((field) => field.fieldKey === tableFieldKey);
      const originTableField: any = fields[originTableFieldIndex];
      // Only update definitions.
      const fieldDefinitionNames = originTableField.itemType
        ? [originTableField.itemType]
        : originTableField.fields.map((field: any) => field.fieldType);
      fieldDefinitionNames.forEach((name: string) => {
        const definition = { ...definitions[name] };
        const updatedFields = definition.fields.map((field) =>
          field.fieldKey === fieldKey ? { ...field, fieldType: newType } : field
        );
        updatedDefinitions[name] = { ...definition, fields: updatedFields };
      });
      await assetService.updateFields(fields, updatedDefinitions);

      this.customModelState.next({ ...currentState, definitions: updatedDefinitions });
    } catch (err: any) {
      this.customModelState.next({ ...currentState, labelError: { name: err.code, message: err.message } });
    }
  }

  // Update Order after loaded the Prediction
  setDocumentPrediction(name: string, analyzeResponse: AnalyzeResponse): void {
    const currentState = this.customModelState.value;
    const { orders } = currentState;
    orders[name] = buildRegionOrders(analyzeResponse.analyzeResult);

    this.customModelState.next({ ...currentState, orders });
  }

  async insertTableField(tableFieldKey: string, fieldKey: string, index: number, fieldLocation: FieldLocation): Promise<void> {
    const currentState = this.customModelState.value;
    try {
      const { fields, definitions } = currentState;
      const updatedFields = [...fields];
      const updatedDefinitions = { ...definitions };
      const originTableFieldIndex = fields.findIndex((field) => field.fieldKey === tableFieldKey);
      const originTableField: any = fields[originTableFieldIndex];
      const objectName = originTableField.itemType || originTableField.fields[0].fieldType;
      const insertField: any = {
        fieldKey,
        fieldType: fieldLocation === FieldLocation.field ? objectName : FieldType.String,
        fieldFormat: FieldFormat.NotSpecified,
      };

      if (fieldLocation === FieldLocation.field) {
        const insertedFields = originTableField.fields.slice();
        insertedFields.splice(index, 0, insertField);
        const updatedTableField = { ...originTableField, fields: insertedFields };
        updatedFields.splice(originTableFieldIndex, 1, updatedTableField);
      } else {
        const insertedFields = definitions[objectName].fields.slice();
        insertedFields.splice(index, 0, insertField);
        updatedDefinitions[objectName] = { ...definitions[objectName], fields: insertedFields };
      }

      await this.assetService.updateFields(updatedFields, updatedDefinitions);

      this.customModelState.next({ ...currentState, fields: updatedFields, definitions: updatedDefinitions });
    } catch (err: any) {
      this.customModelState.next({ ...currentState, labelError: { name: err.code, message: err.message } });
    }
  }

  async addTableField(fieldKey: string, tableType: TableType, headerType?: HeaderType): Promise<void> {
    const currentState = this.customModelState.value;
    try {
      const { fields, definitions } = currentState;
      const getTableFields = (headerType: HeaderType, fieldType: any) =>
        new Array(2).fill(null).map((_, index) => ({
          fieldKey: headerType === HeaderType.column ? `COLUMN${index + 1}` : `ROW${index + 1}`,
          fieldType,
          fieldFormat: FieldFormat.NotSpecified,
        }));

      const objectName = `${fieldKey}_object`;
      let field: any = { fieldKey, fieldFormat: FieldFormat.NotSpecified };
      let definition: any = {
        fieldKey: objectName,
        fieldType: FieldType.Object,
        fieldFormat: FieldFormat.NotSpecified,
      };

      if (tableType === TableType.dynamic) {
        field = { ...field, fieldType: FieldType.Array, itemType: objectName };
        definition = { ...definition, fields: getTableFields(HeaderType.column, FieldType.String) };
      } else {
        if (headerType === HeaderType.column) {
          field = {
            ...field,
            fieldType: FieldType.Object,
            fields: getTableFields(HeaderType.row, objectName),
            visualizationHint: VisualizationHint.Vertical,
          };
          definition = { ...definition, fields: getTableFields(HeaderType.column, FieldType.String) };
        } else {
          field = {
            ...field,
            fieldType: FieldType.Object,
            fields: getTableFields(HeaderType.column, objectName),
            visualizationHint: VisualizationHint.Horizontal,
          };
          definition = { ...definition, fields: getTableFields(HeaderType.row, FieldType.String) };
        }
      }

      const updatedFields = fields.concat(field);
      const updatedDefinitions = { ...definitions, [objectName]: definition };

      await this.assetService.updateFields(updatedFields, updatedDefinitions);

      this.customModelState.next({ ...currentState, fields: updatedFields, definitions: updatedDefinitions });
    } catch (err: any) {
      this.customModelState.next({ ...currentState, labelError: { name: err.code, message: err.message } });
    }
  }

  async assignLabel(labelName: string): Promise<void> {
    const currentState = this.customModelState.value;
    try {
      const { labels, fields, labelValueCandidates, orders } = currentState;
      
      if (labelValueCandidates.length === 0) {
        // No label candidate to be assigned, just return.
        this.customModelState.next({ ...currentState, labels });
        return;
      }

      // Step 1. Remove duplicated items in LabelValueCandidates.
      const uniqueCandidates: LabelValueCandidate[] = uniqueByKeepFirst(
        labelValueCandidates,
        (item: LabelValueCandidate) => JSON.stringify(item.boundingBoxes)
      );

      // Step 2. Check invalid assignment and throw errors.
      const fieldKey = decodeLabelString(labelName.split("/")[0]);
      const field = fields.find((f) => f.fieldKey === fieldKey);
      validateAssignment(uniqueCandidates, field!);

      // Step 3. Check cross-page label issue and throw errors.
      const labelValueCandidatePageNum = labelValueCandidates[0].page;

      this.uxService.documentsState$.pipe(
        take(1)
      ).subscribe(async ({ currentDocument }) => {
        if (currentDocument) {
          const { name: documentName, currentPage } = currentDocument;
          const currLabelValuePageNum = labels[documentName]?.find(({ label }) => label === labelName)?.value[0].page;
          if (currLabelValuePageNum && labelValueCandidatePageNum !== currLabelValuePageNum) {
            this.customModelState.next({
              ...currentState,
              labelError: {
                name: "Cross-page label error",
                message: `Sorry, we don't support cross-page labeling with the same field. You have label regions with same field name <b>${labelName}</b> across 2 pages.`
              }
            });
            return;
          }

          // Step 4. Remove existed label.value if it occurred in uniqueCandidates.
          const uniqCandidateBoxes = uniqueCandidates.map((candidate) => JSON.stringify(candidate.boundingBoxes));
          const documentLabels = labels[documentName]
            ? labels[documentName].slice().map((documentLabel) => {
                  const labelPageNum = documentLabel.value[0].page;
                  const remainingValue = documentLabel.value.filter(
                      (value) =>
                          labelValueCandidatePageNum !== labelPageNum ||
                          !uniqCandidateBoxes.includes(JSON.stringify(value.boundingBoxes))
                  );

                  if (remainingValue.length !== documentLabel.value.length) {
                    return { ...documentLabel, value: remainingValue };
                  }
                  return documentLabel;
              })
            : [];
          // Step 5. Check if labelName existed in documentLabels.
          const iLabel = documentLabels.findIndex((docLabel) => docLabel.label === labelName);
          const candidatesValue: LabelValue[] = uniqueCandidates.map(makeLabelValue);
          const isSingleDrawRegion =
              uniqueCandidates.length === 1 && uniqueCandidates[0].category === FeatureCategory.DrawnRegion;
          if (iLabel === -1) {
            // Step 5.a. Add label.
            documentLabels.push({
              label: labelName,
              value: candidatesValue.sort((a, b) => compareOrder(a, b, orders[documentName], currentPage)),
              labelType: isSingleDrawRegion ? LabelType.Region : undefined,
            });
          } else {
            // Step 5.b. Merge or replace label.
            if (isSingleDrawRegion) {
              documentLabels[iLabel] = {
                ...documentLabels[iLabel],
                value: candidatesValue,
                labelType: LabelType.Region,
              };
            } else if (field?.fieldType === FieldType.Signature || field?.fieldType === FieldType.SelectionMark) {
              documentLabels[iLabel] = {
                ...documentLabels[iLabel],
                value: candidatesValue,
              };
            } else if (documentLabels[iLabel].labelType === LabelType.Region) {
              // Replace the existing region with text.
              documentLabels[iLabel] = {
                ...documentLabels[iLabel],
                value: candidatesValue.sort((a, b) => compareOrder(a, b, orders[documentName], currentPage)),
                labelType: undefined,
              };
            } else {
              // Concat text.
              documentLabels[iLabel] = {
                ...documentLabels[iLabel],
                value: documentLabels[iLabel].value
                  .concat(candidatesValue)
                  .sort((a, b) => compareOrder(a, b, orders[documentName], currentPage)),
              };
            }
          }
    
          // Step 6. Remove empty label.
          const updatedLabel = { [documentName]: documentLabels.filter((label) => label.value.length > 0) };

          // Step 7: save labels.json
          // Note: for error handling purpose we await here, but for UX consideration we can call and ignore.
          await this.assetService.updateDocumentLabels(updatedLabel);
          this.customModelState.next({ ...currentState, labels: { ...labels, ...updatedLabel } });
        }
      });
    } catch (err: any) {
      this.customModelState.next({ ...currentState, labelError: { name: err.code, message: err.message } });
    }
  }

  async updateLabel(labelName: string, oldCandidate: LabelValueCandidate, newCandidate: LabelValueCandidate): Promise<void> {
    const currentState = this.customModelState.value;
    try {
      const { labels } = currentState;
      this.uxService.documentsState$.pipe(
        take(1)
      ).subscribe(async ({ currentDocument }) => {
        if (currentDocument) {
          const documentName = currentDocument.name;

          // Find Label
          const iLabel = labels[documentName].findIndex((label) => label.label === labelName);
          if (iLabel === -1) {
            this.customModelState.next({ ...currentState, labels });
            return;
          }

          const updatedDocumentLabels = {
            [documentName]: labels[documentName].map((label, index) => {
              if (index === iLabel) {
                const updatedLabelValue = label.value.map((value) => {
                  if (JSON.stringify(value.boundingBoxes) === JSON.stringify(oldCandidate.boundingBoxes)) {
                      return { ...value, boundingBoxes: newCandidate.boundingBoxes };
                  }
                  return value;
                });
                return { ...label, value: updatedLabelValue };
              }
              return label;
            }),
          };

          // Save labels.json
          // Note: for error handling purpose we await here, but for UX consideration we can call and ignore.
          await this.assetService.updateDocumentLabels(updatedDocumentLabels);
          this.customModelState.next({ ...currentState, labels: { ...labels, ...updatedDocumentLabels } });
        }
      });
    } catch (err: any) {
      this.customModelState.next({ ...currentState, labelError: { name: err.code, message: err.message } });
    }
  }

  async deleteLabelByField(fieldKey: string): Promise<void> {
    const currentState = this.customModelState.value;
    try {
      const { labels } = currentState;
      this.uxService.documentsState$.pipe(
        take(1)
      ).subscribe(async ({ currentDocument }) => {
        if (currentDocument) {
          const documentName = currentDocument.name;

          const updatedDocumentLabels = {
            [documentName]: labels[documentName].filter((label) => getFieldKeyFromLabel(label) !== fieldKey),
          };
          const updatedLabels = { ...labels, ...updatedDocumentLabels };

          await this.assetService.updateDocumentLabels(updatedDocumentLabels);
          this.customModelState.next({ ...currentState, labels: updatedLabels });
        }
      });
    } catch (err: any) {
      this.customModelState.next({ ...currentState, labelError: { name: err.code, message: err.message } });
    }
  }

  async deleteLabelByLabel(targetLabel: string): Promise<void> {
    const currentState = this.customModelState.value;
    try {
      const { labels } = currentState;
      this.uxService.documentsState$.pipe(
        take(1)
      ).subscribe(async ({ currentDocument }) => {
        if (currentDocument) {
          const documentName = currentDocument.name;

          const updatedDocumentLabels = {
            [documentName]: labels[documentName].filter((label) => label.label !== targetLabel),
          };
          const updatedLabels = { ...labels, ...updatedDocumentLabels };

          await this.assetService.updateDocumentLabels(updatedDocumentLabels);
          this.customModelState.next({ ...currentState, labels: updatedLabels });
        }
      });
    } catch (err: any) {
      this.customModelState.next({ ...currentState, labelError: { name: err.code, message: err.message } });
    }
  }

  async updateTableLabel(tableFieldKey: string, newLabel: Label[]): Promise<void> {
    const currentState = this.customModelState.value;
    try {
      const { labels } = currentState;
      this.uxService.documentsState$.pipe(
        take(1)
      ).subscribe(async ({ currentDocument }) => {
        if (currentDocument) {
          const documentName = currentDocument.name;

          // Update labels.
          const remainingLabels = labels[documentName].filter(
            (label) => getFieldKeyFromLabel(label) !== tableFieldKey
          );
          const updatedDocumentLabels = { [documentName]: [...remainingLabels, ...newLabel] };

          const updatedLabels = { ...labels, ...updatedDocumentLabels };

          await this.assetService.updateDocumentLabels(updatedDocumentLabels);
          this.customModelState.next({ ...currentState, labels: updatedLabels });
        } else {
          this.customModelState.next({ ...currentState, labels });
        }
      });
    } catch (err: any) {
      this.customModelState.next({ ...currentState, labelError: { name: err.code, message: err.message } });
    }
  }

  async renameField(fieldKey: string, newName: string): Promise<void> {
    const currentState = this.customModelState.value;
    const { fields, labels, definitions } = currentState;
    this.uxService.documentsState$.pipe(
      take(1)
    ).subscribe(async ({ documents }) => {
      try {
        // Fetch all document labels and update the label data with target field.
        let allLabels = await getAllDocumentLabels(labels, documents, this.assetService);

        // Update labels.
        const updatedLabels: any = {};
        Object.entries(allLabels).forEach(([documentName, labels]) => {
          // Only process the document that contains target label.
          if ((labels as any[]).find((label: any) => getFieldKeyFromLabel(label) === fieldKey)) {
            const updatedDocLabels = (labels as any[]).map((label) => {
              if (getFieldKeyFromLabel(label) === fieldKey) {
                const newLabel = label.label.split("/");
                newLabel[0] = encodeLabelString(newName); // Replace old fieldKey with new one.
                return { ...label, label: newLabel.join("/") };
              }
              return label;
            });
            updatedLabels[documentName] = updatedDocLabels;
          }
        });
        allLabels = { ...allLabels, ...updatedLabels };

        // Update fields.
        const newObjectName = `${newName}_object`;
        const originFieldIndex = fields.findIndex((field) => field.fieldKey === fieldKey);
        const originField: any = fields[originFieldIndex];
        const updatedField = {
          ...originField,
          ...(originField.itemType && { itemType: newObjectName }),
          ...(originField.fields && {
              fields: originField.fields.map((field: any) => ({ ...field, fieldType: newObjectName })),
          }),
          fieldKey: newName,
        };
        const updatedFields = [...fields];
        updatedFields.splice(originFieldIndex, 1, updatedField);

        // Update definitions.
        const updatedDefinitions = { ...definitions };
        if (originField.itemType) {
          // For dynamic table.
          updatedDefinitions[newObjectName] = {
            ...updatedDefinitions[originField.itemType],
            fieldKey: newObjectName,
          };
          delete updatedDefinitions[originField.itemType];
        }
        if (originField.fields) {
          // For fixed table.
          const originFieldTypes = originField.fields.map((field: any) => field.fieldType);
          updatedDefinitions[newObjectName] = {
            ...updatedDefinitions[originFieldTypes[0]],
            fieldKey: newObjectName,
          };
          originFieldTypes.forEach((fieldType: any) => delete updatedDefinitions[fieldType]);
        }

        await Promise.all([
          this.assetService.updateFields(updatedFields, updatedDefinitions),
          this.assetService.updateDocumentLabels(updatedLabels),
        ]);

        this.customModelState.next({ ...currentState, fields: updatedFields, labels: allLabels, definitions: updatedDefinitions });
      } catch (err: any) {
        this.customModelState.next({ ...currentState, labelError: { name: err.code, message: err.message } });
      }
    });
  }

  async renameTableField(tableFieldKey: string, fieldKey: string, newName: string, fieldLocation: FieldLocation): Promise<void> {
    const currentState = this.customModelState.value;
    const { fields, labels, definitions } = currentState;
    this.uxService.documentsState$.pipe(
      take(1)
    ).subscribe(async ({ documents }) => {
      try {
        // Fetch all document labels and update the label data with target field.
        let allLabels = await getAllDocumentLabels(labels, documents, this.assetService);

        // Update labels.
        const updatedLabels: any = {};
        const isTargetLabel = (label: any) =>
            getFieldKeyFromLabel(label) === tableFieldKey &&
            getTableFieldKeyFromLabel(label, fieldLocation) === fieldKey;
        Object.entries(allLabels).forEach(([documentName, labels]) => {
            // Only process the document that contains target label.
          if ((labels as any[]).find(isTargetLabel)) {
            const updatedDocLabels = (labels as any[]).map((label) => {
              if (isTargetLabel(label)) {
                const newLabel = label.label.split("/");
                const index = fieldLocation === FieldLocation.field ? 1 : 2;
                newLabel[index] = encodeLabelString(newName); // Replace old fieldKey with new one.
                return { ...label, label: newLabel.join("/") };
              }
              return label;
            });
            updatedLabels[documentName] = updatedDocLabels;
          }
        });
        allLabels = { ...allLabels, ...updatedLabels };

        // Update fields.
        const updatedFields = [...fields];
        const updatedDefinitions = { ...definitions };
        const originTableFieldIndex = fields.findIndex((field) => field.fieldKey === tableFieldKey);
        const originTableField: any = fields[originTableFieldIndex];
        if (fieldLocation === FieldLocation.field) {
          // Update fields.
          const tableFields = originTableField.fields.map((field: any) =>
            field.fieldKey === fieldKey ? { ...field, fieldKey: newName } : field
          );
          updatedFields.splice(originTableFieldIndex, 1, { ...originTableField, fields: tableFields });
        } else {
          // Update definitions.
          const objectName = originTableField.itemType || originTableField.fields[0].fieldType;
          const definition = { ...definitions[objectName] };
          const definitionFields = definition.fields.map((field) =>
            field.fieldKey === fieldKey ? { ...field, fieldKey: newName } : field
          );
          updatedDefinitions[objectName] = { ...definition, fields: definitionFields };
        }

        await Promise.all([
          this.assetService.updateFields(updatedFields, updatedDefinitions),
          this.assetService.updateDocumentLabels(updatedLabels),
        ]);

        this.customModelState.next({ ...currentState, fields: updatedFields, labels: allLabels, definitions: updatedDefinitions });
      } catch (err: any) {
        this.customModelState.next({ ...currentState, labelError: { name: err.code, message: err.message } });
      }
    });
  }

  async deleteField(fieldKey: string): Promise<void> {
    const currentState = this.customModelState.value;
    const { fields, labels, definitions } = currentState;
    this.uxService.documentsState$.pipe(
      take(1)
    ).subscribe(async ({ documents }) => {
      try {
        // Fetch all document labels and update the label data with target field.
        let allLabels = await getAllDocumentLabels(labels, documents, this.assetService);
        const updatedLabels: any = {};
        Object.entries(allLabels).forEach(([documentName, labels]) => {
          if ((labels as any[]).find((label) => getFieldKeyFromLabel(label) === fieldKey)) {
            const updatedDocLabels = (labels as any[]).filter((label) => getFieldKeyFromLabel(label) !== fieldKey);
            updatedLabels[documentName] = updatedDocLabels;
          }
        });
        allLabels = { ...allLabels, ...updatedLabels };

        // Update fields and definitions.
        const updatedFields = fields.filter((field) => field.fieldKey !== fieldKey);
        const targetField = fields.find((field) => field.fieldKey === fieldKey)! as any;
        const updatedDefinitions = { ...definitions };
        if (targetField.itemType) {
          // Delete dynamic row table cell definitions.
          delete updatedDefinitions[targetField.itemType];
        }
        if (targetField.fields) {
          // Delete fixed table cell definitions.
          const fieldTypesToDelete = targetField.fields.map((field: any) => field.fieldType);
          fieldTypesToDelete.forEach((fieldType: any) => delete updatedDefinitions[fieldType]);
        }

        await Promise.all([
          this.assetService.updateFields(updatedFields, updatedDefinitions),
          this.assetService.updateDocumentLabels(updatedLabels),
        ]);

        this.customModelState.next({ ...currentState, fields: updatedFields, labels: allLabels, definitions: updatedDefinitions });
      } catch (err: any) {
        this.customModelState.next({ ...currentState, labelError: { name: err.code, message: err.message } });
      }
    });
  }

  async deleteTableField(tableFieldKey: string, fieldKey: string, fieldLocation: FieldLocation): Promise<void> {
    const currentState = this.customModelState.value;
    const { fields, labels, definitions } = currentState;
    this.uxService.documentsState$.pipe(
      take(1)
    ).subscribe(async ({ documents }) => {
      try {
        // Fetch all document labels and update the label data with target field.
        let allLabels = await getAllDocumentLabels(labels, documents, this.assetService);

        // Update labels.
        const updatedLabels: any = {};
        const isTargetLabel = (label: any) =>
          getFieldKeyFromLabel(label) === tableFieldKey &&
          getTableFieldKeyFromLabel(label, fieldLocation) === fieldKey;
        Object.entries(allLabels).forEach(([documentName, labels]) => {
          // Only process the document that contains target label.
          if ((labels as any[]).find(isTargetLabel)) {
            const updatedDocLabels = (labels as any[]).filter((label) => !isTargetLabel(label));
            updatedLabels[documentName] = updatedDocLabels;
          }
        });
        allLabels = { ...allLabels, ...updatedLabels };

        const updatedFields = [...fields];
        const updatedDefinitions = { ...definitions };
        const originTableFieldIndex = fields.findIndex((field) => field.fieldKey === tableFieldKey);
        const originTableField: any = fields[originTableFieldIndex];
        if (fieldLocation === FieldLocation.field) {
          // Update fields.
          const tableFields = originTableField.fields.filter((field: any) => field.fieldKey !== fieldKey);
          updatedFields.splice(originTableFieldIndex, 1, { ...originTableField, fields: tableFields });
        } else {
          // Update definitions.
          const objectName = originTableField.itemType || originTableField.fields[0].fieldType;
          const definition = { ...definitions[objectName] };
          const definitionFields = definition.fields.filter((field) => field.fieldKey !== fieldKey);
          updatedDefinitions[objectName] = { ...definition, fields: definitionFields };
        }

        await Promise.all([
            this.assetService.updateFields(updatedFields, updatedDefinitions),
            this.assetService.updateDocumentLabels(updatedLabels),
        ]);

        this.customModelState.next({ ...currentState, fields: updatedFields, labels: allLabels, definitions: updatedDefinitions });
      } catch (err: any) {
        this.customModelState.next({ ...currentState, labelError: { name: err.code, message: err.message } });
      }
    });
  }

}
