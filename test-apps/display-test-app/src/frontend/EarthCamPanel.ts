/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Viewport } from "@itwin/core-frontend";
import { ClipVector } from "@itwin/core-geometry";
import { createButton, createNumericInput, createSlider, Slider } from "@itwin/frontend-devtools";
import { convertImageDataToProps, ImageData, ImageDecorator, ImageProps } from "./ImageDecorator";
import { ToolBarDropDown } from "./ToolBar";

export class EarthCamDebugPanel extends ToolBarDropDown {
  private readonly _vp: Viewport;
  private readonly _element: HTMLElement;
  private readonly _slider: Slider;
  private _index: number = 0;
  public intervalID: number = 0;

  public get decorator() { return ImageDecorator.getOrCreate(this._vp); }

  public constructor(vp: Viewport, parent: HTMLElement) {
    super();
    this._vp = vp;
    const startingScaling = 1;

    ImageDecorator.setClipVector(ClipVector.createEmpty());

    this._element = document.createElement("div");
    this._element.className = "toolMenu";
    parent.appendChild(this._element);

    createButton({
      id: "earthcam-timeline-play-btn",
      parent: this._element,
      value: "Play",
      handler: (btn) => {
        if (btn.value === "Play") {
          this.playTimeline();
          btn.value = "Pause";
        } else {
          this.stopTimeline();
          btn.value = "Play";
        }
      },
      // inline?: boolean;
      // tooltip?: string;
    });
    createButton({
      id: "earthcam-image-quality-btn",
      parent: this._element,
      value: "Use Low Quality",
      handler: (btn) => {
        if (btn.value === "Use Low Quality") {
          this.decorator.imageQuality = "medium";
          this._vp.invalidateDecorations();
          btn.value = "Use High Quality";
        } else {
          this.decorator.imageQuality = undefined;
          this._vp.invalidateDecorations();
          btn.value = "Use Low Quality";
        }
      },
      // inline?: boolean;
      // tooltip?: string;
    });
    this._slider = createSlider({
      name: "timeline",
      id: "earthcam-timeline",
      parent: this._element,
      min: "0",
      max: EarthCamClient.imageProps.length.toString(),
      step: "1",
      value: this._index.toString(),
      handler: (slider: HTMLInputElement) => {
        const i = Number.parseInt(slider.value, 10);
        this.setIndex(i);
      },
    });
    this._slider.div.style.margin = "5px";
    const scaleSpan = document.createElement("span");
    this._element.appendChild(scaleSpan);

    const label = document.createElement("label");
    label.style.display = "inline";
    label.title = "Scale Image";
    scaleSpan.appendChild(label);

    createNumericInput({
      handler: (value) => this.setScaling(value),
      id: "earthcam-scaling",
      parent: scaleSpan,
      value: startingScaling,
      display: "inline",
      min: 0.01,
      parseAsFloat: true,
    });

    this.setScaling(startingScaling);
    this.setIndex(0);
    this.open();
  }

  public get isOpen() { return "none" !== this._element.style.display; }
  protected _open() { this._element.style.display = "block"; }
  protected _close() { this._element.style.display = "none"; }

  public setIndex(i: number) {
    this._index = i;
    this._slider.slider.value = this._index.toString();
    const newData = EarthCamClient.imageProps[i];
    const props = convertImageDataToProps(newData);
    this.decorator.setImage(props).then((didDisplay: boolean) => {
      if (!didDisplay) console.error("Failed to create texture from image props.");
    }).catch((err) => {
      console.error("Error During 'SetImage': ", err);
    });
  }

  public setScaling(scale: number) {
    ImageDecorator.scaling = scale;
    this._vp.invalidateDecorations();
  }

  private _timelineIntervalFunc = () => {
    if (this.intervalID !== 0) {
      if (this._index === EarthCamClient.imageProps.length - 1) {
        this.setIndex(0);
      } else {
        this.setIndex(this._index+1);
      }
    }
  };

  public playTimeline() {
    if (!this.intervalID)
      this.intervalID = window.setInterval(this._timelineIntervalFunc, 900);
  }

  public stopTimeline() {
    clearInterval(this.intervalID);
  }
}

class EarthCamClient {
  public static readonly imageProps: ImageData[] = [
  ];
}
