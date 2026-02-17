import React from 'react';

// Minimal mock that renders children and supports common props.
const stripMotionProps = (props: Record<string, unknown>) => {
  const {
    animate,
    initial,
    exit,
    whileHover,
    whileTap,
    transition,
    variants,
    layout,
    layoutId,
    drag,
    dragConstraints,
    onDrag,
    onDragEnd,
    onDragStart,
    ...rest
  } = props as any;
  return rest;
};

export const motion: any = new Proxy(
  {},
  {
    get: (_target, prop) => {
      const tag = typeof prop === 'string' ? prop : 'div';
      return ({ children, ...rest }: any) => React.createElement(tag, stripMotionProps(rest), children);
    },
  }
);

export const AnimatePresence = ({ children }: any) => <>{children}</>;
