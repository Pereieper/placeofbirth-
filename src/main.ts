import { enableProdMode, importProvidersFrom, APP_INITIALIZER } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { provideRouter } from '@angular/router';
import { routes } from './app/app.routes';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { Storage } from '@ionic/storage-angular';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { Drivers } from '@ionic/storage';
import { SQLite } from '@ionic-native/sqlite/ngx';
import { HttpClientModule, provideHttpClient } from '@angular/common/http';
import { HTTP } from '@awesome-cordova-plugins/http/ngx';
import { Capacitor } from '@capacitor/core';

// ✅ Create and initialize Ionic Storage manually
let storageInstance: Storage;
export function provideStorageFactory() {
  const storage = new Storage({
    name: '__mydb',
    driverOrder: [(Drivers as any).SQLite, Drivers.IndexedDB, Drivers.LocalStorage],
  });

  return () =>
    storage.create().then(created => {
      storageInstance = created;
    });
}

bootstrapApplication(AppComponent, {
  providers: [
    provideIonicAngular(),
    provideHttpClient(), // ✅ Modern HttpClient provider (safer + tree-shakable)
    importProvidersFrom(HttpClientModule, IonicModule.forRoot(), FormsModule),
    provideRouter(routes),

    // ✅ Initialize Ionic Storage
    {
      provide: APP_INITIALIZER,
      useFactory: provideStorageFactory,
      multi: true,
    },
    {
      provide: Storage,
      useFactory: () => storageInstance,
    },

    // ✅ Native plugins
    SQLite,
    HTTP,
  ],
}).catch(err => console.error('Bootstrap error:', err));
