/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
/** @module Rendering */

import { Point2d, Point3d, Vector3d, XYAndZ } from "@bentley/geometry-core";
import { Viewport } from "./Viewport";
import { DecorateContext } from "./ViewContext";
import { IDisposable } from "@bentley/bentleyjs-core/lib/Disposable";
import { RenderTexture, ImageSource, ImageSourceFormat } from "@bentley/imodeljs-common";

/**
 * Sprites are small raster images that are drawn *on top* of Viewports by a ViewDecoration.
 * Their purpose is to draw the user's attention to something of importance.
 *
 * There are two classes in the Sprites subsystem: Sprite (a Sprite Definition) and SpriteLocation.
 * Sprite Definitions are the images that define the way a type of sprite looks and are generally
 * loaded one time and saved for the rest of a session. A SpriteLocation defines the current
 * position of a single Sprite in a Viewport.
 *
 * A SpriteLocation can be either active or inactive. It becomes active by specifying a location
 * (an x,y point) and a Sprite Definition to draw at that point. It should be obvious that a single Sprite
 * Definition can be used many times by many Sprite Locations and that a single Sprite Location can
 * change both position and which Sprite Definition is shown at that position over time.
 *
 * Sprites can be of varying sizes and color depths and can have both opaque and transparent pixels.
 *
 * Element Manipulator handles and the AccuSnap indicators are examples of Sprites.
 * @note It is also possible to draw a Sprite onto a Viewport directly
 * without ever using a SpritLocation. SpriteLocations are merely provided as a convenience.
 */
export class Sprite implements IDisposable {
  public readonly size = new Point2d();
  public texture?: RenderTexture;
  public dispose() { if (this.texture) this.texture.dispose(); }

  public fromNativeAsset(vp: Viewport, name: string): void {
    vp.iModel.loadNativeAsset(name).then((val: Uint8Array) => {
      const src = new ImageSource(val, ImageSourceFormat.Png);
      this.texture = vp.target.renderSystem.createTextureFromImageSource(src, 32, 32, undefined, new RenderTexture.Params(undefined, true));
      this.size.set(32, 32);
    }).catch(() => { });
  }
}

/** Icon sprites are loaded from .png files in the assets directory of imodeljs-native.
 * They are cached by name. They are cleared when the ToolAdmin is shut down.
 */
export class IconSprites {
  private static readonly _sprites = new Map<string, Sprite>();

  /** Look up an IconSprite by name. If not loaded, create and load it. */
  public static getSprite(spriteName: string, vp: Viewport): Sprite {
    let sprite = this._sprites.get(spriteName);
    if (!sprite) {
      sprite = new Sprite();
      this._sprites.set(spriteName, sprite);
      sprite.fromNativeAsset(vp, "decorators/dgncore/" + spriteName + ".png");
    }
    return sprite;
  }
  public static emptyAll() { this._sprites.forEach((sprite: Sprite) => sprite.dispose()); this._sprites.clear(); }
}

/**
 * A Sprite Location. Sprites generally move around on the screen and this object holds the current location
 * and current Sprite for an image of a sprite within a Viewport. SpriteLocations can be either
 * inactive (not visible) or active.
 *
 * A SpriteLocation can also specify that a Sprite should be drawn partially transparent so that
 * you can "see through" the Sprite.
 */
export class SpriteLocation {
  private viewport?: Viewport;
  /** The Sprite shown by this SpriteLocation. */
  public sprite?: Sprite;
  /** The location of the sprite, in *view* coordinates. */
  private readonly viewLocation = new Point3d();
  private transparency = 0;

  public get isActive(): boolean { return this.viewport !== undefined; }

  /** Change the location of this SpriteLocation from a point in *world* coordinates. */
  public setLocationWorld(location: XYAndZ) { this.viewport!.worldToView(location, this.viewLocation); }

  /**
   * Activate this SpriteLocation to show a Sprite at a location in a Viewport.
   * This call does not display the Sprite in the Viewport. Rather, subsequent calls to
   * [[decorate]] from  will show the Sprite.
   * This SpriteLocation remains active until [[deactivate]] is called.
   * @param sprite  The Sprite to draw at this SpriteLocation
   * @param viewport The Viewport onto which the Sprite is drawn
   * @param location The position, in world coordinates
   * @param transparency The transparency to draw the Sprite (0=opaque, 255=invisible)
   */
  public activate(sprite: Sprite, viewport: Viewport, location: XYAndZ, transparency: number): void {
    viewport.invalidateDecorations();
    this.viewport = viewport;
    this.sprite = sprite;
    this.transparency = transparency;
    this.setLocationWorld(location);
  }

  /** Turn this SpriteLocation off so it will no longer show in its Viewport. */
  public deactivate() {
    if (!this.isActive)
      return;

    this.viewport!.invalidateDecorations();
    this.viewport = undefined;
    this.sprite = undefined;
  }

  /** If this SpriteLocation is active and the supplied DecorateContext is for its Viewport, add the Sprite to the context at the current location. */
  public decorate(context: DecorateContext) {
    if (context.viewport === this.viewport && this.sprite)
      context.addSprite(this.sprite, this.viewLocation, Vector3d.unitX(), this.transparency);
  }
}
