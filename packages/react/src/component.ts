import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import type { ViraGenUI } from "@vira-enterprise-genui/runtime-web";
import { createViraReactSession } from "./session.js";
import type {
  ViraExperienceComponent,
  ViraExperienceHandle,
  ViraExperienceProps,
} from "./types.js";

function safeCall<T>(callback: ((value: T) => void) | undefined, value: T): void {
  if (!callback) return;
  try {
    callback(value);
  } catch {
    // React host callbacks are notifications and cannot alter Runtime Web semantics.
  }
}

export const ViraExperience: ViraExperienceComponent = forwardRef<
  ViraExperienceHandle,
  ViraExperienceProps
>(function ViraExperience(props, ref) {
  const sdkRef = useRef<ViraGenUI | undefined>(undefined);
  const propsRef = useRef<ViraExperienceProps>(props);
  propsRef.current = props;

  useImperativeHandle(ref, () => Object.freeze({
    getSdk(): ViraGenUI | undefined {
      return sdkRef.current;
    },
  }), []);

  useEffect(() => {
    const session = createViraReactSession(
      props.configuration,
      props.experience,
      {
        onAction: (payload) => safeCall(propsRef.current.onAction, payload),
        onEffect: (payload) => safeCall(propsRef.current.onEffect, payload),
        onStateChange: (payload) => safeCall(propsRef.current.onStateChange, payload),
        onError: (payload) => safeCall(propsRef.current.onError, payload),
      },
    );

    if (!session.ok) {
      if (session.stage === "configuration") {
        safeCall(propsRef.current.onConfigurationError, session.issue);
      } else if (session.stage === "mount") {
        safeCall(propsRef.current.onMountResult, session.result);
      } else {
        safeCall(propsRef.current.onWrapperError, session.issue);
      }
      return;
    }

    sdkRef.current = session.value.sdk;
    safeCall(propsRef.current.onMountResult, session.value.mountResult);
    safeCall(propsRef.current.onReady, session.value.sdk);

    return () => {
      if (sdkRef.current === session.value.sdk) sdkRef.current = undefined;
      session.value.dispose();
    };
  }, [props.configuration, props.experience]);

  return null;
});
