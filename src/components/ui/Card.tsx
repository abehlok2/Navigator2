import React from "react";
import "../../styles/theme.css";

type CardProps = {
  children: React.ReactNode;
  title?: string;
  as?: keyof JSX.IntrinsicElements;
};

export const Card: React.FC<CardProps> = ({ children, title, as: Component = "section" }) => {
  return (
    <Component className="ui-card">
      {title ? <h3 className="ui-card-title">{title}</h3> : null}
      {children}
    </Component>
  );
};

Card.displayName = "Card";
