// Copyright 2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import * as React from 'react';
import { storiesOf } from '@storybook/react';
import { select } from '@storybook/addon-knobs';

import type { PropsType } from './Tooltip';
import { Tooltip, TooltipPlacement } from './Tooltip';
import { Theme } from '../util/theme';

const createProps = (overrideProps: Partial<PropsType> = {}): PropsType => ({
  content: overrideProps.content || 'Hello World',
  direction: select('direction', TooltipPlacement, overrideProps.direction),
  sticky: overrideProps.sticky,
  theme: overrideProps.theme,
});

const story = storiesOf('Components/Tooltip', module);

const Trigger = (
  <span
    style={{
      display: 'inline-block',
      marginTop: 200,
      marginBottom: 200,
      marginLeft: 200,
      marginRight: 200,
    }}
  >
    Trigger
  </span>
);

story.add('Top', () => (
  <Tooltip
    {...createProps({
      direction: TooltipPlacement.Top,
    })}
  >
    {Trigger}
  </Tooltip>
));

story.add('Right', () => (
  <Tooltip
    {...createProps({
      direction: TooltipPlacement.Right,
    })}
  >
    {Trigger}
  </Tooltip>
));

story.add('Bottom', () => (
  <Tooltip
    {...createProps({
      direction: TooltipPlacement.Bottom,
    })}
  >
    {Trigger}
  </Tooltip>
));

story.add('Left', () => (
  <Tooltip
    {...createProps({
      direction: TooltipPlacement.Left,
    })}
  >
    {Trigger}
  </Tooltip>
));

story.add('Sticky', () => (
  <Tooltip
    {...createProps({
      sticky: true,
    })}
  >
    {Trigger}
  </Tooltip>
));

story.add('With Applied Popper Modifiers', () => {
  return (
    <Tooltip
      {...createProps({
        direction: TooltipPlacement.Bottom,
      })}
      popperModifiers={[
        {
          name: 'offset',
          options: {
            offset: [80, 80],
          },
        },
      ]}
    >
      {Trigger}
    </Tooltip>
  );
});

story.add('Dark Theme', () => (
  <Tooltip
    {...createProps({
      sticky: true,
      theme: Theme.Dark,
    })}
  >
    {Trigger}
  </Tooltip>
));
