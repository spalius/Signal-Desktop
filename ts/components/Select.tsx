// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { ChangeEvent } from 'react';
import React from 'react';
import classNames from 'classnames';

export type Option = Readonly<{
  disabled?: boolean;
  text: string;
  value: string | number;
}>;

export type PropsType = Readonly<{
  disabled?: boolean;
  moduleClassName?: string;
  name?: string;
  options: ReadonlyArray<Option>;
  onChange(value: string): void;
  value?: string | number;
}>;

export const Select = React.forwardRef(
  (
    { disabled, moduleClassName, name, onChange, options, value }: PropsType,
    ref: React.Ref<HTMLSelectElement>
  ): JSX.Element => {
    const onSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
      onChange(event.target.value);
    };

    return (
      <div className={classNames(['module-select', moduleClassName])}>
        <select
          disabled={disabled}
          name={name}
          value={value}
          onChange={onSelectChange}
          ref={ref}
        >
          {options.map(
            ({ disabled: optionDisabled, text, value: optionValue }) => {
              return (
                <option
                  disabled={optionDisabled}
                  value={optionValue}
                  key={optionValue}
                  aria-label={text}
                >
                  {text}
                </option>
              );
            }
          )}
        </select>
      </div>
    );
  }
);
