// Copyright 2016-2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { requestMicrophonePermissions } from '../util/requestMicrophonePermissions';
import * as log from '../logging/log';
import type { WebAudioRecorderClass } from '../window.d';

export class RecorderClass {
  private context?: AudioContext;
  private input?: GainNode;
  private recorder?: WebAudioRecorderClass;
  private source?: MediaStreamAudioSourceNode;
  private stream?: MediaStream;
  private blob?: Blob;
  private resolve?: (blob: Blob) => void;

  clear(): void {
    this.blob = undefined;
    this.resolve = undefined;

    if (this.source) {
      this.source.disconnect();
      this.source = undefined;
    }

    if (this.recorder) {
      if (this.recorder.isRecording()) {
        this.recorder.cancelRecording();
      }

      // Reach in and terminate the web worker used by WebAudioRecorder, otherwise
      // it gets leaked due to a reference cycle with its onmessage listener
      this.recorder.worker.terminate();
      this.recorder = undefined;
    }

    this.input = undefined;
    this.stream = undefined;

    if (this.context) {
      this.context.close();
      this.context = undefined;
    }
  }

  async start(): Promise<boolean> {
    const hasMicrophonePermission = await requestMicrophonePermissions();
    if (!hasMicrophonePermission) {
      log.info(
        'Recorder/start: Microphone permission was denied, new audio recording not allowed.'
      );
      return false;
    }

    this.clear();

    this.context = new AudioContext();
    this.input = this.context.createGain();

    this.recorder = new window.WebAudioRecorder(this.input, {
      encoding: 'mp3',
      workerDir: 'js/', // must end with slash
      options: {
        timeLimit: 360, // one minute more than our UI-imposed limit
      },
    });
    this.recorder.onComplete = this.onComplete.bind(this);
    this.recorder.onError = this.onError.bind(this);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!this.context || !this.input) {
        const err = new Error(
          'Recorder/getUserMedia/stream: Missing context or input!'
        );
        this.onError(this.recorder, err);
        throw err;
      }
      this.source = this.context.createMediaStreamSource(stream);
      this.source.connect(this.input);
      this.stream = stream;
    } catch (err) {
      log.error(
        'Recorder.onGetUserMediaError:',
        err && err.stack ? err.stack : err
      );
      this.clear();
      throw err;
    }

    if (this.recorder) {
      this.recorder.startRecording();
      return true;
    }

    return false;
  }

  async stop(): Promise<Blob | undefined> {
    if (!this.recorder) {
      log.warn('Recorder/stop: Called with no recorder');
      return;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }

    if (this.blob) {
      return this.blob;
    }

    const promise = new Promise<Blob>(resolve => {
      this.resolve = resolve;
    });

    this.recorder.finishRecording();

    return promise;
  }

  onComplete(_recorder: WebAudioRecorderClass, blob: Blob): void {
    this.blob = blob;
    this.resolve?.(blob);
  }

  onError(_recorder: WebAudioRecorderClass, error: Error): void {
    if (!this.recorder) {
      log.warn('Recorder/onError: Called with no recorder');
      return;
    }

    this.clear();

    log.error('Recorder/onError:', error && error.stack ? error.stack : error);
  }

  getBlob(): Blob {
    if (!this.blob) {
      throw new Error('no blob found');
    }

    return this.blob;
  }
}

export const recorder = new RecorderClass();
