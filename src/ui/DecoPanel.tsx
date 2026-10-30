import type { ReactNode } from 'react';

interface Props {
  title?: ReactNode;
  className?: string;
  children: ReactNode;
  /** Unfold like a fan when it appears. */
  unfold?: boolean;
  id?: string;
  role?: string;
  'aria-label'?: string;
}

/** Art deco panel: navy, thin double gold border, fan corners. */
export function DecoPanel({ title, className, children, unfold, ...rest }: Props) {
  return (
    <section className={`deco-panel ${unfold ? 'unfold' : ''} ${className ?? ''}`} {...rest}>
      <span className="deco-corner tl" aria-hidden="true" />
      <span className="deco-corner tr" aria-hidden="true" />
      {title && <h2 className="deco-panel-title">{title}</h2>}
      {children}
    </section>
  );
}
