import { Puck } from "@puckeditor/core";
import type { Config, Data } from "@puckeditor/core";
import { createElement } from "react";
import type { ComponentType, ReactElement } from "react";
import type { ViraExperienceStudioProps } from "./types.js";

type PuckRuntimeProps = {
  readonly config: Config;
  readonly data: Data;
  readonly onChange?: (data: Data) => void;
  readonly onPublish?: (data: Data) => void | Promise<void>;
  readonly headerTitle?: string;
  readonly height?: string | number;
};

const PuckRuntime = Puck as unknown as ComponentType<PuckRuntimeProps>;

export function ViraExperienceStudio(props: ViraExperienceStudioProps): ReactElement {
  const puckProps: PuckRuntimeProps = {
    config: props.session.config,
    data: props.session.data,
    ...(props.onChange === undefined ? {} : { onChange: props.onChange }),
    ...(props.onPublish === undefined ? {} : { onPublish: props.onPublish }),
    ...(props.headerTitle === undefined ? {} : { headerTitle: props.headerTitle }),
    ...(props.height === undefined ? {} : { height: props.height }),
  };
  return createElement(PuckRuntime, puckProps);
}
