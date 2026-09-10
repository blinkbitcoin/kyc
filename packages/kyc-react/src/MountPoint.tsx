// The container a MountableSource is handed.
//
// Kept separate from Verification.tsx so the mount/cleanup lifecycle is
// testable on its own, and so the component stays a plain switch over states.

import { useEffect, useRef } from 'react';
import { ClientErrorCodes } from '@blinkbitcoin/kyc-core/hosted';

import type { CSSProperties, FC } from 'react';
import type {
  VerificationEvent,
  VerificationSession,
  VerificationSourceError,
} from '@blinkbitcoin/kyc-core/hosted';
import type { MountableSource } from './mountable';

export const MOUNT_POINT_TEST_ID = 'verification-mount';

export interface MountPointProps {
  source: MountableSource;
  /** The running session; a new one re-mounts (restart drops the old UI). */
  session: VerificationSession;
  onEvent: (event: VerificationEvent) => void;
  style?: CSSProperties;
  testId?: string;
}

export const MountPoint: FC<MountPointProps> = ({
  source,
  session,
  onEvent,
  style,
  testId = MOUNT_POINT_TEST_ID,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // The handler lives in a ref so a re-render with a new callback never
  // re-mounts the SDK; only source/session identity may do that.
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    // The div is rendered unconditionally by this component, so by the time
    // effects run the ref is always attached. Read through a local rather
    // than a null check, which would be an unreachable branch.
    const container = containerRef.current as HTMLDivElement;
    try {
      const unmount = source.mount(container, session, event => {
        onEventRef.current(event);
      });
      return () => {
        unmount();
      };
    } catch (cause) {
      const failure = cause as VerificationSourceError | undefined;
      onEventRef.current({
        type: 'error',
        code: failure?.code ?? ClientErrorCodes.SDK_UNAVAILABLE,
        message: failure?.message,
      });
      return undefined;
    }
  }, [source, session]);

  return (
    <div
      ref={containerRef}
      data-testid={testId}
      style={{ ...styles.mount, ...style }}
    />
  );
};

const styles: Record<string, CSSProperties> = {
  mount: { width: '100%', height: '100%', minHeight: 480 },
};
