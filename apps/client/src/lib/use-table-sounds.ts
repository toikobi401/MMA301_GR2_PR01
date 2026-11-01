import { useAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useEffect, useRef } from 'react';
import { Platform, Vibration } from 'react-native';

const TURN_SOUND = require('../../assets/sounds/turn.wav');
const ACTION_SOUND = require('../../assets/sounds/action.wav');

function replay(player: AudioPlayer): void {
  // A browser refuses sound until the page has been interacted with. That is
  // not worth surfacing: the turn is still visible on the table.
  try {
    player.seekTo(0);
    player.play();
  } catch {
    // Nothing to do; playing sound is never allowed to break the table.
  }
}

/**
 * Sound and a buzz for what a player might otherwise miss, above all that it
 * is now their turn in a game with a clock on it.
 */
export function useTableSounds(options: {
  enabled: boolean;
  isMyTurn: boolean;
  actionCount: number;
}): void {
  const { enabled, isMyTurn, actionCount } = options;
  const turnPlayer = useAudioPlayer(TURN_SOUND);
  const actionPlayer = useAudioPlayer(ACTION_SOUND);
  const lastActionCount = useRef(actionCount);

  useEffect(() => {
    if (!isMyTurn || !enabled) return;
    replay(turnPlayer);
    if (Platform.OS !== 'web') Vibration.vibrate(60);
  }, [isMyTurn, enabled, turnPlayer]);

  useEffect(() => {
    const grew = actionCount > lastActionCount.current;
    lastActionCount.current = actionCount;
    if (grew && enabled) replay(actionPlayer);
  }, [actionCount, enabled, actionPlayer]);
}
