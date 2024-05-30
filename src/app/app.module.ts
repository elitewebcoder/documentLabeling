import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LabelPageComponent } from './core/label-page/label-page.component';
import { ImageMapComponent } from './core/components/image-map/image-map.component';
import { LabelPaneComponent } from './core/components/label-pane/label-pane.component';
import { DocumentGalleryComponent } from './core/components/document-gallery/document-gallery.component';
import { InlineLabelMenuComponent } from './core/components/inline-label-menu/inline-label-menu.component';

@NgModule({
  declarations: [
    AppComponent,
    LabelPageComponent,
    ImageMapComponent,
    LabelPaneComponent,
    DocumentGalleryComponent,
    InlineLabelMenuComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
