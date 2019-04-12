import {Injectable} from '@angular/core';
import {Observable, zip} from 'rxjs';

import {Folder, Library, LibraryFile} from '@app/models/file';
import {HttpClient} from '@angular/common/http';
import {Store} from '@ngrx/store';
import {getAllFiles, getFileById, getFilesLoaded, getFilesOfFolder, State} from '@app/reducers';
import {FilesActionTypes, LoadFiles} from '@app/actions/files.actions';
import {Actions} from '@ngrx/effects';
import {ServiceHelper} from '@app/services/service-helper';

@Injectable()
export class FilesService extends ServiceHelper {

  constructor(private httpClient: HttpClient, store: Store<State>, actions$: Actions) {
    super(store, actions$);
  }

  getAll(): Observable<LibraryFile[]> {
    return this.store.select(getAllFiles);
  }

  getFilesOfFolder(folder: Folder | Library): Observable<LibraryFile[]> {
    return this.store.select(getFilesOfFolder, folder);
  }

  getById(id: string): Observable<LibraryFile> {
    return this.store.select(getFileById, id);
  }

  getByIds(ids: string[]): Observable<LibraryFile[]> {
    return zip(...ids.map(id => this.store.select(getFileById, id)));
  }

  getLoaded(): Observable<boolean> {
    return this.store.select(getFilesLoaded);
  }

  load(): Observable<LibraryFile[]> {
    return this.dispatchActionObservable(
      new LoadFiles(),
      FilesActionTypes.LoadFilesSuccess,
      FilesActionTypes.LoadFilesError
    );
  }

}
