/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Notification
 */

import "./ActivityMessagePopup.scss";
import * as React from "react";
import { ActivityMessageEventArgs, MessageManager } from "../messages/MessageManager";
import { CommonProps } from "@itwin/core-react";
import { useActivityMessage } from "./ActivityMessage";

/** Properties for [[ActivityMessagePopup]] component
 * @public
 */
export interface ActivityMessagePopupProps extends CommonProps {
  cancelActivityMessage?: () => void;
  dismissActivityMessage?: () => void;
}

/** Activity Message Popup React component
 * @public
 */
export function ActivityMessagePopup(props: ActivityMessagePopupProps) {
  const [activityMessageInfo, setActivityMessageInfo] = React.useState<ActivityMessageEventArgs | undefined>(undefined);

  React.useEffect(() => {
    const handleActivityMessageUpdatedEvent = (args: ActivityMessageEventArgs) => {
      setActivityMessageInfo(args);
    };

    return MessageManager.onActivityMessageUpdatedEvent.addListener(handleActivityMessageUpdatedEvent);
  }, []);

  React.useEffect(() => {
    const handleActivityMessageCancelledEvent = () => {
      setActivityMessageInfo(undefined);
    };

    return MessageManager.onActivityMessageCancelledEvent.addListener(handleActivityMessageCancelledEvent);
  }, []);

  const cancelActivityMessage = React.useCallback(() => {
    MessageManager.endActivityMessage(false);
    props.cancelActivityMessage && props.cancelActivityMessage();
  }, [props]);

  const dismissActivityMessage = React.useCallback(() => {
    props.dismissActivityMessage && props.dismissActivityMessage();
  }, [props]);

  useActivityMessage({activityMessageInfo, cancelActivityMessage, dismissActivityMessage});

  return <></>;
}
