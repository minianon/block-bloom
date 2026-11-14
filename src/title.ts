import Phaser from 'phaser';
import { W, H, PANEL, GREEN, text, loadIcons, drawBlock, button, settingsRow, goTo, fitOrientation } from './ui.ts';
import { COLORS, decodeSave } from './logic.ts';

const TILE = 104;

/** Title screen: logo tiles drop in, petals drift, Play pulses. Play resumes a saved run if there is one. */
export class Title extends Phaser.Scene {
  constructor() { super('title'); }

  preload() { loadIcons(this); }

  create() {
    fitOrientation(this.game);
    const wide = W > H;
    this.input.enabled = true;
    this.cameras.main.fadeIn(300, 20, 22, 63);
    document.body.classList.remove('dim');
    document.getElementById('splash')?.remove(); // page's loading logo hands over to the animated one
    this.petals();

    // Logo: one glossy tile per letter, dropping in with a bounce, then gently bobbing.
    const words = ['BLOCK', 'BLOOM'];
    words.forEach((word, row) => {
      const y = (wide ? 110 : 330) + row * (TILE + 18);
      [...word].forEach((ch, i) => {
        const x = W / 2 + (i - (word.length - 1) / 2) * (TILE + 8);
        const g = this.add.graphics();
        drawBlock(g, -TILE / 2, -TILE / 2, TILE, COLORS[(i + row * 2) % COLORS.length]);
        const letter = this.add.text(0, -6, ch, text(66)).setOrigin(0.5).setShadow(0, 4, 'rgba(0,0,0,0.3)', 0);
        const tile = this.add.container(x, -150, [g, letter]).setAngle(Phaser.Math.Between(-20, 20));
        const delay = 150 + (row * word.length + i) * 70;
        this.tweens.add({ targets: tile, y, angle: 0, delay, duration: 650, ease: 'Bounce.easeOut' });
        this.tweens.add({ targets: tile, y: y - 8, delay: delay + 900 + i * 120, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      });
    });

    let best = 0;
    let save: ReturnType<typeof decodeSave> = null;
    try {
      best = Number(localStorage.getItem('bb-best')) || 0;
      save = decodeSave(localStorage.getItem('bb-save'));
    } catch { /* storage blocked: fresh start */ }

    // Best score under the logo.
    const pill = this.add.graphics().fillStyle(PANEL, 0.45).fillRoundedRect(-130, -32, 260, 64, 32);
    const crown = this.add.image(-92, -1, 'crown').setDisplaySize(38, 38);
    const bestText = this.add.text(-60, 0, `Best ${best}`, text(32)).setOrigin(0, 0.5);
    const bestPill = this.add.container(W / 2, wide ? 375 : 640, [pill, crown, bestText]).setAlpha(0);
    this.tweens.add({ targets: bestPill, alpha: 1, delay: 1000, duration: 400 });

    // Play (or Continue a saved run), popping in then breathing.
    const play = save
      ? button(this, W / 2, wide ? 490 : 820, 480, 'Continue', 'play', GREEN, () => goTo(this, 'play', { resume: true }), `Score ${save.points}`)
      : button(this, W / 2, wide ? 490 : 820, 480, 'Play', 'play', GREEN, () => goTo(this, 'play', { resume: false }));
    play.setScale(0);
    this.tweens.add({ targets: play, scale: 1, delay: 1100, duration: 420, ease: 'Back.easeOut', onComplete: () => {
      this.tweens.add({ targets: play, scale: 1.05, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } });

    if (save) {
      const fresh = this.add.text(W / 2, wide ? 615 : 950, 'New game', text(32, '#ffffff', '600')).setOrigin(0.5).setAlpha(0)
        .setInteractive({ useHandCursor: true });
      fresh.once('pointerup', () => {
        try { localStorage.removeItem('bb-save'); } catch { /* storage blocked */ }
        goTo(this, 'play', { resume: false });
      });
      this.tweens.add({ targets: fresh, alpha: 0.8, delay: 1300, duration: 400 });
    }

    const settings = (wide ? settingsRow(this, W - 150, H - 120) : settingsRow(this, W / 2, H - 210)).setAlpha(0);
    this.tweens.add({ targets: settings, alpha: 1, delay: 1300, duration: 400 });
  }

  /** Slow petals falling behind everything, forever. */
  petals() {
    const spawn = (startY?: number) => {
      const x = Phaser.Math.Between(0, W);
      const p = this.add.ellipse(x, startY ?? -30, 26, 14, Phaser.Utils.Array.GetRandom(COLORS)).setAlpha(0.5).setDepth(-1);
      const fall = Phaser.Math.Between(7000, 12000) * (1 - (startY ?? 0) / (H + 60));
      this.tweens.add({
        targets: p, y: H + 40, x: x + Phaser.Math.Between(-120, 120), angle: Phaser.Math.Between(-360, 360),
        duration: fall, onComplete: () => { p.destroy(); spawn(); },
      });
    };
    for (let i = 0; i < 16; i++) spawn(Phaser.Math.Between(0, H));
  }
}
