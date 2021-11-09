// Copyright 2018-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import * as Attachment from '../../types/Attachment';
import * as MIME from '../../types/MIME';
import { SignalService } from '../../protobuf';
import * as Bytes from '../../Bytes';
import * as logger from '../../logging/log';

import { fakeAttachment } from '../../test-both/helpers/fakeAttachment';

describe('Attachment', () => {
  describe('getUploadSizeLimitKb', () => {
    const { getUploadSizeLimitKb } = Attachment;

    it('returns 6000 kilobytes for supported non-GIF images', () => {
      assert.strictEqual(getUploadSizeLimitKb(MIME.IMAGE_JPEG), 6000);
      assert.strictEqual(getUploadSizeLimitKb(MIME.IMAGE_PNG), 6000);
      assert.strictEqual(getUploadSizeLimitKb(MIME.IMAGE_WEBP), 6000);
    });

    it('returns 25000 kilobytes for GIFs', () => {
      assert.strictEqual(getUploadSizeLimitKb(MIME.IMAGE_GIF), 25000);
    });

    it('returns 100000 for other file types', () => {
      assert.strictEqual(getUploadSizeLimitKb(MIME.APPLICATION_JSON), 100000);
      assert.strictEqual(getUploadSizeLimitKb(MIME.AUDIO_AAC), 100000);
      assert.strictEqual(getUploadSizeLimitKb(MIME.AUDIO_MP3), 100000);
      assert.strictEqual(getUploadSizeLimitKb(MIME.VIDEO_MP4), 100000);
      assert.strictEqual(
        getUploadSizeLimitKb('image/vnd.adobe.photoshop' as MIME.MIMEType),
        100000
      );
    });
  });

  describe('getFileExtension', () => {
    it('should return file extension from content type', () => {
      const input: Attachment.AttachmentType = fakeAttachment({
        data: Bytes.fromString('foo'),
        contentType: MIME.IMAGE_GIF,
      });
      assert.strictEqual(Attachment.getFileExtension(input), 'gif');
    });

    it('should return file extension for QuickTime videos', () => {
      const input: Attachment.AttachmentType = fakeAttachment({
        data: Bytes.fromString('foo'),
        contentType: MIME.VIDEO_QUICKTIME,
      });
      assert.strictEqual(Attachment.getFileExtension(input), 'mov');
    });
  });

  describe('getSuggestedFilename', () => {
    context('for attachment with filename', () => {
      it('should return existing filename if present', () => {
        const attachment: Attachment.AttachmentType = fakeAttachment({
          fileName: 'funny-cat.mov',
          data: Bytes.fromString('foo'),
          contentType: MIME.VIDEO_QUICKTIME,
        });
        const actual = Attachment.getSuggestedFilename({ attachment });
        const expected = 'funny-cat.mov';
        assert.strictEqual(actual, expected);
      });
    });
    context('for attachment without filename', () => {
      it('should generate a filename based on timestamp', () => {
        const attachment: Attachment.AttachmentType = fakeAttachment({
          data: Bytes.fromString('foo'),
          contentType: MIME.VIDEO_QUICKTIME,
        });
        const timestamp = new Date(new Date(0).getTimezoneOffset() * 60 * 1000);
        const actual = Attachment.getSuggestedFilename({
          attachment,
          timestamp,
        });
        const expected = 'signal-1970-01-01-000000.mov';
        assert.strictEqual(actual, expected);
      });
    });
    context('for attachment with index', () => {
      it('should generate a filename based on timestamp', () => {
        const attachment: Attachment.AttachmentType = fakeAttachment({
          data: Bytes.fromString('foo'),
          contentType: MIME.VIDEO_QUICKTIME,
        });
        const timestamp = new Date(new Date(0).getTimezoneOffset() * 60 * 1000);
        const actual = Attachment.getSuggestedFilename({
          attachment,
          timestamp,
          index: 3,
        });
        const expected = 'signal-1970-01-01-000000_003.mov';
        assert.strictEqual(actual, expected);
      });
    });
  });

  describe('isVisualMedia', () => {
    it('should return true for images', () => {
      const attachment: Attachment.AttachmentType = fakeAttachment({
        fileName: 'meme.gif',
        data: Bytes.fromString('gif'),
        contentType: MIME.IMAGE_GIF,
      });
      assert.isTrue(Attachment.isVisualMedia(attachment));
    });

    it('should return true for videos', () => {
      const attachment: Attachment.AttachmentType = fakeAttachment({
        fileName: 'meme.mp4',
        data: Bytes.fromString('mp4'),
        contentType: MIME.VIDEO_MP4,
      });
      assert.isTrue(Attachment.isVisualMedia(attachment));
    });

    it('should return false for voice message attachment', () => {
      const attachment: Attachment.AttachmentType = fakeAttachment({
        fileName: 'Voice Message.aac',
        flags: SignalService.AttachmentPointer.Flags.VOICE_MESSAGE,
        data: Bytes.fromString('voice message'),
        contentType: MIME.AUDIO_AAC,
      });
      assert.isFalse(Attachment.isVisualMedia(attachment));
    });

    it('should return false for other attachments', () => {
      const attachment: Attachment.AttachmentType = fakeAttachment({
        fileName: 'foo.json',
        data: Bytes.fromString('{"foo": "bar"}'),
        contentType: MIME.APPLICATION_JSON,
      });
      assert.isFalse(Attachment.isVisualMedia(attachment));
    });
  });

  describe('isFile', () => {
    it('should return true for JSON', () => {
      const attachment: Attachment.AttachmentType = fakeAttachment({
        fileName: 'foo.json',
        data: Bytes.fromString('{"foo": "bar"}'),
        contentType: MIME.APPLICATION_JSON,
      });
      assert.isTrue(Attachment.isFile(attachment));
    });

    it('should return false for images', () => {
      const attachment: Attachment.AttachmentType = fakeAttachment({
        fileName: 'meme.gif',
        data: Bytes.fromString('gif'),
        contentType: MIME.IMAGE_GIF,
      });
      assert.isFalse(Attachment.isFile(attachment));
    });

    it('should return false for videos', () => {
      const attachment: Attachment.AttachmentType = fakeAttachment({
        fileName: 'meme.mp4',
        data: Bytes.fromString('mp4'),
        contentType: MIME.VIDEO_MP4,
      });
      assert.isFalse(Attachment.isFile(attachment));
    });

    it('should return false for voice message attachment', () => {
      const attachment: Attachment.AttachmentType = fakeAttachment({
        fileName: 'Voice Message.aac',
        flags: SignalService.AttachmentPointer.Flags.VOICE_MESSAGE,
        data: Bytes.fromString('voice message'),
        contentType: MIME.AUDIO_AAC,
      });
      assert.isFalse(Attachment.isFile(attachment));
    });
  });

  describe('isVoiceMessage', () => {
    it('should return true for voice message attachment', () => {
      const attachment: Attachment.AttachmentType = fakeAttachment({
        fileName: 'Voice Message.aac',
        flags: SignalService.AttachmentPointer.Flags.VOICE_MESSAGE,
        data: Bytes.fromString('voice message'),
        contentType: MIME.AUDIO_AAC,
      });
      assert.isTrue(Attachment.isVoiceMessage(attachment));
    });

    it('should return true for legacy Android voice message attachment', () => {
      const attachment: Attachment.AttachmentType = fakeAttachment({
        data: Bytes.fromString('voice message'),
        contentType: MIME.AUDIO_MP3,
      });
      assert.isTrue(Attachment.isVoiceMessage(attachment));
    });

    it('should return false for other attachments', () => {
      const attachment: Attachment.AttachmentType = fakeAttachment({
        fileName: 'foo.gif',
        data: Bytes.fromString('foo'),
        contentType: MIME.IMAGE_GIF,
      });
      assert.isFalse(Attachment.isVoiceMessage(attachment));
    });
  });

  describe('replaceUnicodeOrderOverrides', () => {
    it('should sanitize left-to-right order override character', async () => {
      const input = {
        contentType: MIME.IMAGE_JPEG,
        fileName: 'test\u202Dfig.exe',
        size: 1111,
      };
      const expected = {
        contentType: MIME.IMAGE_JPEG,
        fileName: 'test\uFFFDfig.exe',
        size: 1111,
      };

      const actual = await Attachment.replaceUnicodeOrderOverrides(input);
      assert.deepEqual(actual, expected);
    });

    it('should sanitize right-to-left order override character', async () => {
      const input = {
        contentType: MIME.IMAGE_JPEG,
        fileName: 'test\u202Efig.exe',
        size: 1111,
      };
      const expected = {
        contentType: MIME.IMAGE_JPEG,
        fileName: 'test\uFFFDfig.exe',
        size: 1111,
      };

      const actual = await Attachment.replaceUnicodeOrderOverrides(input);
      assert.deepEqual(actual, expected);
    });

    it('should sanitize multiple override characters', async () => {
      const input = {
        contentType: MIME.IMAGE_JPEG,
        fileName: 'test\u202e\u202dlol\u202efig.exe',
        size: 1111,
      };
      const expected = {
        contentType: MIME.IMAGE_JPEG,
        fileName: 'test\uFFFD\uFFFDlol\uFFFDfig.exe',
        size: 1111,
      };

      const actual = await Attachment.replaceUnicodeOrderOverrides(input);
      assert.deepEqual(actual, expected);
    });

    it('should ignore non-order-override characters', () => {
      const input = {
        contentType: MIME.IMAGE_JPEG,
        fileName: 'abc',
        size: 1111,
      };

      const actual = Attachment._replaceUnicodeOrderOverridesSync(input);
      assert.deepEqual(actual, input);
    });

    it('should replace order-override characters', () => {
      const input = {
        contentType: MIME.IMAGE_JPEG,
        fileName: 'abc\u202D\u202E',
        size: 1111,
      };

      const actual = Attachment._replaceUnicodeOrderOverridesSync(input);
      assert.deepEqual(actual, {
        contentType: MIME.IMAGE_JPEG,
        fileName: 'abc\uFFFD\uFFFD',
        size: 1111,
      });
    });
  });

  describe('replaceUnicodeV2', () => {
    it('should remove all bad characters', async () => {
      const input = {
        size: 1111,
        contentType: MIME.IMAGE_JPEG,
        fileName:
          'file\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069\u200E\u200F\u061C.jpeg',
      };
      const expected = {
        fileName:
          'file\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD.jpeg',
        contentType: MIME.IMAGE_JPEG,
        size: 1111,
      };

      const actual = await Attachment.replaceUnicodeV2(input);
      assert.deepEqual(actual, expected);
    });

    it('should should leave normal filename alone', async () => {
      const input = {
        fileName: 'normal.jpeg',
        contentType: MIME.IMAGE_JPEG,
        size: 1111,
      };
      const expected = {
        fileName: 'normal.jpeg',
        contentType: MIME.IMAGE_JPEG,
        size: 1111,
      };

      const actual = await Attachment.replaceUnicodeV2(input);
      assert.deepEqual(actual, expected);
    });

    it('should handle missing fileName', async () => {
      const input = {
        size: 1111,
        contentType: MIME.IMAGE_JPEG,
      };
      const expected = {
        size: 1111,
        contentType: MIME.IMAGE_JPEG,
      };

      const actual = await Attachment.replaceUnicodeV2(input);
      assert.deepEqual(actual, expected);
    });
  });

  describe('removeSchemaVersion', () => {
    it('should remove existing schema version', () => {
      const input = {
        contentType: MIME.IMAGE_JPEG,
        fileName: 'foo.jpg',
        size: 1111,
        schemaVersion: 1,
      };

      const expected = {
        contentType: MIME.IMAGE_JPEG,
        fileName: 'foo.jpg',
        size: 1111,
      };

      const actual = Attachment.removeSchemaVersion({
        attachment: input,
        logger,
      });
      assert.deepEqual(actual, expected);
    });
  });

  describe('migrateDataToFileSystem', () => {
    it('should write data to disk and store relative path to it', async () => {
      const input = {
        contentType: MIME.IMAGE_JPEG,
        data: Bytes.fromString('Above us only sky'),
        fileName: 'foo.jpg',
        size: 1111,
      };

      const expected = {
        contentType: MIME.IMAGE_JPEG,
        path: 'abc/abcdefgh123456789',
        fileName: 'foo.jpg',
        size: 1111,
      };

      const expectedAttachmentData = Bytes.fromString('Above us only sky');
      const writeNewAttachmentData = async (attachmentData: Uint8Array) => {
        assert.deepEqual(attachmentData, expectedAttachmentData);
        return 'abc/abcdefgh123456789';
      };

      const actual = await Attachment.migrateDataToFileSystem(input, {
        writeNewAttachmentData,
      });
      assert.deepEqual(actual, expected);
    });

    it('should skip over (invalid) attachments without data', async () => {
      const input = {
        contentType: MIME.IMAGE_JPEG,
        fileName: 'foo.jpg',
        size: 1111,
      };

      const expected = {
        contentType: MIME.IMAGE_JPEG,
        fileName: 'foo.jpg',
        size: 1111,
      };

      const writeNewAttachmentData = async () => 'abc/abcdefgh123456789';

      const actual = await Attachment.migrateDataToFileSystem(input, {
        writeNewAttachmentData,
      });
      assert.deepEqual(actual, expected);
    });

    it('should throw error if data is not valid', async () => {
      const input = {
        contentType: MIME.IMAGE_JPEG,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: 123 as any,
        fileName: 'foo.jpg',
        size: 1111,
      };

      const writeNewAttachmentData = async () => 'abc/abcdefgh123456789';

      await assert.isRejected(
        Attachment.migrateDataToFileSystem(input, {
          writeNewAttachmentData,
        }),
        'Expected `attachment.data` to be a typed array; got: number'
      );
    });
  });
});
