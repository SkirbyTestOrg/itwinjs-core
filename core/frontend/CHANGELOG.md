# Change Log - @bentley/imodeljs-frontend

This log was last generated on Tue, 24 Jul 2018 14:13:01 GMT and should not be manually modified.

## 0.102.0
Tue, 24 Jul 2018 14:13:01 GMT

### Updates

- added ToolTip to AccuSnap
- Rotate view tool target handle add. Fixed data button not accounting for snap location.
- Fix getGridPlaneViewIntersections.
- Make reality models locate-able
- computeRootToNpc should not be changing frustFraction
- remove get/setShow methods on ViewFlags. They were redundant.
- Support tentative with RotateView tool.
- alignWithRootZ needs to set corrected rotation on view state.
- Remove remnants of rotation sphere in ViewRotate. Change animateFrustumChange to not default to no animation.
- Don't call animateFrustumChange from applyViewState if animationTime is undefined.
- Updating performance metrics
- Support rendering on iOS.

## 0.101.0
Mon, 23 Jul 2018 22:00:01 GMT

### Updates

- Flash snap curve primitive
- Disable accusnap debugging.
- Fix adjustSnapPoint. Display normal at snap location.
- Fix window area horizontal/vertical decoration line
- Support creating textures from HTML image elements.
- Freeze IModel.projectExtents. Drawing grids was destroying it
- Move snap related setting from ElementLocateManager to AccuSnap.
- Fix white textures while loading reality model tiles.
- Fix import issue in Polyline.ts
- Fix import issue in Primitive.ts
- Handler to reopen a connection if the backend was moved should really be skipped for calls originating from other connections. 
- Viewport supports custom logic for overriding symbology.
- Fix assertion when creating point string graphics
- ClipVolumes are created using rendering system.
- ClipVolume -> RenderClipVolume
- ClipMaskVolume class for clipping view attachments
- Support overriding line pattern symbology.
- TFS#917985: Tweaked the internal mechanism when opening a new IModelConnection for better performance. Added more logging to enable the router/provisioner team to potential diagnose performance issues. 
- Fix transparency in perspective views
- Fix rendering of translucent textures.
- WIP: TFS#914011 - Rendergradient skybox using shader.
- Added optional display of tile bounding volumes for debugging purposes.
- Fix for testing undefined values for colors
- ShaderBuilder dynamically builds shaders incorporating clipping for various clip plane set lengths alongside normal shader programs
- SheetViewState member name cleanup.

