import {ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {VideoService} from '@app/services/video.service';
import {Observable, Subscription, zip} from 'rxjs';
import {filter, first, map, skip, take, tap, throttleTime} from 'rxjs/operators';
import {CoreService} from '@app/services/core.service';
import {ActivatedRoute, Router} from '@angular/router';
import {MatDialog} from '@angular/material';
import {ErrorDialogComponent} from '@app/components/dialogs/error-dialog.component';
import {environment} from '@env/environment';
import {FilesService} from '@app/services/files.service';

@Component({
  selector: 'app-video',
  template: `
    <video #video
           autoplay
           *ngIf="src$ | async as source"
           [src]="source"
           [volume]="volume$ | async"
           [currentTime]="currentTime"
           [muted]="muted$ | async"
           (play)="onPlay()"
           (playing)="onPlaying()"
           (pause)="onPause()"
           (ended)="onEnded()"
           (canplay)="onCanPlay()"
           (canplaythrough)="onCanPlayThrough()"
           (loadedmetadata)="onLoadedMetadata($event)"
           (timeupdate)="onTimeUpdate($event)"
           (waiting)="onWaiting()"
           (error)="onError($event)">
    </video>
    <app-controls
      [playing]="playing$ | async"
      [currentTime]="currentTime$ | async"
      [duration]="duration$ | async"
      [loading]="loading$ | async"
      [volume]="volume$ | async"
      [muted]="muted$ | async"
      (seekTo)="seekTo($event)"
      (openSidenav)="openSidenav()"
      (resume)="play()"
      (pause)="pause()"
      (seekForward)="seekForward()"
      (seekBackward)="seekBackward()"
      (setVolume)="setVolume($event)"
      (setMuted)="setMuted($event)"
      (closeVideo)="closeVideo()">
    </app-controls>
  `,
  styles: [`
    :host {
      height: 100%;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: black;
      position: absolute;
      top: 0;
      left: 0;
      z-index: 30;
    }
    video {
      width: 100%;
      height: 100%;
    }
    app-controls {
      position: absolute;
      left: 0;
      top: 0;
      right: 0;
      bottom: 0;
      z-index: 1;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VideoComponent implements OnInit, OnDestroy {

  @ViewChild('video', { static: false })
  videoRef: ElementRef;

  src$: Observable<string>;
  volume$: Observable<number>;
  muted$: Observable<boolean>;
  currentTime = 0;

  playing$: Observable<boolean>;
  currentTime$: Observable<number>;
  duration$: Observable<number>;
  loading$: Observable<boolean>;

  subscriptions: Subscription[] = [];

  constructor(
    private core: CoreService,
    private video: VideoService,
    private files: FilesService,
    private router: Router,
    private route: ActivatedRoute,
    private dialog: MatDialog
  ) { }

  ngOnInit() {
    this.src$ = this.video.getSource().pipe(
      filter(s => !!s),
      tap(() => this.video.setLoading(true))
    );
    this.volume$ = this.video.getVolume();
    this.muted$ = this.video.getMuted();

    this.playing$ = this.video.getPlaying();
    this.currentTime$ = this.video.getCurrentTime();
    this.duration$ = this.video.getDuration();
    this.loading$ = this.video.getLoading();

    const id = this.route.snapshot.paramMap.get('id');
    this.files.getById(id).pipe(
      first(video => !!video),
    ).subscribe(video => {
      this.video.setSource(`${environment.endpoint}/videos/${video.libraryName}/${video.id}`);
      const play = this.route.snapshot.queryParamMap.get('play');
      if (play && +play === 0) {
        setTimeout(() => this.pause());
      }
    });

    this.route.queryParamMap.pipe(
      take(1),
      map(params => params.get('time')),
      filter(time => time !== null),
      tap(time => this.seekTo(+time))
    ).subscribe();

    this.subscriptions.push(

      this.video.getCurrentTime().pipe(
        throttleTime(1000),
        map(time => Math.floor(time)),
        tap(time => this.router.navigate(
          [],
          { queryParams: { time }, queryParamsHandling: 'merge', replaceUrl: true }
        ))
      ).subscribe(),

      this.video.getPlaying().pipe(
        skip(1),
        tap(playing => this.router.navigate(
          [],
          { queryParams: { play: playing ? 1 : 0 }, queryParamsHandling: 'merge', replaceUrl: true })
        )
      ).subscribe()

    );
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  openSidenav() {
    this.core.toggleSidenav();
  }

  play() {
    (this.videoRef.nativeElement as HTMLMediaElement).play().then(
      () => {},
      error => console.error(error)
    );
  }

  pause() {
    (this.videoRef.nativeElement as HTMLMediaElement).pause();
  }

  seekTo(time: number) {
    this.currentTime = time;
  }

  seekForward() {
    zip(this.currentTime$, this.duration$).pipe(take(1)).subscribe(
      arr => {
        const currentTime = arr[0];
        const duration = arr[1];
        this.seekTo(Math.min(currentTime + 30, duration));
      }
    );
  }

  seekBackward() {
    this.currentTime$.pipe(take(1)).subscribe(
      currentTime => this.seekTo(Math.max(currentTime - 10, 0))
    );
  }

  setVolume(volume: number) {
    this.video.setVolume(volume);
  }

  setMuted(muted: boolean) {
    this.video.setMuted(muted);
  }

  onPlay() {
    this.video.setLoading(false);
    this.video.setPlaying(true);
  }

  onPlaying() {
    this.onPlay();
  }

  onPause() {
    this.video.setPlaying(false);
  }

  onEnded() {
    this.video.setPlaying(false);
  }

  onCanPlay() {
    this.video.setLoading(false);
  }

  onCanPlayThrough() {
    this.video.setLoading(false);
  }

  onLoadedMetadata(event) {
    this.video.setDuration(event.target.duration);
  }

  onTimeUpdate(event) {
    // Fix for Edge ?
    this.video.getLoading().pipe(
      take(1),
      tap(loading => loading ? this.video.setLoading(false) : {})
    ).subscribe();

    this.video.updateCurrentTime(event.target.currentTime);
  }

  onWaiting() {
    this.video.setLoading(true);
  }

  onError(event) {
    // https://developer.mozilla.org/en-US/docs/Web/API/MediaError/code
    console.error('VideoError', event.target.error);
    this.video.setLoading(false);
    if (event.target.error.code === 4) {
      this.dialog.open(ErrorDialogComponent, {
        data: {
          title: 'Playback failed',
          message: 'This format might not be supported by your current browser.<br/> Please try using another browser or report this error.'
        }
      });
    } else {
      this.dialog.open(ErrorDialogComponent, {
        data: {
          title: 'An error occurred',
          message: event.target.error.message
        }
      });
    }
  }

  closeVideo() {
    this.router.navigate(
      ['app', { outlets: { player: null } }],
      { queryParams: { time: null, play: null }, queryParamsHandling: 'merge', replaceUrl: true }
    ).then(() => {
      this.video.setSource(null);
      this.video.updateCurrentTime(0);
      this.video.setDuration(0);
    });
  }

}
