import { Scene } from "phaser";
import { logger } from "~/lib/logger";

/**
 * SoundManager - Centralized sound management
 *
 * Features:
 * - Global volume control (0.0 to 1.0)
 * - Mute toggle
 * - Persistent preferences (localStorage)
 * - Browser autoplay handling
 */
export class SoundManager {
  private static globalVolume: number = 0.2;
  private static isMuted: boolean = false;
  private static isMusicMuted: boolean = false;
  private static isFireSoundsMuted: boolean = false;
  private static isSfxMuted: boolean = false;
  private static isAudioUnlocked: boolean = false;
  private static initialized: boolean = false;

  // Store active music references for global control
  private static battleMusic: Phaser.Sound.BaseSound | null = null;
  private static fireSounds: Phaser.Sound.BaseSound | null = null;

  /**
   * Initialize sound manager - load preferences from localStorage
   */
  static initialize() {
    if (this.initialized) return;

    // Load volume preference (default: 1.0 = 100%)
    const savedVolume = localStorage.getItem("sound-volume");
    if (savedVolume !== null) {
      this.globalVolume = parseFloat(savedVolume);
    }

    // Load mute preference (default: false)
    const savedMute = localStorage.getItem("sound-muted");
    if (savedMute !== null) {
      this.isMuted = savedMute === "true";
    }

    // Load music mute preference
    const savedMusicMute = localStorage.getItem("sound-music-muted");
    if (savedMusicMute !== null) {
      this.isMusicMuted = savedMusicMute === "true";
    }

    // Load fire sounds mute preference
    const savedFireMute = localStorage.getItem("sound-fire-muted");
    if (savedFireMute !== null) {
      this.isFireSoundsMuted = savedFireMute === "true";
    }

    // Load SFX mute preference
    const savedSfxMute = localStorage.getItem("sound-sfx-muted");
    if (savedSfxMute !== null) {
      this.isSfxMuted = savedSfxMute === "true";
    }

    this.initialized = true;
  }

  /**
   * Play a sound with global volume applied
   * @param scene - Phaser scene
   * @param key - Sound key
   * @param baseVolume - Base volume (0.0 to 1.0), will be multiplied by globalVolume
   * @param config - Additional sound config (loop, etc.)
   */
  static play(
    scene: Scene,
    key: string,
    baseVolume: number = 1.0,
    config?: Phaser.Types.Sound.SoundConfig
  ): Phaser.Sound.BaseSound | null {
    if (!this.initialized) {
      this.initialize();
    }

    // Skip non-looping sounds when audio context is suspended (tab not focused)
    // Looping sounds (music/ambient) are handled separately via pause/resume
    const soundManager = scene.sound as Phaser.Sound.WebAudioSoundManager;
    if (soundManager.context && soundManager.context.state === "suspended" && !config?.loop) {
      return null;
    }

    // Calculate final volume
    const finalVolume = baseVolume * this.globalVolume;

    try {
      // Create the sound object (even if muted, so we can control it later)
      const sound = scene.sound.add(key, {
        ...config,
        volume: finalVolume,
      });

      // Determine if this sound should be muted based on type
      let shouldMute = this.isMuted;
      if (key === "battle-theme") {
        shouldMute = shouldMute || this.isMusicMuted;
      } else if (key === "fire-sounds") {
        shouldMute = shouldMute || this.isFireSoundsMuted;
      }

      // Only play if not muted
      if (!shouldMute) {
        sound.play();
        logger.ui.debug(`[SoundManager] Playing "${key}" at volume ${finalVolume.toFixed(2)}`);
      } else {
        logger.ui.debug(`[SoundManager] Sound "${key}" created but not played (muted)`);
      }

      return sound;
    } catch (error) {
      logger.ui.error(`[SoundManager] Failed to create sound "${key}":`, error);
      return null;
    }
  }

  /**
   * Play a one-shot sound effect
   */
  static playSound(scene: Scene, key: string, baseVolume: number = 1.0) {
    if (!this.initialized) {
      this.initialize();
    }

    // Skip sounds when audio context is suspended (tab not focused)
    // This prevents sounds from queuing and playing all at once when tab regains focus
    const soundManager = scene.sound as Phaser.Sound.WebAudioSoundManager;
    if (soundManager.context && soundManager.context.state === "suspended") {
      return;
    }

    // Check global mute and SFX mute
    if (this.isMuted || this.isSfxMuted) {
      return;
    }

    const finalVolume = baseVolume * this.globalVolume;

    try {
      scene.sound.play(key, { volume: finalVolume });
      logger.ui.debug(`[SoundManager] Playing sound "${key}" at volume ${finalVolume.toFixed(2)}`);
    } catch (error) {
      logger.ui.error(`[SoundManager] Failed to play sound "${key}":`, error);
    }
  }

  /**
   * Play a random impact sound (for character landing)
   */
  static playRandomImpact(scene: Scene, baseVolume: number = 0.4) {
    // Available impact sounds (missing impact-2)
    const impactSounds = [
      "impact-1",
      "impact-3",
      "impact-4",
      "impact-5",
      "impact-6",
      "impact-7",
      "impact-8",
    ];

    // Pick a random impact sound
    const randomIndex = Math.floor(Math.random() * impactSounds.length);
    const randomImpact = impactSounds[randomIndex];

    // Play the random impact sound
    this.playSound(scene, randomImpact, baseVolume);
  }

  /**
   * Play a random death scream (for character elimination)
   */
  static playRandomDeathScream(scene: Scene, baseVolume: number = 0.5) {
    // Available death scream sounds (14 total)
    const deathScreams = [
      "death-scream-1",
      "death-scream-2",
      "death-scream-3",
      "death-scream-4",
      "death-scream-5",
      "death-scream-6",
      "death-scream-7",
      "death-scream-8",
      "death-scream-9",
      "death-scream-10",
      "death-scream-11",
      "death-scream-12",
      "death-scream-13",
      "death-scream-14",
    ];

    // Pick a random death scream
    const randomIndex = Math.floor(Math.random() * deathScreams.length);
    const randomScream = deathScreams[randomIndex];

    // Play the random death scream
    this.playSound(scene, randomScream, baseVolume);
  }

  /**
   * Play explosion sound (for big explosions)
   */
  static playExplosion(scene: Scene, baseVolume: number = 0.7) {
    this.playSound(scene, "explosion-dust", baseVolume);
  }

  /**
   * Play victory sound (for winner celebration)
   */
  static playVictory(scene: Scene, baseVolume: number = 0.6) {
    this.playSound(scene, "victory", baseVolume);
  }

  /**
   * Play insert coin sound (for betting UI)
   */
  static playInsertCoin(scene: Scene, baseVolume: number = 0.7) {
    this.playSound(scene, "insert-coin", baseVolume);
  }

  /**
   * Play challenger sound (when a new player joins)
   */
  static playChallenger(scene: Scene, baseVolume: number = 0.6) {
    this.playSound(scene, "challenger", baseVolume / 3);
  }

  /**
   * Play boss power-up sound (Mario-style power-up for boss additional bets)
   */
  static playBossPowerUp(scene: Scene, baseVolume: number = 0.6) {
    this.playSound(scene, "boss-power-up", baseVolume);
  }

  /**
   * Play 5-second countdown sound (for final countdown)
   * Plays the intro sound after countdown finishes
   */
  static playCountdown5Sec(scene: Scene, baseVolume: number = 0.7) {
    if (!this.initialized) {
      this.initialize();
    }

    // Skip sounds when audio context is suspended (tab not focused)
    const soundManager = scene.sound as Phaser.Sound.WebAudioSoundManager;
    if (soundManager.context && soundManager.context.state === "suspended") {
      return;
    }

    // Check global mute and SFX mute
    if (this.isMuted || this.isSfxMuted) {
      return;
    }

    const finalVolume = baseVolume * this.globalVolume;

    try {
      // Use scene.sound.add to get a reference we can attach events to
      const countdownSound = scene.sound.add("countdown-5sec", { volume: finalVolume });

      // Play intro sound when countdown finishes
      countdownSound.once("complete", () => {
        logger.ui.debug("[SoundManager] Countdown finished, playing intro sound");
        this.playSound(scene, "domin8-intro", 0.5);
      });

      countdownSound.play();
      logger.ui.debug(
        `[SoundManager] Playing countdown-5sec at volume ${finalVolume.toFixed(2)}`
      );
    } catch (error) {
      logger.ui.error(`[SoundManager] Failed to play countdown sound:`, error);
    }
  }

  /**
   * Set global volume (0.0 to 1.0)
   */
  static setGlobalVolume(volume: number) {
    this.globalVolume = Math.max(0, Math.min(1, volume)); // Clamp to 0-1
    localStorage.setItem("sound-volume", this.globalVolume.toString());

    // Update battle music volume immediately if it's playing
    if (this.battleMusic && typeof (this.battleMusic as any).setVolume === "function") {
      (this.battleMusic as any).setVolume(this.globalVolume * 0.2); // 0.2 is the base volume for battle music
      logger.ui.debug(
        `[SoundManager] Updated battle music volume to ${this.globalVolume.toFixed(2)}`
      );
    }
  }

  /**
   * Get current global volume
   */
  static getGlobalVolume(): number {
    if (!this.initialized) {
      this.initialize();
    }
    return this.globalVolume;
  }

  /**
   * Set mute state
   */
  static setMuted(muted: boolean) {
    this.isMuted = muted;
    localStorage.setItem("sound-muted", muted.toString());

    // Control battle music directly
    if (this.battleMusic) {
      if (muted) {
        this.battleMusic.pause();
      } else if (!this.isMusicMuted) {
        // Only play if music isn't individually muted
        if (!(this.battleMusic as any).isPlaying) {
          this.battleMusic.play();
        } else {
          this.battleMusic.resume();
        }
      }
    }

    // Control fire sounds directly
    if (this.fireSounds) {
      if (muted) {
        this.fireSounds.pause();
      } else if (!this.isFireSoundsMuted) {
        // Only play if fire sounds aren't individually muted
        if (!(this.fireSounds as any).isPlaying) {
          this.fireSounds.play();
        } else {
          this.fireSounds.resume();
        }
      }
    }

    logger.ui.debug(`[SoundManager] Master ${muted ? "muted" : "unmuted"}`);
  }

  /**
   * Get current mute state
   */
  static isSoundMuted(): boolean {
    if (!this.initialized) {
      this.initialize();
    }
    return this.isMuted;
  }

  /**
   * Toggle mute
   */
  static toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  /**
   * Unlock audio context (call on first user interaction)
   */
  static unlockAudio(scene: Scene): Promise<void> {
    return new Promise((resolve) => {
      if (this.isAudioUnlocked) {
        resolve();
        return;
      }

      // Try to resume audio context
      const soundManager = scene.game.sound as any;
      if (soundManager.context) {
        const context = soundManager.context as AudioContext;

        if (context.state === "suspended") {
          context
            .resume()
            .then(() => {
              this.isAudioUnlocked = true;
              resolve();
            })
            .catch((error: Error) => {
              console.error("[SoundManager] Failed to unlock audio context:", error);
              resolve(); // Resolve anyway to not block execution
            });
        } else {
          this.isAudioUnlocked = true;
          resolve();
        }
      } else {
        console.warn("[SoundManager] No audio context available");
        resolve();
      }
    });
  }

  /**
   * Check if audio is unlocked
   */
  static isUnlocked(): boolean {
    return this.isAudioUnlocked;
  }

  /**
   * Apply mute state to Phaser's global sound manager
   */
  static applyMuteToScene(scene: Scene) {
    if (!this.initialized) {
      this.initialize();
    }
    scene.sound.mute = this.isMuted;
  }

  /**
   * Update all playing sounds with new volume
   */
  static updateAllSoundsVolume(scene: Scene) {
    if (!this.initialized) {
      this.initialize();
    }

    // Phaser's global volume control
    scene.sound.volume = this.globalVolume;
  }

  /**
   * Register battle music for global control
   */
  static setBattleMusic(music: Phaser.Sound.BaseSound | null) {
    this.battleMusic = music;

    // Apply current mute state immediately
    if (music && (this.isMuted || this.isMusicMuted)) {
      music.pause();
    }
  }

  /**
   * Get battle music reference
   */
  static getBattleMusic(): Phaser.Sound.BaseSound | null {
    return this.battleMusic;
  }

  /**
   * Register fire sounds for global control
   */
  static setFireSounds(sounds: Phaser.Sound.BaseSound | null) {
    this.fireSounds = sounds;

    // Apply current mute state immediately
    if (sounds && (this.isMuted || this.isFireSoundsMuted)) {
      sounds.pause();
    }
  }

  /**
   * Get fire sounds reference
   */
  static getFireSounds(): Phaser.Sound.BaseSound | null {
    return this.fireSounds;
  }

  // ============ Music Controls ============

  /**
   * Set music mute state
   */
  static setMusicMuted(muted: boolean) {
    this.isMusicMuted = muted;
    localStorage.setItem("sound-music-muted", muted.toString());

    // Control battle music directly
    if (this.battleMusic) {
      if (muted || this.isMuted) {
        this.battleMusic.pause();
      } else {
        // Use play() if not playing, resume() if paused
        if (!(this.battleMusic as any).isPlaying) {
          this.battleMusic.play();
        } else {
          this.battleMusic.resume();
        }
      }
    }
    logger.ui.debug(`[SoundManager] Music ${muted ? "muted" : "unmuted"}`);
  }

  /**
   * Get music mute state
   */
  static isMusicMutedState(): boolean {
    if (!this.initialized) {
      this.initialize();
    }
    return this.isMusicMuted;
  }

  // ============ Fire Sounds Controls ============

  /**
   * Set fire sounds mute state
   */
  static setFireSoundsMuted(muted: boolean) {
    this.isFireSoundsMuted = muted;
    localStorage.setItem("sound-fire-muted", muted.toString());

    // Control fire sounds directly
    if (this.fireSounds) {
      if (muted || this.isMuted) {
        this.fireSounds.pause();
      } else {
        // Use play() if not playing, resume() if paused
        if (!(this.fireSounds as any).isPlaying) {
          this.fireSounds.play();
        } else {
          this.fireSounds.resume();
        }
      }
    }
    logger.ui.debug(`[SoundManager] Fire sounds ${muted ? "muted" : "unmuted"}`);
  }

  /**
   * Get fire sounds mute state
   */
  static isFireSoundsMutedState(): boolean {
    if (!this.initialized) {
      this.initialize();
    }
    return this.isFireSoundsMuted;
  }

  // ============ SFX Controls ============

  /**
   * Set SFX mute state
   */
  static setSfxMuted(muted: boolean) {
    this.isSfxMuted = muted;
    localStorage.setItem("sound-sfx-muted", muted.toString());
    logger.ui.debug(`[SoundManager] SFX ${muted ? "muted" : "unmuted"}`);
  }

  /**
   * Get SFX mute state
   */
  static isSfxMutedState(): boolean {
    if (!this.initialized) {
      this.initialize();
    }
    return this.isSfxMuted;
  }

  // ============ App Lifecycle Controls ============

  private static wasMusicPlayingBeforePause: boolean = false;
  private static wereFireSoundsPlayingBeforePause: boolean = false;

  /**
   * Pause all sounds (call when app goes to background)
   */
  static pauseAll() {
    logger.ui.debug("[SoundManager] Pausing all sounds (app backgrounded)");

    // Remember current state
    this.wasMusicPlayingBeforePause = this.battleMusic ? (this.battleMusic as any).isPlaying : false;
    this.wereFireSoundsPlayingBeforePause = this.fireSounds ? (this.fireSounds as any).isPlaying : false;

    // Pause battle music
    if (this.battleMusic && (this.battleMusic as any).isPlaying) {
      this.battleMusic.pause();
    }

    // Pause fire sounds
    if (this.fireSounds && (this.fireSounds as any).isPlaying) {
      this.fireSounds.pause();
    }
  }

  /**
   * Resume sounds (call when app comes to foreground)
   */
  static resumeAll() {
    logger.ui.debug("[SoundManager] Resuming sounds (app foregrounded)");

    // Only resume if not muted and was playing before
    if (!this.isMuted && !this.isMusicMuted && this.wasMusicPlayingBeforePause) {
      if (this.battleMusic) {
        this.battleMusic.resume();
      }
    }

    if (!this.isMuted && !this.isFireSoundsMuted && this.wereFireSoundsPlayingBeforePause) {
      if (this.fireSounds) {
        this.fireSounds.resume();
      }
    }
  }
}
