// Copyright 2018-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';

import { Image } from './Image';
import { StagedGenericAttachment } from './StagedGenericAttachment';
import { StagedPlaceholderAttachment } from './StagedPlaceholderAttachment';
import type { LocalizerType } from '../../types/Util';
import type { AttachmentType } from '../../types/Attachment';
import {
  areAllAttachmentsVisual,
  getUrl,
  isImageAttachment,
  isVideoAttachment,
} from '../../types/Attachment';

export type Props = Readonly<{
  attachments: ReadonlyArray<AttachmentType>;
  i18n: LocalizerType;
  onAddAttachment?: () => void;
  onClickAttachment?: (attachment: AttachmentType) => void;
  onClose?: () => void;
  onCloseAttachment: (attachment: AttachmentType) => void;
}>;

const IMAGE_WIDTH = 120;
const IMAGE_HEIGHT = 120;

// This is a 1x1 black square.
const BLANK_VIDEO_THUMBNAIL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQAAAAA3bvkkAAAACklEQVR42mNiAAAABgADm78GJQAAAABJRU5ErkJggg==';

export const AttachmentList = ({
  attachments,
  i18n,
  onAddAttachment,
  onClickAttachment,
  onCloseAttachment,
  onClose,
}: Props): JSX.Element | null => {
  if (!attachments.length) {
    return null;
  }

  const allVisualAttachments = areAllAttachmentsVisual(attachments);

  return (
    <div className="module-attachments">
      {onClose && attachments.length > 1 ? (
        <div className="module-attachments__header">
          <button
            type="button"
            onClick={onClose}
            className="module-attachments__close-button"
            aria-label={i18n('close')}
          />
        </div>
      ) : null}
      <div className="module-attachments__rail">
        {(attachments || []).map((attachment, index) => {
          const url = getUrl(attachment);

          const key = url || attachment.path || attachment.fileName || index;

          const isImage = isImageAttachment(attachment);
          const isVideo = isVideoAttachment(attachment);

          if (isImage || isVideo || attachment.pending) {
            const clickCallback =
              attachments.length > 1 ? onClickAttachment : undefined;

            const imageUrl =
              url || (isVideo ? BLANK_VIDEO_THUMBNAIL : undefined);

            return (
              <Image
                key={key}
                alt={i18n('stagedImageAttachment', [
                  attachment.fileName || url || index.toString(),
                ])}
                className="module-staged-attachment"
                i18n={i18n}
                attachment={attachment}
                softCorners
                playIconOverlay={isVideo}
                height={IMAGE_HEIGHT}
                width={IMAGE_WIDTH}
                url={imageUrl}
                closeButton
                onClick={clickCallback}
                onClickClose={onCloseAttachment}
                onError={() => {
                  onCloseAttachment(attachment);
                }}
              />
            );
          }

          return (
            <StagedGenericAttachment
              key={key}
              attachment={attachment}
              i18n={i18n}
              onClose={onCloseAttachment}
            />
          );
        })}
        {allVisualAttachments && onAddAttachment ? (
          <StagedPlaceholderAttachment onClick={onAddAttachment} i18n={i18n} />
        ) : null}
      </div>
    </div>
  );
};
