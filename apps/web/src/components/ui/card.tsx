import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

export function Card({ children, className, ...props }: CardProps) {
  return (
    <section className={["card", className].filter(Boolean).join(" ")} {...props}>
      {children}
    </section>
  );
}
