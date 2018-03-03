/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import { Viewport } from "./Viewport";
import { Point2d } from "@bentley/geometry-core";
import { iModelApp } from "./IModelApp";

/** Message Types for outputMessage */
export const enum OutputMessageType {
  Toast = 0,
  Pointer = 1,
  Sticky = 2,
  InputField = 3,
  Alert = 4, // Modal
}

export const enum OutputMessagePriority {
  None = 0,
  Error = 10,
  Warning = 11,
  Info = 12,
  Debug = 13,
  OldStyle = 14,
  TempRight = 15,
  TempLeft = 16,
  Fatal = 17,
}

/** Values for outputMessage */
export const enum OutputMessageAlert {
  None = 0,
  Dialog = 1,
  Balloon = 2,
}

/** Relative Position for setPointerTypeDetails */
export const enum RelativePosition {
  Left = 0,
  Top = 1,
  Right = 2,
  Bottom = 3,
  TopLeft = 4,
  TopRight = 5,
  BottomLeft = 6,
  BottomRight = 7,
}

/** Reason for ending the activity message via endActivityMessage */
export const enum ActivityMessageEndReason {
  Completed = 0,
  Cancelled = 1,
}

export const enum MessageBoxType {
  OkCancel,
  Ok,
  LargeOk,
  MediumAlert,
  YesNoCancel,
  YesNo,
}

export const enum MessageBoxIconType {
  NoSymbol = 0,   // Means Don't draw Symbol
  Information = 1,   // Lower Case i
  Question = 2,   // Question Mark
  Warning = 3,   // Exclamation Point
  Critical = 4,   // Stop Sign
}

export const enum MessageBoxValue {
  Apply = 1,
  Reset = 2,
  Ok = 3,
  Cancel = 4,
  Default = 5,
  Yes = 6,
  No = 7,
  Retry = 8,
  Stop = 9,
  Help = 10,
  YesToAll = 11,
  NoToAll = 12,
}

export class NotifyMessageDetails {
  public displayTime = 3500;
  public viewport?: Viewport;
  public displayPoint?: Point2d;
  public relativePosition = RelativePosition.TopRight;

  /** Constructor
   *  @param priority        The priority this message should be accorded by the NotificationManager.
   *  @param briefMsg        A short message that conveys the simplest explanation of the issue.
   *  @param detailedMsg     A comprehensive message that explains the issue in detail and potentially offers a solution.
   *  @param msgType         The type of message.
   *  @param openAlert       Whether an alert box should be displayed or not, and if so what kind.
   */
  public constructor(public priority: OutputMessagePriority, public briefMessage: string, public detailedMessage?: string, public msgType = OutputMessageType.Toast, public openAlert = OutputMessageAlert.None) { }

  /** Set OutputMessageType.Pointer message details.
   * @param viewport            Viewport over which to display the Pointer type message.
   * @param displayPoint        Point at which to display the Pointer type message.
   * @param relativePosition    Position relative to displayPoint at which to display the Pointer type message.
   */
  public setPointerTypeDetails(viewport: Viewport, displayPoint: Point2d, relativePosition = RelativePosition.TopRight) {
    this.viewport = viewport;
    this.displayPoint = displayPoint.clone();
    this.relativePosition = relativePosition;
  }
}

/**
 * Specifies the details of an activity message to be displayed to the user.
 */
export class ActivityMessageDetails {
  public wasCancelled = false;

  /**
   * @param showProgressBar         Indicates whether to show the progress bar in the activity message dialog.
   * @param showPercentInMessage    Indicates whether to show the percentage complete in the activity message text.
   * @param supportsCancellation    Indicates whether to show the Cancel button, giving the user the ability to cancel the operation.
   */
  public constructor(public showProgressBar: boolean, public showPercentInMessage: boolean, public supportsCancellation: boolean) { }

  /** Called from NotificationAdmin when the user cancels the activity. */
  public onActivityCancelled() { this.wasCancelled = true; }

  /** Called from NotificationAdmin when the activity completes successfully. */
  public onActivityCompleted() { this.wasCancelled = false; }
}

/**
 * The NotificationManager controls the interaction with the user for prompts, error messages, and alert dialogs.
 * Implementations of the NotificationManager may present the information in different ways. For example, in
 * non-interactive sessions, these messages may be saved to a log file or simply discarded.
 */
export class NotificationManager {
  /** Output a prompt, given an i18n key. */
  public outputPromptByKey(key: string) { this.outputPrompt(iModelApp.i18n.translate(key)); }

  /** Output a prompt to the user. A 'prompt' indicates an action the user should take to proceed. */
  public outputPrompt(_prompt: string) { }

  /** Output a message and/or alert to the user. */
  public outputMessage(_message: NotifyMessageDetails) { }

  /** Output a MessageBox and wait for response from the user.
   * @param mbType       The MessageBox type.
   * @param message      The message to display.
   * @param icon         The MessageBox icon type.
   * @return the response from the user.
   */
  public openMessageBox(_mbType: MessageBoxType, _message: string, _icon: MessageBoxIconType): Promise<MessageBoxValue> { return Promise.resolve(MessageBoxValue.Ok); }

  /**
   * Set up for activity messages.
   * @param details  The activity message details.
   * @return true if the message was displayed, false if an invalid priority is specified.
   */
  public setupActivityMessage(_details: ActivityMessageDetails) { return true; }

  /**
   * Output an activity message to the user.
   * @param messageText      The message text.
   * @param percentComplete  The percentage of completion.
   * @return true if the message was displayed, false if the message could not be displayed.
   */
  public outputActivityMessage(_messageText: string, _percentComplete: number) { return true; }

  /**
   * End an activity message.
   * @param[in] reason       Reason for the end of the Activity Message.
   * @return true if the message was ended successfully, false if the activityMessage could not be ended.
   */
  public endActivityMessage(_reason: ActivityMessageEndReason) { return true; }
}
