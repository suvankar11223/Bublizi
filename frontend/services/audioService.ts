import { Audio } from 'expo-av';
import { Platform } from 'react-native';

class AudioService {
  private recording: Audio.Recording | null = null;
  private sound: Audio.Sound | null = null;
  private recordingStartTime: number = 0;

  // ── RECORDING ─────────────────────────────────────────────────────

  async startRecording(): Promise<void> {
    try {
      // Clean up any existing recording first
      if (this.recording) {
        console.log('[AudioService] Cleaning up existing recording...');
        try {
          await this.recording.stopAndUnloadAsync();
        } catch (e) {
          console.log('[AudioService] Error cleaning up:', e);
        }
        this.recording = null;
      }

      console.log('[AudioService] Requesting permissions...');
      const permission = await Audio.requestPermissionsAsync();
      
      if (!permission.granted) {
        throw new Error('Audio recording permission not granted');
      }

      console.log('[AudioService] Setting audio mode...');
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      console.log('[AudioService] Starting recording...');
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      this.recording = recording;
      this.recordingStartTime = Date.now();
      console.log('[AudioService] Recording started');
    } catch (error) {
      console.error('[AudioService] Failed to start recording:', error);
      // Clean up on error
      this.recording = null;
      throw error;
    }
  }

  async stopRecording(): Promise<{ uri: string; duration: number }> {
    if (!this.recording) {
      throw new Error('No active recording');
    }

    try {
      console.log('[AudioService] Stopping recording...');
      await this.recording.stopAndUnloadAsync();
      
      const uri = this.recording.getURI();
      const duration = Math.floor((Date.now() - this.recordingStartTime) / 1000);
      
      // Clean up recording reference
      this.recording = null;
      
      console.log('[AudioService] Recording stopped:', { uri, duration });
      
      if (!uri) {
        throw new Error('No recording URI');
      }

      return { uri, duration };
    } catch (error) {
      console.error('[AudioService] Failed to stop recording:', error);
      // Clean up on error
      this.recording = null;
      throw error;
    }
  }

  async cancelRecording(): Promise<void> {
    if (this.recording) {
      try {
        await this.recording.stopAndUnloadAsync();
        this.recording = null;
        console.log('[AudioService] Recording cancelled');
      } catch (error) {
        console.error('[AudioService] Failed to cancel recording:', error);
      }
    }
  }

  // ── PLAYBACK ──────────────────────────────────────────────────────

  async playAudio(
    url: string,
    onProgress?: (position: number, duration: number) => void,
    onFinish?: () => void
  ): Promise<void> {
    try {
      // Stop any existing playback
      await this.stopAudio();

      console.log('[AudioService] Loading audio:', url);
      
      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true },
        (status) => {
          if (!status.isLoaded) return;
          
          if (status.didJustFinish) {
            onFinish?.();
            return;
          }
          
          if (status.durationMillis) {
            onProgress?.(
              status.positionMillis / 1000,
              status.durationMillis / 1000
            );
          }
        }
      );

      this.sound = sound;
      console.log('[AudioService] Audio playing');
    } catch (error) {
      console.error('[AudioService] Failed to play audio:', error);
      throw error;
    }
  }

  async pauseAudio(): Promise<void> {
    if (this.sound) {
      await this.sound.pauseAsync();
      console.log('[AudioService] Audio paused');
    }
  }

  async resumeAudio(): Promise<void> {
    if (this.sound) {
      await this.sound.playAsync();
      console.log('[AudioService] Audio resumed');
    }
  }

  async stopAudio(): Promise<void> {
    if (this.sound) {
      try {
        await this.sound.stopAsync();
        await this.sound.unloadAsync();
        this.sound = null;
        console.log('[AudioService] Audio stopped');
      } catch (error) {
        console.error('[AudioService] Failed to stop audio:', error);
      }
    }
  }

  // ── UPLOAD ────────────────────────────────────────────────────────

  async uploadVoice(
    uri: string,
    duration: number,
    apiBaseUrl: string
  ): Promise<{ audioUrl: string }> {
    try {
      const fullUrl = `${apiBaseUrl}/api/upload/voice`;
      console.log('[AudioService] Full upload URL:', fullUrl);
      console.log('[AudioService] apiBaseUrl received:', apiBaseUrl);
      console.log('[AudioService] uri:', uri);
      console.log('[AudioService] duration:', duration);
      
      // Skip file existence check — just attempt upload directly
      const formData = new FormData();
      const filename = `voice_${Date.now()}.m4a`;
      const fileObj: any = {
        uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
        name: filename,
        type: 'audio/m4a',
      };

      formData.append('audio', fileObj);
      formData.append('duration', String(duration));

      console.log('[AudioService] Uploading to:', fullUrl);
      const response = await fetch(fullUrl, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${errorText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(`Upload failed: ${JSON.stringify(result)}`);
      }

      console.log('[AudioService] Upload successful:', result.audioUrl);
      return { audioUrl: result.audioUrl };
    } catch (error) {
      console.error('[AudioService] Upload failed:', error);
      throw error;
    }
  }
}

export const audioService = new AudioService();
