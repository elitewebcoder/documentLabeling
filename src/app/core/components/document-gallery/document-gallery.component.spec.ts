import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DocumentGalleryComponent } from './document-gallery.component';

describe('DocumentGalleryComponent', () => {
  let component: DocumentGalleryComponent;
  let fixture: ComponentFixture<DocumentGalleryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ DocumentGalleryComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DocumentGalleryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
