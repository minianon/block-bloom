import Phaser from 'phaser';
import './style.css';
import {
  SIZE, emptyBoard, dealTray, canPlace, place, previewClear, revive, isEmpty, score, anyMove, offerContinue, decodeSave, PERFECT_BONUS, COLORS,
  type Board, type Piece, type Cell,
} from './logic.ts';
import { sfx } from './sfx.ts';
import { initPlatform, showRewarded, showInterstitial, gameplayStart, gameplayStop, happytime } from './ads.ts';
import { W, H, PANEL, GREEN, ROSE, BLUE, text, loadIcons, drawBlock, button, iconButton, settingsRow, modal, closeModal, goTo, fitOrientation, wideScreen } from './ui.ts';
import { Title } from './title.ts';

const CELL = 80, GAP = 6;
// Layout, set per orientation in layout(): portrait stacks header/board/tray; landscape puts board left, the rest right.
let BOARD_X = 0, BOARD_Y = 0, TRAY_X = 0, TRAY_W = 0, TRAY_Y = 0;
function layout() {
  const wide = W > H;
  BOARD_X = wide ? 60 : (W - SIZE * CELL) / 2;
  BOARD_Y = wide ? (H - SIZE * CELL) / 2 : 290;
  TRAY_X = wide ? 724 : 0;
  TRAY_W = W - TRAY_X;
  TRAY_Y = wide ? 500 : BOARD_Y + SIZE * CELL + 190;
}
const boardMidX = () => BOARD_X + SIZE * CELL / 2;
const TRAY_SCALE = 0.55;
const LIFT = 40; // gap between the finger and the bottom of a dragged piece, so the finger never hides it
const INTERSTITIAL_EVERY = 2; // games between full-screen ads
const CELL_BG = 0x1c2057;

let gamesFinished = 0; // survives scene restarts
let adsOff = false; // portal said ads are disabled this session: never show the Continue button

const cellX = (c: number) => BOARD_X + c * CELL + GAP / 2;
const cellY = (r: number) => BOARD_Y + r * CELL + GAP / 2;
const BLOCK = CELL - GAP;

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* storage blocked */ } },
};

class Play extends Phaser.Scene {
  board!: Board;
  tray: (Piece | null)[] = [];
  trayViews: Phaser.GameObjects.Container[] = [];
  boardG!: Phaser.GameObjects.Graphics;
  ghostG!: Phaser.GameObjects.Graphics;
  scoreText!: Phaser.GameObjects.Text;
  bestText!: Phaser.GameObjects.Text;
  overlay: Phaser.GameObjects.Container | null = null;
  points = 0;
  shown = 0; // score on screen, counts up toward points
  streak = 0;
  best = 0;
  startBest = 0;
  revived = false;
  over = false;
  watchedAd = false; // a rewarded video this game means no between-games ad (portal rule)
  hint: Phaser.GameObjects.Container | null = null;

  constructor() { super('play'); }

  preload() { loadIcons(this); }

  create(data: { resume?: boolean }) {
    fitOrientation(this.game);
    layout();
    this.input.enabled = true;
    this.cameras.main.fadeIn(250, 20, 22, 63);
    this.best = Number(store.get('bb-best')) || 0;
    this.startBest = this.best;
    this.overlay = this.hint = null;
    this.trayViews = [];
    this.revived = this.watchedAd = this.over = false;
    this.points = this.streak = 0;
    document.body.classList.remove('dim');

    const save = data?.resume ? decodeSave(store.get('bb-save')) : null;
    if (save) ({ board: this.board, tray: this.tray, points: this.points, streak: this.streak, revived: this.revived } = save);
    else { this.board = emptyBoard(); store.del('bb-save'); }
    this.shown = this.points;

    this.drawHeader();
    this.boardG = this.add.graphics();
    this.ghostG = this.add.graphics();
    this.add.graphics().fillStyle(PANEL, 0.35).fillRoundedRect(TRAY_X + 24, TRAY_Y - 120, TRAY_W - 48, 240, 36);
    this.drawBoard();
    if (save) this.showTray(); else this.refillTray();
    if (!this.over) {
      this.showHint();
      gameplayStart();
    }

    this.input.on('dragstart', (p: Phaser.Input.Pointer, view: Phaser.GameObjects.Container) => {
      this.hideHint();
      this.tweens.killTweensOf(view);
      view.setScale(1).setDepth(10);
      this.follow(p, view);
      sfx.pick();
    });
    this.input.on('drag', (p: Phaser.Input.Pointer, view: Phaser.GameObjects.Container) => {
      this.follow(p, view);
      this.drawGhost(view);
    });
    this.input.on('dragend', (_p: Phaser.Input.Pointer, view: Phaser.GameObjects.Container) => this.drop(view));

    // Leaving the app or tab mid-game pauses it.
    const autoPause = () => { if (!this.overlay) this.pause(); };
    this.game.events.on(Phaser.Core.Events.BLUR, autoPause);
    this.game.events.on(Phaser.Core.Events.HIDDEN, autoPause);
    this.events.once('shutdown', () => {
      this.game.events.off(Phaser.Core.Events.BLUR, autoPause);
      this.game.events.off(Phaser.Core.Events.HIDDEN, autoPause);
    });
  }

  update() {
    if (this.shown === this.points) return;
    this.shown = this.points - this.shown < 1 ? this.points : this.shown + Math.ceil((this.points - this.shown) * 0.15);
    this.scoreText.setText(String(this.shown));
  }

  drawHeader() {
    const wide = W > H, midX = TRAY_X + TRAY_W / 2;
    iconButton(this, wide ? W - 70 : 70, 80, 'pause', () => this.pause());

    const pill = this.add.graphics().fillStyle(PANEL, 0.45).fillRoundedRect(-110, -30, 220, 60, 30);
    const crown = this.add.image(-72, -1, 'crown').setDisplaySize(36, 36);
    this.bestText = this.add.text(-40, 0, String(this.best), text(32)).setOrigin(0, 0.5);
    this.add.container(wide ? midX - 110 : W - 140, 80, [pill, crown, this.bestText]);

    this.scoreText = this.add.text(wide ? midX : W / 2, wide ? 240 : 185, String(this.points), text(96)).setOrigin(0.5).setShadow(0, 6, 'rgba(0,0,0,0.3)', 0);
  }

  /** Dragged piece sits centered just above the finger, the same for every piece and wherever it was grabbed. */
  follow(p: Phaser.Input.Pointer, view: Phaser.GameObjects.Container) {
    view.setPosition(p.worldX - view.getData('cols') * CELL / 2, p.worldY - view.getData('rows') * CELL - LIFT);
  }

  save() {
    if (this.over) return;
    store.set('bb-save', JSON.stringify({ board: this.board, tray: this.tray, points: this.points, streak: this.streak, revived: this.revived }));
  }

  pieceOf = (view: Phaser.GameObjects.Container) => this.tray[view.getData('slot')]!;

  /** Board cell under the dragged piece's top-left block, if the piece fits there. */
  dropSpot(view: Phaser.GameObjects.Container) {
    const col = Math.round((view.x - BOARD_X) / CELL);
    const row = Math.round((view.y - BOARD_Y) / CELL);
    return canPlace(this.board, this.pieceOf(view), row, col) ? { row, col } : null;
  }

  /** Faint piece where it would land, and the lines it would clear lit up in its color. */
  drawGhost(view: Phaser.GameObjects.Container) {
    const g = this.ghostG.clear();
    const spot = this.dropSpot(view);
    if (!spot) return;
    const piece = this.pieceOf(view);
    for (const [r, c] of previewClear(this.board, piece, spot.row, spot.col)) drawBlock(g, cellX(c), cellY(r), BLOCK, piece.color, 0.85);
    for (const [r, c] of piece.cells) drawBlock(g, cellX(spot.col + c), cellY(spot.row + r), BLOCK, piece.color, 0.4);
  }

  drop(view: Phaser.GameObjects.Container) {
    this.ghostG.clear();
    const slot: number = view.getData('slot');
    const spot = this.overlay ? null : this.dropSpot(view); // auto-pause mid-drag: send the piece home
    if (!spot) {
      if (!this.overlay) sfx.bad();
      this.tweens.add({ targets: view, x: view.getData('homeX'), y: view.getData('homeY'), scale: view.getData('homeScale'), duration: 180, ease: 'Back.easeOut' });
      return;
    }
    const piece = this.tray[slot]!;
    const { lines, cleared } = place(this.board, piece, spot.row, spot.col);
    this.streak = lines ? this.streak + 1 : 0;
    this.points += score(piece.cells.length, lines, this.streak);
    view.destroy();
    this.tray[slot] = null;
    this.drawBoard();
    this.flash(piece.cells.map(([r, c]) => [spot.row + r, spot.col + c]), 0.5, 200);

    if (lines && isEmpty(this.board)) {
      this.points += PERFECT_BONUS;
      sfx.perfect();
      happytime();
      this.popText('PERFECT!', `+${PERFECT_BONUS}`);
    } else if (lines) {
      sfx.clear(lines, this.streak);
      if (lines > 1) this.popText(['', '', 'DOUBLE!', 'TRIPLE!'][lines] ?? 'AMAZING!', `${lines} lines`);
      else if (this.streak > 1) this.popText(`COMBO x${this.streak}`);
    } else sfx.place();
    if (lines) {
      this.flash(cleared, 0.9, 300);
      this.bloom(cleared);
      if (lines > 1) this.cameras.main.shake(180, 0.006);
    }

    const wasBest = this.best > this.startBest;
    this.updateBest();
    if (!wasBest && this.startBest > 0 && this.best > this.startBest) { this.popText('NEW BEST!', '', Math.max(BOARD_Y - 40, 100)); happytime(); }

    if (this.tray.every((p) => p === null)) this.refillTray();
    else if (!anyMove(this.board, this.tray.filter((p): p is Piece => p !== null))) this.gameOver();
    this.save();
  }

  refillTray() {
    this.tray = dealTray(this.board);
    this.showTray();
  }

  /** Builds the draggable views for whatever is in this.tray (empty slots stay empty). */
  showTray() {
    this.trayViews.forEach((v) => v.destroy());
    this.trayViews = [];
    this.tray.forEach((piece, slot) => {
      if (!piece) return;
      const g = this.add.graphics();
      piece.cells.forEach(([r, c]) => drawBlock(g, c * CELL + GAP / 2, r * CELL + GAP / 2, BLOCK, piece.color));
      const rows = Math.max(...piece.cells.map(([r]) => r)) + 1;
      const cols = Math.max(...piece.cells.map(([, c]) => c)) + 1;
      const boxX = TRAY_X + 24, boxW = TRAY_W - 48; // the tray's rounded box
      const homeScale = Math.min(TRAY_SCALE, (boxW / 3 - 40) / (Math.max(rows, cols) * CELL)); // long pieces shrink to fit their slot
      const homeX = boxX + boxW * (2 * slot + 1) / 6 - (cols * CELL * homeScale) / 2;
      const homeY = TRAY_Y - (rows * CELL * homeScale) / 2;
      const view = this.add.container(homeX, homeY, [g]).setScale(0)
        .setData({ slot, homeX, homeY, homeScale, rows, cols })
        .setInteractive(new Phaser.Geom.Rectangle(-CELL / 2, -CELL / 2, (cols + 1) * CELL, (rows + 1) * CELL), Phaser.Geom.Rectangle.Contains);
      this.tweens.add({ targets: view, scale: homeScale, duration: 260, delay: slot * 70, ease: 'Back.easeOut' });
      this.input.setDraggable(view);
      this.trayViews.push(view);
    });
    if (!anyMove(this.board, this.tray.filter((p): p is Piece => p !== null))) this.gameOver();
  }

  drawBoard() {
    const g = this.boardG.clear();
    g.fillStyle(PANEL, 0.55).fillRoundedRect(BOARD_X - 14, BOARD_Y - 14, SIZE * CELL + 28, SIZE * CELL + 28, 28);
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const v = this.board[r][c];
      if (v !== null) { drawBlock(g, cellX(c), cellY(r), BLOCK, v); continue; }
      g.fillStyle(CELL_BG, 0.9).fillRoundedRect(cellX(c), cellY(r), BLOCK, BLOCK, 12);
      g.fillStyle(0x000000, 0.18).fillRoundedRect(cellX(c), cellY(r), BLOCK, BLOCK * 0.25, { tl: 12, tr: 12, bl: 0, br: 0 }); // inset shadow
    }
  }

  /** White flash over cells that fades out. */
  flash(cells: Cell[], alpha: number, duration: number) {
    const g = this.add.graphics().setDepth(15);
    for (const [r, c] of cells) g.fillStyle(0xffffff, alpha).fillRoundedRect(cellX(c), cellY(r), BLOCK, BLOCK, BLOCK * 0.18);
    this.tweens.add({ targets: g, alpha: 0, duration, onComplete: () => g.destroy() });
  }

  /** Petals burst from every cleared cell. */
  bloom(cells: Cell[]) {
    for (const [r, c] of cells) {
      const cx = cellX(c) + BLOCK / 2, cy = cellY(r) + BLOCK / 2;
      for (let i = 0; i < 3; i++) {
        const color = i === 0 ? 0xffffff : Phaser.Utils.Array.GetRandom(COLORS);
        const petal = this.add.ellipse(cx, cy, 24, 13, color).setDepth(20).setRotation(Math.random() * Math.PI);
        this.tweens.add({
          targets: petal, x: cx + Phaser.Math.Between(-110, 110), y: cy + Phaser.Math.Between(-140, 60),
          angle: Phaser.Math.Between(-220, 220), alpha: 0, scale: 0.3, duration: 700, ease: 'Cubic.easeOut',
          onComplete: () => petal.destroy(),
        });
      }
    }
  }

  popText(title: string, sub = '', y = BOARD_Y + SIZE * CELL / 2) {
    const t = this.add.text(0, 0, title, text(76, '#ffd84d')).setOrigin(0.5).setStroke('#3a1f6b', 12).setShadow(0, 6, 'rgba(0,0,0,0.35)', 0);
    const parts: Phaser.GameObjects.GameObject[] = [t];
    if (sub) parts.push(this.add.text(0, 62, sub, text(36)).setOrigin(0.5).setStroke('#3a1f6b', 8));
    const c = this.add.container(boardMidX(), y, parts).setDepth(50).setScale(0.3); // above the game-over card too
    this.tweens.add({ targets: c, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: c, y: y - 70, alpha: 0, delay: 650, duration: 450, ease: 'Cubic.easeIn', onComplete: () => c.destroy() });
  }

  updateBest() {
    if (this.points <= this.best) return;
    this.best = this.points;
    this.bestText.setText(String(this.best));
    store.set('bb-best', String(this.best));
  }

  /** First game only: a hand drags the first piece onto the board until the player tries it. */
  showHint() {
    if (store.get('bb-hint-done') || !this.trayViews[0]) return;
    const from = this.trayViews[0];
    const hand = this.add.image(0, 0, 'hand').setDisplaySize(84, 84).setOrigin(0.3, 0.1);
    const label = this.add.text(boardMidX(), BOARD_Y + SIZE * CELL / 2, 'Drag blocks onto the board', text(40)).setOrigin(0.5).setStroke('#3a1f6b', 10);
    this.hint = this.add.container(0, 0, [hand, label]).setDepth(35);
    hand.setPosition(from.getData('homeX') + 30, from.getData('homeY') + 30);
    this.tweens.add({ targets: hand, x: BOARD_X + 3 * CELL, y: BOARD_Y + 4 * CELL, duration: 1100, hold: 300, repeat: -1, repeatDelay: 400, ease: 'Sine.easeInOut' });
  }

  hideHint() {
    if (!this.hint) return;
    this.hint.destroy();
    this.hint = null;
    store.set('bb-hint-done', '1');
  }

  pause() {
    if (this.overlay || this.over) return;
    gameplayStop();
    this.save();
    const { root, panel, top } = modal(this, 720, 'PAUSED');
    const resume = () => { closeModal(root); this.overlay = null; gameplayStart(); };
    panel.add([
      button(this, 0, top + 200, 460, 'Resume', 'play', GREEN, resume),
      button(this, 0, top + 330, 460, 'Restart', 'replay', ROSE, () => this.playAgain()),
      button(this, 0, top + 460, 460, 'Home', 'home', BLUE, () => goTo(this, 'title')),
      settingsRow(this, 0, top + 590),
    ]);
    this.overlay = root;
  }

  gameOver() {
    if (this.over) return;
    this.over = true;
    store.del('bb-save');
    sfx.over();
    gameplayStop();
    this.trayViews.forEach((v) => v.active && v.disableInteractive()); // placed pieces are already destroyed
    const newBest = this.points > this.startBest && this.points > 0;
    const canContinue = !this.revived && !adsOff && offerContinue(this.points, this.startBest);
    const { root, panel, top } = modal(this, canContinue ? 820 : 690, 'OUT OF SPACE');
    panel.add([
      this.add.text(0, top + 160, newBest ? 'NEW BEST SCORE' : 'SCORE', text(26, '#ffffff', '600')).setOrigin(0.5).setAlpha(0.7),
      this.add.text(0, top + 240, String(this.points), text(110)).setOrigin(0.5).setShadow(0, 6, 'rgba(0,0,0,0.3)', 0),
      this.add.text(0, top + 330, `Best ${this.best}`, text(30, '#ffd84d', '600')).setOrigin(0.5),
    ]);
    let y = top + 460;
    if (canContinue) {
      const cont = button(this, 0, y, 460, 'Continue', 'video', GREEN, () => this.continueWithAd(cont), 'Watch a short video');
      panel.add(cont);
      y += 130;
    }
    panel.add(button(this, 0, y, 460, 'Play Again', 'replay', ROSE, () => this.playAgain()));
    panel.add(button(this, 0, y + 130, 460, 'Home', 'home', BLUE, () => { gamesFinished++; goTo(this, 'title'); }));
    this.overlay = root;
  }

  async continueWithAd(cont: Phaser.GameObjects.Container) {
    cont.setAlpha(0.6);
    (cont.list[3] as Phaser.GameObjects.Text).setText('Loading video...');
    const result = await showRewarded(); // game-over card stays up and blocks taps while the ad runs
    if (result !== 'rewarded') {
      // no reward without a finished video: say why in the button's place, keep the rest of the card
      adsOff ||= result === 'off';
      const why = { off: 'Videos are off here', adblock: 'Turn off your ad blocker to watch', 'no-ad': 'No video right now, try later' }[result];
      cont.parentContainer.add(this.add.text(cont.x, cont.y, why, text(30, '#ffffff', '600')).setOrigin(0.5).setAlpha(0.85));
      cont.destroy();
      return;
    }
    closeModal(this.overlay);
    this.overlay = null;
    this.over = false;
    this.revived = this.watchedAd = true;
    const cleared = revive(this.board);
    this.drawBoard();
    this.flash(cleared, 0.9, 350);
    this.bloom(cleared);
    sfx.perfect();
    this.popText('SECOND CHANCE!', 'Rows cleared');
    gameplayStart();
    this.refillTray();
    this.save();
  }

  async playAgain() {
    gamesFinished++;
    store.del('bb-save');
    if (!this.watchedAd && gamesFinished % INTERSTITIAL_EVERY === 0) await showInterstitial();
    goTo(this, 'play', { resume: false });
  }
}

// Wait for the bundled font, or Phaser draws the first texts in a fallback font.
Promise.all([document.fonts.load('700 40px Fredoka').catch(() => {}), initPlatform()]).finally(() => {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    transparent: true, // page gradient shows through
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H },
    scene: [Title, Play],
  });
  // Rotating the phone (or resizing the window) past square relays the screen; a running game resumes from its save.
  addEventListener('resize', () => {
    if (wideScreen() === W > H) return;
    const play = game.scene.getScene('play') as Play;
    if (game.scene.isActive('title')) game.scene.getScene('title').scene.restart();
    else if (game.scene.isActive('play') && !play.over) { play.save(); gameplayStop(); play.scene.restart({ resume: true }); }
    // game-over card stays as is (scaled to fit); the next screen picks up the new orientation
  });
  if (import.meta.env.DEV) Object.assign(window, { game }); // lets dev tools poke at the scene
});
