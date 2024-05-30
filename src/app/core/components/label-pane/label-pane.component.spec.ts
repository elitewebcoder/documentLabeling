import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LabelPaneComponent } from './label-pane.component';

describe('LabelPaneComponent', () => {
  let component: LabelPaneComponent;
  let fixture: ComponentFixture<LabelPaneComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ LabelPaneComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LabelPaneComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
