import React, { useId } from "react";
import "../../styles/theme.css";

type InputProps = {
  type?: React.HTMLInputTypeAttribute;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  name?: string;
  id?: string;
  disabled?: boolean;
  autoComplete?: string;
};

export const Input: React.FC<InputProps> = ({
  type = "text",
  value,
  onChange,
  placeholder,
  label,
  error,
  name,
  id,
  disabled = false,
  autoComplete,
}) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="ui-input-group">
      {label && (
        <label className="ui-input-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`ui-input-field${error ? " error" : ""}`}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
        disabled={disabled}
        autoComplete={autoComplete}
      />
      {error && (
        <span id={errorId} role="alert" className="ui-input-error">
          {error}
        </span>
      )}
    </div>
  );
};

Input.displayName = "Input";
