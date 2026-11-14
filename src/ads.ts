// The one place the game talks to ad networks and portals. Game code never changes per platform.
// Platform is chosen at build time: `npm run build:crazygames` sets VITE_PLATFORM=crazygames.
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

const PLATFORM: string = import.meta.env.VITE_PLATFORM ?? 'dev';
let cg: CrazySDK | null = null;

/** 'rewarded' = watched to the end; 'no-ad' = none available now; 'adblock' = blocked by the player; 'off' = ads disabled this session. */
export type RewardResult = 'rewarded' | 'no-ad' | 'adblock' | 'off';

export async function initPlatform() {
  if (PLATFORM !== 'crazygames') return;
  try {
    await new Promise<void>((ok, fail) => {
      const s = Object.assign(document.createElement('script'), { src: 'https://sdk.crazygames.com/crazygames-sdk-v3.js', onload: ok, onerror: fail });
      document.head.append(s);
    });
    const sdk = (window as unknown as { CrazyGames: { SDK: CrazySDK } }).CrazyGames.SDK;
    await sdk.init();
    if (sdk.environment === 'disabled') return; // not on CrazyGames: calls would throw
    cg = sdk;
    setSiteMuted(sdk.game.settings.muteAudio);
    sdk.game.addSettingsChangeListener((s) => setSiteMuted(s.muteAudio));
  } catch { /* SDK blocked (adblock/offline): the game still plays, just without ads */ }
}

function request(type: 'rewarded' | 'midgame'): Promise<RewardResult> {
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

export const gameplayStart = () => cg?.game.gameplayStart();
export const gameplayStop = () => cg?.game.gameplayStop();
export const happytime = () => cg?.game.happytime();
