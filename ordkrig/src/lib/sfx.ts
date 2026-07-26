import { Vibration } from 'react-native';

/**
 * Lyd + haptikk + våken skjerm – med VAKTER: på et bygg uten native-modulene
 * (eldre TestFlight-bygg) blir alt et stille no-op i stedet for krasj.
 * (Nye oppdateringer når uansett bare nye bygg pga. runtimeVersion=appVersion.)
 */

let player: { seekTo: (s: number) => void; play: () => void } | null = null;

/** Last inn pengelyden (kalles én gang ved inngang til spillet). */
export function initSfx(): void {
  if (player) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createAudioPlayer } = require('expo-audio');
    player = createAudioPlayer(require('../../assets/sounds/points.wav'));
  } catch {
    player = null;
  }
}

/** 🪙 Mynt-pling når poengene tildeles. */
export function playPointsSound(): void {
  try {
    if (!player) return;
    player.seekTo(0);
    player.play();
  } catch {
    // stille
  }
}

/** Myk liten dult (noen stemte på svaret ditt o.l.). */
export function hapticSoft(fallbackMs = 100): void {
  try {
    const Haptics = require('expo-haptics');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  } catch {
    Vibration.vibrate(fallbackMs);
  }
}

/** Suksess-følelse (du gjettet riktig). */
export function hapticSuccess(fallbackMs = 150): void {
  try {
    const Haptics = require('expo-haptics');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  } catch {
    Vibration.vibrate(fallbackMs);
  }
}

/** Kraftigere varsel (tiden holder på å renne ut). */
export function hapticWarn(fallbackMs = 300): void {
  try {
    const Haptics = require('expo-haptics');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  } catch {
    Vibration.vibrate(fallbackMs);
  }
}

/** Skjermen holder seg våken mens man er i spillet. */
export function keepAwakeOn(): void {
  try {
    require('expo-keep-awake').activateKeepAwakeAsync?.().catch?.(() => {});
  } catch {
    // ikke tilgjengelig i dette bygget
  }
}

export function keepAwakeOff(): void {
  try {
    require('expo-keep-awake').deactivateKeepAwake?.();
  } catch {
    // ikke tilgjengelig i dette bygget
  }
}
