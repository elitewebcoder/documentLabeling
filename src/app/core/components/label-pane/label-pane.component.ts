import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { isEqual } from 'lodash';
import {
  ArrayField,
  Definitions,
  Field,
  FieldFormat,
  FieldType,
  HeaderType,
  Label,
  Labels,
  ObjectField,
  TableType,
} from 'src/app/models/customModels';
import { CustomModelService } from 'src/app/services/custom-model.service';
import { LabelUXService } from 'src/app/services/label-ux.service';
import { FieldLocation, IDocument } from 'src/app/types/customModelTypes';
import {
  getFieldColor,
  getFieldKeyFromLabel,
  getUnusedFieldColor,
} from 'src/app/utils/customModel';

@Component({
  selector: 'app-label-pane',
  templateUrl: './label-pane.component.html',
  styleUrls: ['./label-pane.component.scss'],
})
export class LabelPaneComponent implements OnInit {
  @Input() isTablePaneOpen = false;
  @Output() setIsTablePaneOpen: EventEmitter<boolean> = new EventEmitter();

  isFieldCalloutOpen = false;
  isCreateTableModalOpen = false;
  showAllFields = true;

  fieldOptions: any[] = [
    {
      key: 'field',
      text: 'Field',
      iconProps: { iconName: 'GroupList' },
      fieldType: FieldType.String,
    },
    {
      key: 'selectionMark',
      text: 'Selection Mark',
      iconProps: { iconName: 'CheckboxComposite' },
      fieldType: FieldType.SelectionMark,
    },
    {
      key: 'signature',
      text: 'Signature',
      iconProps: { iconName: 'WhiteBoardApp16' },
      fieldType: FieldType.Signature,
    },
    {
      key: 'table',
      text: 'Table',
      iconProps: { iconName: 'Table' },
    },
  ];

  fieldsButtonStyles: any = {
    menuIcon: {
      // This is for hiding the chevron icon, please note that we can't use display: none because
      // it will be overwritten by ms-Icon class.
      width: 0,
      height: 0,
      margin: 0,
      overflow: 'hidden',
    },
  };

  currentDocument?: IDocument;
  labels?: Labels;
  definitions?: any;
  fields: Field[] = [];
  hoveredLabelName = '';

  createFieldType: any;
  tableFieldKey: any;

  constructor(
    readonly uxService: LabelUXService,
    readonly customModelService: CustomModelService
  ) {}

  ngOnInit(): void {
    this.uxService.documentsState$.subscribe(({ currentDocument }) => {
      if (currentDocument && !isEqual(currentDocument, this.currentDocument)) {
        this.currentDocument = currentDocument;
        this.clearStates();
      }
    });
    this.uxService.canvasState$.subscribe(({ hoveredLabelName }) => {
      if (hoveredLabelName !== this.hoveredLabelName) {
        this.hoveredLabelName = hoveredLabelName;
      }
    });
    this.customModelService.customModelState$.subscribe(
      ({ labels, fields, definitions, colorForFields }) => {
        if (labels && !isEqual(labels, this.labels)) {
          this.labels = labels;
        }
        if (fields && !isEqual(fields, this.fields)) {
          if (!this.fields || fields.length > this.fields.length) {
            const addedFields = fields.filter(
              (field) => !(this.fields || []).includes(field)
            );
            const addedColorMap = addedFields.map((field: any) => ({
              [field.fieldKey]:
                !this.fields || this.fields.length === 0
                  ? getFieldColor(fields, field.fieldKey)
                  : getUnusedFieldColor(colorForFields),
            }));

            this.customModelService.setColorForFields([
              ...colorForFields,
              ...addedColorMap,
            ]);
          }
          if (this.fields && fields.length < this.fields.length) {
            const removedFields = this.fields.filter(
              (field: any) => !fields.includes(field)
            );
            const removedKeys = removedFields.map(
              (field: any) => field.fieldKey
            );

            this.customModelService.setColorForFields(
              colorForFields.filter(
                (color) => Object.keys(color)[0] !== removedKeys[0]
              )
            );
          }

          // Update fields
          this.fields = fields;
        }
        if (definitions && !isEqual(definitions, this.definitions)) {
          this.definitions = definitions;
        }
      }
    );
  }

  clearStates() {
    this.customModelService.setHideInlineLabelMenu(false);
    this.isFieldCalloutOpen = false;
    this.createFieldType = undefined;
    this.tableFieldKey = undefined;
    this.setIsTablePaneOpen.emit(false);
  }

  getDocumentLabels = (): Label[] => {
    if (this.currentDocument) {
      return this.labels![this.currentDocument.name] || [];
    } else {
      return [];
    }
  };
  getTableLabels = (fieldKey: string): { [labelName: string]: Label } => {
    const labels = this.getDocumentLabels().filter(
      (label) => getFieldKeyFromLabel(label) === fieldKey
    );
    return labels.reduce((obj, item) => ({ ...obj, [item.label]: item }), {});
  };
  getTableDefinition = (fieldKey: string): ObjectField => {
    const field = this.fields.find((field: any) => field.fieldKey === fieldKey);

    if (field!.fieldType === FieldType.Array) {
      const { itemType } = field as ArrayField;
      return this.definitions[itemType];
    } else {
      const { fields } = field as ObjectField;
      const { fieldType } = fields[0]; // currently only support ObjectField whose fields are having all identical filedType.
      return this.definitions[fieldType];
    }
  };
  handleCreateField = (value: string) => {
    if (!value) {
      return;
    }
    const newField: Field = {
      fieldKey: value,
      fieldType: this.createFieldType!,
      fieldFormat: FieldFormat.NotSpecified,
    };
    this.customModelService.addField(newField);
  };
  handleCreateTableField = async (
    fieldKey: string,
    tableType: TableType,
    headerType: HeaderType
  ) => {
    await this.customModelService.addTableField(
      fieldKey,
      tableType,
      headerType
    );
  };
  handleRenameTableField = async (
    tableFieldKey: string,
    fieldKey: string,
    newName: string,
    fieldLocation: FieldLocation
  ) => {
    await this.customModelService.renameTableField(
      tableFieldKey,
      fieldKey,
      newName,
      fieldLocation
    );
  };
  handleDeleteTableField = async (
    tableFieldKey: string,
    fieldKey: string,
    fieldLocation: FieldLocation
  ) => {
    await this.customModelService.deleteTableField(
      tableFieldKey,
      fieldKey,
      fieldLocation
    );
  };
  handleInsertTableField = async (
    tableFieldKey: string,
    fieldKey: string,
    index: number,
    fieldLocation: FieldLocation
  ) => {
    await this.customModelService.insertTableField(
      tableFieldKey,
      fieldKey,
      index,
      fieldLocation
    );
  };
  handleDeleteTableLabel = async (label: string) => {
    await this.customModelService.deleteLabelByLabel(label);
  };
  handleCreateFieldClick = (type: FieldType) => {
    this.isFieldCalloutOpen = true;
    this.createFieldType = type;
  };
  handleCreateFieldDismiss = () => {
    this.isFieldCalloutOpen = false;
    this.createFieldType = undefined;
  };
  handleTablePaneClose = () => {
    this.customModelService.setHideInlineLabelMenu(false);
    this.setIsTablePaneOpen.emit(false);
    this.tableFieldKey = undefined;
  };
  handleCreateTableModalClose = () => {
    this.isCreateTableModalOpen = false;
  };
  handleAssignLabel = (labelName: string) => {
    this.customModelService.assignLabel(labelName);
  };
  makeFieldsMenu = () => {
    return {
      items: this.fieldOptions.map((option) => ({
        ...option,
        iconProps: option.iconProps,
        onClick:
          option.key === 'table'
            ? this.onCreateTableClick
            : () => this.handleCreateFieldClick(option.fieldType!),
      })),
      directionalHint: 6,
      onMenuOpened: this.handleCreateFieldDismiss,
    };
  };
  onCreateTableClick = () => {
    this.isCreateTableModalOpen = true;
  };
  onFieldFilterClick = () => {
    this.showAllFields = !this.showAllFields;
  };
  onGetCreateFieldErrorMessage = (value: string) => {
    const isDuplicate = this.fields.some(
      (field: any) => field.fieldKey === value
    );

    if (isDuplicate) {
      return 'The field already exists.';
    } else {
      return undefined;
    }
  };
  handleItemMouseEnter = (labelName: string) => {
    if (this.hoveredLabelName !== labelName) {
      this.uxService.setHoveredLabelName(labelName);
    }
  };
  handleItemMouseLeave = () => {
    this.uxService.setHoveredLabelName('');
  };
  handleTablePaneOpen = (field: Field) => {
    this.setIsTablePaneOpen.emit(true);
    this.tableFieldKey = field.fieldKey;
  };
  noop = () => {};
}
