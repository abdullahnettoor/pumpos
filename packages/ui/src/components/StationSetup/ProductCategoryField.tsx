import React, { useId } from 'react';
import { Field, TextInput } from '../primitives/Field.js';

export interface ProductCategoryFieldProps {
  value: string;
  onChange: (value: string) => void;
  categories: readonly string[];
}

export const ProductCategoryField: React.FC<ProductCategoryFieldProps> = ({
  value,
  onChange,
  categories,
}) => {
  const datalistId = useId();

  return (
    <Field label="Category">
      <TextInput
        type="text"
        list={datalistId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={100}
        placeholder="e.g. Engine Oil, Gear Oil, Coolants"
      />
      <datalist id={datalistId}>
        {categories.map((cat) => (
          <option key={cat} value={cat} />
        ))}
      </datalist>
    </Field>
  );
};
