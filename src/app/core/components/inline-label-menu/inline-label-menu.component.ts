import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { isEqual } from 'lodash';
import { Field, FieldFormat, FieldType, PrimitiveField } from 'src/app/models/customModels';

import { CustomModelService } from 'src/app/services/custom-model.service';
import { encodeLabelString, getColorByFieldKey } from 'src/app/utils/customModel';

@Component({
  selector: 'app-inline-label-menu',
  templateUrl: './inline-label-menu.component.html',
  styleUrls: ['./inline-label-menu.component.scss']
})
export class InlineLabelMenuComponent implements OnInit, OnChanges {
  @Input() enabledTypes: FieldType[] = [];
  @Input() showPopup = false;
  @Input() positionTop = 0;
  @Input() positionLeft = 0;

  items: any[] = [];
  searchText = "";
  fields: Field[] = [];
  colorForFields: any[] = [];
  hideInlineLabelMenu = false;

  get top(): string {
    return `${this.positionTop}px`;
  }

  get left(): string {
    return `${this.positionLeft}px`;
  }

  constructor(
    readonly customModelService: CustomModelService
  ) { }

  ngOnInit(): void {
    this.customModelService.customModelState$.subscribe(({
      fields,
      colorForFields,
      hideInlineLabelMenu
    }) => {
      if (!isEqual(fields, this.fields)) {
        this.fields = fields;
        this.prepareItems();
      }
      if (!isEqual(colorForFields, this.colorForFields)) {
        this.colorForFields = colorForFields;
        this.prepareItems();
      }
      if (hideInlineLabelMenu !== this.hideInlineLabelMenu) {
        this.hideInlineLabelMenu = hideInlineLabelMenu;
      }
    })
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['enabledTypes']) {
      this.prepareItems();
    }
  }

  prepareItems() {
    const lowerSearchText = this.searchText.toLocaleLowerCase();
    const items = this.fields
      .filter((f) => f.fieldType !== FieldType.Array && f.fieldType !== FieldType.Object)
      .filter((f) => f.fieldKey.toLocaleLowerCase().includes(lowerSearchText))
      .map((f) => {
          return {
              iconName: "CircleFill",
              iconColor: getColorByFieldKey(this.colorForFields, f.fieldKey),
              text: f.fieldKey,
              type: f.fieldType,
          };
      })
      .filter((f) => this.enabledTypes.includes(f.type));
    this.items = items.length > 0
      ? items 
      : [{
          text: "Field",
          iconName: "GroupList",
          isCreate: true,
          iconColor: "rgb(16, 110, 190)",
          fieldType: FieldType.String,
        },
        {
          text: "Select a subscription",
          iconName: "CheckboxComposite",
          isCreate: true,
          iconColor: "rgb(16, 110, 190)",
          fieldType: FieldType.SelectionMark,
        },
        {
          text: "Signature",
          iconName: "WhiteBoardApp16",
          isCreate: true,
          iconColor: "rgb(16, 110, 190)",
          fieldType: FieldType.Signature,
        }];
  }

  handleFieldClick(fieldKey: string) {
    this.customModelService.assignLabel(encodeLabelString(fieldKey));
    if (this.searchText !== "") {
      this.searchText = "";
      this.prepareItems();
    }
  }

  async handleCreateFieldClick(fieldType: FieldType) {
    if (!this.searchText) {
        return; // Ignore if fieldKey is empty;
    }
    const field: PrimitiveField = { fieldKey: this.searchText, fieldType, fieldFormat: FieldFormat.NotSpecified };
    await this.customModelService.addField(field);
    this.customModelService.assignLabel(encodeLabelString(this.searchText));
    if (this.searchText !== "") {
      this.searchText = "";
      this.prepareItems();
    }
  }

  handleSearchTextChange(e: any) {
    this.searchText = e.target.value || "";
    this.prepareItems();
  }

}
