// The one place the game talks to ad networks and portals. Game code never changes per platform.
// Platform is chosen at build time: `npm run build:crazygames` / `build:poki` set VITE_PLATFORM.
import { setAdPlaying, setSiteMuted } from './sfx.ts';

type AdError = { code: string; message: string };
type CrazySDK = {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  ad: { requestAd(type: 'rewarded' | 'midgame', cb: { adStarted?: () => void; adFinished?: () => void; adError?: (e: AdError) => void }): void };
  game: {
    gameplayStart(): void;
    gameplayStop(): void;
    happytime(): void;
    settings: { muteAudio: boolean };
    addSettingsChangeListener(fn: (s: { muteAudio: boolean }) => void): void;
  };
};
type PokiSDK = {
  init(): Promise<void>;
  gameLoadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(before?: () => void): Promise<void>;
  rewardedBreak(before?: () => void): Promise<boolean>;
};

const PLATFORM: string = import.meta.env.VITE_PLATFORM ?? 'dev';
let cg: CrazySDK | null = null;
let poki: PokiSDK | null = null;

/** Games between full-screen ads. Poki decides itself whether a break really shows, so it gets asked every time. */
export const INTERSTITIAL_EVERY = PLATFORM === 'poki' ? 1 : 2;

/** 'rewarded' = watched to the end; 'no-ad' = none available now; 'adblock' = blocked by the player; 'off' = ads disabled this session. */
export type RewardResult = 'rewarded' | 'no-ad' | 'adblock' | 'off';

const loadScript = (src: string) => new Promise<void>((ok, fail) => {
  document.head.append(Object.assign(document.createElement('script'), { src, onload: ok, onerror: fail }));
});

export async function initPlatform() {
  try {
    if (PLATFORM === 'crazygames') {
      await loadScript('https://sdk.crazygames.com/crazygames-sdk-v3.js');
      const sdk = (window as unknown as { CrazyGames: { SDK: CrazySDK } }).CrazyGames.SDK;
      await sdk.init();
      if (sdk.environment === 'disabled') return; // not on CrazyGames: calls would throw
      cg = sdk;
      setSiteMuted(sdk.game.settings.muteAudio);
      sdk.game.addSettingsChangeListener((s) => setSiteMuted(s.muteAudio));
    } else if (PLATFORM === 'poki') {
      await loadScript('https://game-cdn.poki.com/scripts/v2/poki-sdk.js');
      const sdk = (window as unknown as { PokiSDK: PokiSDK }).PokiSDK;
      await sdk.init().catch(() => {}); // Poki: "something went wrong, load your game anyway"
      poki = sdk;
    }
  } catch { /* SDK blocked (adblock/offline): the game still plays, just without ads */ }
}

function request(type: 'rewarded' | 'midgame'): Promise<RewardResult> {
  if (poki) {
    const sdk = poki;
    const done = (r: RewardResult) => { setAdPlaying(false); return r; };
    return type === 'rewarded'
      ? sdk.rewardedBreak(() => setAdPlaying(true)).then((ok) => done(ok ? 'rewarded' : 'no-ad'), () => done('no-ad'))
      : sdk.commercialBreak(() => setAdPlaying(true)).then(() => done('rewarded'), () => done('no-ad'));
  }
  if (!cg) {
    // shortcut: dev builds fake a watched ad; Android (AdMob) gets its own branch here before launch
    return new Promise((r) => setTimeout(() => r(PLATFORM === 'dev' ? 'rewarded' : 'off'), 600));
  }
  const sdk = cg;
  return new Promise((resolve) => sdk.ad.requestAd(type, {
    adStarted: () => setAdPlaying(true), // mute when the ad really starts, not on request
    adFinished: () => { setAdPlaying(false); resolve('rewarded'); },
    adError: (e) => { setAdPlaying(false); resolve(e.code === 'adsDisabled' ? 'off' : e.code === 'adblock' ? 'adblock' : 'no-ad'); },
  }));
}

/** Rewarded video. Only grant the reward when this resolves to 'rewarded'. */
export const showRewarded = () => request('rewarded');

/** Ad between games. Resolves when closed or unavailable; the portal caps how often it really shows. */
export const showInterstitial = async () => { await request('midgame'); };

/** First screen is up and playable (Poki measures load-to-play from this). */
export const loadingFinished = () => poki?.gameLoadingFinished();
export const gameplayStart = () => { cg?.game.gameplayStart(); poki?.gameplayStart(); };
export const gameplayStop = () => { cg?.game.gameplayStop(); poki?.gameplayStop(); };
export const happytime = () => cg?.game.happytime();
