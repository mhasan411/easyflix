import {ChangeDetectionStrategy, Component, OnInit} from '@angular/core';
import {Creator, Network, Season, Show, ShowDetails} from '@app/models/show';
import {ActivatedRoute, Router} from '@angular/router';
import {EMPTY, Observable} from 'rxjs';
import {filter, map, take} from 'rxjs/operators';
import {Cast} from '@app/models/movie';
import {DomSanitizer, SafeStyle} from '@angular/platform-browser';
import {CoreService} from '@app/services/core.service';
import {FilesService} from '@app/services/files.service';
import {VideoService} from '@app/services/video.service';
import {FilterService} from '@app/services/filter.service';

@Component({
  selector: 'app-show-info',
  template: `
    <ng-container *ngIf="show$ | async as show">
      <section class="info">
        <dl class="left">
          <dt>Original name</dt>
          <dd><span class="overflow-ellipsis">{{ show.original_name }}</span></dd>
          <dt>First air date</dt>
          <dd>{{ show.first_air_date | date:'mediumDate'}}</dd>
          <dt>Episodes</dt>
          <dd *ngIf="show.details as details; else loading">
            <span *ngIf="getTotalAvailableEpisodesCount(show) < details.number_of_episodes">
              {{ getTotalAvailableEpisodesCount(show) }} /
            </span>
            <span>{{ details.number_of_episodes }}</span>
          </dd>
          <dt>Seasons</dt>
          <dd *ngIf="show.details as details; else loading">
            <span *ngIf="getAvailableSeasons(show).length !== details.number_of_seasons">
              {{ getAvailableSeasons(show).length }} /
            </span>
            <span>{{ details.number_of_seasons }}</span>
          </dd>
          <ng-template #loading>
            <dd class="loading">Loading...</dd>
          </ng-template>
        </dl>
        <dl class="right">
          <dt>Language</dt>
          <dd>
            <a class="search" (click)="searchLanguage(show.original_language)">
              {{ getLanguage(show.original_language) | async }}
            </a>
          </dd>
          <dt>Genres</dt>
          <dd *ngIf="show.details as details; else loading">
            <ng-container *ngFor="let genre of getGenres(details); last as isLast">
              <a class="search" (click)="searchGenre(genre)">{{genre}}</a>{{ isLast ? '' : ',' }}
            </ng-container>
          </dd>
          <dt>Created by</dt>
          <dd *ngIf="show.details as details; else loading">
            <ng-container *ngFor="let creator of getCreatedBy(details.created_by); last as isLast">
              <a class="search" (click)="searchPeople(creator)">{{creator}}</a>{{ isLast ? '' : ',' }}
            </ng-container>
          </dd>
          <dt>Networks</dt>
          <dd *ngIf="show.details as details; else loading">
            <ng-container *ngFor="let network of getNetworks(details.networks); last as isLast">
              <a class="search" (click)="searchNetwork(network)">{{network}}</a>{{ isLast ? '' : ',' }}
            </ng-container>
          </dd>
        </dl>
      </section>
      <div class="cast" *ngIf="show.details as details; else castLoading">
        <div class="people" *ngFor="let actor of details.credits.cast">
          <div class="profile" [style]="getActorStyle(actor) | async">
            <mat-icon *ngIf="!actor.profile_path">person</mat-icon>
          </div>
          <div class="name">
            <a class="search" (click)="searchPeople(actor.name)">{{ actor.name }}</a>
          </div>
        </div>
      </div>
      <ng-template #castLoading>
        <!--TODO -->
      </ng-template>
    </ng-container>
  `,
  styles: [`
    :host {
      display: block;
    }
    .info {
      display: flex;
    }
    dl {
      display: inline-flex;
      flex-direction: row;
      flex-wrap: wrap;
      font-weight: 300;
      margin: 0;
      width: 100%;
      line-height: 1.9;
    }
    dl.left, dl.right {
      width: 50%;
    }
    dt {
      width: 9rem;
      padding-right: 1rem;
      box-sizing: border-box;
      font-weight: 400;
      margin: 0;
      text-align: right;
    }
    dd {
      width: calc(100% - 9rem);
      align-items: center;
      margin: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .right dt {
      width: 7rem;
    }
    .right dd {
      width: calc(100% - 7rem);
    }
    .cast {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      max-width: 1300px;
      width: 100%;
      height: 258px;
      padding-top: 2rem;
    }
    .people {
      display: flex;
      flex-direction: column;
      width: 140px; /* 185 */
    }
    .profile {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 210px; /* 278 */
      background-size: cover;
      background-position: 50% 50%;
    }
    .profile mat-icon {
      font-size: 6rem;
      height: 6rem;
      width: 6rem;
    }
    .name {
      font-weight: 400;
      font-size: 14px;
      height: 3rem;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 0 .5rem;
    }
    a.search {
      cursor: pointer;
    }
    a.search:hover {
      text-decoration: underline;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShowInfoComponent implements OnInit {

  show$: Observable<Show>;

  constructor(
    private core: CoreService,
    private files: FilesService,
    private video: VideoService,
    private filters: FilterService,
    private router: Router,
    private route: ActivatedRoute,
    private sanitizer: DomSanitizer,
  ) {}

  ngOnInit(): void {
    this.route.parent.data.subscribe(
      (data: { show$: Observable<Show> }) => this.show$ = data.show$
    );
  }

  getActorStyle(actor: Cast): Observable<SafeStyle> {
    if (actor.profile_path) {
      return this.core.getConfig().pipe(
        filter(s => !!s),
        take(1),
        map(config => this.sanitizer.bypassSecurityTrustStyle(
          `background-image: url(${config.images.secure_base_url}w185${actor.profile_path})`
        ))
      );
    }
    return EMPTY;
  }

  getLanguage(languageCode: string): Observable<string> {
    return this.core.getConfig().pipe(
      filter(s => !!s),
      take(1),
      map(config =>
        config.languages
          .find(language => language.iso_639_1 === languageCode)
          .english_name
      )
    );
  }

  getCreatedBy(creators: Creator[]): string[] {
    return creators.map(creator => creator.name);
  }

  getGenres(details: ShowDetails): string[] {
    return details.genres.map(genre => genre.name);
  }

  getNetworks(networks: Network[]): string[] {
    return networks.map(network => network.name);
  }

  getTotalAvailableEpisodesCount(show: Show): number {
    return Array.from(
      new Set(show.files.map(file => `s${file.seasonNumber}e${file.episodeNumber}`))
    ).length;
  }

  getAvailableSeasons(show: Show): Season[] {
    const seasonNumbers = Array.from(new Set(show.files.map(file => file.seasonNumber)));
    return show.details.seasons.filter(season => seasonNumbers.includes(season.season_number));
  }

  searchPeople(person: string) {
    this.router.navigate(['/', {outlets: {show: null}}], {queryParamsHandling: 'preserve'}).then(
      () => {
        this.filters.clear();
        this.filters.setSearch(person);
      }
    );
  }

  searchLanguage(language: string) {
    this.router.navigate(['/', {outlets: {show: null}}], {queryParamsHandling: 'preserve'}).then(
      () => {
        this.filters.clear();
        this.filters.setLanguages([language]);
      }
    );
  }

  searchGenre(genre: string) {
    this.router.navigate(['/', {outlets: {show: null}}], {queryParamsHandling: 'preserve'}).then(
      () => {
        this.filters.clear();
        this.filters.setGenres([genre]);
      }
    );
  }



  searchTag(tag: string) {
    this.router.navigate(['/', {outlets: {show: null}}], {queryParamsHandling: 'preserve'}).then(
      () => {
        this.filters.clear();
        this.filters.setTags([tag]);
      }
    );
  }

  searchNetwork(network: string) {
  }

}