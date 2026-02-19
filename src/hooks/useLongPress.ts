import { useCallback, useRef, useState } from 'react';

export const useLongPress = (
    onLongPress: (e: any) => void,
    onClick?: () => void,
    { delay = 800, shouldPreventDefault = true } = {}
) => {
    const [longPressTriggered, setLongPressTriggered] = useState(false);
    const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);
    const target = useRef<any>(undefined);

    const start = useCallback(
        (event: any) => {
            if (shouldPreventDefault && event.target) {
                event.target.addEventListener('touchend', preventDefault, {
                    passive: false
                });
                target.current = event.target;
            }
            setLongPressTriggered(false);
            timeout.current = setTimeout(() => {
                onLongPress(event);
                setLongPressTriggered(true);
            }, delay);
        },
        [onLongPress, delay, shouldPreventDefault]
    );

    const clear = useCallback(
        (event: any, shouldTriggerClick = true) => {
            if (timeout.current) clearTimeout(timeout.current);
            if (shouldTriggerClick && !longPressTriggered && onClick) onClick();
            setLongPressTriggered(false);
            if (shouldPreventDefault && target.current) {
                target.current.removeEventListener('touchend', preventDefault);
            }
        },
        [onClick, longPressTriggered, shouldPreventDefault]
    );

    const preventDefault = (event: any) => {
        if (!event.cancelable) return;
        event.preventDefault();
    };

    return {
        onMouseDown: (e: any) => start(e),
        onTouchStart: (e: any) => start(e),
        onMouseUp: (e: any) => clear(e),
        onMouseLeave: (e: any) => clear(e, false),
        onTouchEnd: (e: any) => clear(e)
    };
};
