import React from "react";
import "../../styles/theme.css";

type ButtonVariant = "primary" | "danger" | "secondary";

type ButtonProps = {
  variant?: ButtonVariant;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  children: React.ReactNode;
  type?: "button" | "submit" | "reset";
  ariaLabel?: string;
};

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  onClick,
  disabled = false,
  children,
  type = "button",
  ariaLabel,
}) => {
  const variantClass = `ui-button--${variant}`;

  return (
    <button
      type={type}
      className={`ui-button ${variantClass}`}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
};

Button.displayName = "Button";
