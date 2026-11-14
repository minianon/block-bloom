// Shared look: sizes, colors, font, blocks, buttons, cards. Every screen draws through these.
import Phaser from 'phaser';
import { sfx, isMuted, toggleMute, isVibrateOn, toggleVibrate } from './sfx.ts';

export const W = 720, H = 1280;
export const PANEL = 0x0b0e33, CARD = 0x2b2f78, GREEN = 0x3ccf6e, ROSE = 0xff5c8a, BLUE = 0x5468e8;
const FONT = 'Fredoka, system-ui, sans-serif';

export const text = (size: number, color = '#ffffff', weight = '700') => ({ fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: weight });

const ICONS = ['sound-on', 'sound-off', 'vibrate-on', 'vibrate-off', 'crown', 'video', 'replay', 'hand', 'pause', 'play', 'home'];
export function loadIcons(scene: Phaser.Scene) {
  for (const k of ICONS) if (!scene.textures.exists(k)) scene.load.svg(k, `icons/${k}.svg`, { width: 96, height: 96 });
}

/** Lighten (f > 0) or darken (f < 0) a 0xRRGGBB color. */
export function shade(c: number, f: number) {
  const ch = (v: number) => Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f));
  return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255);
}

/** Glossy beveled block: dark base edge, face, lighter raised center, shine strip. */
export function drawBlock(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, color: number, alpha = 1) {
  const r = s * 0.18;
  g.fillStyle(shade(color, -0.4), alpha).fillRoundedRect(x, y, s, s, r);
  g.fillStyle(color, alpha).fillRoundedRect(x, y, s, s * 0.9, r);
  g.fillStyle(shade(color, 0.18), alpha).fillRoundedRect(x + s * 0.12, y + s * 0.1, s * 0.76, s * 0.66, r * 0.7);
  g.fillStyle(0xffffff, 0.45 * alpha).fillRoundedRect(x + s * 0.18, y + s * 0.14, s * 0.4, s * 0.12, s * 0.06);
}

/** Press-down feedback plus a tap sound for anything tappable. */
function tappable(b: Phaser.GameObjects.Container, onTap: () => void, once: boolean) {
  b.setInteractive({ useHandCursor: true });
  b.on('pointerdown', () => b.setScale(0.93));
  b.on('pointerout', () => b.setScale(1));
  b[once ? 'once' : 'on']('pointerup', () => { b.setScale(1); sfx.tap(); onTap(); });
  return b;
}

/** Chunky pill button with an icon. Fires once: screens that need it again rebuild it. */
export function button(scene: Phaser.Scene, x: number, y: number, w: number, label: string, icon: string, color: number, onTap: () => void, sub = '') {
  const h = 104;
  const g = scene.add.graphics();
  g.fillStyle(shade(color, -0.35)).fillRoundedRect(-w / 2, -h / 2 + 8, w, h, h / 2);
  g.fillStyle(color).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  g.fillStyle(0xffffff, 0.2).fillRoundedRect(-w / 2 + 18, -h / 2 + 8, w - 36, h * 0.36, h * 0.18);
  const label_ = scene.add.text(22, sub ? -12 : -2, label, text(40)).setOrigin(0.5).setShadow(0, 3, 'rgba(0,0,0,0.25)', 0);
  const icon_ = scene.add.image(label_.x - label_.width / 2 - 30, label_.y, icon).setDisplaySize(36, 36);
  const parts: Phaser.GameObjects.GameObject[] = [g, icon_, label_];
  if (sub) parts.push(scene.add.text(0, 26, sub, text(22, '#ffffff', '600')).setOrigin(0.5).setAlpha(0.85));
  return tappable(scene.add.container(x, y, parts).setSize(w, h), onTap, true);
}

/** Round icon button on a soft disc. */
export function iconButton(scene: Phaser.Scene, x: number, y: number, icon: string, onTap: (img: Phaser.GameObjects.Image) => void, r = 38) {
  const disc = scene.add.graphics().fillStyle(PANEL, 0.45).fillCircle(0, 0, r);
  const img = scene.add.image(0, 0, icon).setDisplaySize(r * 1.05, r * 1.05);
  return tappable(scene.add.container(x, y, [disc, img]).setSize(r * 2, r * 2), () => onTap(img), false);
}

/** Sound and vibration toggles side by side, each with a label under it. */
export function settingsRow(scene: Phaser.Scene, x: number, y: number) {
  const sound = iconButton(scene, -70, 0, isMuted() ? 'sound-off' : 'sound-on', (img) => img.setTexture(toggleMute() ? 'sound-off' : 'sound-on'), 44);
  const vib = iconButton(scene, 70, 0, isVibrateOn() ? 'vibrate-on' : 'vibrate-off', (img) => img.setTexture(toggleVibrate() ? 'vibrate-on' : 'vibrate-off'), 44);
  const l1 = scene.add.text(-70, 66, 'Sound', text(22, '#ffffff', '600')).setOrigin(0.5).setAlpha(0.75);
  const l2 = scene.add.text(70, 66, 'Vibration', text(22, '#ffffff', '600')).setOrigin(0.5).setAlpha(0.75);
  return scene.add.container(x, y, [sound, vib, l1, l2]);
}

/** Dimmed full-screen modal with a card; returns the card container to add content to (y=0 is card center). */
export function modal(scene: Phaser.Scene, cardH: number, title: string) {
  document.body.classList.add('dim');
  const top = -cardH / 2;
  const dim = scene.add.rectangle(W / 2, H / 2, W, H, 0x05061a, 0.65).setInteractive(); // blocks taps behind
  const card = scene.add.graphics();
  card.fillStyle(0x000000, 0.3).fillRoundedRect(-300, top + 12, 600, cardH, 44);
  card.fillStyle(CARD).fillRoundedRect(-300, top, 600, cardH, 44);
  card.lineStyle(4, 0xffffff, 0.12).strokeRoundedRect(-300, top, 600, cardH, 44);
  const heading = scene.add.text(0, top + 80, title, text(52, '#ffd84d')).setOrigin(0.5).setStroke('#3a1f6b', 10);
  const panel = scene.add.container(W / 2, H / 2, [card, heading]).setScale(0.6).setAlpha(0);
  scene.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: 280, ease: 'Back.easeOut' });
  const root = scene.add.container(0, 0, [dim, panel]).setDepth(40);
  return { root, panel, top };
}

export function closeModal(root: Phaser.GameObjects.Container | null) {
  root?.destroy();
  document.body.classList.remove('dim');
}

/** Fade to another scene. */
export function goTo(scene: Phaser.Scene, key: string, data?: object) {
  scene.input.enabled = false;
  scene.cameras.main.fadeOut(220, 20, 22, 63);
  scene.cameras.main.once('camerafadeoutcomplete', () => scene.scene.start(key, data));
}
