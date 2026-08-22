import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useMotionValue, useReducedMotion, animate, type PanInfo } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";

const ACTION_WIDTH = 72;

export interface SwipeAction {
  /** Used as the button's aria-label, e.g. "Edit expense" — not shown as text. */
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: (e: React.MouseEvent) => void;
  variant: "edit" | "delete";
}

interface SwipeableRowProps {
  /** Unique per row — coordinates "only one row open at a time" across the list. */
  id: string | number;
  actions: SwipeAction[];
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** The row's normal tap action on desktop/tablet (e.g. open edit). Ignored on the
   *  tap that closes an open drawer. */
  onRowClick?: () => void;
}

/**
 * Registry coordinating "only one row's drawer open at a time" without a context
 * provider — each mounted row registers a close callback here, keyed by id.
 */
const openRows = new Map<string, () => void>();
let currentlyOpenId: string | null = null;

function requestOpen(id: string) {
  if (currentlyOpenId && currentlyOpenId !== id) {
    openRows.get(currentlyOpenId)?.();
  }
  currentlyOpenId = id;
}

function requestClosed(id: string) {
  if (currentlyOpenId === id) currentlyOpenId = null;
}

export function SwipeableRow({ id, actions, children, className, style, onRowClick }: SwipeableRowProps) {
  const isMobile = useIsMobile();
  const rowId = String(id);
  const drawerWidth = actions.length * ACTION_WIDTH;

  const x = useMotionValue(0);
  const [open, setOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const rowRef = useRef<HTMLDivElement>(null);

  const snapTo = (target: number, nowOpen: boolean) => {
    animate(x, target, prefersReducedMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 38 });
    setOpen(nowOpen);
    if (nowOpen) requestOpen(rowId);
    else requestClosed(rowId);
  };

  useEffect(() => {
    if (!isMobile) return;
    openRows.set(rowId, () => snapTo(0, false));
    return () => {
      openRows.delete(rowId);
      if (currentlyOpenId === rowId) currentlyOpenId = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, rowId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") snapTo(0, false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Desktop/tablet: identical markup to before this component existed — no
  // drag layer, no action drawer, no extra wrapping div beyond what every
  // page already rendered directly.
  if (!isMobile) {
    return (
      <div className={className} style={style} onClick={onRowClick}>
        {children}
      </div>
    );
  }

  const handleDragEnd = (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const passedDistance = Math.abs(info.offset.x) > drawerWidth / 2;
    const passedVelocity = info.velocity.x < -400;
    const shouldOpen = info.offset.x < 0 && (passedDistance || passedVelocity);
    const closingFast = info.offset.x > 0 && (Math.abs(info.offset.x) > drawerWidth / 3 || info.velocity.x > 400);
    if (open && closingFast) snapTo(0, false);
    else snapTo(shouldOpen ? -drawerWidth : 0, shouldOpen);
  };

  return (
    <div ref={rowRef} className="swipe-row-shell relative overflow-hidden">
      {/* Action drawer — real, always-focusable buttons behind the content layer.
          This doubles as the non-gesture fallback: focusing one opens the drawer. */}
      <div className="absolute inset-y-0 right-0 flex" style={{ width: drawerWidth }}>
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              type="button"
              aria-label={action.label}
              onFocus={() => snapTo(-drawerWidth, true)}
              onClick={(e) => {
                action.onClick(e);
                snapTo(0, false);
              }}
              style={{ width: ACTION_WIDTH }}
              className={`h-full flex items-center justify-center shrink-0 ${
                action.variant === "delete"
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              <Icon className="w-5 h-5" />
            </button>
          );
        })}
      </div>

      <motion.div
        className={`${className ?? ""} relative select-none`}
        style={{ ...style, x, touchAction: "pan-y" }}
        drag="x"
        dragConstraints={{ left: -drawerWidth, right: 0 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
        onClick={(e) => {
          // Read the live motion value, not the `open` state: the native click
          // fires synchronously right after mouseup, before React has
          // re-rendered with the state this same gesture just set — a state
          // check here would still see the pre-drag value and fire onRowClick
          // on the same tap that was supposed to close the drawer.
          if (Math.abs(x.get()) > 1) {
            e.preventDefault();
            e.stopPropagation();
            snapTo(0, false);
            return;
          }
          onRowClick?.();
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
