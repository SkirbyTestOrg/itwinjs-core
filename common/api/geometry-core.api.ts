// @public
class AbstractNewtonIterator {
  protected constructor(stepSizeTolerance?: number, successiveConvergenceTarget?: number, maxIterations?: number);
  // (undocumented)
  protected _maxIterations: number;
  // (undocumented)
  protected _numAccepted: number;
  // (undocumented)
  protected _stepSizeTolerance: number;
  // (undocumented)
  protected _successiveConvergenceTarget: number;
  // (undocumented)
  abstract applyCurrentStep(isFinalStep: boolean): boolean;
  abstract computeStep(): boolean;
  abstract currentStepSize(): number;
  // (undocumented)
  numIterations: number;
  // (undocumented)
  runIterations(): boolean;
  // (undocumented)
  testConvergence(delta: number): boolean;
}

// WARNING: EQN_EPS has incomplete type information
// WARNING: s_safeDivideFactor has incomplete type information
// WARNING: s_quadricRelTol has incomplete type information
// WARNING: sTestWindow has incomplete type information
// @public
class AnalyticRoots {
  // (undocumented)
  static appendCubicRoots(c: Float64Array | number[], results: GrowableFloat64Array): void;
  // (undocumented)
  static appendImplicitLineUnitCircleIntersections(alpha: number, beta: number, gamma: number, cosValues: OptionalGrowableFloat64Array, sinValues: OptionalGrowableFloat64Array, radiansValues: OptionalGrowableFloat64Array, reltol?: number): number;
  static appendLinearRoot(c0: number, c1: number, values: GrowableFloat64Array): void;
  static appendQuadraticRoots(c: Float64Array | number[], values: GrowableFloat64Array): void;
  // (undocumented)
  static appendQuarticRoots(c: Float64Array | number[], results: GrowableFloat64Array): void;
  // (undocumented)
  static cbrt(x: number): number;
  static isSmallRatio(x: number, y: number, abstol?: number, reltol?: number): boolean;
  static isZero(x: number): boolean;
  // (undocumented)
  static mostDistantFromMean(data: GrowableFloat64Array | undefined): number;
  static safeDivide(values: Float64Array, numerator: number, denominator: number, defaultValue: number | undefined, offset: number): boolean;
}

// WARNING: piOver4Radians has incomplete type information
// WARNING: piOver2Radians has incomplete type information
// WARNING: piRadians has incomplete type information
// WARNING: pi2Radians has incomplete type information
// WARNING: piOver12Radians has incomplete type information
// @public
class Angle implements BeJSONFunctions {
  static adjustDegrees0To360(degrees: number): number;
  static adjustDegreesSigned180(degrees: number): number;
  static adjustRadians0To2Pi(radians: number): number;
  static adjustRadiansMinusPiPlusPi(radians: number): number;
  static cleanupTrigValue(value: number, tolerance?: number): number;
  // (undocumented)
  clone(): Angle;
  cloneScaled(scale: number): Angle;
  // (undocumented)
  cos(): number;
  static create360(): Angle;
  static createAtan2(numerator: number, denominator: number): Angle;
  static createDegrees(degrees: number): Angle;
  static createDegreesAdjustPositive(degrees: number): Angle;
  static createDegreesAdjustSigned180(degrees: number): Angle;
  static createRadians(radians: number): Angle;
  // (undocumented)
  readonly degrees: number;
  // (undocumented)
  static readonly degreesPerRadian: number;
  static degreesToRadians(degrees: number): number;
  static dotProductsToHalfAngleTrigValues(dotUU: number, dotVV: number, dotUV: number, favorZero?: boolean): TrigValues;
  // (undocumented)
  freeze(): void;
  static fromJSON(json?: AngleProps, defaultValRadians?: number): Angle;
  isAlmostEqual(other: Angle): boolean;
  isAlmostEqualAllowPeriodShift(other: Angle): boolean;
  isAlmostEqualNoPeriodShift(other: Angle): boolean;
  static isAlmostEqualRadiansAllowPeriodShift(radiansA: number, radiansB: number): boolean;
  static isAlmostEqualRadiansNoPeriodShift(radiansA: number, radiansB: number): boolean;
  // (undocumented)
  readonly isAlmostZero: boolean;
  // (undocumented)
  readonly isExactZero: boolean;
  readonly isFullCircle: boolean;
  // (undocumented)
  static isFullCircleRadians(radians: number): boolean;
  readonly isHalfCircle: boolean;
  static isHalfCircleRadians(radians: number): boolean;
  static isPerpendicularDotSet(dotUU: number, dotVV: number, dotUV: number): boolean;
  // (undocumented)
  readonly radians: number;
  static radiansBetweenVectorsXYZ(ux: number, uy: number, uz: number, vx: number, vy: number, vz: number): number;
  // (undocumented)
  static readonly radiansPerDegree: number;
  static radiansToDegrees(radians: number): number;
  setDegrees(degrees: number): void;
  setFrom(other: Angle): void;
  setFromJSON(json?: AngleProps, defaultValRadians?: number): void;
  setRadians(radians: number): void;
  // (undocumented)
  sin(): number;
  // (undocumented)
  tan(): number;
  toJSON(): AngleProps;
  // (undocumented)
  toJSONRadians(): AngleProps;
  static trigValuesToHalfAngleTrigValues(rCos2A: number, rSin2A: number): TrigValues;
  // (undocumented)
  static zero(): Angle;
}

// @public
class AngleSweep implements BeJSONFunctions {
  angleToPositivePeriodicFraction(theta: Angle): number;
  angleToSignedPeriodicFraction(theta: Angle): number;
  angleToUnboundedFraction(theta: Angle): number;
  capLatitudeInPlace(): void;
  clone(): AngleSweep;
  cloneMinusRadians(radians: number): AngleSweep;
  static create360(startRadians?: number): AngleSweep;
  static createFullLatitude(): AngleSweep;
  static createStartEnd(startAngle: Angle, endAngle: Angle, result?: AngleSweep): AngleSweep;
  static createStartEndDegrees(startDegrees?: number, endDegrees?: number, result?: AngleSweep): AngleSweep;
  static createStartEndRadians(startRadians?: number, endRadians?: number, result?: AngleSweep): AngleSweep;
  static createStartSweep(startAngle: Angle, sweepAngle: Angle, result?: AngleSweep): AngleSweep;
  static createStartSweepDegrees(startDegrees?: number, sweepDegrees?: number, result?: AngleSweep): AngleSweep;
  static createStartSweepRadians(startRadians?: number, sweepRadians?: number, result?: AngleSweep): AngleSweep;
  readonly endAngle: Angle;
  readonly endDegrees: number;
  readonly endRadians: number;
  fractionPeriod(): number;
  fractionToAngle(fraction: number): Angle;
  fractionToRadians(fraction: number): number;
  static fromJSON(json?: AngleSweepProps): AngleSweep;
  // (undocumented)
  interpolate(fraction: number, other: AngleSweep): AngleSweep;
  isAlmostEqual(other: AngleSweep): boolean;
  isAlmostEqualAllowPeriodShift(other: AngleSweep): boolean;
  isAlmostEqualNoPeriodShift(other: AngleSweep): boolean;
  isAngleInSweep(angle: Angle): boolean;
  readonly isCCW: boolean;
  readonly isFullCircle: boolean;
  readonly isFullLatitudeSweep: boolean;
  isRadiansInSweep(radians: number): boolean;
  radiansArraytoPositivePeriodicFractions(data: GrowableFloat64Array): void;
  // (undocumented)
  radiansToPositivePeriodicFraction(radians: number): number;
  // (undocumented)
  radiansToSignedPeriodicFraction(radians: number): number;
  reverseInPlace(): void;
  setFrom(other: AngleSweep): void;
  setFromJSON(json?: any): void;
  setStartEndDegrees(startDegrees?: number, endDegrees?: number): void;
  setStartEndRadians(startRadians?: number, endRadians?: number): void;
  readonly startAngle: Angle;
  readonly startDegrees: number;
  readonly startRadians: number;
  readonly sweepDegrees: number;
  readonly sweepRadians: number;
  toJSON(): any;
}

// @public
class AnnotatedLineString3d {
  // (undocumented)
  curveParam?: GrowableFloat64Array;
  uvwParam?: GrowableXYZArray;
  // (undocumented)
  vectorV?: GrowableXYZArray;
  // (undocumented)
  vecturU?: GrowableXYZArray;
}

// WARNING: quadratureGuassCount has incomplete type information
// WARNING: quadratureIntervalAngleDegrees has incomplete type information
// @public
class Arc3d extends CurvePrimitive, implements BeJSONFunctions {
  // (undocumented)
  allPerpendicularAngles(spacePoint: Point3d, _extend?: boolean, _endpoints?: boolean): number[];
  // (undocumented)
  angleToPointAndDerivative(theta: Angle, result?: Ray3d): Ray3d;
  announceClipIntervals(clipper: Clipper, announce?: AnnounceNumberNumberCurvePrimitive): boolean;
  // (undocumented)
  appendPlaneIntersectionPoints(plane: PlaneAltitudeEvaluator, result: CurveLocationDetail[]): number;
  readonly center: Point3d;
  circularRadius(): number | undefined;
  // (undocumented)
  clone(): Arc3d;
  clonePartialCurve(fractionA: number, fractionB: number): CurvePrimitive | undefined;
  // (undocumented)
  cloneTransformed(transform: Transform): CurvePrimitive;
  // (undocumented)
  closestPoint(spacePoint: Point3d, extend: boolean, result?: CurveLocationDetail): CurveLocationDetail;
  computeStrokeCountForOptions(options?: StrokeOptions): number;
  // (undocumented)
  static create(center: Point3d, vector0: Vector3d, vector90: Vector3d, sweep?: AngleSweep, result?: Arc3d): Arc3d;
  static createCircularStartMiddleEnd(pointA: XYAndZ, pointB: XYAndZ, pointC: XYAndZ, result?: Arc3d): Arc3d | LineString3d | undefined;
  // (undocumented)
  static createRefs(center: Point3d, matrix: Matrix3d, sweep: AngleSweep, result?: Arc3d): Arc3d;
  // (undocumented)
  static createScaledXYColumns(center: Point3d, matrix: Matrix3d, radius0: number, radius90: number, sweep: AngleSweep, result?: Arc3d): Arc3d;
  // (undocumented)
  static createUnitCircle(): Arc3d;
  // (undocumented)
  static createXY(center: Point3d, radius: number, sweep?: AngleSweep): Arc3d;
  // (undocumented)
  static createXYEllipse(center: Point3d, radiusA: number, radiusB: number, sweep?: AngleSweep): Arc3d;
  curveLength(): number;
  curveLengthBetweenFractions(fraction0: number, fraction1: number): number;
  // (undocumented)
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  emitStrokableParts(handler: IStrokeHandler, options?: StrokeOptions): void;
  emitStrokes(dest: LineString3d, options?: StrokeOptions): void;
  // (undocumented)
  endPoint(result?: Point3d): Point3d;
  // (undocumented)
  extendRange(range: Range3d, transform?: Transform): void;
  // (undocumented)
  fractionToPoint(fraction: number, result?: Point3d): Point3d;
  fractionToPointAnd2Derivatives(fraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  // (undocumented)
  fractionToPointAndDerivative(fraction: number, result?: Ray3d): Ray3d;
  getFractionToDistanceScale(): number | undefined;
  // (undocumented)
  isAlmostEqual(otherGeometry: GeometryQuery): boolean;
  // (undocumented)
  readonly isCircular: boolean;
  readonly isExtensibleFractionSpace: boolean;
  // (undocumented)
  isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean;
  // (undocumented)
  isSameGeometryClass(other: GeometryQuery): boolean;
  readonly matrix: Matrix3d;
  maxVectorLength(): number;
  moveSignedDistanceFromFraction(startFraction: number, signedDistance: number, allowExtension: false, result?: CurveLocationDetail): CurveLocationDetail;
  quickEccentricity(): number;
  quickLength(): number;
  // (undocumented)
  radiansToPointAndDerivative(radians: number, result?: Ray3d): Ray3d;
  // (undocumented)
  reverseInPlace(): void;
  // (undocumented)
  set(center: Point3d, matrix: Matrix3d, sweep: AngleSweep | undefined): void;
  // (undocumented)
  setFrom(other: Arc3d): void;
  // (undocumented)
  setFromJSON(json?: any): void;
  // (undocumented)
  setRefs(center: Point3d, matrix: Matrix3d, sweep: AngleSweep): void;
  // (undocumented)
  setVector0Vector90(vector0: Vector3d, vector90: Vector3d): void;
  // (undocumented)
  startPoint(result?: Point3d): Point3d;
  // (undocumented)
  sweep: AngleSweep;
  toJSON(): any;
  // (undocumented)
  toScaledMatrix3d: {
    axes: Matrix3d;
    center: Point3d;
    r0: number;
    r90: number;
    sweep: AngleSweep;
  }
  toTransformedPoint4d: {
    center: Point4d;
    sweep: AngleSweep;
    vector0: Point4d;
    vector90: Point4d;
  }
  toTransformedVectors: {
    center: Point3d;
    sweep: AngleSweep;
    vector0: Vector3d;
    vector90: Vector3d;
  }
  toVectors: {
    center: Point3d;
    sweep: AngleSweep;
    vector0: Vector3d;
    vector90: Vector3d;
  }
  // (undocumented)
  tryTransformInPlace(transform: Transform): boolean;
  readonly vector0: Vector3d;
  readonly vector90: Vector3d;
}

// @public
class AuxChannel {
  constructor(data: AuxChannelData[], dataType: AuxChannelDataType, name?: string, inputName?: string);
  // (undocumented)
  clone(): AuxChannel;
  data: AuxChannelData[];
  // (undocumented)
  dataType: AuxChannelDataType;
  readonly entriesPerValue: number;
  inputName?: string;
  // (undocumented)
  isAlmostEqual(other: AuxChannel, tol?: number): boolean;
  readonly isScalar: boolean;
  name?: string;
  readonly scalarRange: Range1d | undefined;
  readonly valueCount: number;
}

// @public
class AuxChannelData {
  constructor(input: number, values: number[]);
  // (undocumented)
  clone(): AuxChannelData;
  // (undocumented)
  copyValues(other: AuxChannelData, thisIndex: number, otherIndex: number, blockSize: number): void;
  input: number;
  // (undocumented)
  isAlmostEqual(other: AuxChannelData, tol?: number): boolean;
  values: number[];
}

// @public
enum AuxChannelDataType {
  Distance = 1,
  Normal = 3,
  Scalar = 0,
  Vector = 2
}

// @public (undocumented)
enum AxisIndex {
  // (undocumented)
  X = 0,
  // (undocumented)
  Y = 1,
  // (undocumented)
  Z = 2
}

// @public
enum AxisOrder {
  XYZ = 0,
  XZY = 4,
  YXZ = 5,
  YZX = 1,
  ZXY = 2,
  ZYX = 6
}

// @public
enum AxisScaleSelect {
  LongestRangeDirection = 1,
  NonUniformRangeContainment = 2,
  Unit = 0
}

// @public
class BagOfCurves extends CurveCollection {
  constructor();
  // (undocumented)
  protected _children: AnyCurve[];
  // (undocumented)
  announceToCurveProcessor(processor: RecursiveCurveProcessor, indexInParent?: number): void;
  // (undocumented)
  readonly children: AnyCurve[];
  // (undocumented)
  cloneEmptyPeer(): BagOfCurves;
  // (undocumented)
  cloneStroked(options?: StrokeOptions): BagOfCurves;
  // (undocumented)
  static create(...data: AnyCurve[]): BagOfCurves;
  // (undocumented)
  dgnBoundaryType(): number;
  // (undocumented)
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  // (undocumented)
  getChild(i: number): AnyCurve | undefined;
  // (undocumented)
  isSameGeometryClass(other: GeometryQuery): boolean;
  // (undocumented)
  tryAddChild(child: AnyCurve): boolean;
}

// @public (undocumented)
interface BeJSONFunctions {
  setFromJSON(json: any): void;
  // (undocumented)
  toJSON(): any;
}

// @public
class Bezier1dNd {
  constructor(blockSize: number, polygon: Float64Array);
  clonePolygon(result?: Float64Array): Float64Array;
  static create(data: Point2d[] | Point3d[] | Point4d[]): Bezier1dNd | undefined;
  evaluate(s: number, buffer?: Float64Array): Float64Array;
  evaluateDerivative(s: number, buffer?: Float64Array): Float64Array;
  fractionToParentFraction(fraction: number): number;
  getPolygonPoint(i: number, buffer?: Float64Array): Float64Array | undefined;
  interpolatePoleInPlace(poleIndexA: number, fraction: number, poleIndexB: number): void;
  interval?: Segment1d;
  isAlmostEqual(other: any): boolean;
  loadSpanPoles(data: Float64Array, spanIndex: number): void;
  loadSpanPolesWithWeight(data: Float64Array, dataDimension: number, spanIndex: number, weight: number): void;
  readonly order: number;
  readonly packedData: Float64Array;
  reverseInPlace(): void;
  static saturate1dInPlace(coffs: Float64Array, knots: KnotVector, spanIndex: number): boolean;
  // (undocumented)
  saturateInPlace(knots: KnotVector, spanIndex: number): boolean;
  setInterval(a: number, b: number): void;
  setPolygonPoint(i: number, buffer: Float64Array): void;
  subdivideInPlaceKeepLeft(fraction: number): boolean;
  subdivideInPlaceKeepRight(fraction: number): boolean;
  subdivideToIntervalInPlace(fraction0: number, fraction1: number): boolean;
  unpackToJsonArrays(): any[];
}

// @public
class BezierCoffs {
  constructor(data: number | Float64Array | number[]);
  addInPlace(a: number): void;
  protected allocateToOrder(order: number): void;
  abstract basisFunctions(u: number, result?: Float64Array): Float64Array;
  // (undocumented)
  abstract clone(): BezierCoffs;
  coffs: Float64Array;
  copyFrom(other: BezierCoffs): void;
  createPeer(): BezierCoffs;
  abstract evaluate(u: number): number;
  filter01(roots: number[] | undefined, restrictTo01?: boolean): number[] | undefined;
  static maxAbsDiff(dataA: BezierCoffs, dataB: BezierCoffs): number | undefined;
  readonly order: number;
  roots(targetValue: number, _restrictTo01: boolean): number[] | undefined;
  scaleInPlace(scale: number): void;
  subdivide(u: number, left: BezierCoffs, right: BezierCoffs): boolean;
  abstract sumBasisFunctionDerivatives(u: number, polygon: Float64Array, n: number, result?: Float64Array): Float64Array;
  abstract sumBasisFunctions(u: number, polygon: Float64Array, n: number, result?: Float64Array): Float64Array;
  // (undocumented)
  zero(): void;
}

// @public
class BezierCurve3d extends BezierCurveBase {
  // (undocumented)
  clone(): BezierCurve3d;
  // (undocumented)
  clonePartialCurve(f0: number, f1: number): BezierCurve3d | undefined;
  cloneTransformed(transform: Transform): BezierCurve3d;
  computeStrokeCountForOptions(options?: StrokeOptions): number;
  copyPointsAsLineString(): LineString3d;
  static create(data: Point3d[] | Point2d[]): BezierCurve3d | undefined;
  static createOrder(order: number): BezierCurve3d;
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  // (undocumented)
  extendRange(rangeToExtend: Range3d, transform?: Transform): void;
  fractionToPoint(fraction: number, result?: Point3d): Point3d;
  fractionToPointAnd2Derivatives(fraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  fractionToPointAndDerivative(fraction: number, result?: Ray3d): Ray3d;
  getPolePoint3d(i: number, result?: Point3d): Point3d | undefined;
  getPolePoint4d(i: number, result?: Point4d): Point4d | undefined;
  // (undocumented)
  isAlmostEqual(other: any): boolean;
  // (undocumented)
  isSameGeometryClass(other: any): boolean;
  loadSpanPoles(data: Float64Array, spanIndex: number): void;
  // (undocumented)
  tryTransformInPlace(transform: Transform): boolean;
}

// @public
class BezierCurve3dH extends BezierCurveBase {
  // (undocumented)
  clone(): BezierCurve3dH;
  cloneTransformed(transform: Transform): BezierCurve3dH;
  computeStrokeCountForOptions(options?: StrokeOptions): number;
  static create(data: Point3d[] | Point4d[] | Point2d[]): BezierCurve3dH | undefined;
  static createOrder(order: number): BezierCurve3dH;
  // (undocumented)
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  // (undocumented)
  extendRange(rangeToExtend: Range3d, transform?: Transform): void;
  fractionToPoint(fraction: number, result?: Point3d): Point3d;
  fractionToPoint4d(fraction: number, result?: Point4d): Point4d;
  fractionToPointAnd2Derivatives(fraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  fractionToPointAndDerivative(fraction: number, result?: Ray3d): Ray3d;
  getPolePoint3d(i: number, result?: Point3d): Point3d | undefined;
  getPolePoint4d(i: number, result?: Point4d): Point4d | undefined;
  // (undocumented)
  isAlmostEqual(other: any): boolean;
  // (undocumented)
  isSameGeometryClass(other: any): boolean;
  // (undocumented)
  isUnitWeight(tolerance?: number): boolean;
  loadSpan3dPolesWithWeight(data: Float64Array, spanIndex: number, weight: number): void;
  loadSpan4dPoles(data: Float64Array, spanIndex: number): void;
  poleProductsXYZW(products: Float64Array, ax: number, ay: number, az: number, aw: number): void;
  tryMultiplyMatrix4dInPlace(matrix: Matrix4d): void;
  tryTransformInPlace(transform: Transform): boolean;
  updateClosestPointByTruePerpendicular(spacePoint: Point3d, detail: CurveLocationDetail): boolean;
}

// @public
class BezierCurveBase extends CurvePrimitive {
  protected constructor(blockSize: number, data: Float64Array);
  // (undocumented)
  protected _polygon: Bezier1dNd;
  // (undocumented)
  protected _workBezier?: UnivariateBezier;
  // (undocumented)
  protected _workCoffsA?: Float64Array;
  // (undocumented)
  protected _workCoffsB?: Float64Array;
  protected _workData0: Float64Array;
  // (undocumented)
  protected _workData1: Float64Array;
  protected _workPoint0: Point3d;
  // (undocumented)
  protected _workPoint1: Point3d;
  protected allocateAndZeroBezierWorkData(primaryBezierOrder: number, orderA: number, orderB: number): void;
  abstract computeStrokeCountForOptions(options?: StrokeOptions): number;
  copyPolesAsJsonArray(): any[];
  // (undocumented)
  readonly degree: number;
  emitStrokableParts(handler: IStrokeHandler, _options?: StrokeOptions): void;
  emitStrokes(dest: LineString3d, options?: StrokeOptions): void;
  // (undocumented)
  endPoint(): Point3d;
  abstract extendRange(rangeToExtend: Range3d, transform?: Transform): void;
  // (undocumented)
  fractionToParentFraction(fraction: number): number;
  abstract getPolePoint3d(i: number, point?: Point3d): Point3d | undefined;
  abstract getPolePoint4d(i: number, point?: Point4d): Point4d | undefined;
  isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean;
  // (undocumented)
  readonly numPoles: number;
  // (undocumented)
  readonly order: number;
  // (undocumented)
  polygonLength(): number;
  // (undocumented)
  quickLength(): number;
  reverseInPlace(): void;
  saturateInPlace(knotVector: KnotVector, spanIndex: number): boolean;
  // (undocumented)
  setInterval(a: number, b: number): void;
  // (undocumented)
  startPoint(): Point3d;
}

// @public
class BezierPolynomialAlgebra {
  static accumulate(dataA: Float64Array, orderA: number, resultB: Float64Array): void;
  static accumulateProduct(product: Float64Array, dataA: Float64Array, dataB: Float64Array, scale?: number): void;
  static accumulateProductWithDifferences(product: Float64Array, dataA: Float64Array, dataB: Float64Array, scale?: number): void;
  static accumulateScaledShiftedComponentTimesComponentDelta(product: Float64Array, data: Float64Array, dataBlockSize: number, dataOrder: number, scale: number, indexA: number, constA: number, indexB: number): void;
  static componentDifference(difference: Float64Array, data: Float64Array, dataBlockSize: number, dataOrder: number, index: number): void;
  static scaledComponentSum(sum: Float64Array, data: Float64Array, dataBlockSize: number, dataOrder: number, indexA: number, constA: number, indexB: number, constB: number): void;
  static univariateDifference(data: Float64Array, difference: Float64Array): void;
}

// @public (undocumented)
class Box extends SolidPrimitive {
  protected constructor(map: Transform, baseX: number, baseY: number, topX: number, topY: number, capped: boolean);
  // (undocumented)
  clone(): Box;
  // (undocumented)
  cloneTransformed(transform: Transform): Box | undefined;
  // (undocumented)
  constantVSection(zFraction: number): CurveCollection;
  // (undocumented)
  static createDgnBox(baseOrigin: Point3d, vectorX: Vector3d, vectorY: Vector3d, topOrigin: Point3d, baseX: number, baseY: number, topX: number, topY: number, capped: boolean): Box | undefined;
  // (undocumented)
  static createDgnBoxWithAxes(baseOrigin: Point3d, axes: Matrix3d, topOrigin: Point3d, baseX: number, baseY: number, topX: number, topY: number, capped: boolean): Box | undefined;
  // (undocumented)
  static createRange(range: Range3d, capped: boolean): Box | undefined;
  // (undocumented)
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  // (undocumented)
  extendRange(range: Range3d, transform?: Transform): void;
  // (undocumented)
  getBaseOrigin(): Point3d;
  // (undocumented)
  getBaseX(): number;
  // (undocumented)
  getBaseY(): number;
  getConstructiveFrame(): Transform | undefined;
  // (undocumented)
  getCorners(): Point3d[];
  // (undocumented)
  getTopOrigin(): Point3d;
  // (undocumented)
  getTopX(): number;
  // (undocumented)
  getTopY(): number;
  // (undocumented)
  getVectorX(): Vector3d;
  // (undocumented)
  getVectorY(): Vector3d;
  // (undocumented)
  getVectorZ(): Vector3d;
  // (undocumented)
  isAlmostEqual(other: GeometryQuery): boolean;
  readonly isClosedVolume: boolean;
  // (undocumented)
  isSameGeometryClass(other: any): boolean;
  // (undocumented)
  strokeConstantVSection(zFraction: number): LineString3d;
  // (undocumented)
  tryTransformInPlace(transform: Transform): boolean;
}

// WARNING: primaryCapId has incomplete type information
// @public (undocumented)
class BoxTopology {
  // (undocumented)
  static readonly axisEdgeVertex: number[][][];
  // (undocumented)
  static readonly cornerIndexCCW: number[][];
  // (undocumented)
  static readonly faceDirections: number[][][];
  // (undocumented)
  static readonly faceId: number[][];
  // (undocumented)
  static readonly partnerFace: number[][];
  static readonly points: Point3d[];
}

// @public
class BSpline1dNd {
  protected constructor(numPoles: number, poleLength: number, order: number, knots: KnotVector);
  // (undocumented)
  basisBuffer: Float64Array;
  // (undocumented)
  basisBuffer1: Float64Array;
  // (undocumented)
  basisBuffer2: Float64Array;
  // (undocumented)
  static create(numPoles: number, poleLength: number, order: number, knots: KnotVector): BSpline1dNd | undefined;
  // (undocumented)
  readonly degree: number;
  // (undocumented)
  evaluateBasisFunctionsInSpan(spanIndex: number, spanFraction: number, f: Float64Array, df?: Float64Array, ddf?: Float64Array): void;
  // (undocumented)
  evaluateBuffersAtKnot(u: number, numDerivative?: number): void;
  // (undocumented)
  evaluateBuffersInSpan(spanIndex: number, spanFraction: number): void;
  // (undocumented)
  evaluateBuffersInSpan1(spanIndex: number, spanFraction: number): void;
  // (undocumented)
  getPoint3dPole(i: number, result?: Point3d): Point3d | undefined;
  // (undocumented)
  knots: KnotVector;
  // (undocumented)
  readonly numPoles: number;
  // (undocumented)
  readonly numSpan: number;
  // (undocumented)
  readonly order: number;
  // (undocumented)
  packedData: Float64Array;
  // (undocumented)
  poleBuffer: Float64Array;
  // (undocumented)
  poleBuffer1: Float64Array;
  // (undocumented)
  poleBuffer2: Float64Array;
  // (undocumented)
  poleLength: number;
  // (undocumented)
  reverseInPlace(): void;
  // (undocumented)
  spanFractionToKnot(span: number, localFraction: number): number;
  sumPoleBuffer1ForSpan(spanIndex: number): void;
  sumPoleBuffer2ForSpan(spanIndex: number): void;
  sumPoleBufferForSpan(spanIndex: number): void;
  testCloseablePolygon(mode?: BSplineWrapMode): boolean;
}

// @public
class BSpline2dNd extends GeometryQuery {
  protected constructor(numPolesU: number, numPolesV: number, poleLength: number, knotsU: KnotVector, knotsV: KnotVector);
  // (undocumented)
  protected _basisBuffer1UV: Float64Array[];
  // (undocumented)
  protected _basisBufferUV: Float64Array[];
  // (undocumented)
  protected _poleBuffer: Float64Array;
  // (undocumented)
  protected _poleBuffer1UV: Float64Array[];
  // (undocumented)
  coffs: Float64Array;
  // (undocumented)
  degreeUV(select: UVSelect): number;
  // (undocumented)
  evaluateBuffersAtKnot(u: number, v: number, numDerivative?: number): void;
  extendRangeXYZ(rangeToExtend: Range3d, transform?: Transform): void;
  extendRangeXYZH(rangeToExtend: Range3d, transform?: Transform): void;
  abstract fractionToPointAndDerivatives(_fractionU: number, _fractionV: number, _result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors | undefined;
  fractionToRigidFrame(fractionU: number, fractionV: number, result?: Transform): Transform | undefined;
  // (undocumented)
  getPoint3dPole(i: number, j: number, result?: Point3d): Point3d | undefined;
  // (undocumented)
  getPoint3dPoleXYZW(i: number, j: number, result?: Point3d): Point3d | undefined;
  isClosable(select: UVSelect): boolean;
  // (undocumented)
  knots: KnotVector[];
  // (undocumented)
  numberToUVSelect(value: number): UVSelect;
  // (undocumented)
  numPolesTotal(): number;
  // (undocumented)
  numPolesUV(select: UVSelect): number;
  // (undocumented)
  numSpanUV(select: UVSelect): number;
  // (undocumented)
  orderUV(select: UVSelect): number;
  // (undocumented)
  poleDimension: number;
  // (undocumented)
  poleStepUV(select: UVSelect): number;
  reverseInPlace(select: UVSelect): void;
  setWrappable(select: UVSelect, value: BSplineWrapMode): void;
  // (undocumented)
  spanFractionsToBasisFunctions(select: UVSelect, spanIndex: number, spanFraction: number, f: Float64Array, df?: Float64Array): void;
  spanFractionToKnot(select: UVSelect, span: number, localFraction: number): number;
  sumpoleBufferDerivativesForSpan(spanIndexU: number, spanIndexV: number): void;
  sumPoleBufferForSpan(spanIndexU: number, spanIndexV: number): void;
  // (undocumented)
  static validOrderAndPoleCounts(orderU: number, numPolesU: number, orderV: number, numPolesV: number, numUV: number): boolean;
}

// @public
class BSplineCurve3d extends BSplineCurve3dBase {
  // (undocumented)
  clone(): BSplineCurve3d;
  // (undocumented)
  cloneTransformed(transform: Transform): BSplineCurve3d;
  // WARNING: The type "StrokeCountMap" needs to be exported by the package (e.g. added to index.ts)
  computeAndAttachRecursiveStrokeCounts(options?: StrokeOptions, parentStrokeMap?: StrokeCountMap): void;
  computeStrokeCountForOptions(options?: StrokeOptions): number;
  copyKnots(includeExtraEndKnot: boolean): number[];
  copyPoints(): any[];
  copyPointsFloat64Array(): Float64Array;
  static create(poleArray: Float64Array | Point3d[], knotArray: Float64Array | number[], order: number): BSplineCurve3d | undefined;
  static createUniformKnots(poles: Point3d[] | Float64Array, order: number): BSplineCurve3d | undefined;
  // (undocumented)
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  // (undocumented)
  emitStrokableParts(handler: IStrokeHandler, options?: StrokeOptions): void;
  // (undocumented)
  emitStrokes(dest: LineString3d, options?: StrokeOptions): void;
  // (undocumented)
  evaluatePointAndTangentInSpan(spanIndex: number, spanFraction: number): Ray3d;
  evaluatePointInSpan(spanIndex: number, spanFraction: number): Point3d;
  // (undocumented)
  extendRange(rangeToExtend: Range3d, transform?: Transform): void;
  // (undocumented)
  fractionToPoint(fraction: number, result?: Point3d): Point3d;
  fractionToPointAnd2Derivatives(fraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  // (undocumented)
  fractionToPointAndDerivative(fraction: number, result?: Ray3d): Ray3d;
  // (undocumented)
  getPolePoint3d(poleIndex: number, result?: Point3d): Point3d | undefined;
  // (undocumented)
  getPolePoint4d(poleIndex: number, result?: Point4d): Point4d | undefined;
  getSaturatedBezierSpan3d(spanIndex: number, result?: BezierCurveBase): BezierCurveBase | undefined;
  getSaturatedBezierSpan3dH(spanIndex: number, result?: BezierCurveBase): BezierCurve3dH | undefined;
  getSaturatedBezierSpan3dOr3dH(spanIndex: number, prefer3dH: boolean, result?: BezierCurveBase): BezierCurveBase | undefined;
  // (undocumented)
  isAlmostEqual(other: any): boolean;
  readonly isClosable: BSplineWrapMode;
  // (undocumented)
  isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean;
  // (undocumented)
  isSameGeometryClass(other: any): boolean;
  knotToPoint(u: number, result?: Point3d): Point3d;
  knotToPointAnd2Derivatives(u: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  knotToPointAndDerivative(u: number, result?: Ray3d): Ray3d;
  // (undocumented)
  quickLength(): number;
  setWrappable(value: BSplineWrapMode): void;
  // (undocumented)
  spanFractionToKnot(span: number, localFraction: number): number;
  // (undocumented)
  tryTransformInPlace(transform: Transform): boolean;
}

// @public
class BSplineCurve3dBase extends CurvePrimitive {
  protected constructor(poleDimension: number, numPoles: number, order: number, knots: KnotVector);
  // (undocumented)
  protected _bcurve: BSpline1dNd;
  appendPlaneIntersectionPoints(plane: PlaneAltitudeEvaluator, result: CurveLocationDetail[]): number;
  closestPoint(spacePoint: Point3d, _extend: boolean): CurveLocationDetail | undefined;
  collectBezierSpans(prefer3dH: boolean): BezierCurveBase[];
  copyKnots(includeExtraEndKnot: boolean): number[];
  // (undocumented)
  readonly degree: number;
  endPoint(): Point3d;
  abstract evaluatePointAndTangentInSpan(spanIndex: number, spanFraction: number, result?: Ray3d): Ray3d;
  abstract evaluatePointInSpan(spanIndex: number, spanFraction: number, result?: Point3d): Point3d;
  // (undocumented)
  fractionToPoint(fraction: number, result?: Point3d): Point3d;
  fractionToPointAnd2Derivatives(fraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  fractionToPointAndDerivative(fraction: number, result?: Ray3d): Ray3d;
  abstract getPolePoint3d(poleIndex: number, result?: Point3d): Point3d | undefined;
  abstract getPolePoint4d(poleIndex: number, result?: Point4d): Point4d | undefined;
  abstract getSaturatedBezierSpan3dOr3dH(spanIndex: number, prefer3dH: boolean, result?: BezierCurveBase): BezierCurveBase | undefined;
  abstract knotToPoint(knot: number, result?: Point3d): Point3d;
  abstract knotToPointAnd2Derivatives(knot: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  abstract knotToPointAndDerivative(knot: number, result?: Ray3d): Ray3d;
  // (undocumented)
  readonly numPoles: number;
  // (undocumented)
  readonly numSpan: number;
  // (undocumented)
  readonly order: number;
  poleIndexToDataIndex(poleIndex: number): number | undefined;
  reverseInPlace(): void;
  setWrappable(value: BSplineWrapMode): void;
  startPoint(): Point3d;
}

// @public
class BSplineCurve3dH extends BSplineCurve3dBase {
  // (undocumented)
  clone(): BSplineCurve3dH;
  // (undocumented)
  cloneTransformed(transform: Transform): BSplineCurve3dH;
  // WARNING: The type "StrokeCountMap" needs to be exported by the package (e.g. added to index.ts)
  computeAndAttachRecursiveStrokeCounts(options?: StrokeOptions, parentStrokeMap?: StrokeCountMap): void;
  computeStrokeCountForOptions(options?: StrokeOptions): number;
  copyPoints(): any[];
  copyPointsFloat64Array(): Float64Array;
  static create(controlPoints: Float64Array | Point4d[] | Point3d[], knotArray: Float64Array | number[], order: number): BSplineCurve3dH | undefined;
  static createUniformKnots(controlPoints: Point3d[] | Point4d[] | Float64Array, order: number): BSplineCurve3dH | undefined;
  // (undocumented)
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  // (undocumented)
  emitStrokableParts(handler: IStrokeHandler, options?: StrokeOptions): void;
  // (undocumented)
  emitStrokes(dest: LineString3d, options?: StrokeOptions): void;
  evaluatePointAndTangentInSpan(spanIndex: number, spanFraction: number, result?: Ray3d): Ray3d;
  evaluatePointInSpan(spanIndex: number, spanFraction: number, result?: Point3d): Point3d;
  // (undocumented)
  extendRange(rangeToExtend: Range3d, transform?: Transform): void;
  // (undocumented)
  getPolePoint3d(poleIndex: number, result?: Point3d): Point3d | undefined;
  // (undocumented)
  getPolePoint4d(poleIndex: number, result?: Point4d): Point4d | undefined;
  getSaturatedBezierSpan3dH(spanIndex: number, result?: BezierCurveBase): BezierCurveBase | undefined;
  getSaturatedBezierSpan3dOr3dH(spanIndex: number, _prefer3dH: boolean, result?: BezierCurveBase): BezierCurveBase | undefined;
  // (undocumented)
  isAlmostEqual(other: any): boolean;
  readonly isClosable: boolean;
  // (undocumented)
  isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean;
  // (undocumented)
  isSameGeometryClass(other: any): boolean;
  knotToPoint(u: number, result?: Point3d): Point3d;
  knotToPointAnd2Derivatives(u: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  knotToPointAndDerivative(u: number, result?: Ray3d): Ray3d;
  // (undocumented)
  quickLength(): number;
  // (undocumented)
  spanFractionToKnot(span: number, localFraction: number): number;
  // (undocumented)
  tryTransformInPlace(transform: Transform): boolean;
}

// @public
class BSplineSurface3d extends BSpline2dNd, implements BSplineSurface3dQuery {
  // (undocumented)
  clone(): BSplineSurface3d;
  cloneTransformed(transform: Transform): BSplineSurface3d;
  copyKnots(select: UVSelect, includeExtraEndKnot: boolean): number[];
  copyPointsFloat64Array(): Float64Array;
  static create(controlPointArray: Point3d[] | Float64Array, numPolesU: number, orderU: number, knotArrayU: number[] | Float64Array | undefined, numPolesV: number, orderV: number, knotArrayV: number[] | Float64Array | undefined): BSplineSurface3d | undefined;
  static createGrid(points: number[][][], orderU: number, knotArrayU: number[] | Float64Array | undefined, orderV: number, knotArrayV: number[] | Float64Array | undefined): BSplineSurface3d | undefined;
  // (undocumented)
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  // (undocumented)
  extendRange(rangeToExtend: Range3d, transform?: Transform): void;
  fractionToPoint(fractionU: number, fractionV: number): Point3d;
  fractionToPointAndDerivatives(fractionU: number, fractionV: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  getPointArray(flatArray?: boolean): any[];
  getPointGridJSON(): PackedPointGrid;
  // (undocumented)
  getPole(i: number, j: number, result?: Point3d): Point3d | undefined;
  // (undocumented)
  isAlmostEqual(other: any): boolean;
  // (undocumented)
  isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean;
  // (undocumented)
  isSameGeometryClass(other: any): boolean;
  knotToPoint(u: number, v: number): Point3d;
  knotToPointAndDerivatives(u: number, v: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  // (undocumented)
  tryTransformInPlace(transform: Transform): boolean;
}

// @public
class BSplineSurface3dH extends BSpline2dNd, implements BSplineSurface3dQuery {
  // (undocumented)
  clone(): BSplineSurface3dH;
  // (undocumented)
  cloneTransformed(transform: Transform): BSplineSurface3dH;
  copyKnots(select: UVSelect, includeExtraEndKnot: boolean): number[];
  copyPoints4d(): Point4d[];
  copyPointsAndWeights(points: Point3d[], weights: number[], formatter?: (x: number, y: number, z: number) => any): void;
  static create(controlPointArray: Point3d[], weightArray: number[], numPolesU: number, orderU: number, knotArrayU: number[] | undefined, numPolesV: number, orderV: number, knotArrayV: number[] | undefined): BSplineSurface3dH | undefined;
  static createGrid(xyzwGrid: number[][][], weightStyle: WeightStyle, orderU: number, knotArrayU: number[], orderV: number, knotArrayV: number[]): BSplineSurface3dH | undefined;
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  extendRange(rangeToExtend: Range3d, transform?: Transform): void;
  fractionToPoint(fractionU: number, fractionV: number, result?: Point3d): Point3d;
  // (undocumented)
  fractionToPoint4d(fractionU: number, fractionV: number): Point4d;
  fractionToPointAndDerivatives(fractionU: number, fractionV: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  getPointGridJSON(): PackedPointGrid;
  // (undocumented)
  getPole(i: number, j: number, result?: Point3d): Point3d | undefined;
  // (undocumented)
  isAlmostEqual(other: any): boolean;
  // (undocumented)
  isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean;
  // (undocumented)
  isSameGeometryClass(other: any): boolean;
  knotToPoint(knotU: number, knotV: number, result?: Point3d): Point3d;
  knotToPoint4d(u: number, v: number): Point4d;
  knotToPointAndDerivatives(u: number, v: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  // (undocumented)
  tryTransformInPlace(transform: Transform): boolean;
}

// @public
interface BSplineSurface3dQuery {
  // (undocumented)
  clone(): BSplineSurface3dQuery;
  // (undocumented)
  cloneTransformed(transform: Transform): BSplineSurface3dQuery;
  degreeUV(select: UVSelect): number;
  // (undocumented)
  extendRange(range: Range3d, transform?: Transform): void;
  // (undocumented)
  fractionToPoint(uFractioin: number, vFraction: number): Point3d;
  // (undocumented)
  fractionToRigidFrame(uFraction: number, vFraction: number): Transform | undefined;
  getPointGridJSON(): PackedPointGrid;
  // (undocumented)
  isAlmostEqual(other: any): boolean;
  // (undocumented)
  isClosable(select: UVSelect): boolean;
  // (undocumented)
  isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean;
  // (undocumented)
  isSameGeometryClass(other: any): boolean;
  // (undocumented)
  knotToPoint(uKnot: number, vKnot: number): Point3d;
  numberToUVSelect(value: number): UVSelect;
  // (undocumented)
  numPolesTotal(): number;
  numPolesUV(select: UVSelect): number;
  numSpanUV(select: UVSelect): number;
  orderUV(select: UVSelect): number;
  poleStepUV(select: UVSelect): number;
  // (undocumented)
  reverseInPlace(select: UVSelect): void;
  // (undocumented)
  tryTransformInPlace(transform: Transform): boolean;
}

// @public
enum BSplineWrapMode {
  None = 0,
  OpenByAddingControlPoints = 1,
  OpenByRemovingKnots = 2
}

// @public
enum ClipMask {
  // (undocumented)
  All = 63,
  // (undocumented)
  None = 0,
  // (undocumented)
  XAndY = 15,
  // (undocumented)
  XHigh = 2,
  // (undocumented)
  XLow = 1,
  // (undocumented)
  YHigh = 8,
  // (undocumented)
  YLow = 4,
  // (undocumented)
  ZHigh = 32,
  // (undocumented)
  ZLow = 16
}

// @public
interface Clipper {
  // (undocumented)
  announceClippedArcIntervals(arc: Arc3d, announce?: AnnounceNumberNumberCurvePrimitive): boolean;
  announceClippedSegmentIntervals(f0: number, f1: number, pointA: Point3d, pointB: Point3d, announce?: AnnounceNumberNumber): boolean;
  // (undocumented)
  isPointOnOrInside(point: Point3d, tolerance?: number): boolean;
}

// @public
class ClipPlane implements Clipper {
  // (undocumented)
  announceClippedArcIntervals(arc: Arc3d, announce?: AnnounceNumberNumberCurvePrimitive): boolean;
  announceClippedSegmentIntervals(f0: number, f1: number, pointA: Point3d, pointB: Point3d, announce?: (fraction0: number, fraction1: number) => void): boolean;
  // (undocumented)
  appendIntersectionRadians(arc: Arc3d, intersectionRadians: GrowableFloat64Array): void;
  clone(): ClipPlane;
  cloneNegated(): ClipPlane;
  // (undocumented)
  convexPolygonClipInPlace(xyz: Point3d[], work: Point3d[]): void;
  // (undocumented)
  convexPolygonSplitInsideOutside(xyz: Point3d[], xyzIn: Point3d[], xyzOut: Point3d[], altitudeRange: Range1d): void;
  // (undocumented)
  static createEdgeAndUpVector(point0: Point3d, point1: Point3d, upVector: Vector3d, tiltAngle: Angle, result?: ClipPlane): ClipPlane | undefined;
  // (undocumented)
  static createEdgeXY(point0: Point3d, point1: Point3d, result?: ClipPlane): ClipPlane | undefined;
  static createNormalAndDistance(normal: Vector3d, distance: number, invisible?: boolean, interior?: boolean, result?: ClipPlane): ClipPlane | undefined;
  static createNormalAndPoint(normal: Vector3d, point: Point3d, invisible?: boolean, interior?: boolean, result?: ClipPlane): ClipPlane | undefined;
  static createNormalAndPointXYZXYZ(normalX: number, normalY: number, normalZ: number, originX: number, originY: number, originZ: number, invisible?: boolean, interior?: boolean): ClipPlane | undefined;
  static createPlane(plane: Plane3dByOriginAndUnitNormal, invisible?: boolean, interior?: boolean, result?: ClipPlane): ClipPlane;
  // (undocumented)
  readonly distance: number;
  // (undocumented)
  dotProductPlaneNormalPoint(point: Point3d): number;
  // (undocumented)
  dotProductVector(vector: Vector3d): number;
  // (undocumented)
  evaluatePoint(point: Point3d): number;
  // (undocumented)
  static fractionTol: number;
  // (undocumented)
  static fromJSON(json: any, result?: ClipPlane): ClipPlane | undefined;
  getBoundedSegmentSimpleIntersection(pointA: Point3d, pointB: Point3d): number | undefined;
  // (undocumented)
  getPlane3d(): Plane3dByOriginAndUnitNormal;
  // (undocumented)
  getPlane4d(): Point4d;
  // (undocumented)
  readonly interior: boolean;
  // (undocumented)
  readonly invisible: boolean;
  // (undocumented)
  readonly inwardNormalRef: Vector3d;
  // (undocumented)
  isAlmostEqual(other: ClipPlane): boolean;
  // (undocumented)
  isPointInside(point: Point3d, tolerance?: number): boolean;
  // (undocumented)
  isPointOn(point: Point3d, tolerance?: number): boolean;
  // (undocumented)
  isPointOnOrInside(point: Point3d, tolerance?: number): boolean;
  // (undocumented)
  multiplyPlaneByMatrix(matrix: Matrix4d): void;
  negateInPlace(): void;
  offsetDistance(offset: number): void;
  // (undocumented)
  polygonCrossings(xyz: Point3d[], crossings: Point3d[]): void;
  // (undocumented)
  setFlags(invisible: boolean, interior: boolean): void;
  // (undocumented)
  setInvisible(invisible: boolean): void;
  // (undocumented)
  setPlane4d(plane: Point4d): void;
  toJSON(): any;
  // (undocumented)
  transformInPlace(transform: Transform): boolean;
}

// @public
enum ClipPlaneContainment {
  // (undocumented)
  Ambiguous = 2,
  // (undocumented)
  StronglyInside = 1,
  // (undocumented)
  StronglyOutside = 3
}

// @public
class ClipPrimitive {
  protected constructor(planeSet?: UnionOfConvexClipPlaneSets | undefined, isInvisible?: boolean);
  // (undocumented)
  protected _clipPlanes?: UnionOfConvexClipPlaneSets;
  // (undocumented)
  protected _invisible: boolean;
  // (undocumented)
  protected _maskPlanes?: UnionOfConvexClipPlaneSets;
  static addOutsideEdgeSetToParams(x0: number, y0: number, x1: number, y1: number, pParams: PlaneSetParamsCache, isInvisible?: boolean): void;
  static addShapeToParams(shape: Point3d[], pFlags: number[], pParams: PlaneSetParamsCache): void;
  classifyPointContainment(points: Point3d[], ignoreMasks: boolean): ClipPlaneContainment;
  // (undocumented)
  containsZClip(): boolean;
  // (undocumented)
  abstract fetchClipPlanesRef(): UnionOfConvexClipPlaneSets | undefined;
  // (undocumented)
  abstract fetchMaskPlanesRef(): UnionOfConvexClipPlaneSets | undefined;
  abstract getRange(returnMaskRange: boolean, transform: Transform, result?: Range3d): Range3d | undefined;
  // (undocumented)
  readonly invisible: boolean;
  // (undocumented)
  static isLimitEdge(limitValue: number, point0: Point3d, point1: Point3d): boolean;
  // (undocumented)
  abstract multiplyPlanesTimesMatrix(matrix: Matrix4d): boolean;
  setInvisible(invisible: boolean): void;
  // (undocumented)
  abstract toJSON(): any;
  transformInPlace(transform: Transform): boolean;
}

// @public
class ClipShape extends ClipPrimitive {
  protected constructor(polygon?: Point3d[], zLow?: number, zHigh?: number, transform?: Transform, isMask?: boolean, invisible?: boolean);
  // (undocumented)
  protected _bCurve: BSplineCurve3d | undefined;
  // (undocumented)
  protected _isMask: boolean;
  // (undocumented)
  protected _polygon: Point3d[];
  // (undocumented)
  protected _transformFromClip: Transform | undefined;
  // (undocumented)
  protected _transformToClip: Transform | undefined;
  // (undocumented)
  protected _transformValid: boolean;
  // (undocumented)
  protected _zHigh: number | undefined;
  // (undocumented)
  protected _zHighValid: boolean;
  // (undocumented)
  protected _zLow: number | undefined;
  // (undocumented)
  protected _zLowValid: boolean;
  arePlanesDefined(): boolean;
  readonly bCurve: BSplineCurve3d | undefined;
  clone(result?: ClipShape): ClipShape;
  static createBlock(extremities: Range3d, clipMask: ClipMask, isMask?: boolean, invisible?: boolean, transform?: Transform, result?: ClipShape): ClipShape;
  static createEmpty(isMask?: boolean, invisible?: boolean, transform?: Transform, result?: ClipShape): ClipShape;
  static createFrom(other: ClipShape, result?: ClipShape): ClipShape;
  static createShape(polygon?: Point3d[], zLow?: number, zHigh?: number, transform?: Transform, isMask?: boolean, invisible?: boolean, result?: ClipShape): ClipShape | undefined;
  fetchClipPlanesRef(): UnionOfConvexClipPlaneSets;
  fetchMaskPlanesRef(): UnionOfConvexClipPlaneSets | undefined;
  // (undocumented)
  static fromJSON(json: any, result?: ClipShape): ClipShape | undefined;
  getRange(returnMaskRange?: boolean, transform?: Transform, result?: Range3d): Range3d | undefined;
  initSecondaryProps(isMask: boolean, zLow?: number, zHigh?: number, transform?: Transform): void;
  readonly invisible: boolean;
  readonly isMask: boolean;
  readonly isValidPolygon: boolean;
  // (undocumented)
  readonly isXYPolygon: boolean;
  // (undocumented)
  multiplyPlanesTimesMatrix(matrix: Matrix4d): boolean;
  performTransformFromClip(point: Point3d): void;
  performTransformToClip(point: Point3d): void;
  pointInside(point: Point3d, onTolerance?: number): boolean;
  readonly polygon: Point3d[];
  setPolygon(polygon: Point3d[]): void;
  // (undocumented)
  toJSON(): any;
  readonly transformFromClip: Transform | undefined;
  // (undocumented)
  transformInPlace(transform: Transform): boolean;
  readonly transformToClip: Transform | undefined;
  readonly transformValid: boolean;
  readonly zHigh: number | undefined;
  readonly zHighValid: boolean;
  readonly zLow: number | undefined;
  readonly zLowValid: boolean;
}

// @public
enum ClipStatus {
  // (undocumented)
  ClipRequired = 0,
  // (undocumented)
  TrivialAccept = 2,
  // (undocumented)
  TrivialReject = 1
}

// @public
class ClipUtilities {
  static announceNNC(intervals: Range1d[], cp: CurvePrimitive, announce?: AnnounceNumberNumberCurvePrimitive): boolean;
  static clipPolygonToClipShape(polygon: Point3d[], clipShape: ClipShape): Point3d[][];
  // (undocumented)
  static collectClippedCurves(curve: CurvePrimitive, clipper: Clipper): CurvePrimitive[];
  static pointSetSingleClipStatus(points: GrowableXYZArray, planeSet: UnionOfConvexClipPlaneSets, tolerance: number): ClipStatus;
  // (undocumented)
  static selectIntervals01(curve: CurvePrimitive, unsortedFractions: GrowableFloat64Array, clipper: Clipper, announce?: AnnounceNumberNumberCurvePrimitive): boolean;
}

// @public
class ClipVector {
  appendClone(clip: ClipShape): void;
  appendReference(clip: ClipShape): void;
  appendShape(shape: Point3d[], zLow?: number, zHigh?: number, transform?: Transform, isMask?: boolean, invisible?: boolean): boolean;
  // (undocumented)
  boundingRange: Range3d;
  classifyPointContainment(points: Point3d[], ignoreMasks?: boolean): ClipPlaneContainment;
  classifyRangeContainment(range: Range3d, ignoreMasks: boolean): ClipPlaneContainment;
  clear(): void;
  readonly clips: ClipShape[];
  clone(result?: ClipVector): ClipVector;
  static createClipShapeClones(clips: ClipShape[], result?: ClipVector): ClipVector;
  static createClipShapeRefs(clips: ClipShape[], result?: ClipVector): ClipVector;
  static createEmpty(result?: ClipVector): ClipVector;
  static createFrom(donor: ClipVector, result?: ClipVector): ClipVector;
  extractBoundaryLoops(loopPoints: Point3d[][], transform?: Transform): number[];
  static fromJSON(json: any, result?: ClipVector): ClipVector;
  getRange(transform?: Transform, result?: Range3d): Range3d | undefined;
  isAnyLineStringPointInside(points: Point3d[]): boolean;
  isLineStringCompletelyContained(points: Point3d[]): boolean;
  readonly isValid: boolean;
  multiplyPlanesTimesMatrix(matrix: Matrix4d): boolean;
  parseClipPlanes(): void;
  pointInside(point: Point3d, onTolerance?: number): boolean;
  setInvisible(invisible: boolean): void;
  sumSizes(intervals: Segment1d[], begin: number, end: number): number;
  toJSON(): any;
  transformInPlace(transform: Transform): boolean;
}

// WARNING: clusterTerminator has incomplete type information
// @public (undocumented)
class ClusterableArray extends GrowableBlockedArray {
  constructor(numCoordinatePerPoint: number, numExtraDataPerPoint: number, initialBlockCapacity: number);
  addBlock(data: number[]): void;
  addDirect(x0: number, x1: number, x2?: number, x3?: number, x4?: number): void;
  addPoint2d(xy: Point2d, a?: number, b?: number, c?: number): void;
  addPoint3d(xyz: Point3d, a?: number, b?: number, c?: number): void;
  // (undocumented)
  static clusterGrowablePoint3dArray(source: GrowableXYZArray, tolerance?: number): PackedPointsWithIndex;
  clusterIndicesLexical(clusterTolerance?: number): Uint32Array;
  // (undocumented)
  static clusterPoint3dArray(data: Point3d[], tolerance?: number): PackedPointsWithIndex;
  countClusters(clusteredBlocks: Uint32Array): number;
  // (undocumented)
  createIndexBlockToClusterIndex(clusteredBlocks: Uint32Array): Uint32Array;
  // (undocumented)
  createIndexBlockToClusterStart(clusteredBlocks: Uint32Array): Uint32Array;
  createIndexClusterToClusterStart(clusteredBlocks: Uint32Array): Uint32Array;
  getData(blockIndex: number, i: number): number;
  getExtraData(blockIndex: number, i: number): number;
  // (undocumented)
  getPoint2d(blockIndex: number, result?: Point2d): Point2d;
  // (undocumented)
  getPoint3d(blockIndex: number, result?: Point3d): Point3d;
  // (undocumented)
  static isClusterTerminator(x: number): boolean;
  setExtraData(blockIndex: number, i: number, value: number): void;
  setupPrimaryClusterSort(): void;
  sortSubsetsBySingleKey(blockedIndices: Uint32Array, dataIndex: number): void;
  // (undocumented)
  static sortVectorComponent(index: number): number;
  // (undocumented)
  toJSON(): any[];
}

// @public
export function compareRange1dLexicalLowHigh(a: Range1d, b: Range1d): number;

// @public (undocumented)
class Complex implements BeJSONFunctions {
  constructor(x?: number, y?: number);
  // (undocumented)
  angle(): Angle;
  // (undocumented)
  clone(): Complex;
  // (undocumented)
  static create(x?: number, y?: number, result?: Complex): Complex;
  // (undocumented)
  distance(other: Complex): number;
  // (undocumented)
  divide(other: Complex, result?: Complex): Complex | undefined;
  // (undocumented)
  static fromJSON(json?: any): Complex;
  // (undocumented)
  isAlmostEqual(other: Complex): boolean;
  // (undocumented)
  magnitude(): number;
  // (undocumented)
  magnitudeSquared(): number;
  // (undocumented)
  minus(other: Complex, result?: Complex): Complex;
  // (undocumented)
  plus(other: Complex, result?: Complex): Complex;
  // (undocumented)
  set(x?: number, y?: number): void;
  // (undocumented)
  setFrom(other: Complex): void;
  // (undocumented)
  setFromJSON(json?: any): void;
  // (undocumented)
  sqrt(result?: Complex): Complex;
  // (undocumented)
  times(other: Complex, result?: Complex): Complex;
  timesXY(x: number, y: number, result?: Complex): Complex;
  toJSON(): any;
  // (undocumented)
  x: any;
  // (undocumented)
  y: any;
}

// @public
class Cone extends SolidPrimitive, implements UVSurface, UVSurfaceIsoParametricDistance {
  protected constructor(map: Transform, radiusA: number, radiusB: number, capped: boolean);
  // (undocumented)
  clone(): Cone;
  // (undocumented)
  cloneTransformed(transform: Transform): Cone | undefined;
  // (undocumented)
  constantVSection(vFraction: number): CurveCollection | undefined;
  static createAxisPoints(centerA: Point3d, centerB: Point3d, radiusA: number, radiusB: number, capped: boolean): Cone | undefined;
  static createBaseAndTarget(centerA: Point3d, centerB: Point3d, vectorX: Vector3d, vectorY: Vector3d, radiusA: number, radiusB: number, capped: boolean): Cone;
  // (undocumented)
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  // (undocumented)
  extendRange(range: Range3d, transform?: Transform): void;
  // (undocumented)
  getCenterA(): Point3d;
  // (undocumented)
  getCenterB(): Point3d;
  getConstructiveFrame(): Transform | undefined;
  // (undocumented)
  getMaxRadius(): number;
  // (undocumented)
  getRadiusA(): number;
  // (undocumented)
  getRadiusB(): number;
  // (undocumented)
  getVectorX(): Vector3d;
  // (undocumented)
  getVectorY(): Vector3d;
  // (undocumented)
  isAlmostEqual(other: GeometryQuery): boolean;
  readonly isClosedVolume: boolean;
  // (undocumented)
  isSameGeometryClass(other: any): boolean;
  maxIsoParametricDistance(): Vector2d;
  strokeConstantVSection(v: number, fixedStrokeCount: number | undefined, options: StrokeOptions | undefined): LineString3d;
  // (undocumented)
  tryTransformInPlace(transform: Transform): boolean;
  // (undocumented)
  uvFractionToPoint(uFraction: number, vFraction: number, result?: Point3d): Point3d;
  // (undocumented)
  uvFractionToPointAndTangents(uFraction: number, vFraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  // (undocumented)
  vFractionToRadius(v: number): number;
}

// @public
class Constant {
  // (undocumented)
  static readonly circumferenceOfEarth: number;
  // (undocumented)
  static readonly diameterOfEarth: number;
  // (undocumented)
  static readonly oneCentimeter: number;
  // (undocumented)
  static readonly oneKilometer: number;
  // (undocumented)
  static readonly oneMeter: number;
  // (undocumented)
  static readonly oneMillimeter: number;
}

// @public
class ConstructCurveBetweenCurves extends NullGeometryHandler {
  handleArc3d(arc0: Arc3d): any;
  handleLineSegment3d(segment0: LineSegment3d): any;
  handleLineString3d(ls0: LineString3d): any;
  static interpolateBetween(geometry0: GeometryQuery, fraction: number, geometry1: GeometryQuery): GeometryQuery | undefined;
}

// WARNING: hugeVal has incomplete type information
// @public
class ConvexClipPlaneSet implements Clipper {
  // (undocumented)
  addPlaneToConvexSet(plane: ClipPlane | undefined): void;
  // (undocumented)
  addZClipPlanes(invisible: boolean, zLow?: number, zHigh?: number): void;
  // (undocumented)
  announceClippedArcIntervals(arc: Arc3d, announce?: AnnounceNumberNumberCurvePrimitive): boolean;
  announceClippedSegmentIntervals(f0: number, f1: number, pointA: Point3d, pointB: Point3d, announce?: (fraction0: number, fraction1: number) => void): boolean;
  classifyPointContainment(points: Point3d[], onIsOutside: boolean): ClipPlaneContainment;
  // (undocumented)
  clipPointsOnOrInside(points: Point3d[], inOrOn: Point3d[], out: Point3d[]): void;
  clipUnboundedSegment(pointA: Point3d, pointB: Point3d, announce?: (fraction0: number, fraction1: number) => void): boolean;
  // (undocumented)
  clone(result?: ConvexClipPlaneSet): ConvexClipPlaneSet;
  // (undocumented)
  static createEmpty(result?: ConvexClipPlaneSet): ConvexClipPlaneSet;
  // (undocumented)
  static createPlanes(planes: ClipPlane[], result?: ConvexClipPlaneSet): ConvexClipPlaneSet;
  static createRange3dPlanes(range: Range3d, lowX?: boolean, highX?: boolean, lowY?: boolean, highY?: boolean, lowZ?: boolean, highZ?: boolean): ConvexClipPlaneSet;
  static createSweptPolyline(points: Point3d[], upVector: Vector3d, tiltAngle: Angle): ConvexClipPlaneSet | undefined;
  // (undocumented)
  static createXYBox(x0: number, y0: number, x1: number, y1: number, result?: ConvexClipPlaneSet): ConvexClipPlaneSet;
  // (undocumented)
  static createXYPolyLine(points: Point3d[], interior: boolean[], leftIsInside: boolean, result?: ConvexClipPlaneSet): ConvexClipPlaneSet;
  static createXYPolyLineInsideLeft(points: Point3d[], result?: ConvexClipPlaneSet): ConvexClipPlaneSet;
  // (undocumented)
  static fromJSON(json: any, result?: ConvexClipPlaneSet): ConvexClipPlaneSet;
  getRangeOfAlignedPlanes(transform?: Transform, result?: Range3d): Range3d | undefined;
  // (undocumented)
  isAlmostEqual(other: ConvexClipPlaneSet): boolean;
  // (undocumented)
  isPointInside(point: Point3d): boolean;
  // (undocumented)
  isPointOnOrInside(point: Point3d, tolerance: number): boolean;
  // (undocumented)
  isSphereInside(point: Point3d, radius: number): boolean;
  // (undocumented)
  multiplyPlanesByMatrix(matrix: Matrix4d): void;
  negateAllPlanes(): void;
  // (undocumented)
  readonly planes: ClipPlane[];
  // (undocumented)
  polygonClip(input: Point3d[], output: Point3d[], work: Point3d[]): void;
  reloadSweptPolygon(points: Point3d[], sweepDirection: Vector3d, sideSelect: number): number;
  // (undocumented)
  setInvisible(invisible: boolean): void;
  // (undocumented)
  static testRayIntersections(tNear: Float64Array, origin: Point3d, direction: Vector3d, planes: ConvexClipPlaneSet): boolean;
  // (undocumented)
  toJSON(): any;
  // (undocumented)
  transformInPlace(transform: Transform): void;
}

// @public (undocumented)
class ConvexPolygon2d {
  constructor(points: Point2d[]);
  clipRay(ray: Ray2d): Range1d;
  static computeConvexHull(points: Point2d[]): Point2d[];
  containsPoint(point: Point2d): boolean;
  static createHull(points: Point2d[]): ConvexPolygon2d;
  static createHullIsValidCheck(points: Point2d[]): ConvexPolygon2d;
  distanceOutside(xy: Point2d): number;
  static isValidConvexHull(points: Point2d[]): boolean;
  offsetInPlace(distance: number): boolean;
  readonly points: Point2d[];
  rangeAlongRay(ray: Ray2d): Range1d;
  rangePerpendicularToRay(ray: Ray2d): Range1d;
}

// @public
class CoordinateXYZ extends GeometryQuery {
  clone(): GeometryQuery | undefined;
  cloneTransformed(transform: Transform): GeometryQuery | undefined;
  // (undocumented)
  static create(point: Point3d): CoordinateXYZ;
  // (undocumented)
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  // (undocumented)
  extendRange(rangeToExtend: Range3d, transform?: Transform): void;
  isAlmostEqual(other: GeometryQuery): boolean;
  isSameGeometryClass(other: GeometryQuery): boolean;
  // (undocumented)
  readonly point: Point3d;
  range(): Range3d;
  tryTransformInPlace(transform: Transform): boolean;
}

// @public
class CurveChain extends CurveCollection {
  protected constructor();
  // (undocumented)
  protected _curves: CurvePrimitive[];
  // (undocumented)
  readonly children: CurvePrimitive[];
  // (undocumented)
  cloneStroked(options?: StrokeOptions): AnyCurve;
  abstract cyclicCurvePrimitive(index: number): CurvePrimitive | undefined;
  // (undocumented)
  extendRange(range: Range3d, transform?: Transform): void;
  // (undocumented)
  getChild(i: number): CurvePrimitive | undefined;
  // (undocumented)
  getPackedStrokes(options?: StrokeOptions): GrowableXYZArray | undefined;
  reverseChildrenInPlace(): void;
  // (undocumented)
  tryAddChild(child: AnyCurve): boolean;
}

// @public
class CurveChainWithDistanceIndex extends CurvePrimitive {
  chainDistanceToChainFraction(distance: number): number;
  // WARNING: The type "PathFragment" needs to be exported by the package (e.g. added to index.ts)
  protected chainDistanceToFragment(distance: number, allowExtrapolation?: boolean): PathFragment | undefined;
  // (undocumented)
  clone(): CurvePrimitive | undefined;
  cloneTransformed(transform: Transform): CurvePrimitive | undefined;
  closestPoint(spacePoint: Point3d, _extend: boolean): CurveLocationDetail | undefined;
  // WARNING: The type "StrokeCountMap" needs to be exported by the package (e.g. added to index.ts)
  computeAndAttachRecursiveStrokeCounts(options?: StrokeOptions, parentStrokeMap?: StrokeCountMap): void;
  computeStrokeCountForOptions(options?: StrokeOptions): number;
  // (undocumented)
  static createCapture(path: CurveChain, options?: StrokeOptions): CurveChainWithDistanceIndex;
  // WARNING: The type "PathFragment" needs to be exported by the package (e.g. added to index.ts)
  protected curveAndChildFractionToFragment(curve: CurvePrimitive, fraction: number): PathFragment | undefined;
  // (undocumented)
  curveLength(): number;
  curveLengthBetweenFractions(fraction0: number, fraction1: number): number;
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  emitStrokableParts(dest: IStrokeHandler, options?: StrokeOptions): void;
  emitStrokes(dest: LineString3d, options?: StrokeOptions): void;
  // (undocumented)
  endPoint(result?: Point3d): Point3d;
  extendRange(rangeToExtend: Range3d, transform?: Transform): void;
  fractionToPoint(fraction: number, result?: Point3d): Point3d;
  fractionToPointAnd2Derivatives(fraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors | undefined;
  fractionToPointAndDerivative(fraction: number, result?: Ray3d): Ray3d;
  // (undocumented)
  fractionToPointAndUnitTangent(fraction: number, result?: Ray3d): Ray3d;
  isAlmostEqual(other: GeometryQuery): boolean;
  isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean;
  // (undocumented)
  isSameGeometryClass(other: GeometryQuery): boolean;
  moveSignedDistanceFromFraction(startFraction: number, signedDistance: number, allowExtension: boolean, result?: CurveLocationDetail): CurveLocationDetail;
  // (undocumented)
  quickLength(): number;
  reverseInPlace(): void;
  startPoint(result?: Point3d): Point3d;
  tryTransformInPlace(transform: Transform): boolean;
}

// @public
class CurveCollection extends GeometryQuery {
  abstract announceToCurveProcessor(processor: RecursiveCurveProcessor): void;
  checkForNonLinearPrimitives(): boolean;
  // (undocumented)
  clone(): CurveCollection | undefined;
  abstract cloneEmptyPeer(): CurveCollection;
  abstract cloneStroked(options?: StrokeOptions): AnyCurve;
  // (undocumented)
  cloneTransformed(transform: Transform): CurveCollection | undefined;
  // (undocumented)
  abstract dgnBoundaryType(): number;
  extendRange(rangeToExtend: Range3d, transform?: Transform): void;
  // (undocumented)
  abstract getChild(i: number): AnyCurve | undefined;
  readonly isAnyRegionType: boolean;
  readonly isClosedPath: boolean;
  // (undocumented)
  isInner: boolean;
  readonly isOpenPath: boolean;
  maxGap(): number;
  sumLengths(): number;
  abstract tryAddChild(child: AnyCurve): boolean;
  // (undocumented)
  tryTransformInPlace(transform: Transform): boolean;
}

// @public (undocumented)
class CurveCurve {
  static intersectionProjectedXY(worldToLocal: Matrix4d, geometryA: GeometryQuery, extendA: boolean, geometryB: GeometryQuery, extendB: boolean): CurveLocationDetailArrayPair;
  static intersectionXY(geometryA: GeometryQuery, extendA: boolean, geometryB: GeometryQuery, extendB: boolean): CurveLocationDetailArrayPair;
}

// @public
enum CurveIntervalRole {
  intervalEnd = 12,
  intervalInterior = 11,
  intervalStart = 10,
  isolated = 0,
  isolatedAtVertex = 1
}

// @public
class CurveLocationDetail {
  constructor();
  a: number;
  childDetail?: CurveLocationDetail;
  clone(result?: CurveLocationDetail): CurveLocationDetail;
  static create(curve: CurvePrimitive, result?: CurveLocationDetail): CurveLocationDetail;
  static createConditionalMoveSignedDistance(allowExtension: boolean, curve: CurvePrimitive, startFraction: number, endFraction: number, requestedSignedDistance: number, result?: CurveLocationDetail): CurveLocationDetail;
  static createCurveEvaluatedFraction(curve: CurvePrimitive, fraction: number, result?: CurveLocationDetail): CurveLocationDetail;
  static createCurveFractionPoint(curve: CurvePrimitive, fraction: number, point: Point3d, result?: CurveLocationDetail): CurveLocationDetail;
  static createCurveFractionPointDistance(curve: CurvePrimitive, fraction: number, point: Point3d, a: number, result?: CurveLocationDetail): CurveLocationDetail;
  static createCurveFractionPointDistanceCurveSearchStatus(curve: CurvePrimitive, fraction: number, point: Point3d, distance: number, status: CurveSearchStatus, result?: CurveLocationDetail): CurveLocationDetail;
  curve?: CurvePrimitive;
  curveSearchStatus?: CurveSearchStatus;
  fraction: number;
  intervalRole?: CurveIntervalRole;
  readonly isIsolated: boolean;
  point: Point3d;
  pointQ: Point3d;
  setCurve(curve: CurvePrimitive): void;
  setDistanceTo(point: Point3d): void;
  setFP(fraction: number, point: Point3d, vector?: Vector3d, a?: number): void;
  setFR(fraction: number, ray: Ray3d, a?: number): void;
  setIntervalRole(value: CurveIntervalRole): void;
  updateIfCloserCurveFractionPointDistance(curve: CurvePrimitive, fraction: number, point: Point3d, a: number): boolean;
  vectorInCurveLocationDetail?: Vector3d;
}

// @public
class CurveLocationDetailArrayPair {
  constructor();
  // (undocumented)
  dataA: CurveLocationDetail[];
  // (undocumented)
  dataB: CurveLocationDetail[];
}

// @public
class CurveLocationDetailPair {
  constructor();
  clone(result?: CurveLocationDetailPair): CurveLocationDetailPair;
  static createDetailRef(detailA: CurveLocationDetail, detailB: CurveLocationDetail, result?: CurveLocationDetailPair): CurveLocationDetailPair;
  // (undocumented)
  detailA: CurveLocationDetail;
  // (undocumented)
  detailB: CurveLocationDetail;
}

// @public
class CurvePrimitive extends GeometryQuery {
  protected constructor();
  // WARNING: The type "StrokeCountMap" needs to be exported by the package (e.g. added to index.ts)
  addMappedStrokesToLineString3D(map: StrokeCountMap, linestring: LineString3d): number;
  announceClipIntervals(_clipper: Clipper, _announce?: AnnounceNumberNumberCurvePrimitive): boolean;
  appendPlaneIntersectionPoints(plane: PlaneAltitudeEvaluator, result: CurveLocationDetail[]): number;
  clonePartialCurve(_fractionA: number, _fractionB: number): CurvePrimitive | undefined;
  closestPoint(spacePoint: Point3d, extend: boolean): CurveLocationDetail | undefined;
  // WARNING: The type "StrokeCountMap" needs to be exported by the package (e.g. added to index.ts)
  computeAndAttachRecursiveStrokeCounts(options?: StrokeOptions, parentMap?: StrokeCountMap): void;
  abstract computeStrokeCountForOptions(options?: StrokeOptions): number;
  curveLength(): number;
  curveLengthBetweenFractions(fraction0: number, fraction1: number): number;
  curveLengthWithFixedIntervalCountQuadrature(fraction0: number, fraction1: number, numInterval: number, numGauss?: number): number;
  abstract emitStrokableParts(dest: IStrokeHandler, options?: StrokeOptions): void;
  abstract emitStrokes(dest: LineString3d, options?: StrokeOptions): void;
  // (undocumented)
  endPoint(result?: Point3d): Point3d;
  fractionAndDistanceToPointOnTangent(fraction: number, distance: number): Point3d;
  fractionToFrenetFrame(fraction: number, result?: Transform): Transform | undefined;
  abstract fractionToPoint(fraction: number, result?: Point3d): Point3d;
  abstract fractionToPointAnd2Derivatives(fraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors | undefined;
  abstract fractionToPointAndDerivative(fraction: number, result?: Ray3d): Ray3d;
  // (undocumented)
  fractionToPointAndUnitTangent(fraction: number, result?: Ray3d): Ray3d;
  getFractionToDistanceScale(): number | undefined;
  // WARNING: The type "StrokeCountMap" needs to be exported by the package (e.g. added to index.ts)
  // WARNING: The type "StrokeCountMap" needs to be exported by the package (e.g. added to index.ts)
  static installStrokeCountMap(curve: CurvePrimitive, curveMap: StrokeCountMap, parentMap?: StrokeCountMap): void;
  readonly isExtensibleFractionSpace: boolean;
  abstract isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean;
  moveSignedDistanceFromFraction(startFraction: number, signedDistance: number, allowExtension: boolean, result?: CurveLocationDetail): CurveLocationDetail;
  protected moveSignedDistanceFromFractionGeneric(startFraction: number, signedDistance: number, allowExtension: boolean, result?: CurveLocationDetail): CurveLocationDetail;
  abstract quickLength(): number;
  abstract reverseInPlace(): void;
  startPoint(result?: Point3d): Point3d;
  // WARNING: The type "StrokeCountMap" needs to be exported by the package (e.g. added to index.ts)
  strokeData?: StrokeCountMap;
}

// @public
enum CurveSearchStatus {
  error = 0,
  stoppedAtBoundary = 2,
  success = 1
}

// @public
class DeepCompare {
  constructor(numberRelTol?: number);
  // (undocumented)
  compare(a: any, b: any, tolerance?: number): boolean;
  // (undocumented)
  compareNumber(_a: number, _b: number): boolean;
  // (undocumented)
  errorTracker: any[];
  // (undocumented)
  numberRelTol: number;
  // (undocumented)
  propertyCounts: {
    [key: string]: any;
  }
  // (undocumented)
  typeCounts: {
    arrays: number;
    booleans: number;
    functions: number;
    numbers: number;
    objects: number;
    strings: number;
    undefined: number;
  }
}

// @public (undocumented)
class Degree2PowerPolynomial {
  constructor(c0?: number, c1?: number, c2?: number);
  // (undocumented)
  addConstant(a: number): void;
  // (undocumented)
  addSquaredLinearTerm(a: number, b: number, s?: number): void;
  // (undocumented)
  coffs: number[];
  evaluate(x: number): number;
  evaluateDerivative(x: number): number;
  // (undocumented)
  static fromRootsAndC2(root0: number, root1: number, c2?: number): Degree2PowerPolynomial;
  // (undocumented)
  realRoots(): number[] | undefined;
  static solveQuadratic(a: number, b: number, c: number): number[] | undefined;
  // (undocumented)
  tryGetVertexFactorization(): {
          x0: number;
          y0: number;
          c: number;
      } | undefined;
}

// @public (undocumented)
class Degree3PowerPolynomial {
  constructor(c0?: number, c1?: number, c2?: number, c3?: number);
  // (undocumented)
  addConstant(a: number): void;
  // (undocumented)
  addSquaredLinearTerm(a: number, b: number, s?: number): void;
  // (undocumented)
  coffs: number[];
  evaluate(x: number): number;
  evaluateDerivative(x: number): number;
  // (undocumented)
  static fromRootsAndC3(root0: number, root1: number, root2: number, c3?: number): Degree3PowerPolynomial;
}

// @public (undocumented)
class Degree4PowerPolynomial {
  constructor(c0?: number, c1?: number, c2?: number, c3?: number, c4?: number);
  // (undocumented)
  addConstant(a: number): void;
  // (undocumented)
  coffs: number[];
  evaluate(x: number): number;
  evaluateDerivative(x: number): number;
  // (undocumented)
  static fromRootsAndC4(root0: number, root1: number, root2: number, root3: number, c4?: number): Degree4PowerPolynomial;
}

// @public
class FacetFaceData {
  clone(result?: FacetFaceData): FacetFaceData;
  convertParamToDistance(param: Point2d, result?: Point2d): Point2d;
  convertParamToNormalized(param: Point2d, result?: Point2d): Point2d;
  convertParamXYToDistance(x: number, y: number, result?: Point2d): Point2d;
  convertParamXYToNormalized(x: number, y: number, result?: Point2d): Point2d;
  static createNull(): FacetFaceData;
  // (undocumented)
  readonly paramDistanceRange: Range2d;
  // (undocumented)
  readonly paramRange: Range2d;
  scaleDistances(distanceScale: number): void;
  setNull(): void;
  setParamDistanceRangeFromNewFaceData(polyface: IndexedPolyface, facetStart: number, facetEnd: number): boolean;
}

// @public
class FrameBuilder {
  constructor();
  announce(data: any): void;
  announcePoint(point: Point3d): number;
  // (undocumented)
  announceVector(vector: Vector3d): number;
  // (undocumented)
  applyDefaultUpVector(vector?: Vector3d): void;
  // (undocumented)
  clear(): void;
  static createFrameToDistantPoints(points: Point3d[]): Transform | undefined;
  static createLocalToWorldTransformInRange(range: Range3d, scaleSelect?: AxisScaleSelect, fractionX?: number, fractionY?: number, fractionZ?: number, defaultAxisLength?: number): Transform;
  static createRightHandedFrame(defaultUpVector: Vector3d | undefined, ...params: any[]): Transform | undefined;
  static createRightHandedLocalToWorld(...params: any[]): Transform | undefined;
  getValidatedFrame(allowLeftHanded?: boolean): Transform | undefined;
  // (undocumented)
  readonly hasOrigin: boolean;
  savedVectorCount(): number;
}

// WARNING: smallMetricDistance has incomplete type information
// WARNING: smallMetricDistanceSquared has incomplete type information
// WARNING: smallAngleRadians has incomplete type information
// WARNING: smallAngleRadiansSquared has incomplete type information
// WARNING: largeFractionResult has incomplete type information
// @public (undocumented)
class Geometry {
  static axisIndexToRightHandedAxisOrder(axisIndex: AxisIndex): AxisOrder;
  static axisOrderToAxis(order: AxisOrder, index: number): number;
  static clamp(value: number, min: number, max: number): number;
  static clampToStartEnd(x: number, a: number, b: number): number;
  static conditionalDivideFraction(numerator: number, denominator: number): number | undefined;
  static correctSmallMetricDistance(distance: number, replacement?: number): number;
  static crossProductMagnitude(ux: number, uy: number, uz: number, vx: number, vy: number, vz: number): number;
  static crossProductXYXY(ux: number, uy: number, vx: number, vy: number): number;
  static crossProductXYZXYZ(ux: number, uy: number, uz: number, vx: number, vy: number, vz: number, result?: Vector3d): Vector3d;
  // (undocumented)
  static curvatureMagnitude(ux: number, uy: number, uz: number, vx: number, vy: number, vz: number): number;
  // (undocumented)
  static cyclic3dAxis(axis: number): number;
  static defined01(value: any): number;
  static distanceXYXY(x0: number, y0: number, x1: number, y1: number): number;
  static distanceXYZXYZ(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number;
  static dotProductXYZXYZ(ux: number, uy: number, uz: number, vx: number, vy: number, vz: number): number;
  // (undocumented)
  static readonly fullCircleRadiansMinusSmallAngle: number;
  // (undocumented)
  static hypotenuseSquaredXY(x: number, y: number): number;
  // (undocumented)
  static hypotenuseSquaredXYZ(x: number, y: number, z: number): number;
  // (undocumented)
  static hypotenuseSquaredXYZW(x: number, y: number, z: number, w: number): number;
  // (undocumented)
  static hypotenuseXY(x: number, y: number): number;
  // (undocumented)
  static hypotenuseXYZ(x: number, y: number, z: number): number;
  // (undocumented)
  static hypotenuseXYZW(x: number, y: number, z: number, w: number): number;
  static interpolate(a: number, f: number, b: number): number;
  static inverseInterpolate(x0: number, f0: number, x1: number, f1: number, targetF?: number, defaultResult?: number): number | undefined;
  static inverseInterpolate01(f0: number, f1: number, targetF?: number): number | undefined;
  // (undocumented)
  static inverseMetricDistance(a: number): number | undefined;
  // (undocumented)
  static inverseMetricDistanceSquared(a: number): number | undefined;
  // (undocumented)
  static isAlmostEqualNumber(a: number, b: number): boolean;
  static isArrayOfNumberArray(json: any, numNumberArray: number, minEntries?: number): boolean;
  // (undocumented)
  static isDistanceWithinTol(distance: number, tol: number): boolean;
  static isIn01(x: number, apply01?: boolean): boolean;
  static isIn01WithTolerance(x: number, tolerance: number): boolean;
  static isNumberArray(json: any, minEntries?: number): boolean;
  // (undocumented)
  static isSameCoordinate(x: number, y: number, tol?: number): boolean;
  // (undocumented)
  static isSameCoordinateSquared(x: number, y: number): boolean;
  // (undocumented)
  static isSamePoint2d(dataA: Point2d, dataB: Point2d): boolean;
  // (undocumented)
  static isSamePoint3d(dataA: Point3d, dataB: Point3d): boolean;
  // (undocumented)
  static isSamePoint3dXY(dataA: Point3d, dataB: Point3d): boolean;
  // (undocumented)
  static isSameVector2d(dataA: Vector2d, dataB: Vector2d): boolean;
  // (undocumented)
  static isSameVector3d(dataA: Vector3d, dataB: Vector3d): boolean;
  // (undocumented)
  static isSameXYZ(dataA: XYZ, dataB: XYZ): boolean;
  // (undocumented)
  static isSmallAngleRadians(value: number): boolean;
  // (undocumented)
  static isSmallMetricDistance(distance: number): boolean;
  // (undocumented)
  static isSmallMetricDistanceSquared(distanceSquared: number): boolean;
  // (undocumented)
  static isSmallRelative(value: number): boolean;
  static lexicalXYLessThan(a: XY | XYZ, b: XY | XYZ): 1 | 0 | -1;
  // (undocumented)
  static lexicalXYZLessThan(a: XYZ, b: XYZ): 1 | 0 | -1;
  static lexicalYXLessThan(a: XY | XYZ, b: XY | XYZ): 1 | 0 | -1;
  // (undocumented)
  static maxAbsDiff(a: number, b0: number, b1: number): number;
  // (undocumented)
  static maxAbsXY(x: number, y: number): number;
  // (undocumented)
  static maxAbsXYZ(x: number, y: number, z: number): number;
  // (undocumented)
  static maxXY(a: number, b: number): number;
  // (undocumented)
  static maxXYZ(a: number, b: number, c: number): number;
  static modulo(a: number, period: number): number;
  // (undocumented)
  static resolveNumber(value: number | undefined, defaultValue?: number): number;
  static restrictToInterval(x: number, a: number, b: number): number;
  static safeDivideFraction(numerator: number, denominator: number, defaultResult: number): number;
  static solveTrigForm(constCoff: number, cosCoff: number, sinCoff: number): Vector2d[] | undefined;
  // (undocumented)
  static square(x: number): number;
  static stepCount(stepSize: number, total: number, minCount?: number, maxCount?: number): number;
  // (undocumented)
  static tripleProduct(ux: number, uy: number, uz: number, vx: number, vy: number, vz: number, wx: number, wy: number, wz: number): number;
  static tripleProductPoint4dXYW(columnA: Point4d, columnB: Point4d, columnC: Point4d): number;
  static tripleProductXYW(columnA: XAndY, weightA: number, columnB: XAndY, weightB: number, columnC: XAndY, weightC: number): number;
}

// @public (undocumented)
class GeometryHandler {
  // (undocumented)
  abstract handleArc3d(g: Arc3d): any;
  // (undocumented)
  handleBagOfCurves(g: BagOfCurves): any;
  // (undocumented)
  abstract handleBezierCurve3d(g: BezierCurve3d): any;
  // (undocumented)
  abstract handleBezierCurve3dH(g: BezierCurve3dH): any;
  // (undocumented)
  abstract handleBox(g: Box): any;
  // (undocumented)
  abstract handleBSplineCurve3d(g: BSplineCurve3d): any;
  // (undocumented)
  abstract handleBSplineCurve3dH(g: BSplineCurve3dH): any;
  // (undocumented)
  abstract handleBSplineSurface3d(g: BSplineSurface3d): any;
  // (undocumented)
  abstract handleBSplineSurface3dH(g: BSplineSurface3dH): any;
  // (undocumented)
  abstract handleCone(g: Cone): any;
  // (undocumented)
  abstract handleCoordinateXYZ(g: CoordinateXYZ): any;
  // (undocumented)
  handleCurveCollection(_g: CurveCollection): any;
  // (undocumented)
  abstract handleIndexedPolyface(g: IndexedPolyface): any;
  // (undocumented)
  abstract handleLinearSweep(g: LinearSweep): any;
  // (undocumented)
  abstract handleLineSegment3d(g: LineSegment3d): any;
  // (undocumented)
  abstract handleLineString3d(g: LineString3d): any;
  // (undocumented)
  handleLoop(g: Loop): any;
  // (undocumented)
  handleParityRegion(g: ParityRegion): any;
  // (undocumented)
  handlePath(g: Path): any;
  // (undocumented)
  abstract handlePointString3d(g: PointString3d): any;
  // (undocumented)
  abstract handleRotationalSweep(g: RotationalSweep): any;
  // (undocumented)
  abstract handleRuledSweep(g: RuledSweep): any;
  // (undocumented)
  abstract handleSphere(g: Sphere): any;
  // (undocumented)
  abstract handleTorusPipe(g: TorusPipe): any;
  // (undocumented)
  abstract handleTransitionSpiral(g: TransitionSpiral3d): any;
  // (undocumented)
  handleUnionRegion(g: UnionRegion): any;
}

// @public
class GeometryQuery {
  readonly children: GeometryQuery[] | undefined;
  abstract clone(): GeometryQuery | undefined;
  abstract cloneTransformed(transform: Transform): GeometryQuery | undefined;
  // (undocumented)
  abstract dispatchToGeometryHandler(handler: GeometryHandler): any;
  abstract extendRange(rangeToExtend: Range3d, transform?: Transform): void;
  isAlmostEqual(other: GeometryQuery): boolean;
  abstract isSameGeometryClass(other: GeometryQuery): boolean;
  range(transform?: Transform, result?: Range3d): Range3d;
  abstract tryTransformInPlace(transform: Transform): boolean;
  tryTranslateInPlace(dx: number, dy?: number, dz?: number): boolean;
}

// @public
class GrowableBlockedArray {
  constructor(blockSize: number, initialBlocks?: number);
  // (undocumented)
  protected _blockSize: number;
  // (undocumented)
  protected _data: Float64Array;
  // (undocumented)
  protected _inUse: number;
  addBlock(newData: number[]): void;
  blockCapacity(): number;
  protected blockIndexToDoubleIndex(blockIndex: number): number;
  checkedComponent(blockIndex: number, componentIndex: number): number | undefined;
  clear(): void;
  static compareLexicalBlock(data: Float64Array, blockSize: number, ia: number, ib: number): number;
  component(blockIndex: number, componentIndex: number): number;
  // (undocumented)
  distanceBetweenBlocks(blockIndexA: number, blockIndexB: number): number;
  // (undocumented)
  distanceBetweenSubBlocks(blockIndexA: number, blockIndexB: number, iBegin: number, iEnd: number): number;
  ensureBlockCapacity(blockCapacity: number): void;
  getWithinBlock(blockIndex: number, indexWithinBlock: number): number;
  protected newBlockIndex(): number;
  readonly numBlocks: number;
  readonly numPerBlock: number;
  popBlock(): void;
  sortIndicesLexical(compareBlocks?: BlockComparisonFunction): Uint32Array;
}

// @public
class GrowableFloat64Array {
  constructor(initialCapacity?: number);
  // (undocumented)
  atUncheckedIndex(index: number): number;
  // (undocumented)
  back(): number;
  // (undocumented)
  capacity(): number;
  clear(): void;
  clone(maintainExcessCapacity?: boolean): GrowableFloat64Array;
  // (undocumented)
  static compare(a: any, b: any): number;
  compressAdjcentDuplicates(tolerance?: number): void;
  static create(contents: Float64Array | number[]): GrowableFloat64Array;
  ensureCapacity(newCapacity: number): void;
  // (undocumented)
  front(): number;
  // (undocumented)
  readonly length: number;
  move(i: number, j: number): void;
  pop(): void;
  push(toPush: number): void;
  pushBlockCopy(copyFromIndex: number, numToCopy: number): void;
  // (undocumented)
  reassign(index: number, value: number): void;
  resize(newLength: number, padValue?: number): void;
  restrictToInterval(a: number, b: number): void;
  setAtUncheckedIndex(index: number, value: number): void;
  sort(compareMethod?: (a: any, b: any) => number): void;
  swap(i: number, j: number): void;
}

// @public
class GrowableXYArray extends IndexedXYCollection {
  constructor(numPoints?: number);
  areaXY(): number;
  // (undocumented)
  back(result?: Point2d): Point2d | undefined;
  clear(): void;
  clone(): GrowableXYArray;
  compareLexicalBlock(ia: number, ib: number): number;
  component(pointIndex: number, componentIndex: number): number;
  // (undocumented)
  static create(data: XAndY[] | GrowableXYZArray): GrowableXYArray;
  static createFromGrowableXYZArray(source: GrowableXYZArray, transform?: Transform, dest?: GrowableXYArray): GrowableXYArray;
  crossProductIndexIndexIndex(originIndex: number, targetAIndex: number, targetBIndex: number): number | undefined;
  crossProductXAndYIndexIndex(origin: XAndY, targetAIndex: number, targetBIndex: number): number | undefined;
  distance(i: number, j: number): number | undefined;
  distanceIndexToPoint(i: number, spacePoint: Point2d): number | undefined;
  ensureCapacity(pointCapacity: number): void;
  // (undocumented)
  extendRange(rangeToExtend: Range2d, transform?: Transform): void;
  float64Data(): Float64Array;
  // (undocumented)
  readonly float64Length: number;
  // (undocumented)
  front(result?: Point2d): Point2d | undefined;
  getPoint2dArray(): Point2d[];
  getPoint2dAtCheckedPointIndex(pointIndex: number, result?: Point2d): Point2d | undefined;
  getPoint2dAtUncheckedPointIndex(pointIndex: number, result?: Point2d): Point2d;
  // (undocumented)
  getPoint3dArray(z?: number): Point3d[];
  getVector2dAtCheckedVectorIndex(vectorIndex: number, result?: Vector2d): Vector2d | undefined;
  getXAtUncheckedPointIndex(pointIndex: number): number;
  getYAtUncheckedPointIndex(pointIndex: number): number;
  interpolate(i: number, fraction: number, j: number, result?: Point2d): Point2d | undefined;
  // (undocumented)
  static isAlmostEqual(dataA: GrowableXYArray | undefined, dataB: GrowableXYArray | undefined): boolean;
  isIndexValid(index: number): boolean;
  // (undocumented)
  readonly length: number;
  multiplyMatrix3dInPlace(matrix: Matrix3d): void;
  multiplyTransformInPlace(transform: Transform): void;
  pop(): void;
  push(toPush: XAndY): void;
  pushAll(points: XAndY[]): void;
  pushAllXYAndZ(points: XYAndZ[] | GrowableXYZArray): void;
  pushFromGrowableXYArray(source: GrowableXYArray, sourceIndex?: number): number;
  pushWrap(numWrap: number): void;
  // (undocumented)
  pushXY(x: number, y: number): void;
  resize(pointCount: number): void;
  scaleInPlace(factor: number): void;
  setAtCheckedPointIndex(pointIndex: number, value: XAndY): boolean;
  setXYZAtCheckedPointIndex(pointIndex: number, x: number, y: number): boolean;
  sortIndicesLexical(): Uint32Array;
  // (undocumented)
  sumLengths(): number;
  transferFromGrowableXYArray(destIndex: number, source: GrowableXYArray, sourceIndex: number): boolean;
  tryTransformInverseInPlace(transform: Transform): boolean;
  vectorIndexIndex(i: number, j: number, result?: Vector2d): Vector2d | undefined;
  vectorXAndYIndex(origin: XAndY, j: number, result?: Vector2d): Vector2d | undefined;
}

// @public
class GrowableXYZArray extends IndexedXYZCollection {
  constructor(numPoints?: number);
  accumulateCrossProductIndexIndexIndex(originIndex: number, targetAIndex: number, targetBIndex: number, result: Vector3d): void;
  addSteppedPoints(other: GrowableXYZArray, pointIndex0: number, step: number, numAdd: number): void;
  areaXY(): number;
  // (undocumented)
  back(result?: Point3d): Point3d | undefined;
  clear(): void;
  clone(result?: GrowableXYZArray): GrowableXYZArray;
  compareLexicalBlock(ia: number, ib: number): number;
  component(pointIndex: number, componentIndex: number): number;
  // (undocumented)
  static create(data: XYAndZ[]): GrowableXYZArray;
  crossProductIndexIndexIndex(originIndex: number, targetAIndex: number, targetBIndex: number, result?: Vector3d): Vector3d | undefined;
  crossProductXYAndZIndexIndex(origin: XYAndZ, targetAIndex: number, targetBIndex: number, result?: Vector3d): Vector3d | undefined;
  distance(i: number, j: number): number | undefined;
  static distanceBetweenPointsIn2Arrays(arrayA: GrowableXYZArray, i: number, arrayB: GrowableXYZArray, j: number): number | undefined;
  distanceIndexToPoint(i: number, spacePoint: XYAndZ): number | undefined;
  static distanceRangeBetweenCorrespondingPoints(arrayA: GrowableXYZArray, arrayB: GrowableXYZArray): Range1d;
  ensureCapacity(pointCapacity: number): void;
  // (undocumented)
  extendRange(rangeToExtend: Range3d, transform?: Transform): void;
  float64Data(): Float64Array;
  // (undocumented)
  readonly float64Length: number;
  // (undocumented)
  front(result?: Point3d): Point3d | undefined;
  getPoint2dAtCheckedPointIndex(pointIndex: number, result?: Point2d): Point2d | undefined;
  getPoint2dAtUncheckedPointIndex(pointIndex: number, result?: Point2d): Point2d;
  // (undocumented)
  getPoint3dArray(): Point3d[];
  getPoint3dAtCheckedPointIndex(pointIndex: number, result?: Point3d): Point3d | undefined;
  getPoint3dAtUncheckedPointIndex(pointIndex: number, result?: Point3d): Point3d;
  getVector3dAtCheckedVectorIndex(vectorIndex: number, result?: Vector3d): Vector3d | undefined;
  interpolate(i: number, fraction: number, j: number, result?: Point3d): Point3d | undefined;
  // (undocumented)
  static isAlmostEqual(dataA: GrowableXYZArray | undefined, dataB: GrowableXYZArray | undefined): boolean;
  // (undocumented)
  isCloseToPlane(plane: Plane3dByOriginAndUnitNormal, tolerance?: number): boolean;
  isIndexValid(index: number): boolean;
  // (undocumented)
  readonly length: number;
  multiplyAndRenormalizeMatrix3dInverseTransposeInPlace(matrix: Matrix3d): void;
  multiplyMatrix3dInPlace(matrix: Matrix3d): void;
  multiplyTransformInPlace(transform: Transform): void;
  pop(): void;
  push(toPush: XYAndZ): void;
  pushAll(points: Point3d[]): void;
  pushFromGrowableXYZArray(source: GrowableXYZArray, sourceIndex: number): boolean;
  pushWrap(numWrap: number): void;
  // (undocumented)
  pushXYZ(x: number, y: number, z: number): void;
  resize(pointCount: number): void;
  scaleInPlace(factor: number): void;
  setAtCheckedPointIndex(pointIndex: number, value: XYAndZ): boolean;
  setXYZAtCheckedPointIndex(pointIndex: number, x: number, y: number, z: number): boolean;
  sortIndicesLexical(): Uint32Array;
  // (undocumented)
  sumLengths(): number;
  transferFromGrowableXYZArray(destIndex: number, source: GrowableXYZArray, sourceIndex: number): boolean;
  tryTransformInverseInPlace(transform: Transform): boolean;
  vectorIndexIndex(i: number, j: number, result?: Vector3d): Vector3d | undefined;
  vectorXYAndZIndex(origin: XYAndZ, j: number, result?: Vector3d): Vector3d | undefined;
}

// @public
class HalfEdge {
  constructor(x?: number, y?: number, z?: number, i?: number);
  clearMask(mask: HalfEdgeMask): void;
  clearMaskAroundFace(mask: HalfEdgeMask): void;
  clearMaskAroundVertex(mask: HalfEdgeMask): void;
  collectAroundFace(f?: NodeFunction): any[];
  collectAroundVertex(f?: NodeFunction): any[];
  // (undocumented)
  countEdgesAroundFace(): number;
  // (undocumented)
  countEdgesAroundVertex(): number;
  // (undocumented)
  countMaskAroundFace(mask: HalfEdgeMask, value?: boolean): number;
  // (undocumented)
  countMaskAroundVertex(mask: HalfEdgeMask, value?: boolean): number;
  // (undocumented)
  static createEdgeXYXY(id0: any, x0: number, y0: number, id1: any, x1: number, y1: number): HalfEdge;
  static createHalfEdgePair(heArray: HalfEdge[] | undefined): HalfEdge;
  static createHalfEdgePairWithCoordinates(xA: number | undefined, yA: number | undefined, zA: number | undefined, iA: number | undefined, xB: number | undefined, yB: number | undefined, zB: number | undefined, iB: number | undefined, heArray: HalfEdge[] | undefined): HalfEdge;
  decomission(): void;
  distanceXY(other: HalfEdge): number;
  readonly edgeMate: HalfEdge;
  readonly facePredecessor: HalfEdge;
  readonly faceSuccessor: HalfEdge;
  static filterIsMaskOff(node: HalfEdge, mask: HalfEdgeMask): boolean;
  static filterIsMaskOn(node: HalfEdge, mask: HalfEdgeMask): boolean;
  fractionToPoint2d(fraction: number, result?: Point2d): Point2d;
  getMask(mask: HalfEdgeMask): number;
  static horizontalScanFraction(node0: HalfEdge, y: number): number | undefined | HalfEdge;
  // (undocumented)
  i: number;
  // (undocumented)
  readonly id: any;
  isEqualXY(other: HalfEdge): boolean;
  isMaskSet(mask: HalfEdgeMask): boolean;
  // (undocumented)
  maskBits: number;
  // (undocumented)
  static nodeToId(node: HalfEdge): any;
  // (undocumented)
  static nodeToIdMaskXY: {
    id: any;
    mask: any;
    xy: number[];
  }
  // (undocumented)
  static nodeToIdString(node: HalfEdge): any;
  // (undocumented)
  static nodeToIdXYString(node: HalfEdge): string;
  // (undocumented)
  static nodeToMaskString(node: HalfEdge): string;
  // (undocumented)
  static nodeToSelf(node: HalfEdge): any;
  // (undocumented)
  static nodeToXY(node: HalfEdge): number[];
  static pinch(nodeA: HalfEdge, nodeB: HalfEdge): void;
  setMask(mask: HalfEdgeMask): void;
  // (undocumented)
  setMaskAroundFace(mask: HalfEdgeMask): void;
  // (undocumented)
  setMaskAroundVertex(mask: HalfEdgeMask): void;
  signedFaceArea(): number;
  // (undocumented)
  sortAngle?: number;
  static splitEdge(base: undefined | HalfEdge, xA: number | undefined, yA: number | undefined, zA: number | undefined, iA: number | undefined, heArray: HalfEdge[] | undefined): HalfEdge;
  // (undocumented)
  steiner: boolean;
  sumAroundFace(f: NodeToNumberFunction): number;
  sumAroundVertex(f: NodeToNumberFunction): number;
  // (undocumented)
  testAndSetMask(mask: HalfEdgeMask): number;
  // (undocumented)
  static testNodeMaskNotExterior(node: HalfEdge): boolean;
  static transverseIntersectionFractions(nodeA0: HalfEdge, nodeB0: HalfEdge, result?: Vector2d): Vector2d | undefined;
  // (undocumented)
  vectorToFaceSuccessor(result?: Vector3d): Vector3d;
  // (undocumented)
  vectorToFaceSuccessorXY(result?: Vector2d): Vector2d;
  // (undocumented)
  readonly vertexPredecessor: HalfEdge;
  // (undocumented)
  readonly vertexSuccessor: HalfEdge;
  // (undocumented)
  x: number;
  // (undocumented)
  y: number;
  // (undocumented)
  z: number;
  // (undocumented)
  zOrder: number;
}

// @public
class HalfEdgeGraph {
  constructor();
  addEdgeXY(x0: number, y0: number, x1: number, y1: number): HalfEdge;
  // (undocumented)
  allHalfEdges: HalfEdge[];
  announceFaceLoops(announceFace: GraphNodeFunction): void;
  announceVertexLoops(announceVertex: GraphNodeFunction): void;
  clearMask(mask: HalfEdgeMask): void;
  // (undocumented)
  collectFaceLoops(): HalfEdge[];
  collectSegments(): LineSegment3d[];
  // (undocumented)
  collectVertexLoops(): HalfEdge[];
  // (undocumented)
  countFaceLoops(): number;
  // (undocumented)
  countFaceLoopsWithMaskFilter(filter: HalfEdgeAndMaskToBooleanFunction, mask: HalfEdgeMask): number;
  // (undocumented)
  countMask(mask: HalfEdgeMask): number;
  // (undocumented)
  countNodes(): number;
  countVertexLoops(): number;
  createEdgeXYZXYZ(xA?: number, yA?: number, zA?: number, iA?: number, xB?: number, yB?: number, zB?: number, iB?: number): HalfEdge;
  decommission(): void;
  reverseMask(mask: HalfEdgeMask): void;
  setMask(mask: HalfEdgeMask): void;
  splitEdge(base: undefined | HalfEdge, xA?: number, yA?: number, zA?: number, iA?: number): HalfEdge;
}

// @public (undocumented)
enum HalfEdgeMask {
  // (undocumented)
  ALL_MASK = 4294967295,
  // (undocumented)
  BOUNDARY = 2,
  // (undocumented)
  BOUNDARY_VERTEX_MASK = 64,
  // (undocumented)
  CONSTU_MASK = 4,
  // (undocumented)
  CONSTV_MASK = 8,
  // (undocumented)
  DIRECTED_EDGE_MASK = 256,
  // (undocumented)
  EXTERIOR = 1,
  // (undocumented)
  HULL_MASK = 1024,
  // (undocumented)
  NULL_MASK = 0,
  // (undocumented)
  POLAR_LOOP_MASK = 4096,
  // (undocumented)
  PRIMARY_EDGE = 512,
  // (undocumented)
  PRIMARY_VERTEX_MASK = 128,
  // (undocumented)
  SECTION_EDGE_MASK = 2048,
  // (undocumented)
  TRIANGULATED_NODE_MASK = 16384,
  // (undocumented)
  USEAM_MASK = 16,
  // (undocumented)
  VISITED = 8192,
  // (undocumented)
  VSEAM_MASK = 32
}

// @public (undocumented)
module IModelJson {
  interface ArcByVectorProps {
    // (undocumented)
    center: XYZProps;
    // (undocumented)
    sweepStartEnd: AngleSweepProps;
    // (undocumented)
    vectorX: XYZProps;
    // (undocumented)
    vectorY: XYZProps;
  }

  interface AxesProps {
    xyVectors?: [XYZProps, XYZProps];
    yawPitchRollAngles?: YawPitchRollProps;
    zxVectors?: [XYZProps, XYZProps];
  }

  interface BcurveProps {
    // (undocumented)
    knot: [number];
    order: number;
    point: [XYZProps];
  }

  interface BoxProps extends AxesProps {
    baseX: number;
    baseY: number;
    capped?: boolean;
    height?: number;
    origin: XYZProps;
    topOrigin?: XYZProps;
    topX?: number;
    topY?: number;
  }

  interface BSplineSurfaceProps {
    // (undocumented)
    orderU: number;
    // (undocumented)
    orderV: number;
    // (undocumented)
    points: [[[number]]];
    // (undocumented)
    uKnots: [number];
    // (undocumented)
    vKnots: [number];
  }

  interface ConeProps extends AxesProps {
    capped?: boolean;
    // (undocumented)
    end: XYZProps;
    endRadius?: number;
    // (undocumented)
    start: XYZProps;
    startRadius: number;
    vectorX?: XYZProps;
    // (undocumented)
    vectorY?: XYZProps;
  }

  interface CurveCollectionProps extends PlanarRegionProps {
    bagofCurves?: [CurveCollectionProps];
    path?: [CurvePrimitiveProps];
  }

  // (undocumented)
  interface CurvePrimitiveProps {
    // (undocumented)
    arc?: ArcByVectorProps | [XYZProps, XYZProps, XYZProps];
    // (undocumented)
    bcurve?: BcurveProps;
    // (undocumented)
    lineSegment?: [XYZProps, XYZProps];
    // (undocumented)
    lineString?: XYZProps[];
    // (undocumented)
    transitionSpiral?: TransitionSpiralProps;
  }

  interface CylinderProps {
    capped?: boolean;
    end: XYZProps;
    // (undocumented)
    radius: number;
    start: XYZProps;
  }

  // (undocumented)
  interface GeometryProps extends CurvePrimitiveProps, SolidPrimitiveProps, CurveCollectionProps {
    // (undocumented)
    bsurf?: BSplineSurfaceProps;
    // (undocumented)
    indexedMesh?: IndexedMeshProps;
    // (undocumented)
    point?: XYZProps;
  }

  interface IndexedMeshProps {
    color?: [number];
    colorIndex?: [number];
    normal?: [XYZProps];
    normalIndex?: [number];
    param?: [XYProps];
    paramIndex?: [number];
    point: [XYZProps];
    pointIndex: [number];
  }

  interface LinearSweepProps {
    capped?: boolean;
    contour: CurveCollectionProps;
    vector: XYZProps;
  }

  interface PlanarRegionProps {
    loop?: [CurvePrimitiveProps];
    parityRegion?: [{
                loop: [CurvePrimitiveProps];
            }];
    // (undocumented)
    unionRegion?: [PlanarRegionProps];
  }

  // (undocumented)
  interface PointProps {
    // (undocumented)
    point?: XYZProps;
  }

  class Reader {
    constructor();
    // (undocumented)
    static parse(json?: any): any;
    // (undocumented)
    static parseArray(data?: any): any[] | undefined;
    // (undocumented)
    static parseBcurve(data?: any): BSplineCurve3d | BSplineCurve3dH | undefined;
    // (undocumented)
    static parseBox(json?: any): any;
    // (undocumented)
    static parseBsurf(data?: any): BSplineSurface3d | BSplineSurface3dH | undefined;
    // WARNING: The type "ConeProps" needs to be exported by the package (e.g. added to index.ts)
    static parseConeProps(json?: ConeProps): any;
    // (undocumented)
    static parseCoordinate(data?: any): CoordinateXYZ | undefined;
    // (undocumented)
    static parseCurveCollectionMembers(result: CurveCollection, data?: any): CurveCollection | undefined;
    // WARNING: The type "CylinderProps" needs to be exported by the package (e.g. added to index.ts)
    static parseCylinderProps(json?: CylinderProps): any;
    // (undocumented)
    static parseIndexedMesh(data?: any): any | undefined;
    // (undocumented)
    static parseLinearSweep(json?: any): any;
    // (undocumented)
    static parsePointArray(json?: any): Point3d[];
    // (undocumented)
    static parsePolyfaceAuxData(data?: any): PolyfaceAuxData | undefined;
    // (undocumented)
    static parseRotationalSweep(json?: any): any;
    // (undocumented)
    static parseRuledSweep(json?: any): any;
    // WARNING: The type "SphereProps" needs to be exported by the package (e.g. added to index.ts)
    // (undocumented)
    static parseSphere(json?: SphereProps): any;
    // (undocumented)
    static parseTorusPipe(json?: any): any;
    // (undocumented)
    static parseTransitionSpiral(data?: any): TransitionSpiral3d | undefined;
  }

  interface RotationalSweepProps {
    axis: XYZProps;
    capped?: boolean;
    center: XYZProps;
    contour: CurveCollectionProps;
    sweepAngle: AngleProps;
  }

  interface RuledSweepProps {
    capped?: boolean;
    // (undocumented)
    countour: [CurveCollectionProps];
  }

  interface SolidPrimitiveProps {
    // (undocumented)
    box?: BoxProps;
    // (undocumented)
    cone?: ConeProps;
    // (undocumented)
    cylinder?: CylinderProps;
    // (undocumented)
    linearSweep?: LinearSweepProps;
    // (undocumented)
    rotationalSweep?: RotationalSweepProps;
    // (undocumented)
    ruledSweep?: RuledSweepProps;
    // (undocumented)
    sphere?: SphereProps;
    // (undocumented)
    torusPipe?: TorusPipeProps;
  }

  interface SphereProps extends AxesProps {
    capped?: boolean;
    center: XYZProps;
    latitudeStartEnd?: AngleSweepProps;
    radius?: number;
    radiusX?: number;
    radiusY?: number;
    radiusZ?: number;
  }

  interface TorusPipeProps extends AxesProps {
    capped?: boolean;
    center: XYZProps;
    majorRadius: number;
    minorRadius?: number;
    sweepAngle?: AngleProps;
  }

  interface TransitionSpiralProps extends AxesProps {
    // (undocumented)
    curveLength?: number;
    // (undocumented)
    endBearing?: AngleProps;
    // (undocumented)
    endRadius?: number;
    // (undocumented)
    fractionInterval?: number[];
    intervalFractions?: [number, number];
    origin: XYZProps;
    startBearing?: AngleProps;
    // (undocumented)
    startRadius?: number;
    type?: string;
  }

  // (undocumented)
  class Writer extends GeometryHandler {
    // (undocumented)
    emit(data: any): any;
    // (undocumented)
    emitArray(data: object[]): any;
    // (undocumented)
    handleArc3d(data: Arc3d): any;
    // (undocumented)
    handleBagOfCurves(data: BagOfCurves): any;
    // (undocumented)
    handleBezierCurve3d(curve: BezierCurve3d): any;
    // (undocumented)
    handleBezierCurve3dH(curve: BezierCurve3dH): any;
    // (undocumented)
    handleBox(box: Box): any;
    // (undocumented)
    handleBSplineCurve3d(curve: BSplineCurve3d): any;
    // (undocumented)
    handleBSplineCurve3dH(curve: BSplineCurve3dH): any;
    // (undocumented)
    handleBSplineSurface3d(surface: BSplineSurface3d): any;
    // (undocumented)
    handleBSplineSurface3dH(surface: BSplineSurface3dH): any;
    // (undocumented)
    handleCone(data: Cone): any;
    // (undocumented)
    handleCoordinateXYZ(data: CoordinateXYZ): any;
    // (undocumented)
    handleIndexedPolyface(pf: IndexedPolyface): any;
    // (undocumented)
    handleLinearSweep(data: LinearSweep): any;
    // (undocumented)
    handleLineSegment3d(data: LineSegment3d): any;
    // (undocumented)
    handleLineString3d(data: LineString3d): any;
    // (undocumented)
    handleLoop(data: Loop): any;
    // (undocumented)
    handleParityRegion(data: ParityRegion): any;
    // (undocumented)
    handlePath(data: Path): any;
    // (undocumented)
    handlePointString3d(data: PointString3d): any;
    // (undocumented)
    handleRotationalSweep(data: RotationalSweep): any;
    // (undocumented)
    handleRuledSweep(data: RuledSweep): any;
    // (undocumented)
    handleSphere(data: Sphere): any;
    // (undocumented)
    handleTorusPipe(data: TorusPipe): any;
    // (undocumented)
    handleTransitionSpiral(data: TransitionSpiral3d): any;
    // (undocumented)
    handleUnionRegion(data: UnionRegion): any;
    static toIModelJson(data: any): any;
  }

}

// @public (undocumented)
class IndexedPolyface extends Polyface {
  protected constructor(data: PolyfaceData, facetStart?: number[], facetToFaceData?: number[]);
  // (undocumented)
  protected _facetStart: number[];
  // (undocumented)
  protected _facetToFaceData: number[];
  // (undocumented)
  addColor(color: number): number;
  // (undocumented)
  addColorIndex(index: number): void;
  addIndexedPolyface(source: IndexedPolyface, reversed: boolean, transform: Transform | undefined): void;
  // (undocumented)
  addNormal(normal: Vector3d, priorIndexA?: number, priorIndexB?: number): number;
  // (undocumented)
  addNormalIndex(index: number): void;
  // (undocumented)
  addNormalXYZ(x: number, y: number, z: number): number;
  // (undocumented)
  addParam(param: Point2d): number;
  // (undocumented)
  addParamIndex(index: number): void;
  // (undocumented)
  addParamUV(u: number, v: number, priorIndexA?: number, priorIndexB?: number): number;
  // (undocumented)
  addParamXY(x: number, y: number): number;
  addPoint(point: Point3d, priorIndex?: number): number;
  // (undocumented)
  addPointIndex(index: number, visible?: boolean): void;
  addPointXYZ(x: number, y: number, z: number): number;
  cleanupOpenFacet(): void;
  // (undocumented)
  clone(): IndexedPolyface;
  // (undocumented)
  cloneTransformed(transform: Transform): IndexedPolyface;
  readonly colorCount: number;
  // (undocumented)
  static create(needNormals?: boolean, needParams?: boolean, needColors?: boolean): IndexedPolyface;
  createVisitor(numWrap?: number): PolyfaceVisitor;
  // (undocumented)
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  // (undocumented)
  extendRange(range: Range3d, transform?: Transform): void;
  readonly faceCount: number;
  readonly facetCount: number;
  facetIndex0(index: number): number;
  facetIndex1(index: number): number;
  getFaceDataByFacetIndex(facetIndex: number): FacetFaceData;
  isAlmostEqual(other: any): boolean;
  // (undocumented)
  readonly isEmpty: boolean;
  // (undocumented)
  isSameGeometryClass(other: any): boolean;
  // (undocumented)
  isValidFacetIndex(index: number): boolean;
  readonly normalCount: number;
  // (undocumented)
  numEdgeInFacet(facetIndex: number): number;
  readonly paramCount: number;
  readonly pointCount: number;
  // (undocumented)
  range(transform?: Transform, result?: Range3d): Range3d;
  // (undocumented)
  reverseIndices(): void;
  // (undocumented)
  reverseNormals(): void;
  setNewFaceData(endFacetIndex?: number): boolean;
  terminateFacet(validateAllIndices?: boolean): any;
  tryGetFaceData(i: number): FacetFaceData | undefined;
  tryTransformInPlace(transform: Transform): boolean;
  // (undocumented)
  readonly zeroTerminatedIndexCount: number;
}

// @public (undocumented)
class IndexedPolyfaceVisitor extends PolyfaceData, implements PolyfaceVisitor {
  // (undocumented)
  clientAuxIndex(i: number): number;
  // (undocumented)
  clientColorIndex(i: number): number;
  // (undocumented)
  clientNormalIndex(i: number): number;
  // (undocumented)
  clientParamIndex(i: number): number;
  // (undocumented)
  clientPointIndex(i: number): number;
  // (undocumented)
  static create(polyface: IndexedPolyface, numWrap: number): IndexedPolyfaceVisitor;
  // (undocumented)
  currentReadIndex(): number;
  // (undocumented)
  moveToNextFacet(): boolean;
  // (undocumented)
  moveToReadIndex(facetIndex: number): boolean;
  // (undocumented)
  readonly numEdgesThisFacet: number;
  // (undocumented)
  reset(): void;
  tryGetDistanceParameter(index: number, result?: Point2d): Point2d | undefined;
  tryGetNormalizedParameter(index: number, result?: Point2d): Point2d | undefined;
}

// @public
class IndexedXYCollection {
  // (undocumented)
  abstract crossProductIndexIndexIndex(origin: number, indexA: number, indexB: number): number | undefined;
  // (undocumented)
  abstract crossProductXAndYIndexIndex(origin: XAndY, indexA: number, indexB: number): number | undefined;
  // (undocumented)
  abstract getPoint2dAtCheckedPointIndex(index: number, result?: Point2d): Point2d | undefined;
  // (undocumented)
  abstract getVector2dAtCheckedVectorIndex(index: number, result?: Vector2d): Vector2d | undefined;
  readonly length: number;
  // (undocumented)
  abstract vectorIndexIndex(indexA: number, indexB: number, result?: Vector2d): Vector2d | undefined;
  // (undocumented)
  abstract vectorXAndYIndex(origin: XAndY, indexB: number, result?: Vector2d): Vector2d | undefined;
}

// @public
class IndexedXYZCollection {
  // (undocumented)
  abstract accumulateCrossProductIndexIndexIndex(origin: number, indexA: number, indexB: number, result: Vector3d): void;
  // (undocumented)
  abstract crossProductIndexIndexIndex(origin: number, indexA: number, indexB: number, result?: Vector3d): Vector3d | undefined;
  // (undocumented)
  abstract crossProductXYAndZIndexIndex(origin: XYAndZ, indexA: number, indexB: number, result?: Vector3d): Vector3d | undefined;
  // (undocumented)
  abstract getPoint3dAtCheckedPointIndex(index: number, result?: Point3d): Point3d | undefined;
  // (undocumented)
  abstract getVector3dAtCheckedVectorIndex(index: number, result?: Vector3d): Vector3d | undefined;
  readonly length: number;
  // (undocumented)
  abstract vectorIndexIndex(indexA: number, indexB: number, result?: Vector3d): Vector3d | undefined;
  // (undocumented)
  abstract vectorXYAndZIndex(origin: XYAndZ, indexB: number, result?: Vector3d): Vector3d | undefined;
}

// @public
enum InverseMatrixState {
  // (undocumented)
  inverseStored = 1,
  // (undocumented)
  singular = 2,
  // (undocumented)
  unknown = 0
}

// @public (undocumented)
interface IsNullCheck {
  // (undocumented)
  isNull(): boolean;
}

// @public
interface IStrokeHandler {
  announceBezierCurve?(bezier: BezierCurveBase, numStrokes: number, parent: CurvePrimitive, spandex: number, fraction0: number, fraction1: number): void;
  announceIntervalForUniformStepStrokes(cp: CurvePrimitive, numStrokes: number, fraction0: number, fraction1: number): void;
  // (undocumented)
  announcePointTangent(xyz: Point3d, fraction: number, tangent: Vector3d): void;
  announceSegmentInterval(cp: CurvePrimitive, point0: Point3d, point1: Point3d, numStrokes: number, fraction0: number, fraction1: number): void;
  // (undocumented)
  endCurvePrimitive(cp: CurvePrimitive): void;
  // (undocumented)
  endParentCurvePrimitive(cp: CurvePrimitive): void;
  // (undocumented)
  startCurvePrimitive(cp: CurvePrimitive): void;
  startParentCurvePrimitive(cp: CurvePrimitive): void;
}

// WARNING: knotTolerance has incomplete type information
// @public
class KnotVector {
  // (undocumented)
  baseKnotFractionToKnot(knotIndex0: number, localFraction: number): number;
  clone(): KnotVector;
  copyKnots(includeExtraEndKnot: boolean): number[];
  static create(knotArray: number[] | Float64Array, degree: number, skipFirstAndLast?: boolean): KnotVector;
  createBasisArray(): Float64Array;
  static createUniformClamped(numPoles: number, degree: number, a0: number, a1: number): KnotVector;
  static createUniformWrapped(numInterval: number, degree: number, a0: number, a1: number): KnotVector;
  // (undocumented)
  degree: number;
  evaluateBasisFunctions(knotIndex0: number, u: number, f: Float64Array): void;
  evaluateBasisFunctions1(knotIndex0: number, u: number, f: Float64Array, df: Float64Array, ddf?: Float64Array): void;
  // (undocumented)
  fractionToKnot(fraction: number): number;
  grevilleKnot(spanIndex: number): number;
  // (undocumented)
  isAlmostEqual(other: KnotVector): boolean;
  isIndexOfRealSpan(spanIndex: number): boolean;
  // (undocumented)
  readonly knotLength01: number;
  // (undocumented)
  knots: Float64Array;
  // (undocumented)
  knotToLeftKnotIndex(u: number): number;
  // (undocumented)
  readonly leftKnot: number;
  // (undocumented)
  readonly leftKnotIndex: number;
  // (undocumented)
  readonly numSpans: number;
  // (undocumented)
  reflectKnots(): void;
  // (undocumented)
  readonly rightKnot: number;
  // (undocumented)
  readonly rightKnotIndex: number;
  // (undocumented)
  setKnots(knots: number[] | Float64Array, skipFirstAndLast?: boolean): void;
  // (undocumented)
  spanFractionToFraction(spanIndex: number, localFraction: number): number;
  // (undocumented)
  spanFractionToKnot(spanIndex: number, localFraction: number): number;
  spanIndexToLeftKnotIndex(spanIndex: number): number;
  // (undocumented)
  spanIndexToSpanLength(spanIndex: number): number;
  // (undocumented)
  testClosable(mode?: BSplineWrapMode): boolean;
  wrappable: BSplineWrapMode;
}

// @public
class LinearSweep extends SolidPrimitive {
  // (undocumented)
  clone(): LinearSweep;
  // (undocumented)
  cloneSweepVector(): Vector3d;
  // (undocumented)
  cloneTransformed(transform: Transform): LinearSweep;
  // (undocumented)
  constantVSection(vFraction: number): CurveCollection | undefined;
  // (undocumented)
  static create(contour: CurveCollection, direction: Vector3d, capped: boolean): LinearSweep | undefined;
  static createZSweep(xyPoints: XAndY[], z: number, zSweep: number, capped: boolean): LinearSweep | undefined;
  // (undocumented)
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  // (undocumented)
  extendRange(range: Range3d, transform?: Transform): void;
  getConstructiveFrame(): Transform | undefined;
  // (undocumented)
  getCurvesRef(): CurveCollection;
  // (undocumented)
  getSweepContourRef(): SweepContour;
  // (undocumented)
  isAlmostEqual(other: GeometryQuery): boolean;
  readonly isClosedVolume: boolean;
  // (undocumented)
  isSameGeometryClass(other: any): boolean;
  // (undocumented)
  tryTransformInPlace(transform: Transform): boolean;
}

// @public
class LineSegment3d extends CurvePrimitive, implements BeJSONFunctions {
  announceClipIntervals(clipper: Clipper, announce?: AnnounceNumberNumberCurvePrimitive): boolean;
  // (undocumented)
  appendPlaneIntersectionPoints(plane: PlaneAltitudeEvaluator, result: CurveLocationDetail[]): number;
  clone(): LineSegment3d;
  clonePartialCurve(fractionA: number, fractionB: number): CurvePrimitive | undefined;
  cloneTransformed(transform: Transform): CurvePrimitive;
  // (undocumented)
  closestPoint(spacePoint: Point3d, extend: boolean, result?: CurveLocationDetail): CurveLocationDetail;
  computeStrokeCountForOptions(options?: StrokeOptions): number;
  static create(point0: Point3d, point1: Point3d, result?: LineSegment3d): LineSegment3d;
  static createXYXY(x0: number, y0: number, x1: number, y1: number, z?: number, result?: LineSegment3d): LineSegment3d;
  static createXYZXYZ(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, result?: LineSegment3d): LineSegment3d;
  // (undocumented)
  curveLength(): number;
  // (undocumented)
  curveLengthBetweenFractions(fraction0: number, fraction1: number): number;
  // (undocumented)
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  emitStrokableParts(handler: IStrokeHandler, options?: StrokeOptions): void;
  emitStrokes(dest: LineString3d, options?: StrokeOptions): void;
  // (undocumented)
  endPoint(result?: Point3d): Point3d;
  extendRange(range: Range3d, transform?: Transform): void;
  // (undocumented)
  fractionToPoint(fraction: number, result?: Point3d): Point3d;
  fractionToPointAnd2Derivatives(fraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  // (undocumented)
  fractionToPointAndDerivative(fraction: number, result?: Ray3d): Ray3d;
  // (undocumented)
  static fromJSON(json?: any): LineSegment3d;
  getFractionToDistanceScale(): number | undefined;
  // (undocumented)
  isAlmostEqual(other: GeometryQuery): boolean;
  readonly isExtensibleFractionSpace: boolean;
  // (undocumented)
  isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean;
  // (undocumented)
  isSameGeometryClass(other: GeometryQuery): boolean;
  // (undocumented)
  readonly point0Ref: Point3d;
  // (undocumented)
  readonly point1Ref: Point3d;
  // (undocumented)
  quickLength(): number;
  reverseInPlace(): void;
  set(point0: Point3d, point1: Point3d): void;
  setFrom(other: LineSegment3d): void;
  setFromJSON(json?: any): void;
  setRefs(point0: Point3d, point1: Point3d): void;
  // (undocumented)
  startPoint(result?: Point3d): Point3d;
  toJSON(): any;
  // (undocumented)
  tryTransformInPlace(transform: Transform): boolean;
}

// @public
class LineString3d extends CurvePrimitive, implements BeJSONFunctions {
  addClosurePoint(): void;
  addDerivative(vector: Vector3d): void;
  addFraction(fraction: number): void;
  // WARNING: The type "StrokeCountMap" needs to be exported by the package (e.g. added to index.ts)
  addMappedStrokesToLineString3D(map: StrokeCountMap, destLinestring: LineString3d): number;
  addPoint(point: Point3d): void;
  // (undocumented)
  addPoints(...points: any[]): void;
  addPointXYZ(x: number, y: number, z?: number): void;
  // (undocumented)
  addSteppedPoints(source: GrowableXYZArray, pointIndex0: number, step: number, numAdd: number): void;
  addSurfaceNormal(vector: Vector3d): void;
  addUVParam(uvParam: XAndY): void;
  addUVParamAsUV(u: number, v: number): void;
  announceClipIntervals(clipper: Clipper, announce?: AnnounceNumberNumberCurvePrimitive): boolean;
  appendFractionalStrokePoints(curve: CurvePrimitive, numStrokes: number, fraction0?: number, fraction1?: number, include01?: boolean): void;
  appendFractionToPoint(curve: CurvePrimitive, fraction: number): void;
  // (undocumented)
  appendInterpolatedStrokePoints(numStrokes: number, point0: Point3d, point1: Point3d, include01: boolean): void;
  appendPlaneIntersectionPoints(plane: PlaneAltitudeEvaluator, result: CurveLocationDetail[]): number;
  appendStrokePoint(point: Point3d, fraction?: number): void;
  clear(): void;
  // (undocumented)
  clone(): LineString3d;
  clonePartialCurve(fractionA: number, fractionB: number): CurvePrimitive | undefined;
  // (undocumented)
  cloneTransformed(transform: Transform): CurvePrimitive;
  // (undocumented)
  closestPoint(spacePoint: Point3d, extend: boolean, result?: CurveLocationDetail): CurveLocationDetail;
  // WARNING: The type "StrokeCountMap" needs to be exported by the package (e.g. added to index.ts)
  computeAndAttachRecursiveStrokeCounts(options?: StrokeOptions, parentStrokeMap?: StrokeCountMap): void;
  computeStrokeCountForOptions(options?: StrokeOptions): number;
  computeUVFromXYZTransform(transform: Transform): void;
  // (undocumented)
  static create(...points: any[]): LineString3d;
  static createFloat64Array(xyzData: Float64Array): LineString3d;
  static createForStrokes(capacity: number | undefined, options: StrokeOptions | undefined): LineString3d;
  // (undocumented)
  static createPoints(points: Point3d[]): LineString3d;
  // (undocumented)
  static createRectangleXY(point0: Point3d, ax: number, ay: number, closed?: boolean): LineString3d;
  static createRegularPolygonXY(center: Point3d, edgeCount: number, radius: number, radiusToVertices?: boolean): LineString3d;
  // (undocumented)
  static createXY(points: XAndY[], z: number, enforceClosure?: boolean): LineString3d;
  // (undocumented)
  curveLength(): number;
  // (undocumented)
  curveLengthBetweenFractions(fraction0: number, fraction1: number): number;
  derivativeAt(i: number, result?: Vector3d): Vector3d | undefined;
  // (undocumented)
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  emitStrokableParts(handler: IStrokeHandler, options?: StrokeOptions): void;
  emitStrokes(dest: LineString3d, options?: StrokeOptions): void;
  // (undocumented)
  endPoint(): Point3d;
  ensureEmptyNormalIndices(): GrowableFloat64Array;
  ensureEmptyPointIndices(): GrowableFloat64Array;
  ensureEmptySurfaceNormals(): GrowableXYZArray;
  ensureEmptyUVIndices(): GrowableFloat64Array;
  ensureEmptyUVParams(): GrowableXYArray;
  // (undocumented)
  extendRange(rangeToExtend: Range3d, transform?: Transform): void;
  readonly fractions: GrowableFloat64Array | undefined;
  fractionToFrenetFrame(fraction: number, result?: Transform): Transform;
  // (undocumented)
  fractionToPoint(fraction: number, result?: Point3d): Point3d;
  fractionToPointAnd2Derivatives(fraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  // (undocumented)
  fractionToPointAndDerivative(fraction: number, result?: Ray3d): Ray3d;
  // (undocumented)
  static fromJSON(json?: any): LineString3d;
  getIndexedSegment(index: number): LineSegment3d | undefined;
  initializeDerivativeArray(retainArrayContentsIfAlreadyPresent?: boolean): void;
  initializeFractionArray(retainArrayContentsIfAlreadyPresent?: boolean): void;
  initializeUVParamsArray(retainArrayContentsIfAlreadyPresent?: boolean): void;
  // (undocumented)
  isAlmostEqual(other: GeometryQuery): boolean;
  readonly isExtensibleFractionSpace: boolean;
  // (undocumented)
  isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean;
  // (undocumented)
  readonly isPhysicallyClosed: boolean;
  // (undocumented)
  isSameGeometryClass(other: GeometryQuery): boolean;
  moveSignedDistanceFromFraction(startFraction: number, signedDistance: number, allowExtension: false, result?: CurveLocationDetail): CurveLocationDetail;
  // (undocumented)
  readonly normalIndices: GrowableFloat64Array | undefined;
  // (undocumented)
  numPoints(): number;
  // (undocumented)
  readonly packedDerivatives: GrowableXYZArray | undefined;
  readonly packedPoints: GrowableXYZArray;
  // (undocumented)
  readonly packedSurfaceNormals: GrowableXYZArray | undefined;
  // (undocumented)
  readonly packedUVParams: GrowableXYArray | undefined;
  // (undocumented)
  readonly paramIndices: GrowableFloat64Array | undefined;
  pointAt(i: number, result?: Point3d): Point3d | undefined;
  // (undocumented)
  readonly pointIndices: GrowableFloat64Array | undefined;
  readonly points: Point3d[];
  popPoint(): void;
  // (undocumented)
  quickLength(): number;
  quickUnitNormal(result?: Vector3d): Vector3d | undefined;
  // (undocumented)
  reverseInPlace(): void;
  segmentIndexAndLocalFractionToGlobalFraction(index: number, localFraction: number): number;
  // (undocumented)
  setFrom(other: LineString3d): void;
  // (undocumented)
  setFromJSON(json?: any): void;
  // (undocumented)
  startPoint(): Point3d;
  surfaceNormalAt(i: number, result?: Vector3d): Vector3d | undefined;
  toJSON(): any;
  // (undocumented)
  tryTransformInPlace(transform: Transform): boolean;
  vectorBetween(i: number, j: number, result?: Vector3d): Vector3d | undefined;
}

// @public
class Loop extends CurveChain {
  constructor();
  // (undocumented)
  announceToCurveProcessor(processor: RecursiveCurveProcessor, indexInParent?: number): void;
  // (undocumented)
  cloneEmptyPeer(): Loop;
  // (undocumented)
  cloneStroked(options?: StrokeOptions): AnyCurve;
  static create(...curves: CurvePrimitive[]): Loop;
  static createArray(curves: CurvePrimitive[]): Loop;
  // (undocumented)
  static createPolygon(points: Point3d[]): Loop;
  // (undocumented)
  cyclicCurvePrimitive(index: number): CurvePrimitive | undefined;
  // (undocumented)
  dgnBoundaryType(): number;
  // (undocumented)
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  // (undocumented)
  isInner: boolean;
  // (undocumented)
  isSameGeometryClass(other: GeometryQuery): boolean;
}

// @public
class Map4d implements BeJSONFunctions {
  // (undocumented)
  clone(): Map4d;
  static createBoxMap(lowA: Point3d, highA: Point3d, lowB: Point3d, highB: Point3d, result?: Map4d): Map4d | undefined;
  static createIdentity(): Map4d;
  static createRefs(matrix0: Matrix4d, matrix1: Matrix4d): Map4d;
  static createTransform(transform0: Transform, transform1?: Transform): Map4d | undefined;
  static createVectorFrustum(origin: Point3d, uVector: Vector3d, vVector: Vector3d, wVector: Vector3d, fraction: number): Map4d | undefined;
  static fromJSON(json?: any): Map4d;
  // (undocumented)
  isAlmostEqual(other: Map4d): boolean;
  // (undocumented)
  multiplyMapMap(other: Map4d): Map4d;
  // (undocumented)
  reverseInPlace(): void;
  sandwich0This1(other: Map4d): Map4d;
  sandwich1This0(other: Map4d): Map4d;
  setFrom(other: Map4d): void;
  setFromJSON(json: any): void;
  setIdentity(): void;
  // (undocumented)
  toJSON(): any;
  // (undocumented)
  readonly transform0: Matrix4d;
  // (undocumented)
  readonly transform1: Matrix4d;
}

// @public
class Matrix3d implements BeJSONFunctions {
  constructor(coffs?: Float64Array);
  addScaledInPlace(other: Matrix3d, scale: number): void;
  applyGivensColumnOp(i: number, j: number, c: number, s: number): void;
  at(row: number, column: number): number;
  axisOrderCrossProductsInPlace(axisOrder: AxisOrder): void;
  // (undocumented)
  clone(result?: Matrix3d): Matrix3d;
  // (undocumented)
  coffs: Float64Array;
  // (undocumented)
  columnX(result?: Vector3d): Vector3d;
  // (undocumented)
  columnXDotColumnY(): number;
  // (undocumented)
  columnXMagnitude(): number;
  // (undocumented)
  columnXMagnitudeSquared(): number;
  // (undocumented)
  columnXYCrossProductMagnitude(): number;
  // (undocumented)
  columnY(result?: Vector3d): Vector3d;
  // (undocumented)
  columnYMagnitude(): number;
  // (undocumented)
  columnYMagnitudeSquared(): number;
  // (undocumented)
  columnZ(result?: Vector3d): Vector3d;
  // (undocumented)
  columnZCrossVector(vector: XYZ, result?: Vector3d): Vector3d;
  // (undocumented)
  columnZMagnitude(): number;
  // (undocumented)
  columnZMagnitudeSquared(): number;
  computeCachedInverse(useCacheIfAvailable: boolean): boolean;
  conditionNumber(): number;
  static create90DegreeRotationAroundAxis(axisIndex: number): Matrix3d;
  static createCapture(coffs: Float64Array, inverseCoffs?: Float64Array): Matrix3d;
  static createColumns(vectorU: Vector3d, vectorV: Vector3d, vectorW: Vector3d, result?: Matrix3d): Matrix3d;
  // (undocumented)
  static createColumnsInAxisOrder(axisOrder: AxisOrder, columnA: Vector3d, columnB: Vector3d, columnC: Vector3d | undefined, result?: Matrix3d): Matrix3d;
  static createColumnsXYW(vectorU: XAndY, uz: number, vectorV: XAndY, vz: number, vectorW: XAndY, wz: number, result?: Matrix3d): Matrix3d;
  static createDirectionalScale(direction: Vector3d, scale: number, result?: Matrix3d): Matrix3d;
  // (undocumented)
  static createFromQuaternion(quat: Point4d): Matrix3d;
  // (undocumented)
  static createIdentity(result?: Matrix3d): Matrix3d;
  static createPartialRotationVectorToVector(vectorA: Vector3d, fraction: number, vectorB: Vector3d, result?: Matrix3d): Matrix3d | undefined;
  static createPerpendicularVectorFavorPlaneContainingZ(vector: Vector3d, result?: Vector3d): Vector3d;
  static createPerpendicularVectorFavorXYPlane(vector: Vector3d, result?: Vector3d): Vector3d;
  static createRigidFromColumns(vectorA: Vector3d, vectorB: Vector3d, axisOrder: AxisOrder, result?: Matrix3d): Matrix3d | undefined;
  static createRigidFromMatrix3d(source: Matrix3d, axisOrder?: AxisOrder, result?: Matrix3d): Matrix3d | undefined;
  static createRigidHeadsUp(vectorA: Vector3d, axisOrder?: AxisOrder, result?: Matrix3d): Matrix3d;
  static createRigidViewAxesZTowardsEye(x: number, y: number, z: number, result?: Matrix3d): Matrix3d;
  // (undocumented)
  static createRotationAroundAxisIndex(axisIndex: AxisIndex, angle: Angle, result?: Matrix3d): Matrix3d;
  // (undocumented)
  static createRotationAroundVector(axis: Vector3d, angle: Angle, result?: Matrix3d): Matrix3d | undefined;
  // (undocumented)
  static createRotationVectorToVector(vectorA: Vector3d, vectorB: Vector3d, result?: Matrix3d): Matrix3d | undefined;
  static createRows(vectorU: Vector3d, vectorV: Vector3d, vectorW: Vector3d, result?: Matrix3d): Matrix3d;
  // (undocumented)
  static createRowValues(axx: number, axy: number, axz: number, ayx: number, ayy: number, ayz: number, azx: number, azy: number, azz: number, result?: Matrix3d): Matrix3d;
  static createScale(scaleFactorX: number, scaleFactorY: number, scaleFactorZ: number, result?: Matrix3d): Matrix3d;
  static createShuffledColumns(vectorU: Vector3d, vectorV: Vector3d, vectorW: Vector3d, axisOrder: AxisOrder, result?: Matrix3d): Matrix3d;
  static createStandardWorldToView(index: StandardViewIndex, invert?: boolean, result?: Matrix3d): Matrix3d;
  static createUniformScale(scaleFactor: number): Matrix3d;
  static createViewedAxes(rightVector: Vector3d, upVector: Vector3d, leftNoneRight?: number, topNoneBottom?: number): Matrix3d | undefined;
  // (undocumented)
  static createZero(): Matrix3d;
  determinant(): number;
  // (undocumented)
  dotColumnX(vector: XYZ): number;
  // (undocumented)
  dotColumnY(vector: XYZ): number;
  // (undocumented)
  dotColumnZ(vector: XYZ): number;
  // (undocumented)
  dotRowX(vector: XYZ): number;
  // (undocumented)
  dotRowXXYZ(x: number, y: number, z: number): number;
  // (undocumented)
  dotRowY(vector: XYZ): number;
  // (undocumented)
  dotRowYXYZ(x: number, y: number, z: number): number;
  // (undocumented)
  dotRowZ(vector: XYZ): number;
  // (undocumented)
  dotRowZXYZ(x: number, y: number, z: number): number;
  factorPerpendicularColumns(matrixC: Matrix3d, matrixU: Matrix3d): boolean;
  factorRigidWithSignedScale(): {
          rigidAxes: Matrix3d;
          scale: number;
      } | undefined;
  fastSymmetricEigenvalues(leftEigenvectors: Matrix3d, lambda: Vector3d): boolean;
  // (undocumented)
  static flatIndexOf(row: number, column: number): number;
  freeze(): void;
  // (undocumented)
  static fromJSON(json?: Matrix3dProps): Matrix3d;
  getAxisAndAngleOfRotation: {
    angle: Angle;
    axis: Vector3d;
    ok: boolean;
  }
  getColumn(columnIndex: number, result?: Vector3d): Vector3d;
  getRow(columnIndex: number, result?: Vector3d): Vector3d;
  static readonly identity: Matrix3d;
  indexedColumnWithWeight(index: number, weight: number, result?: Point4d): Point4d;
  inverse(result?: Matrix3d): Matrix3d | undefined;
  // (undocumented)
  inverseCoffs: Float64Array | undefined;
  // (undocumented)
  inverseState: InverseMatrixState;
  isAlmostEqual(other: Matrix3d, tol?: number): boolean;
  readonly isDiagonal: boolean;
  isExactEqual(other: Matrix3d): boolean;
  readonly isIdentity: boolean;
  isRigid(allowMirror?: boolean): boolean;
  readonly isSignedPermutation: boolean;
  // (undocumented)
  isSingular(): boolean;
  readonly isUpperTriangular: boolean;
  readonly isXY: boolean;
  maxAbs(): number;
  maxDiff(other: Matrix3d): number;
  multiplyInverse(vector: Vector3d, result?: Vector3d): Vector3d | undefined;
  multiplyInverseTranspose(vector: Vector3d, result?: Vector3d): Vector3d | undefined;
  multiplyInverseXYZAsPoint3d(x: number, y: number, z: number, result?: Point3d): Point3d | undefined;
  multiplyInverseXYZAsVector3d(x: number, y: number, z: number, result?: Vector3d): Vector3d | undefined;
  multiplyMatrixMatrix(other: Matrix3d, result?: Matrix3d): Matrix3d;
  multiplyMatrixMatrixInverse(other: Matrix3d, result?: Matrix3d): Matrix3d | undefined;
  multiplyMatrixMatrixTranspose(other: Matrix3d, result?: Matrix3d): Matrix3d;
  multiplyMatrixTransform(other: Transform, result?: Transform): Transform;
  multiplyMatrixTransposeMatrix(other: Matrix3d, result?: Matrix3d): Matrix3d;
  // (undocumented)
  multiplyTransposeVector(vector: Vector3d, result?: Vector3d): Vector3d;
  multiplyTransposeVectorInPlace(xyzData: XYZ): void;
  multiplyTransposeXYZ(x: number, y: number, z: number, result?: Vector3d): Vector3d;
  multiplyVector(vector: Vector3d, result?: Vector3d): Vector3d;
  multiplyVectorArrayInPlace(data: XYZ[]): void;
  multiplyVectorInPlace(xyzData: XYZ): void;
  multiplyXY(x: number, y: number, result?: Vector3d): Vector3d;
  multiplyXYZ(x: number, y: number, z: number, result?: Vector3d): Vector3d;
  multiplyXYZtoXYZ(xyz: XYZ, result: XYZ): XYZ;
  normalizeColumnsInPlace(originalMagnitudes?: Vector3d): boolean;
  normalizeRowsInPlace(originalMagnitudes?: Vector3d): boolean;
  // (undocumented)
  static numComputeCache: number;
  // (undocumented)
  static numUseCache: number;
  // (undocumented)
  originPlusMatrixTimesXY(origin: XYZ, x: number, y: number, result?: Point3d): Point3d;
  rowX(result?: Vector3d): Vector3d;
  // (undocumented)
  rowXMagnitude(): number;
  rowY(result?: Vector3d): Vector3d;
  // (undocumented)
  rowYMagnitude(): number;
  rowZ(result?: Vector3d): Vector3d;
  // (undocumented)
  rowZMagnitude(): number;
  sameDiagonalScale(): number | undefined;
  scale(scale: number, result?: Matrix3d): Matrix3d;
  scaleColumns(scaleX: number, scaleY: number, scaleZ: number, result?: Matrix3d): Matrix3d;
  scaleColumnsInPlace(scaleX: number, scaleY: number, scaleZ: number): void;
  scaleRows(scaleX: number, scaleY: number, scaleZ: number, result?: Matrix3d): Matrix3d;
  setAt(row: number, column: number, value: number): void;
  setColumn(columnIndex: number, value: Vector3d | undefined): void;
  setColumns(vectorX: Vector3d | undefined, vectorY: Vector3d | undefined, vectorZ?: Vector3d | undefined): void;
  setColumnsPoint4dXYZ(vectorU: Point4d, vectorV: Point4d, vectorW: Point4d): void;
  // (undocumented)
  setFrom(other: Matrix3d): void;
  // (undocumented)
  setFromJSON(json?: Matrix3dProps): void;
  // (undocumented)
  setIdentity(): void;
  // (undocumented)
  setRow(columnIndex: number, value: Vector3d): void;
  setRowValues(axx: number, axy: number, axz: number, ayx: number, ayy: number, ayz: number, azx: number, azy: number, azz: number): void;
  // (undocumented)
  setZero(): void;
  sumDiagonal(): number;
  sumDiagonalSquares(): number;
  sumSkewSquares(): number;
  sumSquares(): number;
  symmetricEigenvalues(leftEigenvectors: Matrix3d, lambda: Vector3d): boolean;
  testPerpendicularUnitRowsAndColumns(): boolean;
  toJSON(): Matrix3dProps;
  // (undocumented)
  toQuaternion(): Point4d;
  transpose(result?: Matrix3d): Matrix3d;
  transposeInPlace(): void;
  // (undocumented)
  static useCachedInverse: boolean;
  // (undocumented)
  static xyPlusMatrixTimesXY(origin: XAndY, matrix: Matrix3d, vector: XAndY, result?: Point2d): Point2d;
  // (undocumented)
  static xyzMinusMatrixTimesXYZ(origin: XYZ, matrix: Matrix3d, vector: XYZ, result?: Point3d): Point3d;
  // (undocumented)
  static xyzPlusMatrixTimesCoordinates(origin: XYZ, matrix: Matrix3d, x: number, y: number, z: number, result?: Point3d): Point3d;
  static xyzPlusMatrixTimesCoordinatesToFloat64Array(origin: XYZ, matrix: Matrix3d, x: number, y: number, z: number, result?: Float64Array): Float64Array;
  static xyzPlusMatrixTimesWeightedCoordinates(origin: XYZ, matrix: Matrix3d, x: number, y: number, z: number, w: number, result?: Point4d): Point4d;
  static xyzPlusMatrixTimesWeightedCoordinatesToFloat64Array(origin: XYZ, matrix: Matrix3d, x: number, y: number, z: number, w: number, result?: Float64Array): Float64Array;
  // (undocumented)
  static xyzPlusMatrixTimesXYZ(origin: XYZ, matrix: Matrix3d, vector: XYAndZ, result?: Point3d): Point3d;
}

// @public
class Matrix4d implements BeJSONFunctions {
  addMomentsInPlace(x: number, y: number, z: number, w: number): void;
  addScaledInPlace(other: Matrix4d, scale?: number): void;
  readonly asTransform: Transform | undefined;
  // (undocumented)
  atIJ(rowIndex: number, columnIndex: number): number;
  // (undocumented)
  clone(): Matrix4d;
  cloneTransposed(result?: Matrix4d): Matrix4d;
  // (undocumented)
  columnDotColumn(columnIndexThis: number, other: Matrix4d, columnIndexOther: number): number;
  // (undocumented)
  columnDotRow(columnIndexThis: number, other: Matrix4d, rowIndexOther: number): number;
  // (undocumented)
  columnW(): Point4d;
  // (undocumented)
  columnX(): Point4d;
  // (undocumented)
  columnY(): Point4d;
  // (undocumented)
  columnZ(): Point4d;
  static createBoxToBox(lowA: Point3d, highA: Point3d, lowB: Point3d, highB: Point3d, result?: Matrix4d): Matrix4d | undefined;
  static createIdentity(result?: Matrix4d): Matrix4d;
  createInverse(): Matrix4d | undefined;
  static createRowValues(cxx: number, cxy: number, cxz: number, cxw: number, cyx: number, cyy: number, cyz: number, cyw: number, czx: number, czy: number, czz: number, czw: number, cwx: number, cwy: number, cwz: number, cww: number, result?: Matrix4d): Matrix4d;
  static createTransform(source: Transform, result?: Matrix4d): Matrix4d;
  static createTranslationAndScaleXYZ(tx: number, ty: number, tz: number, scaleX: number, scaleY: number, scaleZ: number, result?: Matrix4d): Matrix4d;
  static createTranslationXYZ(x: number, y: number, z: number, result?: Matrix4d): Matrix4d;
  static createZero(result?: Matrix4d): Matrix4d;
  diagonal(): Point4d;
  // (undocumented)
  static fromJSON(json?: Matrix4dProps): Matrix4d;
  getSteppedPoint(i0: number, step: number, result?: Point4d): Point4d;
  // (undocumented)
  readonly hasPerspective: boolean;
  // (undocumented)
  isAlmostEqual(other: Matrix4d): boolean;
  isIdentity(tol?: number): boolean;
  matrixPart(): Matrix3d;
  maxAbs(): number;
  maxDiff(other: Matrix4d): number;
  multiplyBlockedFloat64ArrayInPlace(data: Float64Array): void;
  multiplyMatrixMatrix(other: Matrix4d, result?: Matrix4d): Matrix4d;
  multiplyMatrixMatrixTranspose(other: Matrix4d, result?: Matrix4d): Matrix4d;
  multiplyMatrixTransposeMatrix(other: Matrix4d, result?: Matrix4d): Matrix4d;
  multiplyPoint3d(pt: XYAndZ, w: number, result?: Point4d): Point4d;
  multiplyPoint3dArray(pts: XYAndZ[], results: Point4d[], w?: number): void;
  multiplyPoint3dArrayQuietNormalize(points: Point3d[]): void;
  multiplyPoint3dQuietNormalize(point: XYAndZ, result?: Point3d): Point3d;
  multiplyPoint4d(point: Point4d, result?: Point4d): Point4d;
  multiplyPoint4dArrayQuietRenormalize(pts: Point4d[], results: Point3d[]): void;
  multiplyTransposePoint4d(point: Point4d, result?: Point4d): Point4d;
  multiplyTransposeXYZW(x: number, y: number, z: number, w: number, result?: Point4d): Point4d;
  multiplyXYZW(x: number, y: number, z: number, w: number, result?: Point4d): Point4d;
  multiplyXYZWQuietRenormalize(x: number, y: number, z: number, w: number, result?: Point3d): Point3d;
  // (undocumented)
  rowArrays(f?: (value: number) => any): any;
  // (undocumented)
  rowDotColumn(rowIndex: number, other: Matrix4d, columnIndex: number): number;
  // (undocumented)
  rowDotRow(rowIndexThis: number, other: Matrix4d, rowIndexOther: number): number;
  rowOperation(rowIndexA: number, rowIndexB: number, firstColumnIndex: number, scale: number): void;
  // (undocumented)
  rowW(): Point4d;
  // (undocumented)
  rowX(): Point4d;
  // (undocumented)
  rowY(): Point4d;
  // (undocumented)
  rowZ(): Point4d;
  scaleRowsInPlace(ax: number, ay: number, az: number, aw: number): void;
  // (undocumented)
  setFrom(other: Matrix4d): void;
  // (undocumented)
  setFromJSON(json?: Matrix4dProps): void;
  setIdentity(): void;
  setOriginAndVectors(origin: XYZ, vectorX: Vector3d, vectorY: Vector3d, vectorZ: Vector3d): void;
  setZero(): void;
  toJSON(): Matrix4dProps;
  weight(): number;
}

// @public
class MomentData {
  // (undocumented)
  accumulatePointMomentsFromOrigin(points: Point3d[]): void;
  // (undocumented)
  clearSums(origin?: Point3d): void;
  static inertiaProductsToPrincipalAxes(origin: XYZ, inertiaProducts: Matrix4d): MomentData | undefined;
  localToWorldMap: Transform;
  // (undocumented)
  static momentTensorFromInertiaProducts(products: Matrix3d): Matrix3d;
  // (undocumented)
  origin: Point3d;
  // (undocumented)
  static pointsToPrincipalAxes(points: Point3d[]): MomentData;
  radiusOfGyration: Vector3d;
  // (undocumented)
  shiftSumsToCentroid(): boolean;
  // (undocumented)
  static sortColumnsForIncreasingMoments(axes: Matrix3d, moments: Vector3d): void;
  // (undocumented)
  sums: Matrix4d;
}

// @public (undocumented)
class Newton1dUnbounded extends AbstractNewtonIterator {
  constructor(func: NewtonEvaluatorRtoRD);
  // (undocumented)
  applyCurrentStep(): boolean;
  computeStep(): boolean;
  // (undocumented)
  currentStepSize(): number;
  // (undocumented)
  getX(): number;
  // (undocumented)
  setTarget(y: number): void;
  // (undocumented)
  setX(x: number): boolean;
}

// @public
class Newton1dUnboundedApproximateDerivative extends AbstractNewtonIterator {
  constructor(func: NewtonEvaluatorRtoR);
  // (undocumented)
  applyCurrentStep(): boolean;
  computeStep(): boolean;
  // (undocumented)
  currentStepSize(): number;
  // (undocumented)
  derivativeH: number;
  // (undocumented)
  getX(): number;
  // (undocumented)
  setX(x: number): boolean;
}

// @public
class Newton2dUnboundedWithDerivative extends AbstractNewtonIterator {
  constructor(func: NewtonEvaluatorRRtoRRD);
  // (undocumented)
  applyCurrentStep(): boolean;
  computeStep(): boolean;
  // (undocumented)
  currentStepSize(): number;
  // (undocumented)
  getU(): number;
  // (undocumented)
  getV(): number;
  // (undocumented)
  setUV(x: number, y: number): boolean;
}

// @public
class NewtonEvaluatorRRtoRRD {
  constructor();
  currentF: Plane3dByOriginAndVectors;
  abstract evaluate(x: number, y: number): boolean;
}

// @public
class NewtonEvaluatorRtoR {
  // (undocumented)
  currentF: number;
  // (undocumented)
  abstract evaluate(x: number): boolean;
}

// @public
class NewtonEvaluatorRtoRD {
  // (undocumented)
  currentdFdX: number;
  // (undocumented)
  currentF: number;
  // (undocumented)
  abstract evaluate(x: number): boolean;
}

// @public
class NullGeometryHandler extends GeometryHandler {
  // (undocumented)
  handleArc3d(_g: Arc3d): any;
  // (undocumented)
  handleBagOfCurves(_g: BagOfCurves): any;
  // (undocumented)
  handleBezierCurve3d(_g: BezierCurve3d): any;
  // (undocumented)
  handleBezierCurve3dH(_g: BezierCurve3dH): any;
  // (undocumented)
  handleBox(_g: Box): any;
  // (undocumented)
  handleBSplineCurve3d(_g: BSplineCurve3d): any;
  // (undocumented)
  handleBSplineCurve3dH(_g: BSplineCurve3dH): any;
  // (undocumented)
  handleBSplineSurface3d(_g: BSplineSurface3d): any;
  // (undocumented)
  handleBSplineSurface3dH(_g: BSplineSurface3dH): any;
  // (undocumented)
  handleCone(_g: Cone): any;
  // (undocumented)
  handleCoordinateXYZ(_g: CoordinateXYZ): any;
  // (undocumented)
  handleCurveCollection(_g: CurveCollection): any;
  // (undocumented)
  handleIndexedPolyface(_g: IndexedPolyface): any;
  // (undocumented)
  handleLinearSweep(_g: LinearSweep): any;
  // (undocumented)
  handleLineSegment3d(_g: LineSegment3d): any;
  // (undocumented)
  handleLineString3d(_g: LineString3d): any;
  // (undocumented)
  handleLoop(_g: Loop): any;
  // (undocumented)
  handleParityRegion(_g: ParityRegion): any;
  // (undocumented)
  handlePath(_g: Path): any;
  // (undocumented)
  handlePointString3d(_g: PointString3d): any;
  // (undocumented)
  handleRotationalSweep(_g: RotationalSweep): any;
  // (undocumented)
  handleRuledSweep(_g: RuledSweep): any;
  // (undocumented)
  handleSphere(_g: Sphere): any;
  // (undocumented)
  handleTorusPipe(_g: TorusPipe): any;
  // (undocumented)
  handleTransitionSpiral(_g: TransitionSpiral3d): any;
  // (undocumented)
  handleUnionRegion(_g: UnionRegion): any;
}

// @public (undocumented)
class NumberArray {
  static isAlmostEqual(dataA: number[] | Float64Array | undefined, dataB: number[] | Float64Array | undefined, tolerance: number): boolean;
  // (undocumented)
  static isCoordinateInArray(x: number, data: number[] | undefined): boolean;
  static isExactEqual(dataA: any[] | Float64Array | undefined, dataB: any[] | Float64Array | undefined): boolean;
  // (undocumented)
  static maxAbsArray(values: number[]): number;
  // (undocumented)
  static maxAbsDiff(dataA: number[], dataB: number[]): number;
  // (undocumented)
  static maxAbsDiffFloat64(dataA: Float64Array, dataB: Float64Array): number;
  // (undocumented)
  static maxAbsTwo(a1: number, a2: number): number;
  static preciseSum(data: number[]): number;
  static sum(data: number[] | Float64Array): number;
}

// @public
class Order2Bezier extends BezierCoffs {
  constructor(f0?: number, f1?: number);
  basisFunctions(u: number, result?: Float64Array): Float64Array;
  clone(): Order2Bezier;
  evaluate(u: number): number;
  roots(targetValue: number, restrictTo01: boolean): number[] | undefined;
  // (undocumented)
  solve(rightHandSide: number): number | undefined;
  static solveCoffs(a0: number, a1: number): number | undefined;
  sumBasisFunctionDerivatives(_u: number, polygon: Float64Array, n: number, result?: Float64Array): Float64Array;
  sumBasisFunctions(u: number, polygon: Float64Array, n: number, result?: Float64Array): Float64Array;
}

// @public
class Order3Bezier extends BezierCoffs {
  constructor(f0?: number, f1?: number, f2?: number);
  addSquareLinear(f0: number, f1: number, a: number): void;
  basisFunctions(u: number, result?: Float64Array): Float64Array;
  // (undocumented)
  clone(): Order3Bezier;
  evaluate(u: number): number;
  // (undocumented)
  roots(targetValue: number, restrictTo01: boolean): number[] | undefined;
  sumBasisFunctionDerivatives(u: number, polygon: Float64Array, n: number, result?: Float64Array): Float64Array;
  sumBasisFunctions(u: number, polygon: Float64Array, n: number, result?: Float64Array): Float64Array;
}

// @public
class Order4Bezier extends BezierCoffs {
  constructor(f0?: number, f1?: number, f2?: number, f3?: number);
  basisFunctions(u: number, result?: Float64Array): Float64Array;
  // (undocumented)
  clone(): Order4Bezier;
  static createFromDegree3PowerPolynomial(source: Degree3PowerPolynomial): Order4Bezier;
  // (undocumented)
  static createProductOrder3Order2(factorA: Order3Bezier, factorB: Order2Bezier): Order4Bezier;
  evaluate(u: number): number;
  // (undocumented)
  realRoots(e: number, restrictTo01: boolean, roots: GrowableFloat64Array): undefined;
  sumBasisFunctionDerivatives(u: number, polygon: Float64Array, n: number, result?: Float64Array): Float64Array;
  sumBasisFunctions(u: number, polygon: Float64Array, n: number, result?: Float64Array): Float64Array;
}

// @public
class Order5Bezier extends BezierCoffs {
  constructor(f0?: number, f1?: number, f2?: number, f3?: number, f4?: number);
  // (undocumented)
  addConstant(a: number): void;
  // (undocumented)
  addProduct(f: Order3Bezier, g: Order3Bezier, a: number): void;
  basisFunctions(u: number, result?: Float64Array): Float64Array;
  // (undocumented)
  clone(): Order5Bezier;
  static createFromDegree4PowerPolynomial(source: Degree4PowerPolynomial): Order5Bezier;
  evaluate(u: number): number;
  // (undocumented)
  realRoots(e: number, restrictTo01: boolean, roots: GrowableFloat64Array): void;
  sumBasisFunctionDerivatives(u: number, polygon: Float64Array, n: number, result?: Float64Array): Float64Array;
  sumBasisFunctions(u: number, polygon: Float64Array, n: number, result?: Float64Array): Float64Array;
}

// @public
class OrderedRotationAngles {
  static createAngles(xRotation: Angle, yRotation: Angle, zRotation: Angle, order: AxisOrder, result?: OrderedRotationAngles): OrderedRotationAngles;
  static createDegrees(xDegrees: number, yDegrees: number, zDegrees: number, order: AxisOrder, result?: OrderedRotationAngles): OrderedRotationAngles;
  static createFromMatrix3d(matrix: Matrix3d, order: AxisOrder, result?: OrderedRotationAngles): OrderedRotationAngles;
  static createRadians(xRadians: number, yRadians: number, zRadians: number, order: AxisOrder, result?: OrderedRotationAngles): OrderedRotationAngles;
  // (undocumented)
  readonly order: AxisOrder;
  toMatrix3d(result?: Matrix3d): Matrix3d;
  // (undocumented)
  static treatVectorsAsColumns: boolean;
  // (undocumented)
  readonly xAngle: Angle;
  // (undocumented)
  readonly xDegrees: number;
  // (undocumented)
  readonly xRadians: number;
  // (undocumented)
  readonly yAngle: Angle;
  // (undocumented)
  readonly yDegrees: number;
  // (undocumented)
  readonly yRadians: number;
  // (undocumented)
  readonly zAngle: Angle;
  // (undocumented)
  readonly zDegrees: number;
  // (undocumented)
  readonly zRadians: number;
}

// @public
interface PackedPointGrid {
  numCartesianDimensions: number;
  points: number[][][];
  weightStyle?: WeightStyle;
}

// @public
class PackedPointsWithIndex {
  constructor(numOldIndexEntry: number);
  // (undocumented)
  growablePackedPoints: GrowableXYZArray | undefined;
  // (undocumented)
  static invalidIndex: number;
  // (undocumented)
  oldToNew: Uint32Array;
  // (undocumented)
  packedPoints: Point3d[];
  updateIndices(indices: number[]): boolean;
}

// @public
class ParityRegion extends CurveCollection {
  constructor();
  // (undocumented)
  protected _children: Loop[];
  // (undocumented)
  announceToCurveProcessor(processor: RecursiveCurveProcessor, indexInParent?: number): void;
  // (undocumented)
  readonly children: Loop[];
  // (undocumented)
  clone(): ParityRegion;
  // (undocumented)
  cloneEmptyPeer(): ParityRegion;
  // (undocumented)
  cloneStroked(options?: StrokeOptions): ParityRegion;
  // (undocumented)
  static create(...data: Loop[]): ParityRegion;
  // (undocumented)
  dgnBoundaryType(): number;
  // (undocumented)
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  // (undocumented)
  getChild(i: number): Loop | undefined;
  // (undocumented)
  isSameGeometryClass(other: GeometryQuery): boolean;
  // (undocumented)
  tryAddChild(child: AnyCurve): boolean;
}

// @public
class PascalCoefficients {
  static getBezierBasisDerivatives(order: number, u: number, result?: Float64Array): Float64Array;
  static getBezierBasisValues(order: number, u: number, result?: Float64Array): Float64Array;
  static getRow(row: number): Float64Array;
}

// @public
class Path extends CurveChain {
  constructor();
  // (undocumented)
  announceToCurveProcessor(processor: RecursiveCurveProcessor, indexInParent?: number): void;
  // (undocumented)
  cloneEmptyPeer(): Path;
  // (undocumented)
  cloneStroked(options?: StrokeOptions): AnyCurve;
  static create(...curves: Array<CurvePrimitive | Point3d[]>): Path;
  static createArray(curves: CurvePrimitive[]): Path;
  cyclicCurvePrimitive(index: number): CurvePrimitive | undefined;
  // (undocumented)
  dgnBoundaryType(): number;
  // (undocumented)
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  // (undocumented)
  isSameGeometryClass(other: GeometryQuery): boolean;
}

// @public
class Plane3dByOriginAndUnitNormal implements BeJSONFunctions {
  // (undocumented)
  altitude(spacePoint: Point3d): number;
  // (undocumented)
  altitudeToPoint(altitude: number, result?: Point3d): Point3d;
  // (undocumented)
  altitudeXYZ(x: number, y: number, z: number): number;
  // (undocumented)
  altitudeXYZW(x: number, y: number, z: number, w: number): number;
  // (undocumented)
  clone(result?: Plane3dByOriginAndUnitNormal): Plane3dByOriginAndUnitNormal;
  cloneTransformed(transform: Transform): Plane3dByOriginAndUnitNormal | undefined;
  // (undocumented)
  static create(origin: Point3d, normal: Vector3d, result?: Plane3dByOriginAndUnitNormal): Plane3dByOriginAndUnitNormal | undefined;
  static createPointPointVectorInPlane(pointA: Point3d, pointB: Point3d, vector: Vector3d): Plane3dByOriginAndUnitNormal | undefined;
  static createXYPlane(origin?: Point3d): Plane3dByOriginAndUnitNormal;
  static createYZPlane(origin?: Point3d): Plane3dByOriginAndUnitNormal;
  static createZXPlane(origin?: Point3d): Plane3dByOriginAndUnitNormal;
  // (undocumented)
  static fromJSON(json?: any): Plane3dByOriginAndUnitNormal;
  // (undocumented)
  getNormalRef(): Vector3d;
  // (undocumented)
  getOriginRef(): Point3d;
  // (undocumented)
  isAlmostEqual(other: Plane3dByOriginAndUnitNormal): boolean;
  isPointInPlane(spacePoint: Point3d): boolean;
  // (undocumented)
  projectPointToPlane(spacePoint: Point3d, result?: Point3d): Point3d;
  set(origin: Point3d, normal: Vector3d): void;
  setFrom(source: Plane3dByOriginAndUnitNormal): void;
  // (undocumented)
  setFromJSON(json?: any): void;
  toJSON(): any;
  // (undocumented)
  velocity(spaceVector: Vector3d): number;
  // (undocumented)
  velocityXYZ(x: number, y: number, z: number): number;
  // (undocumented)
  weightedAltitude(spacePoint: Point4d): number;
}

// @public
class Plane3dByOriginAndVectors implements BeJSONFunctions {
  static createCapture(origin: Point3d, vectorU: Vector3d, vectorV: Vector3d, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  static createFromTransformColumnsXYAndLengths(transform: Transform, xLength: number | undefined, yLength: number | undefined, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  static createOriginAndTargets(origin: Point3d, targetU: Point3d, targetV: Point3d, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  // (undocumented)
  static createOriginAndVectors(origin: Point3d, vectorU: Vector3d, vectorV: Vector3d, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  static createOriginAndVectorsArrays(origin: Float64Array, vectorU: Float64Array, vectorV: Float64Array, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  static createOriginAndVectorsWeightedArrays(originw: Float64Array, vectorUw: Float64Array, vectorVw: Float64Array, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  // (undocumented)
  static createOriginAndVectorsXYZ(x0: number, y0: number, z0: number, ux: number, uy: number, uz: number, vx: number, vy: number, vz: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  static createXYPlane(result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  fractionToPoint(u: number, v: number, result?: Point3d): Point3d;
  // (undocumented)
  fractionToVector(u: number, v: number, result?: Vector3d): Vector3d;
  // (undocumented)
  static fromJSON(json?: any): Plane3dByOriginAndVectors;
  // (undocumented)
  isAlmostEqual(other: Plane3dByOriginAndVectors): boolean;
  // (undocumented)
  origin: Point3d;
  // (undocumented)
  setFromJSON(json?: any): void;
  // (undocumented)
  setOriginAndVectors(origin: Point3d, vectorU: Vector3d, vectorV: Vector3d): Plane3dByOriginAndVectors;
  // (undocumented)
  setOriginAndVectorsXYZ(x0: number, y0: number, z0: number, ux: number, uy: number, uz: number, vx: number, vy: number, vz: number): Plane3dByOriginAndVectors;
  toJSON(): any;
  // (undocumented)
  vectorU: Vector3d;
  // (undocumented)
  vectorV: Vector3d;
}

// @public
interface PlaneAltitudeEvaluator {
  altitude(point: Point3d): number;
  velocity(vector: Vector3d): number;
  velocityXYZ(x: number, y: number, z: number): number;
  weightedAltitude(point: Point4d): number;
}

// @public
class PlaneByOriginAndVectors4d {
  // (undocumented)
  clone(result?: PlaneByOriginAndVectors4d): PlaneByOriginAndVectors4d;
  // (undocumented)
  static createOriginAndTargets3d(origin: Point3d, targetU: Point3d, targetV: Point3d, result?: PlaneByOriginAndVectors4d): PlaneByOriginAndVectors4d;
  static createOriginAndVectors(origin: Point4d, vectorU: Point4d, vectorV: Point4d, result?: PlaneByOriginAndVectors4d): PlaneByOriginAndVectors4d;
  static createOriginAndVectorsXYZW(x0: number, y0: number, z0: number, w0: number, ux: number, uy: number, uz: number, uw: number, vx: number, vy: number, vz: number, vw: number, result?: PlaneByOriginAndVectors4d): PlaneByOriginAndVectors4d;
  // (undocumented)
  static createXYPlane(result?: PlaneByOriginAndVectors4d): PlaneByOriginAndVectors4d;
  // (undocumented)
  fractionToPoint(u: number, v: number, result?: Point4d): Point4d;
  // (undocumented)
  isAlmostEqual(other: PlaneByOriginAndVectors4d): boolean;
  // (undocumented)
  origin: Point4d;
  setFrom(other: PlaneByOriginAndVectors4d): void;
  setOriginAndVectors(origin: Point4d, vectorU: Point4d, vectorV: Point4d): PlaneByOriginAndVectors4d;
  setOriginAndVectorsXYZW(x0: number, y0: number, z0: number, w0: number, ux: number, uy: number, uz: number, uw: number, vx: number, vy: number, vz: number, vw: number): PlaneByOriginAndVectors4d;
  // (undocumented)
  vectorU: Point4d;
  // (undocumented)
  vectorV: Point4d;
}

// @public
class PlaneSetParamsCache {
  constructor(zLow: number, zHigh: number, localOrigin?: Point3d, isMask?: boolean, isInvisible?: boolean, focalLength?: number);
  // (undocumented)
  clipPlaneSet: UnionOfConvexClipPlaneSets;
  // (undocumented)
  focalLength: number;
  // (undocumented)
  invisible: boolean;
  // (undocumented)
  isMask: boolean;
  // (undocumented)
  limitValue: number;
  // (undocumented)
  localOrigin: Point3d;
  // (undocumented)
  zHigh: number;
  // (undocumented)
  zLow: number;
}

// @public (undocumented)
class Point2d extends XY, implements BeJSONFunctions {
  constructor(x?: number, y?: number);
  // (undocumented)
  addForwardLeft(tangentFraction: number, leftFraction: number, vector: Vector2d): Point2d;
  // (undocumented)
  clone(): Point2d;
  static create(x?: number, y?: number, result?: Point2d): Point2d;
  // (undocumented)
  static createFrom(xy: XAndY | undefined, result?: Point2d): Point2d;
  // (undocumented)
  static createZero(result?: Point2d): Point2d;
  crossProductToPoints(target1: XAndY, target2: XAndY): number;
  // (undocumented)
  dotVectorsToTargets(targetA: XAndY, targetB: XAndY): number;
  // (undocumented)
  forwardLeftInterpolate(tangentFraction: number, leftFraction: number, point: XAndY): Point2d;
  // (undocumented)
  fractionOfProjectionToLine(startPoint: Point2d, endPoint: Point2d, defaultFraction?: number): number;
  // (undocumented)
  static fromJSON(json?: XYProps): Point2d;
  interpolate(fraction: number, other: XAndY, result?: Point2d): Point2d;
  interpolateXY(fractionX: number, fractionY: number, other: XAndY, result?: Point2d): Point2d;
  minus(vector: XAndY, result?: Point2d): Point2d;
  plus(vector: XAndY, result?: Point2d): Point2d;
  plus2Scaled(vectorA: XAndY, scalarA: number, vectorB: XAndY, scalarB: number, result?: Point2d): Point2d;
  plus3Scaled(vectorA: XAndY, scalarA: number, vectorB: XAndY, scalarB: number, vectorC: XAndY, scalarC: number, result?: Point2d): Point2d;
  plusScaled(vector: XAndY, scaleFactor: number, result?: Point2d): Point2d;
  plusXY(dx?: number, dy?: number, result?: Point2d): Point2d;
}

// @public (undocumented)
class Point2dArray {
  // (undocumented)
  static clonePoint2dArray(data: Point2d[]): Point2d[];
  // (undocumented)
  static isAlmostEqual(dataA: undefined | Point2d[], dataB: undefined | Point2d[]): boolean;
  static pointCountExcludingTrailingWraparound(data: XAndY[]): number;
}

// @public
class Point2dArrayCarrier extends IndexedXYCollection {
  constructor(data: Point2d[]);
  // (undocumented)
  crossProductIndexIndexIndex(originIndex: number, indexA: number, indexB: number): number | undefined;
  // (undocumented)
  crossProductXAndYIndexIndex(origin: XAndY, indexA: number, indexB: number): number | undefined;
  // (undocumented)
  data: Point2d[];
  // (undocumented)
  getPoint2dAtCheckedPointIndex(index: number, result?: Point2d): Point2d | undefined;
  // (undocumented)
  getVector2dAtCheckedVectorIndex(index: number, result?: Vector2d): Vector2d | undefined;
  // (undocumented)
  isValidIndex(index: number): boolean;
  readonly length: number;
  // (undocumented)
  vectorIndexIndex(indexA: number, indexB: number, result?: Vector2d): Vector2d | undefined;
  // (undocumented)
  vectorXAndYIndex(origin: XAndY, indexB: number, result?: Vector2d): Vector2d | undefined;
}

// @public
class Point3d extends XYZ {
  constructor(x?: number, y?: number, z?: number);
  clone(result?: Point3d): Point3d;
  static create(x?: number, y?: number, z?: number, result?: Point3d): Point3d;
  static createAdd2Scaled(pointA: XYAndZ, scaleA: number, pointB: XYAndZ, scaleB: number, result?: Point3d): Point3d;
  static createAdd3Scaled(pointA: XYAndZ, scaleA: number, pointB: XYAndZ, scaleB: number, pointC: XYAndZ, scaleC: number, result?: Point3d): Point3d;
  static createFrom(data: XYAndZ | XAndY | Float64Array, result?: Point3d): Point3d;
  static createFromPacked(xyzData: Float64Array, pointIndex: number, result?: Point3d): Point3d | undefined;
  static createFromPackedXYZW(xyzData: Float64Array, pointIndex: number, result?: Point3d): Point3d | undefined;
  static createScale(source: XYAndZ, scale: number, result?: Point3d): Point3d;
  static createZero(result?: Point3d): Point3d;
  crossProductToPoints(pointA: Point3d, pointB: Point3d, result?: Vector3d): Vector3d;
  crossProductToPointsXY(pointA: Point3d, pointB: Point3d): number;
  dotVectorsToTargets(targetA: Point3d, targetB: Point3d): number;
  fractionOfProjectionToLine(startPoint: Point3d, endPoint: Point3d, defaultFraction?: number): number;
  // (undocumented)
  static fromJSON(json?: XYZProps): Point3d;
  interpolate(fraction: number, other: XYAndZ, result?: Point3d): Point3d;
  interpolatePerpendicularXY(fraction: number, pointB: Point3d, fractionXYPerp: number, result?: Point3d): Point3d;
  interpolatePointAndTangent(fraction: number, other: Point3d, tangentScale: number, result?: Ray3d): Ray3d;
  interpolateXYZ(fractionX: number, fractionY: number, fractionZ: number, other: Point3d, result?: Point3d): Point3d;
  minus(vector: XYAndZ, result?: Point3d): Point3d;
  plus(vector: XYAndZ, result?: Point3d): Point3d;
  plus2Scaled(vectorA: XYAndZ, scalarA: number, vectorB: XYZ, scalarB: number, result?: Point3d): Point3d;
  plus3Scaled(vectorA: XYAndZ, scalarA: number, vectorB: XYAndZ, scalarB: number, vectorC: XYAndZ, scalarC: number, result?: Point3d): Point3d;
  plusScaled(vector: XYAndZ, scaleFactor: number, result?: Point3d): Point3d;
  plusXYZ(dx?: number, dy?: number, dz?: number, result?: Point3d): Point3d;
  tripleProductToPoints(pointA: Point3d, pointB: Point3d, pointC: Point3d): number;
}

// @public (undocumented)
class Point3dArray {
  static centroid(points: IndexedXYZCollection, result?: Point3d): Point3d;
  // (undocumented)
  static clonePoint2dArray(data: XYAndZ[]): Point2d[];
  // (undocumented)
  static clonePoint3dArray(data: XYAndZ[]): Point3d[];
  static closestPointIndex(data: XYAndZ[], spacePoint: XYAndZ): number;
  static evaluateTrilinearDerivativeTransform(points: Point3d[], u: number, v: number, w: number, result?: Transform): Transform;
  static evaluateTrilinearPoint(points: Point3d[], u: number, v: number, w: number, result?: Point3d): Point3d;
  static evaluateTrilinearWeights(weights: Float64Array, u0: number, u1: number, v0: number, v1: number, w0: number, w1: number): void;
  static indexOfMostDistantPoint(points: Point3d[], spacePoint: XYZ, farVector: Vector3d): number | undefined;
  static indexOfPointWithMaxCrossProductMagnitude(points: Point3d[], spacePoint: Point3d, vector: Vector3d, farVector: Vector3d): number | undefined;
  // (undocumented)
  static isAlmostEqual(dataA: Point3d[] | Float64Array | undefined, dataB: Point3d[] | Float64Array | undefined): boolean;
  static isCloseToPlane(data: Point3d[] | Float64Array, plane: Plane3dByOriginAndUnitNormal, tolerance?: number): boolean;
  // (undocumented)
  static multiplyInPlace(transform: Transform, xyz: Float64Array): void;
  // (undocumented)
  static packToFloat64Array(data: Point3d[]): Float64Array;
  static sumEdgeLengths(data: Point3d[] | Float64Array, addClosureEdge?: boolean): number;
  static sumWeightedX(weights: Float64Array, points: Point3d[]): number;
  static sumWeightedY(weights: Float64Array, points: Point3d[]): number;
  static sumWeightedZ(weights: Float64Array, points: Point3d[]): number;
  static unpackNumbersToNestedArrays(data: Float64Array, numPerBlock: number): any[];
  static unpackNumbersToNestedArraysIJK(data: Float64Array, numPerBlock: number, numPerRow: number): any[];
  // (undocumented)
  static unpackNumbersToPoint3dArray(data: Float64Array | number[]): Point3d[];
}

// @public
class Point3dArrayCarrier extends IndexedXYZCollection {
  constructor(data: Point3d[]);
  // (undocumented)
  accumulateCrossProductIndexIndexIndex(originIndex: number, indexA: number, indexB: number, result: Vector3d): void;
  // (undocumented)
  crossProductIndexIndexIndex(originIndex: number, indexA: number, indexB: number, result?: Vector3d): Vector3d | undefined;
  // (undocumented)
  crossProductXYAndZIndexIndex(origin: XYAndZ, indexA: number, indexB: number, result?: Vector3d): Vector3d | undefined;
  // (undocumented)
  data: Point3d[];
  // (undocumented)
  getPoint3dAtCheckedPointIndex(index: number, result?: Point3d): Point3d | undefined;
  // (undocumented)
  getVector3dAtCheckedVectorIndex(index: number, result?: Vector3d): Vector3d | undefined;
  // (undocumented)
  isValidIndex(index: number): boolean;
  readonly length: number;
  // (undocumented)
  vectorIndexIndex(indexA: number, indexB: number, result?: Vector3d): Vector3d | undefined;
  // (undocumented)
  vectorXYAndZIndex(origin: XYAndZ, indexB: number, result?: Vector3d): Vector3d | undefined;
}

// @public
class Point4d implements BeJSONFunctions {
  protected constructor(x?: number, y?: number, z?: number, w?: number);
  altitude(point: Point3d): number;
  // (undocumented)
  clone(result?: Point4d): Point4d;
  // (undocumented)
  static create(x?: number, y?: number, z?: number, w?: number, result?: Point4d): Point4d;
  static createAdd2Scaled(vectorA: Point4d, scalarA: number, vectorB: Point4d, scalarB: number, result?: Point4d): Point4d;
  static createAdd3Scaled(vectorA: Point4d, scalarA: number, vectorB: Point4d, scalarB: number, vectorC: Point4d, scalarC: number, result?: Point4d): Point4d;
  static createFromPackedXYZW(data: Float64Array, xIndex?: number, result?: Point4d): Point4d;
  // (undocumented)
  static createFromPointAndWeight(xyz: XYAndZ, w: number): Point4d;
  static createPlanePointPointZ(pointA: Point4d, pointB: Point4d, result?: Point4d): Point4d;
  static createRealDerivativePlane3dByOriginAndVectorsDefault000(x: number, y: number, z: number, w: number, dx: number, dy: number, dz: number, dw: number, ddx: number, ddy: number, ddz: number, ddw: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  static createRealDerivativeRay3dDefault000(x: number, y: number, z: number, w: number, dx: number, dy: number, dz: number, dw: number, result?: Ray3d): Ray3d;
  static createRealPoint3dDefault000(x: number, y: number, z: number, w: number, result?: Point3d): Point3d;
  // (undocumented)
  static createZero(): Point4d;
  // (undocumented)
  crossWeightedMinus(other: Point4d, result?: Vector3d): Vector3d;
  static determinantIndexed3X3(pointA: Point4d, pointB: Point4d, pointC: Point4d, i: number, j: number, k: number): number;
  distanceSquaredXYZW(other: Point4d): number;
  distanceXYZW(other: Point4d): number;
  dotProduct(other: Point4d): number;
  dotProductXYZW(x: number, y: number, z: number, w: number): number;
  dotVectorsToTargets(targetA: Point4d, targetB: Point4d): number;
  // (undocumented)
  static fromJSON(json?: Point4dProps): Point4d;
  interpolate(fraction: number, pointB: Point4d, result?: Point4d): Point4d;
  // (undocumented)
  static interpolateQuaternions(quaternion0: Point4d, fractionParameter: number, quaternion1: Point4d, result?: Point4d): Point4d;
  // (undocumented)
  isAlmostEqual(other: Point4d): boolean;
  isAlmostEqualXYZW(x: number, y: number, z: number, w: number): boolean;
  // (undocumented)
  readonly isAlmostZero: boolean;
  // (undocumented)
  magnitudeSquaredXYZ(): number;
  // (undocumented)
  magnitudeXYZW(): number;
  // (undocumented)
  maxAbs(): number;
  maxDiff(other: Point4d): number;
  // (undocumented)
  minus(other: Point4d, result?: Point4d): Point4d;
  negate(result?: Point4d): Point4d;
  // (undocumented)
  normalizeQuaternion(): number;
  normalizeWeight(result?: Point4d): Point4d | undefined;
  normalizeXYZW(result?: Point4d): Point4d | undefined;
  static perpendicularPoint4dPlane(pointA: Point4d, pointB: Point4d, pointC: Point4d): Point4d;
  // (undocumented)
  plus(other: Point4d, result?: Point4d): Point4d;
  plus2Scaled(vectorA: Point4d, scalarA: number, vectorB: Point4d, scalarB: number, result?: Point4d): Point4d;
  plus3Scaled(vectorA: Point4d, scalarA: number, vectorB: Point4d, scalarB: number, vectorC: Point4d, scalarC: number, result?: Point4d): Point4d;
  plusScaled(vector: Point4d, scaleFactor: number, result?: Point4d): Point4d;
  // (undocumented)
  radiansToPoint4dXYZW(other: Point4d): number | undefined;
  realDistanceXY(other: Point4d): number | undefined;
  realPoint(result?: Point3d): Point3d | undefined;
  realPointDefault000(result?: Point3d): Point3d;
  // (undocumented)
  safeDivideOrNull(denominator: number, result?: Point4d): Point4d | undefined;
  scale(scale: number, result?: Point4d): Point4d;
  set(x?: number, y?: number, z?: number, w?: number): Point4d;
  // (undocumented)
  setFrom(other: Point4d): Point4d;
  // (undocumented)
  setFromJSON(json?: Point4dProps): void;
  toJSON(): Point4dProps;
  // (undocumented)
  toPlane3dByOriginAndUnitNormal(result?: Plane3dByOriginAndUnitNormal): Plane3dByOriginAndUnitNormal | undefined;
  static unitW(): Point4d;
  static unitX(): Point4d;
  static unitY(): Point4d;
  static unitZ(): Point4d;
  velocity(vector: Vector3d): number;
  velocityXYZ(x: number, y: number, z: number): number;
  // (undocumented)
  w: number;
  weightedAltitude(point: Point4d): number;
  // (undocumented)
  x: number;
  // (undocumented)
  xyzw: Float64Array;
  // (undocumented)
  y: number;
  // (undocumented)
  z: number;
}

// @public (undocumented)
class Point4dArray {
  // (undocumented)
  static isAlmostEqual(dataA: Point4d[] | Float64Array | undefined, dataB: Point4d[] | Float64Array | undefined): boolean;
  static isCloseToPlane(data: Point4d[] | Float64Array, plane: Plane3dByOriginAndUnitNormal, tolerance?: number): boolean;
  static multiplyInPlace(transform: Transform, xyzw: Float64Array): void;
  static packPointsAndWeightsToFloat64Array(points: Point3d[], weights: number[], result?: Float64Array): Float64Array;
  // (undocumented)
  static packToFloat64Array(data: Point4d[], result?: Float64Array): Float64Array;
  static unpackFloat64ArrayToPointsAndWeights(data: Float64Array, points: Point3d[], weights: number[], pointFormatter?: (x: number, y: number, z: number) => any): void;
  static unpackToPoint4dArray(data: Float64Array): Point4d[];
}

// @public
class PointString3d extends GeometryQuery, implements BeJSONFunctions {
  addPoint(point: Point3d): void;
  addPoints(...points: any[]): void;
  clear(): void;
  // (undocumented)
  clone(): PointString3d;
  // (undocumented)
  cloneTransformed(transform: Transform): PointString3d;
  closestPoint: {
    index: number;
    xyz: Point3d;
  }
  static create(...points: any[]): PointString3d;
  static createFloat64Array(xyzData: Float64Array): PointString3d;
  static createPoints(points: Point3d[]): PointString3d;
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  extendRange(rangeToExtend: Range3d, transform?: Transform): void;
  // (undocumented)
  static fromJSON(json?: any): PointString3d;
  isAlmostEqual(other: GeometryQuery): boolean;
  isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean;
  // (undocumented)
  isSameGeometryClass(other: GeometryQuery): boolean;
  numPoints(): number;
  pointAt(i: number, result?: Point3d): Point3d | undefined;
  readonly points: Point3d[];
  popPoint(): void;
  reverseInPlace(): void;
  // (undocumented)
  setFrom(other: PointString3d): void;
  // (undocumented)
  setFromJSON(json?: any): void;
  toJSON(): any;
  tryTransformInPlace(transform: Transform): boolean;
}

// @public
class Polyface extends GeometryQuery {
  protected constructor(data: PolyfaceData);
  static areIndicesValid(indices: number[] | undefined, indexPositionA: number, indexPositionB: number, data: any | undefined, dataLength: number): boolean;
  abstract createVisitor(_numWrap: number): PolyfaceVisitor;
  // (undocumented)
  data: PolyfaceData;
  // (undocumented)
  readonly isEmpty: boolean;
  // (undocumented)
  twoSided: boolean;
}

// @public
class PolyfaceAuxData {
  constructor(channels: AuxChannel[], indices: number[]);
  // (undocumented)
  channels: AuxChannel[];
  // (undocumented)
  clone(): PolyfaceAuxData;
  // (undocumented)
  createForVisitor(): PolyfaceAuxData;
  // (undocumented)
  indices: number[];
  // (undocumented)
  isAlmostEqual(other: PolyfaceAuxData, tol?: number): boolean;
}

// @public
class PolyfaceBuilder extends NullGeometryHandler {
  addBetweenLineStringsWithRuleEdgeNormals(lineStringA: LineString3d, vA: number, lineStringB: LineString3d, vB: number, addClosure?: boolean): void;
  addBetweenLineStringsWithStoredIndices(lineStringA: LineString3d, lineStringB: LineString3d): void;
  addBetweenTransformedLineStrings(curves: AnyCurve, transformA: Transform, transformB: Transform, addClosure?: boolean): void;
  // (undocumented)
  addBox(box: Box): void;
  // (undocumented)
  addCone(cone: Cone): void;
  addCoordinateFacets(pointArray: Point3d[][], paramArray?: Point2d[][], normalArray?: Vector3d[][], endFace?: boolean): void;
  // (undocumented)
  addGeometryQuery(g: GeometryQuery): void;
  addGraph(graph: HalfEdgeGraph, needParams: boolean, acceptFaceFunction?: HalfEdgeToBooleanFunction): void;
  addIndexedPolyface(source: IndexedPolyface, reversed: boolean, transform?: Transform): void;
  // (undocumented)
  addLinearSweep(surface: LinearSweep): void;
  // (undocumented)
  addLinearSweepLineStringsXYZOnly(contour: AnyCurve, vector: Vector3d): void;
  addPolygon(points: Point3d[], numPointsToUse?: number): void;
  addQuadFacet(points: Point3d[], params?: Point2d[], normals?: Vector3d[]): void;
  // (undocumented)
  addRotationalSweep(surface: RotationalSweep): void;
  // (undocumented)
  addRuledSweep(surface: RuledSweep): boolean;
  // (undocumented)
  addSphere(sphere: Sphere, strokeCount?: number): void;
  // (undocumented)
  addTorusPipe(surface: TorusPipe, phiStrokeCount?: number, thetaStrokeCount?: number): void;
  addTransformedUnitBox(transform: Transform): void;
  addTriangleFacet(points: Point3d[], params?: Point2d[], normals?: Vector3d[]): void;
  addTriangleFan(conePoint: Point3d, ls: LineString3d, toggle: boolean): void;
  addTrianglesInUncheckedConvexPolygon(ls: LineString3d, toggle: boolean): void;
  addUVGridBody(surface: UVSurface, numU: number, numV: number, uMap?: Segment1d, vMap?: Segment1d): void;
  applyStrokeCountsToCurvePrimitives(data: AnyCurve | GeometryQuery): void;
  claimPolyface(compress?: boolean): IndexedPolyface;
  // (undocumented)
  static create(options?: StrokeOptions): PolyfaceBuilder;
  endFace(): boolean;
  findOrAddNormalnLineString(ls: LineString3d, index: number, transform?: Transform, priorIndexA?: number, priorIndexB?: number): number | undefined;
  findOrAddParamInGrowableXYArray(data: GrowableXYArray, index: number): number | undefined;
  findOrAddParamInLineString(ls: LineString3d, index: number, v: number, priorIndexA?: number, priorIndexB?: number): number | undefined;
  findOrAddParamXY(x: number, y: number): number;
  findOrAddPoint(xyz: Point3d): number;
  findOrAddPointInLineString(ls: LineString3d, index: number, transform?: Transform, priorIndex?: number): number | undefined;
  findOrAddPointXYZ(x: number, y: number, z: number): number;
  // (undocumented)
  static graphToPolyface(graph: HalfEdgeGraph, options?: StrokeOptions, acceptFaceFunction?: HalfEdgeToBooleanFunction): IndexedPolyface;
  // (undocumented)
  handleBox(g: Box): any;
  // (undocumented)
  handleCone(g: Cone): any;
  // (undocumented)
  handleLinearSweep(g: LinearSweep): any;
  // (undocumented)
  handleRotationalSweep(g: RotationalSweep): any;
  // (undocumented)
  handleRuledSweep(g: RuledSweep): any;
  // (undocumented)
  handleSphere(g: Sphere): any;
  // (undocumented)
  handleTorusPipe(g: TorusPipe): any;
  // (undocumented)
  readonly options: StrokeOptions;
  // (undocumented)
  toggleReversedFacetFlag(): void;
}

// WARNING: planarityLocalRelTol has incomplete type information
// @public
class PolyfaceData {
  constructor(needNormals?: boolean, needParams?: boolean, needColors?: boolean);
  // (undocumented)
  auxData: PolyfaceAuxData | undefined;
  // (undocumented)
  clone(): PolyfaceData;
  // (undocumented)
  color: number[] | undefined;
  // (undocumented)
  readonly colorCount: number;
  // (undocumented)
  colorIndex: number[] | undefined;
  // (undocumented)
  compress(): void;
  copyNormalTo(i: number, dest: Vector3d): void;
  copyParamTo(i: number, dest: Point2d): void;
  copyPointTo(i: number, dest: Point3d): void;
  // (undocumented)
  edgeVisible: boolean[];
  face: FacetFaceData[];
  readonly faceCount: number;
  gatherIndexedData(other: PolyfaceData, index0: number, index1: number, numWrap: number): void;
  getColor(i: number): number;
  getEdgeVisible(i: number): boolean;
  getNormal(i: number): Vector3d | undefined;
  getParam(i: number): Point2d | undefined;
  getPoint(i: number): Point3d | undefined;
  // (undocumented)
  readonly indexCount: number;
  // (undocumented)
  isAlmostEqual(other: PolyfaceData): boolean;
  isAlmostEqualParamIndexUV(index: number, u: number, v: number): boolean;
  static isValidFacetStartIndexArray(facetStartIndex: number[]): boolean;
  // (undocumented)
  normal: GrowableXYZArray | undefined;
  // (undocumented)
  readonly normalCount: number;
  // (undocumented)
  normalIndex: number[] | undefined;
  // (undocumented)
  param?: GrowableXYArray;
  // (undocumented)
  readonly paramCount: number;
  // (undocumented)
  paramIndex: number[] | undefined;
  // (undocumented)
  point: GrowableXYZArray;
  // (undocumented)
  readonly pointCount: number;
  // (undocumented)
  pointIndex: number[];
  // (undocumented)
  range(result?: Range3d, transform?: Transform): Range3d;
  // (undocumented)
  readonly requireNormals: boolean;
  // (undocumented)
  resizeAllDataArrays(length: number): void;
  reverseIndices(facetStartIndex?: number[]): void;
  // (undocumented)
  reverseNormals(): void;
  // (undocumented)
  trimAllIndexArrays(length: number): void;
  // (undocumented)
  tryTransformInPlace(transform: Transform): boolean;
}

// @public
class PolyfaceQuery {
  static computePrincipalAreaMoments(source: Polyface): MomentData | undefined;
  static indexedPolyfaceToLoops(polyface: Polyface): BagOfCurves;
  static isPolyfaceClosedByEdgePairing(source: Polyface): boolean;
  // (undocumented)
  static sumFacetAreas(source: Polyface | PolyfaceVisitor): number;
  static sumFacetSecondAreaMomentProducts(source: Polyface | PolyfaceVisitor, origin: Point3d): Matrix4d;
  static sumTetrahedralVolumes(source: Polyface | PolyfaceVisitor, origin?: Point3d): number;
  static visitorToLoop(visitor: PolyfaceVisitor): Loop;
}

// @public
interface PolyfaceVisitor extends PolyfaceData {
  // (undocumented)
  clientAuxIndex(i: number): number;
  // (undocumented)
  clientColorIndex(i: number): number;
  // (undocumented)
  clientNormalIndex(i: number): number;
  // (undocumented)
  clientParamIndex(i: number): number;
  // (undocumented)
  clientPointIndex(i: number): number;
  // (undocumented)
  currentReadIndex(): number;
  // (undocumented)
  moveToNextFacet(): boolean;
  // (undocumented)
  moveToReadIndex(index: number): boolean;
  // (undocumented)
  reset(): void;
}

// @public
class PolygonOps {
  static addSecondMomentAreaProducts(points: IndexedXYZCollection, origin: Point3d, moments: Matrix4d): void;
  static area(points: Point3d[]): number;
  // (undocumented)
  static areaNormal(points: Point3d[], result?: Vector3d): Vector3d;
  static areaNormalGo(points: IndexedXYZCollection, result?: Vector3d): Vector3d | undefined;
  static areaXY(points: Point3d[]): number;
  // (undocumented)
  static centroidAndAreaXY(points: Point2d[], centroid: Point2d): number | undefined;
  // (undocumented)
  static centroidAreaNormal(points: Point3d[]): Ray3d | undefined;
  static parity(pPoint: Point2d, pPointArray: Point2d[] | Point3d[], tol?: number): number;
  static parityVectorTest(pPoint: Point2d, theta: number, pPointArray: Point2d[] | Point3d[], tol: number): number | undefined;
  static parityXTest(pPoint: Point2d, pPointArray: Point2d[] | Point3d[], tol: number): number | undefined;
  static parityYTest(pPoint: Point2d, pPointArray: Point2d[] | Point3d[], tol: number): number | undefined;
  static sumTriangleAreas(points: Point3d[]): number;
  static sumTriangleAreasXY(points: Point3d[]): number;
  static testXYPolygonTurningDirections(pPointArray: Point2d[] | Point3d[]): number;
  // (undocumented)
  static unitNormal(points: IndexedXYZCollection, result: Vector3d): boolean;
}

// @public (undocumented)
class PowerPolynomial {
  // (undocumented)
  static accumulate(coffP: Float64Array, coffQ: Float64Array, scaleQ: number): number;
  // (undocumented)
  static degreeKnownEvaluate(coff: Float64Array, degree: number, x: number): number;
  // (undocumented)
  static evaluate(coff: Float64Array, x: number): number;
  // (undocumented)
  static zero(coff: Float64Array): void;
}

// @public
class Quadrature {
  // (undocumented)
  static readonly gaussW1Interval01: Float64Array;
  // (undocumented)
  static readonly gaussW2Interval01: Float64Array;
  // (undocumented)
  static readonly gaussW3Interval01: Float64Array;
  // (undocumented)
  static readonly gaussW4Interval01: Float64Array;
  // (undocumented)
  static readonly gaussW5Interval01: Float64Array;
  // (undocumented)
  static readonly gaussX1Interval01: Float64Array;
  // (undocumented)
  static readonly gaussX2Interval01: Float64Array;
  // (undocumented)
  static readonly gaussX3Interval01: Float64Array;
  // (undocumented)
  static readonly gaussX4Interval01: Float64Array;
  // (undocumented)
  static readonly gaussX5Interval01: Float64Array;
  static mapWeights(xA: number, h: number, xRef: Float64Array, wRef: Float64Array, xMapped: Float64Array, wMapped: Float64Array): number;
  // (undocumented)
  static setupGauss1(xA: number, xB: number, xMapped: Float64Array, wMapped: Float64Array): number;
  // (undocumented)
  static setupGauss2(xA: number, xB: number, xMapped: Float64Array, wMapped: Float64Array): number;
  // (undocumented)
  static setupGauss3(xA: number, xB: number, xMapped: Float64Array, wMapped: Float64Array): number;
  // (undocumented)
  static setupGauss4(xA: number, xB: number, xMapped: Float64Array, wMapped: Float64Array): number;
  static setupGauss5(xA: number, xB: number, xMapped: Float64Array, wMapped: Float64Array): number;
  static sum1(xx: Float64Array, ww: Float64Array, n: number, f: (x: number) => number): number;
}

// @public (undocumented)
export function quotientDerivative2(ddg: number, dh: number, ddh: number, f: number, df: number, divh: number): number;

// @public (undocumented)
class Range1d extends RangeBase {
  clone(result?: this): this;
  containsRange(other: Range1d): boolean;
  containsX(x: number): boolean;
  static createArray<T extends Range1d>(values: Float64Array | number[], result?: T): T;
  static createFrom<T extends Range1d>(other: T, result?: T): T;
  static createNull<T extends Range1d>(result?: T): T;
  static createX<T extends Range1d>(x: number, result?: T): T;
  static createXX<T extends Range1d>(xA: number, xB: number, result?: T): T;
  static createXXOrCorrectToNull<T extends Range1d>(xA: number, xB: number, result?: T): T;
  distanceToRange(other: Range1d): number;
  distanceToX(x: number): number;
  expandInPlace(delta: number): void;
  extendArray(values: Float64Array | number[]): void;
  extendArraySubset(values: Float64Array | number[], beginIndex: number, numValue: number): void;
  extendRange(other: Range1d): void;
  extendX(x: number): void;
  fractionToPoint(fraction: number): number;
  // (undocumented)
  static fromJSON<T extends Range1d>(json?: Range1dProps): T;
  // (undocumented)
  high: number;
  intersect(other: Range1d, result?: Range1d): Range1d;
  intersectsRange(other: Range1d): boolean;
  isAlmostEqual(other: Range1d): boolean;
  readonly isAlmostZeroLength: boolean;
  readonly isNull: boolean;
  readonly isSinglePoint: boolean;
  length(): number;
  // (undocumented)
  low: number;
  maxAbs(): number;
  scaleAboutCenterInPlace(scaleFactor: number): void;
  setFrom(other: Range1d): void;
  setFromJSON(json: Range1dProps): void;
  // (undocumented)
  setNull(): void;
  setX(x: number): void;
  toJSON(): Range1dProps;
  union(other: Range1d, result?: Range1d): Range1d;
}

// @public
class Range1dArray {
  static countContainingRanges(data: Range1d[], value: number): number;
  static differenceSorted(dataA: Range1d[], dataB: Range1d[]): Range1d[];
  static getBreaks(data: Range1d[], result?: GrowableFloat64Array, sort?: boolean, compress?: boolean): GrowableFloat64Array;
  // (undocumented)
  static intersectSorted(dataA: Range1d[], dataB: Range1d[]): Range1d[];
  static isSorted(data: Range1d[], strict?: boolean): boolean;
  // (undocumented)
  static paritySorted(dataA: Range1d[], dataB: Range1d[]): Range1d[];
  // (undocumented)
  static simplifySortParity(data: Range1d[], removeZeroLengthRanges?: boolean): void;
  static simplifySortUnion(data: Range1d[], removeZeroLengthRanges?: boolean): void;
  static sort(data: Range1d[]): void;
  static sumLengths(data: Range1d[]): number;
  static testParity(data: Range1d[], value: number): boolean;
  static testUnion(data: Range1d[], value: number): boolean;
  // (undocumented)
  static unionSorted(dataA: Range1d[], dataB: Range1d[]): Range1d[];
}

// @public (undocumented)
class Range2d extends RangeBase, implements LowAndHighXY {
  constructor(lowx?: number, lowy?: number, highx?: number, highy?: number);
  // (undocumented)
  readonly bottom: number;
  // (undocumented)
  readonly center: Point2d;
  clone(result?: this): this;
  containsPoint(point: XAndY): boolean;
  containsRange(other: LowAndHighXY): boolean;
  containsXY(x: number, y: number): boolean;
  static createArray<T extends Range2d>(points: Point2d[], result?: T): T;
  // (undocumented)
  static createFrom<T extends Range2d>(other: LowAndHighXY, result?: T): T;
  static createNull<T extends Range2d>(result?: T): T;
  static createXY<T extends Range2d>(x: number, y: number, result?: T): T;
  static createXYXY<T extends Range2d>(xA: number, yA: number, xB: number, yB: number, result?: T): T;
  static createXYXYOrCorrectToNull<T extends Range2d>(xA: number, yA: number, xB: number, yB: number, result?: T): T;
  diagonal(result?: Vector2d): Vector2d;
  diagonalFractionToPoint(fraction: number, result?: Point2d): Point2d;
  distanceToPoint(point: XAndY): number;
  distanceToRange(other: LowAndHighXY): number;
  expandInPlace(delta: number): void;
  extendPoint(point: XAndY): void;
  extendRange(other: LowAndHighXY): void;
  extendTransformedXY(transform: Transform, x: number, y: number): void;
  extendXY(x: number, y: number): void;
  fractionToPoint(fractionX: number, fractionY: number, result?: Point2d): Point2d;
  // (undocumented)
  freeze(): void;
  static fromArrayBuffer<T extends Range2d>(buffer: ArrayBuffer): T;
  static fromFloat64Array<T extends Range2d>(f64: Float64Array): T;
  // (undocumented)
  static fromJSON<T extends Range2d>(json?: Range2dProps): T;
  // (undocumented)
  readonly height: number;
  // (undocumented)
  high: Point2d;
  intersect(other: LowAndHighXY, result?: Range2d): Range2d;
  intersectsRange(other: LowAndHighXY): boolean;
  // (undocumented)
  isAlmostEqual(other: Range2d): boolean;
  readonly isAlmostZeroX: boolean;
  readonly isAlmostZeroY: boolean;
  readonly isNull: boolean;
  readonly isSinglePoint: boolean;
  // (undocumented)
  readonly left: number;
  // (undocumented)
  low: Point2d;
  maxAbs(): number;
  // (undocumented)
  readonly right: number;
  scaleAboutCenterInPlace(scaleFactor: number): void;
  // (undocumented)
  setFrom(other: LowAndHighXY): void;
  setFromJSON(json: Range2dProps): void;
  // (undocumented)
  setNull(): void;
  setXY(x: number, y: number): void;
  // (undocumented)
  static toFloat64Array(val: LowAndHighXY): Float64Array;
  // (undocumented)
  toJSON(): Range2dProps;
  // (undocumented)
  readonly top: number;
  union(other: LowAndHighXY, result?: Range2d): Range2d;
  // (undocumented)
  readonly width: number;
  xLength(): number;
  yLength(): number;
}

// @public (undocumented)
class Range3d extends RangeBase, implements LowAndHighXYZ, BeJSONFunctions {
  constructor(lowx?: number, lowy?: number, lowz?: number, highx?: number, highy?: number, highz?: number);
  // (undocumented)
  readonly back: number;
  // (undocumented)
  readonly bottom: number;
  readonly center: Point3d;
  // (undocumented)
  clone(result?: this): this;
  containsPoint(point: Point3d): boolean;
  containsPointXY(point: Point3d): boolean;
  containsRange(other: Range3d): boolean;
  containsXYZ(x: number, y: number, z: number): boolean;
  corners(): Point3d[];
  static create(...point: Point3d[]): Range3d;
  static createArray<T extends Range3d>(points: Point3d[], result?: T): T;
  // (undocumented)
  static createFrom<T extends Range3d>(other: Range3d, result?: T): T;
  static createInverseTransformedArray<T extends Range3d>(transform: Transform, points: Point3d[]): T;
  static createNull<T extends Range3d>(result?: T): T;
  static createRange2d<T extends Range3d>(range: Range2d, z?: number, result?: T): T;
  static createTransformed<T extends Range3d>(transform: Transform, ...point: Point3d[]): T;
  static createTransformedArray<T extends Range3d>(transform: Transform, points: Point3d[]): T;
  static createXYZ<T extends Range3d>(x: number, y: number, z: number, result?: T): T;
  static createXYZXYZ<T extends Range3d>(xA: number, yA: number, zA: number, xB: number, yB: number, zB: number, result?: T): T;
  static createXYZXYZOrCorrectToNull<T extends Range3d>(xA: number, yA: number, zA: number, xB: number, yB: number, zB: number, result?: T): T;
  // (undocumented)
  readonly depth: number;
  diagonal(result?: Vector3d): Vector3d;
  diagonalFractionToPoint(fraction: number, result?: Point3d): Point3d;
  distanceToPoint(point: XYAndZ): number;
  distanceToRange(other: Range3d): number;
  ensureMinLengths(min?: number): void;
  expandInPlace(delta: number): void;
  extend(...point: Point3d[]): void;
  extendArray(points: Point3d[] | GrowableXYZArray, transform?: Transform): void;
  extendInverseTransformedArray(points: Point3d[] | GrowableXYZArray, transform: Transform): void;
  extendInverseTransformedXYZ(transform: Transform, x: number, y: number, z: number): boolean;
  extendPoint(point: Point3d): void;
  extendRange(other: LowAndHighXYZ): void;
  extendTransformedPoint(transform: Transform, point: Point3d): void;
  extendTransformedXYZ(transform: Transform, x: number, y: number, z: number): void;
  extendTransformedXYZW(transform: Transform, x: number, y: number, z: number, w: number): void;
  extendTransformTransformedXYZ(transformA: Transform, transformB: Transform, x: number, y: number, z: number): void;
  extendXYZ(x: number, y: number, z: number): void;
  extendXYZW(x: number, y: number, z: number, w: number): void;
  fractionToPoint(fractionX: number, fractionY: number, fractionZ: number, result?: Point3d): Point3d;
  // (undocumented)
  freeze(): void;
  static fromArrayBuffer<T extends Range3d>(buffer: ArrayBuffer): T;
  static fromFloat64Array<T extends Range3d>(f64: Float64Array): T;
  // (undocumented)
  static fromJSON<T extends Range3d>(json?: Range3dProps): T;
  // (undocumented)
  readonly front: number;
  getLocalToWorldTransform(result?: Transform): Transform;
  getNpcToWorldRangeTransform(result?: Transform): Transform;
  // (undocumented)
  readonly height: number;
  // (undocumented)
  high: Point3d;
  intersect(other: Range3d, result?: Range3d): Range3d;
  intersectsRange(other: Range3d): boolean;
  intersectsRangeXY(other: Range3d): boolean;
  isAlmostEqual(other: Range3d): boolean;
  readonly isAlmostZeroX: boolean;
  readonly isAlmostZeroY: boolean;
  readonly isAlmostZeroZ: boolean;
  readonly isNull: boolean;
  readonly isSinglePoint: boolean;
  // (undocumented)
  readonly left: number;
  localToWorld(xyz: XYAndZ, result?: Point3d): Point3d | undefined;
  localToWorldArrayInPlace(points: Point3d[]): boolean;
  localXYZToWorld(fractionX: number, fractionY: number, fractionZ: number, result?: Point3d): Point3d | undefined;
  // (undocumented)
  low: Point3d;
  maxAbs(): number;
  maxLength(): number;
  // (undocumented)
  readonly right: number;
  scaleAboutCenterInPlace(scaleFactor: number): void;
  setFrom(other: Range3d): void;
  // (undocumented)
  setFromJSON(json?: Range3dProps): void;
  setNull(): void;
  setXYZ(x: number, y: number, z: number): void;
  // (undocumented)
  static toFloat64Array(val: LowAndHighXYZ): Float64Array;
  toJSON(): Range3dProps;
  // (undocumented)
  readonly top: number;
  union(other: Range3d, result?: Range3d): Range3d;
  // (undocumented)
  readonly width: number;
  worldToLocal(point: Point3d, result?: Point3d): Point3d | undefined;
  worldToLocalArrayInPlace(point: Point3d[]): boolean;
  xLength(): number;
  yLength(): number;
  zLength(): number;
}

// @public (undocumented)
class RangeBase {
  // (undocumented)
  protected static readonly _EXTREME_NEGATIVE: number;
  // (undocumented)
  protected static readonly _EXTREME_POSITIVE: number;
  // (undocumented)
  static coordinateToRangeAbsoluteDistance(x: number, low: number, high: number): number;
  // (undocumented)
  static isExtremePoint2d(xy: Point2d): boolean;
  // (undocumented)
  static isExtremePoint3d(xyz: Point3d): boolean;
  // (undocumented)
  static isExtremeValue(x: number): boolean;
  protected static npcScaleFactor(low: number, high: number): number;
  static rangeToRangeAbsoluteDistance(lowA: number, highA: number, lowB: number, highB: number): number;
}

// @public (undocumented)
class Ray2d {
  // (undocumented)
  ccwPerpendicularRay(): Ray2d;
  // (undocumented)
  static createOriginAndDirection(origin: Point2d, direction: Vector2d): Ray2d;
  // (undocumented)
  static createOriginAndDirectionCapture(origin: Point2d, direction: Vector2d): Ray2d;
  // (undocumented)
  static createOriginAndTarget(origin: Point2d, target: Point2d): Ray2d;
  // (undocumented)
  cwPerpendicularRay(): Ray2d;
  // (undocumented)
  readonly direction: Vector2d;
  fractionToPoint(f: number): Point2d;
  intersectUnboundedLine(linePointA: Point2d, linePointB: Point2d, fraction: number[], dhds: number[]): boolean;
  // (undocumented)
  normalizeDirectionInPlace(): boolean;
  // (undocumented)
  readonly origin: Point2d;
  parallelRay(leftFraction: number): Ray2d;
  perpendicularProjectionFraction(point: Point2d): number;
  projectionFraction(point: Point2d): number;
}

// @public
class Ray3d implements BeJSONFunctions {
  // (undocumented)
  a?: number;
  clone(result?: Ray3d): Ray3d;
  cloneTransformed(transform: Transform): Ray3d;
  // (undocumented)
  static create(origin: Point3d, direction: Vector3d, result?: Ray3d): Ray3d;
  static createCapture(origin: Point3d, direction: Vector3d): Ray3d;
  static createPointVectorNumber(origin: Point3d, direction: Vector3d, a: number, result?: Ray3d): Ray3d;
  static createStartEnd(origin: Point3d, target: Point3d, result?: Ray3d): Ray3d;
  static createWeightedDerivative(weightedPoint: Float64Array, weightedDerivative: Float64Array, result?: Ray3d): Ray3d | undefined;
  // (undocumented)
  static createXAxis(): Ray3d;
  static createXYZUVW(originX: number, originY: number, originZ: number, directionX: number, directionY: number, directionZ: number, result?: Ray3d): Ray3d;
  // (undocumented)
  static createYAxis(): Ray3d;
  // (undocumented)
  static createZAxis(): Ray3d;
  // (undocumented)
  static createZero(result?: Ray3d): Ray3d;
  // (undocumented)
  direction: Vector3d;
  distance(spacePoint: Point3d): number;
  // (undocumented)
  dotProductToPoint(spacePoint: Point3d): number;
  fractionToPoint(fraction: number): Point3d;
  // (undocumented)
  static fromJSON(json?: any): Ray3d;
  // (undocumented)
  getDirectionRef(): Vector3d;
  // (undocumented)
  getOriginRef(): Point3d;
  intersectionWithPlane(plane: Plane3dByOriginAndUnitNormal, result?: Point3d): number | undefined;
  // (undocumented)
  isAlmostEqual(other: Ray3d): boolean;
  // (undocumented)
  origin: Point3d;
  perpendicularPartOfVectorToTarget(targetPoint: XYAndZ, result?: Vector3d): Vector3d;
  // (undocumented)
  pointToFraction(spacePoint: Point3d): number;
  // (undocumented)
  projectPointToRay(spacePoint: Point3d): Point3d;
  set(origin: Point3d, direction: Vector3d): void;
  setFrom(source: Ray3d): void;
  setFromJSON(json?: any): void;
  toJSON(): any;
  toRigidZFrame(): Transform | undefined;
  transformInPlace(transform: Transform): void;
  // (undocumented)
  tryNormalizeInPlaceWithAreaWeight(a: number): boolean;
  trySetDirectionMagnitudeInPlace(magnitude?: number): boolean;
}

// @public
class RecurseToCurvesGeometryHandler extends GeometryHandler {
  // (undocumented)
  handleArc3d(_g: Arc3d): any;
  // (undocumented)
  handleBagOfCurves(g: BagOfCurves): any;
  // (undocumented)
  handleBezierCurve3d(_g: BezierCurve3d): any;
  // (undocumented)
  handleBezierCurve3dH(_g: BezierCurve3dH): any;
  // (undocumented)
  handleBox(_g: Box): any;
  // (undocumented)
  handleBSplineCurve3d(_g: BSplineCurve3d): any;
  // (undocumented)
  handleBSplineCurve3dH(_g: BSplineCurve3dH): any;
  // (undocumented)
  handleBSplineSurface3d(_g: BSplineSurface3d): any;
  // (undocumented)
  handleBSplineSurface3dH(_g: BSplineSurface3dH): any;
  // (undocumented)
  handleChildren(g: GeometryQuery): any;
  // (undocumented)
  handleCone(_g: Cone): any;
  // (undocumented)
  handleCoordinateXYZ(_g: CoordinateXYZ): any;
  // (undocumented)
  handleCurveCollection(_g: CurveCollection): any;
  // (undocumented)
  handleIndexedPolyface(_g: IndexedPolyface): any;
  // (undocumented)
  handleLinearSweep(_g: LinearSweep): any;
  // (undocumented)
  handleLineSegment3d(_g: LineSegment3d): any;
  // (undocumented)
  handleLineString3d(_g: LineString3d): any;
  // (undocumented)
  handleLoop(g: Loop): any;
  // (undocumented)
  handleParityRegion(g: ParityRegion): any;
  // (undocumented)
  handlePath(g: Path): any;
  // (undocumented)
  handlePointString3d(_g: PointString3d): any;
  // (undocumented)
  handleRotationalSweep(_g: RotationalSweep): any;
  // (undocumented)
  handleRuledSweep(_g: RuledSweep): any;
  // (undocumented)
  handleSphere(_g: Sphere): any;
  // (undocumented)
  handleTorusPipe(_g: TorusPipe): any;
  // (undocumented)
  handleTransitionSpiral(_g: TransitionSpiral3d): any;
  // (undocumented)
  handleUnionRegion(g: UnionRegion): any;
}

// @public
class RecursiveCurveProcessor {
  protected constructor();
  // (undocumented)
  announceBagOfCurves(data: BagOfCurves, _indexInParent?: number): void;
  announceCurvePrimitive(_data: CurvePrimitive, _indexInParent?: number): void;
  announceLoop(data: Loop, _indexInParent?: number): void;
  announceParityRegion(data: ParityRegion, _indexInParent?: number): void;
  announcePath(data: Path, _indexInParent?: number): void;
  announceUnexpected(_data: AnyCurve, _indexInParent: number): void;
  announceUnionRegion(data: UnionRegion, _indexInParent?: number): void;
}

// @public
class RecursiveCurveProcessorWithStack extends RecursiveCurveProcessor {
  protected constructor();
  // (undocumented)
  protected _stack: CurveCollection[];
  // (undocumented)
  announceBagOfCurves(data: BagOfCurves, _indexInParent?: number): void;
  announceCurvePrimitive(_data: CurvePrimitive, _indexInParent?: number): void;
  announceLoop(data: Loop, indexInParent?: number): void;
  announceParityRegion(data: ParityRegion, _indexInParent?: number): void;
  announcePath(data: Path, indexInParent?: number): void;
  announceUnexpected(_data: AnyCurve, _indexInParent: number): void;
  announceUnionRegion(data: UnionRegion, indexInParent?: number): void;
  // (undocumented)
  enter(data: CurveCollection): void;
  // (undocumented)
  leave(): CurveCollection | undefined;
}

// @public (undocumented)
class RotationalSweep extends SolidPrimitive {
  // (undocumented)
  clone(): RotationalSweep;
  // (undocumented)
  cloneAxisRay(): Ray3d;
  // (undocumented)
  cloneTransformed(transform: Transform): RotationalSweep;
  // (undocumented)
  constantVSection(vFraction: number): CurveCollection | undefined;
  // (undocumented)
  static create(contour: CurveCollection, axis: Ray3d, sweepAngle: Angle, capped: boolean): RotationalSweep | undefined;
  // (undocumented)
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  // (undocumented)
  extendRange(range: Range3d, transform?: Transform): void;
  getConstructiveFrame(): Transform | undefined;
  // (undocumented)
  getCurves(): CurveCollection;
  // (undocumented)
  getFractionalRotationTransform(vFraction: number, result?: Transform): Transform;
  // (undocumented)
  getSweep(): Angle;
  // (undocumented)
  getSweepContourRef(): SweepContour;
  // (undocumented)
  isAlmostEqual(other: GeometryQuery): boolean;
  readonly isClosedVolume: boolean;
  // (undocumented)
  isSameGeometryClass(other: any): boolean;
  // (undocumented)
  tryTransformInPlace(transform: Transform): boolean;
}

// @public (undocumented)
class RuledSweep extends SolidPrimitive {
  // (undocumented)
  clone(): RuledSweep;
  // (undocumented)
  cloneContours(): CurveCollection[];
  // (undocumented)
  cloneSweepContours(): SweepContour[];
  // (undocumented)
  cloneTransformed(transform: Transform): RuledSweep;
  // (undocumented)
  constantVSection(vFraction: number): CurveCollection | undefined;
  // (undocumented)
  static create(contours: CurveCollection[], capped: boolean): RuledSweep | undefined;
  // (undocumented)
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  // (undocumented)
  extendRange(rangeToExtend: Range3d, transform?: Transform): void;
  getConstructiveFrame(): Transform | undefined;
  // (undocumented)
  isAlmostEqual(other: GeometryQuery): boolean;
  readonly isClosedVolume: boolean;
  // (undocumented)
  isSameGeometryClass(other: any): boolean;
  static mutatePartners(collectionA: CurveCollection, collectionB: CurveCollection, primitiveMutator: CurvePrimitiveMutator): CurveCollection | undefined;
  // (undocumented)
  sweepContoursRef(): SweepContour[];
  // (undocumented)
  tryTransformInPlace(transform: Transform): boolean;
}

// @public
class Segment1d {
  clone(): Segment1d;
  static create(x0?: number, x1?: number, result?: Segment1d): Segment1d;
  fractionToPoint(fraction: number): number;
  isAlmostEqual(other: Segment1d): boolean;
  readonly isExact01: boolean;
  // (undocumented)
  readonly isIn01: boolean;
  reverseInPlace(): void;
  set(x0: number, x1: number): void;
  setFrom(other: Segment1d): void;
  shift(dx: number): void;
  // (undocumented)
  x0: number;
  // (undocumented)
  x1: number;
}

// @public (undocumented)
class SmallSystem {
  // (undocumented)
  static linearSystem2d(ux: number, vx: number, // first row of matrix
      uy: number, vy: number, // second row of matrix
      cx: number, cy: number, // right side
      result: Vector2d): boolean;
  static linearSystem3d(axx: number, axy: number, axz: number, // first row of matrix
      ayx: number, ayy: number, ayz: number, // second row of matrix
      azx: number, azy: number, azz: number, // second row of matrix
      cx: number, cy: number, cz: number, // right side
      result?: Vector3d): Vector3d | undefined;
  static lineSegment2dXYTransverseIntersectionUnbounded(a0: Point2d, a1: Point2d, b0: Point2d, b1: Point2d, result: Vector2d): boolean;
  static lineSegment3dClosestApproachUnbounded(a0: Point3d, a1: Point3d, b0: Point3d, b1: Point3d, result: Vector2d): boolean;
  static lineSegment3dHXYClosestPointUnbounded(hA0: Point4d, hA1: Point4d, spacePoint: Point4d): number | undefined;
  static lineSegment3dHXYTransverseIntersectionUnbounded(hA0: Point4d, hA1: Point4d, hB0: Point4d, hB1: Point4d, result?: Vector2d): Vector2d | undefined;
  static lineSegment3dXYClosestPointUnbounded(pointA0: Point3d, pointA1: Point3d, spacePoint: Point3d): number | undefined;
  static lineSegment3dXYTransverseIntersectionUnbounded(a0: Point3d, a1: Point3d, b0: Point3d, b1: Point3d, result: Vector2d): boolean;
}

// @public (undocumented)
class SmoothTransformBetweenFrusta {
  static create(cornerA: Point3d[], cornerB: Point3d[]): SmoothTransformBetweenFrusta | undefined;
  // (undocumented)
  fractionToWorldCorners(fraction: number, result?: Point3d[]): Point3d[];
  // (undocumented)
  interpolateLocalCorners(fraction: number, result?: Point3d[]): Point3d[];
}

// @public
class SolidPrimitive extends GeometryQuery {
  protected constructor(capped: boolean);
  // (undocumented)
  protected _capped: boolean;
  capped: boolean;
  abstract constantVSection(_vFraction: number): CurveCollection | undefined;
  abstract getConstructiveFrame(): Transform | undefined;
  readonly isClosedVolume: boolean;
}

// @public
class Sphere extends SolidPrimitive, implements UVSurface {
  // (undocumented)
  clone(): Sphere;
  cloneCenter(): Point3d;
  cloneLatitudeSweep(): AngleSweep;
  // (undocumented)
  cloneLocalToWorld(): Transform;
  // (undocumented)
  cloneTransformed(transform: Transform): Sphere | undefined;
  cloneVectorX(): Vector3d;
  cloneVectorY(): Vector3d;
  cloneVectorZ(): Vector3d;
  // (undocumented)
  constantVSection(vFraction: number): CurveCollection | undefined;
  // (undocumented)
  static createCenterRadius(center: Point3d, radius: number, latitudeSweep?: AngleSweep): Sphere;
  static createDgnSphere(center: Point3d, vectorX: Vector3d, vectorZ: Vector3d, radiusXY: number, radiusZ: number, latitudeSweep: AngleSweep, capped: boolean): Sphere | undefined;
  static createEllipsoid(localToWorld: Transform, latitudeSweep: AngleSweep, capped: boolean): Sphere | undefined;
  static createFromAxesAndScales(center: Point3d, axes: undefined | Matrix3d, radiusX: number, radiusY: number, radiusZ: number, latitudeSweep: AngleSweep | undefined, capped: boolean): Sphere | undefined;
  // (undocumented)
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  // (undocumented)
  extendRange(range: Range3d, transform?: Transform): void;
  getConstructiveFrame(): Transform | undefined;
  // (undocumented)
  isAlmostEqual(other: GeometryQuery): boolean;
  readonly isClosedVolume: boolean;
  // (undocumented)
  isSameGeometryClass(other: any): boolean;
  readonly latitudeSweepFraction: number;
  maxIsoParametricDistance(): Vector2d;
  strokeConstantVSection(v: number, fixedStrokeCount: number | undefined, options?: StrokeOptions): LineString3d;
  // (undocumented)
  trueSphereRadius(): number | undefined;
  // (undocumented)
  tryTransformInPlace(transform: Transform): boolean;
  uFractionToRadians(u: number): number;
  uvFractionToPoint(uFraction: number, vFraction: number, result?: Point3d): Point3d;
  uvFractionToPointAndTangents(uFraction: number, vFraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  vFractionToRadians(v: number): number;
}

// @public
class SphereImplicit {
  constructor(r: number);
  // (undocumented)
  evaluateDerivativesThetaPhi(theta: number, phi: number, dxdTheta: Vector3d, dxdPhi: Vector3d): void;
  // (undocumented)
  evaluateImplicitFunction(x: number, y: number, z: number): number;
  // (undocumented)
  evaluateImplicitFunctionXYZW(wx: number, wy: number, wz: number, w: number): number;
  // (undocumented)
  evaluateThetaPhi(thetaRadians: number, phiRadians: number): Point3d;
  // (undocumented)
  radius: number;
  // (undocumented)
  xyzToThetaPhiR: {
    phi: number;
    r: number;
    theta: number;
    valid: boolean;
  }
}

// @public (undocumented)
enum StandardViewIndex {
  // (undocumented)
  Back = 6,
  // (undocumented)
  Bottom = 2,
  // (undocumented)
  Front = 5,
  // (undocumented)
  Iso = 7,
  // (undocumented)
  Left = 3,
  // (undocumented)
  Right = 4,
  // (undocumented)
  RightIso = 8,
  // (undocumented)
  Top = 1
}

// @public
class StrokeOptions {
  angleTol?: Angle;
  // (undocumented)
  applyAngleTol(minCount: number, sweepRadians: number, defaultStepRadians: number): number;
  // (undocumented)
  applyChordTol(minCount: number, radius: number, sweepRadians: number): number;
  // (undocumented)
  applyMaxEdgeLength(minCount: number, totalLength: number): number;
  // (undocumented)
  applyMinStrokesPerPrimitive(minCount: number): number;
  // (undocumented)
  applyTolerancesToArc(radius: number, sweepRadians?: number): number;
  chordTol?: number;
  // (undocumented)
  static createForCurves(): StrokeOptions;
  // (undocumented)
  static createForFacets(): StrokeOptions;
  // (undocumented)
  defaultCircleStrokes: number;
  // (undocumented)
  readonly hasMaxEdgeLength: boolean;
  maxEdgeLength?: number;
  minStrokesPerPrimitive?: number;
  // (undocumented)
  needColors?: boolean;
  needConvexFacets?: boolean;
  // (undocumented)
  needNormals: boolean;
  // (undocumented)
  needParams: boolean;
  shouldTriangulate: boolean;
}

// @public
class SweepContour {
  // (undocumented)
  axis: Ray3d | undefined;
  buildFacets(_builder: PolyfaceBuilder, options: StrokeOptions | undefined): void;
  // (undocumented)
  clone(): SweepContour;
  // (undocumented)
  cloneTransformed(transform: Transform): SweepContour | undefined;
  // (undocumented)
  static createForLinearSweep(contour: CurveCollection, defaultNormal?: Vector3d): SweepContour | undefined;
  // (undocumented)
  static createForRotation(contour: CurveCollection, axis: Ray3d): SweepContour | undefined;
  // (undocumented)
  curves: CurveCollection;
  emitFacets(builder: PolyfaceBuilder, reverse: boolean, transform?: Transform): void;
  // (undocumented)
  getCurves(): CurveCollection;
  // (undocumented)
  isAlmostEqual(other: any): boolean;
  // (undocumented)
  localToWorld: Transform;
  purgeFacets(): void;
  // (undocumented)
  tryTransformInPlace(transform: Transform): boolean;
}

// @public (undocumented)
class TorusImplicit {
  constructor(majorRadiusR: number, minorRadiusr: number);
  // (undocumented)
  boxSize(): number;
  // (undocumented)
  evaluateDerivativesThetaPhi(theta: number, phi: number, dxdTheta: Vector3d, dxdPhi: Vector3d): void;
  // (undocumented)
  evaluateImplicitFunctionPoint(xyz: Point3d): number;
  // (undocumented)
  evaluateImplicitFunctionXYZ(x: number, y: number, z: number): number;
  // (undocumented)
  evaluateImplicitFunctionXYZW(x: number, y: number, z: number, w: number): number;
  // (undocumented)
  evaluateThetaPhi(theta: number, phi: number): Point3d;
  // (undocumented)
  evaluateThetaPhiDistance(theta: number, phi: number, distance: number): Point3d;
  // (undocumented)
  implicitFunctionScale(): number;
  // (undocumented)
  majorRadius: number;
  // (undocumented)
  minorRadius: number;
  xyzToThetaPhiDistance: {
    distance: number;
    phi: number;
    rho: number;
    safePhi: boolean;
    theta: number;
  }
}

// @public
class TorusPipe extends SolidPrimitive, implements UVSurface, UVSurfaceIsoParametricDistance {
  protected constructor(map: Transform, radiusA: number, radiusB: number, sweep: Angle, capped: boolean);
  // (undocumented)
  clone(): TorusPipe;
  // (undocumented)
  cloneCenter(): Point3d;
  // (undocumented)
  cloneTransformed(transform: Transform): TorusPipe | undefined;
  // (undocumented)
  cloneVectorX(): Vector3d;
  // (undocumented)
  cloneVectorY(): Vector3d;
  // (undocumented)
  constantUSection(uFraction: number): CurveCollection | undefined;
  // (undocumented)
  constantVSection(v: number): CurveCollection | undefined;
  static createDgnTorusPipe(center: Point3d, vectorX: Vector3d, vectorY: Vector3d, majorRadius: number, minorRadius: number, sweep: Angle, capped: boolean): TorusPipe | undefined;
  // (undocumented)
  static createInFrame(frame: Transform, majorRadius: number, minorRadius: number, sweep: Angle, capped: boolean): TorusPipe | undefined;
  // (undocumented)
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  // (undocumented)
  extendRange(range: Range3d, transform?: Transform): void;
  getConstructiveFrame(): Transform | undefined;
  // (undocumented)
  getIsReversed(): boolean;
  // (undocumented)
  getMajorRadius(): number;
  // (undocumented)
  getMinorRadius(): number;
  // (undocumented)
  getSweepAngle(): Angle;
  // (undocumented)
  getThetaFraction(): number;
  // (undocumented)
  isAlmostEqual(other: GeometryQuery): boolean;
  readonly isClosedVolume: boolean;
  // (undocumented)
  isSameGeometryClass(other: any): boolean;
  maxIsoParametricDistance(): Vector2d;
  // (undocumented)
  tryTransformInPlace(transform: Transform): boolean;
  uvFractionToPoint(u: number, v: number, result?: Point3d): Point3d;
  uvFractionToPointAndTangents(u: number, v: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
  vFractionToRadians(v: number): number;
}

// @public
class Transform implements BeJSONFunctions {
  clone(result?: Transform): Transform;
  // (undocumented)
  cloneRigid(axisOrder?: AxisOrder): Transform | undefined;
  static createFixedPointAndMatrix(fixedPoint: Point3d, matrix: Matrix3d, result?: Transform): Transform;
  static createIdentity(result?: Transform): Transform;
  static createMatrixPickupPutdown(matrix: Matrix3d, pointA: Point3d, pointB: Point3d, result?: Transform): Transform;
  static createOriginAndMatrix(origin: XYZ | undefined, matrix: Matrix3d | undefined, result?: Transform): Transform;
  static createOriginAndMatrixColumns(origin: XYZ, vectorX: Vector3d, vectorY: Vector3d, vectorZ: Vector3d, result?: Transform): Transform;
  static createRefs(origin: XYZ, matrix: Matrix3d, result?: Transform): Transform;
  static createRowValues(qxx: number, qxy: number, qxz: number, ax: number, qyx: number, qyy: number, qyz: number, ay: number, qzx: number, qzy: number, qzz: number, az: number, result?: Transform): Transform;
  static createScaleAboutPoint(fixedPoint: Point3d, scale: number, result?: Transform): Transform;
  static createTranslation(translation: XYZ, result?: Transform): Transform;
  static createTranslationXYZ(x?: number, y?: number, z?: number, result?: Transform): Transform;
  static createZero(result?: Transform): Transform;
  // (undocumented)
  freeze(): void;
  // (undocumented)
  static fromJSON(json?: TransformProps): Transform;
  getOrigin(): Point3d;
  getTranslation(): Vector3d;
  static readonly identity: Transform;
  static initFromRange(min: Point3d, max: Point3d, npcToGlobal?: Transform, globalToNpc?: Transform): void;
  // (undocumented)
  inverse(): Transform | undefined;
  isAlmostEqual(other: Transform): boolean;
  readonly isIdentity: boolean;
  // (undocumented)
  static matchArrayLengths(source: any[], dest: any[], constructionFunction: () => any): number;
  readonly matrix: Matrix3d;
  multiplyComponentXYZ(componentIndex: number, x: number, y: number, z: number): number;
  multiplyComponentXYZW(componentIndex: number, x: number, y: number, z: number, w: number): number;
  // (undocumented)
  multiplyInversePoint3d(point: XYAndZ, result?: Point3d): Point3d | undefined;
  multiplyInversePoint3dArray(source: Point3d[], result?: Point3d[]): Point3d[] | undefined;
  multiplyInversePoint3dArrayInPlace(source: Point3d[]): boolean;
  multiplyPoint2d(source: XAndY, result?: Point2d): Point2d;
  multiplyPoint2dArray(source: Point2d[], result?: Point2d[]): Point2d[];
  multiplyPoint3d(point: XYAndZ, result?: Point3d): Point3d;
  multiplyPoint3dArray(source: Point3d[], result?: Point3d[]): Point3d[];
  multiplyPoint3dArrayInPlace(points: Point3d[]): void;
  multiplyRange(range: Range3d, result?: Range3d): Range3d;
  multiplyTransformMatrix3d(other: Matrix3d, result?: Transform): Transform;
  multiplyTransformTransform(other: Transform, result?: Transform): Transform;
  multiplyTransposeXYZW(x: number, y: number, z: number, w: number, result?: Point4d): Point4d;
  multiplyVector(vector: Vector3d, result?: Vector3d): Vector3d;
  multiplyVectorXYZ(x: number, y: number, z: number, result?: Vector3d): Vector3d;
  multiplyXYZ(x: number, y: number, z: number, result?: Point3d): Point3d;
  multiplyXYZToFloat64Array(x: number, y: number, z: number, result?: Float64Array): Float64Array;
  multiplyXYZW(x: number, y: number, z: number, w: number, result?: Point4d): Point4d;
  multiplyXYZWToFloat64Array(x: number, y: number, z: number, w: number, result?: Float64Array): Float64Array;
  readonly origin: XYZ;
  // (undocumented)
  setFrom(other: Transform): void;
  // (undocumented)
  setFromJSON(json?: TransformProps): void;
  setIdentity(): void;
  setMultiplyTransformTransform(transformA: Transform, transformB: Transform): void;
  setOriginAndMatrixColumns(origin: XYZ, vectorX: Vector3d, vectorY: Vector3d, vectorZ: Vector3d): void;
  // (undocumented)
  toJSON(): TransformProps;
}

// @public
class TransitionConditionalProperties {
  constructor(radius0: number | undefined, radius1: number | undefined, bearing0: Angle | undefined, bearing1: Angle | undefined, arcLength: number | undefined);
  // (undocumented)
  bearing0: Angle | undefined;
  // (undocumented)
  bearing1: Angle | undefined;
  clone(): TransitionConditionalProperties;
  // (undocumented)
  curveLength: number | undefined;
  isAlmostEqual(other: TransitionConditionalProperties): boolean;
  numDefinedProperties(): number;
  // (undocumented)
  radius0: number | undefined;
  // (undocumented)
  radius1: number | undefined;
  tryResolveAnySingleUnknown(): boolean;
}

// WARNING: defaultSpiralType has incomplete type information
// @public (undocumented)
class TransitionSpiral3d extends CurvePrimitive {
  constructor(spiralType: string | undefined, radius01: Segment1d, bearing01: AngleSweep, activeFractionInterval: Segment1d, localToWorld: Transform, arcLength: number, properties: TransitionConditionalProperties | undefined);
  // (undocumented)
  activeFractionInterval: Segment1d;
  // (undocumented)
  static averageCurvature(radiusLimits: Segment1d): number;
  static averageCurvatureR0R1(r0: number, r1: number): number;
  // (undocumented)
  bearing01: AngleSweep;
  // (undocumented)
  clone(): TransitionSpiral3d;
  // (undocumented)
  cloneTransformed(transform: Transform): TransitionSpiral3d;
  computeStrokeCountForOptions(options?: StrokeOptions): number;
  static create(spiralType: string | undefined, radius0: number | undefined, radius1: number | undefined, bearing0: Angle | undefined, bearing1: Angle | undefined, arcLength: number | undefined, fractionInterval: undefined | Segment1d, localToWorld: Transform): TransitionSpiral3d | undefined;
  static createRadiusRadiusBearingBearing(radius01: Segment1d, bearing01: AngleSweep, activeFractionInterval: Segment1d, localToWorld: Transform): TransitionSpiral3d;
  // (undocumented)
  static curvatureToRadius(curvature: number): number;
  curveLength(): number;
  // (undocumented)
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  // (undocumented)
  emitStrokableParts(dest: IStrokeHandler, options?: StrokeOptions): void;
  // (undocumented)
  emitStrokes(dest: LineString3d, options?: StrokeOptions): void;
  // (undocumented)
  endPoint(): Point3d;
  // (undocumented)
  extendRange(rangeToExtend: Range3d, transform?: Transform): void;
  fractionToBearingRadians(fraction: number): number;
  fractionToCurvature(fraction: number): number;
  fractionToFrenetFrame(fraction: number, result?: Transform): Transform;
  // (undocumented)
  fractionToPoint(fraction: number, result?: Point3d): Point3d;
  fractionToPointAnd2Derivatives(fraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors | undefined;
  // (undocumented)
  fractionToPointAndDerivative(fraction: number, result?: Ray3d): Ray3d;
  getSpiralType(): string;
  // (undocumented)
  static initWorkSpace(): void;
  // (undocumented)
  isAlmostEqual(other: GeometryQuery): boolean;
  // (undocumented)
  isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean;
  // (undocumented)
  isSameGeometryClass(other: any): boolean;
  // (undocumented)
  localToWorld: Transform;
  readonly originalProperties: TransitionConditionalProperties | undefined;
  quickLength(): number;
  // (undocumented)
  radius01: Segment1d;
  // (undocumented)
  static radius0LengthSweepRadiansToRadius1(radius0: number, arcLength: number, sweepRadians: number): number;
  // (undocumented)
  static radius1LengthSweepRadiansToRadius0(radius1: number, arcLength: number, sweepRadians: number): number;
  // (undocumented)
  static radiusRadiusLengthToSweepRadians(radius0: number, radius1: number, arcLength: number): number;
  // (undocumented)
  static radiusRadiusSweepRadiansToArcLength(radius0: number, radius1: number, sweepRadians: number): number;
  // (undocumented)
  static radiusToCurvature(radius: number): number;
  // (undocumented)
  refreshComputedProperties(): void;
  // (undocumented)
  reverseInPlace(): void;
  // (undocumented)
  setFrom(other: TransitionSpiral3d): TransitionSpiral3d;
  // (undocumented)
  startPoint(): Point3d;
  // (undocumented)
  tryTransformInPlace(transform: Transform): boolean;
}

// @public (undocumented)
class Triangulator {
  static createTriangulatedGraphFromLoops(loops: GrowableXYZArray[] | XAndY[][]): HalfEdgeGraph | undefined;
  static createTriangulatedGraphFromSingleLoop(data: XAndY[]): HalfEdgeGraph;
  static flipTriangles(graph: HalfEdgeGraph): void;
  triangulateAllPositiveAreaFaces(graph: HalfEdgeGraph): void;
}

// @public (undocumented)
class TriDiagonalSystem {
  constructor(n: number);
  // (undocumented)
  addToB(row: number, bb: number): void;
  // (undocumented)
  addToRow(row: number, left: number, diag: number, right: number): void;
  // (undocumented)
  copy(): TriDiagonalSystem;
  // (undocumented)
  defactor(): boolean;
  // (undocumented)
  factor(): boolean;
  // (undocumented)
  factorAndBackSubstitute(): boolean;
  // (undocumented)
  factorAndBackSubstitutePointArrays(vectorB: Point3d[], vectorX: Point3d[]): boolean;
  // (undocumented)
  flatten(): any;
  // (undocumented)
  flattenWithPoints(xyzB: Point3d[]): any;
  // (undocumented)
  getB(row: number): number;
  // (undocumented)
  getX(row: number): number;
  // (undocumented)
  multiplyAX(): boolean;
  // (undocumented)
  multiplyAXPoints(pointX: Point3d[], pointB: Point3d[]): boolean;
  // (undocumented)
  order(): number;
  // (undocumented)
  reset(): void;
  // (undocumented)
  setB(row: number, bb: number): void;
  // (undocumented)
  setRow(row: number, left: number, diag: number, right: number): void;
  // (undocumented)
  setX(row: number, xx: number): void;
}

// WARNING: coeffientRelTol has incomplete type information
// @public (undocumented)
class TrigPolynomial {
  // (undocumented)
  static readonly C: Float64Array;
  // (undocumented)
  static readonly CC: Float64Array;
  // (undocumented)
  static readonly CCminusSS: Float64Array;
  // (undocumented)
  static readonly CW: Float64Array;
  // (undocumented)
  static readonly S: Float64Array;
  // (undocumented)
  static readonly SC: Float64Array;
  // (undocumented)
  static readonly SmallAngle: number;
  // (undocumented)
  static solveAngles(coff: Float64Array, nominalDegree: number, referenceCoefficient: number, radians: number[]): boolean;
  // (undocumented)
  static solveUnitCircleEllipseIntersection(cx: number, cy: number, ux: number, uy: number, vx: number, vy: number, ellipseRadians: number[], circleRadians: number[]): boolean;
  // (undocumented)
  static solveUnitCircleHomogeneousEllipseIntersection(cx: number, cy: number, cw: number, ux: number, uy: number, uw: number, vx: number, vy: number, vw: number, ellipseRadians: number[], circleRadians: number[]): boolean;
  // (undocumented)
  static solveUnitCircleImplicitQuadricIntersection(axx: number, axy: number, ayy: number, ax: number, ay: number, a1: number, radians: number[]): boolean;
  // (undocumented)
  static readonly SS: Float64Array;
  // (undocumented)
  static readonly SW: Float64Array;
  // (undocumented)
  static readonly W: Float64Array;
  // (undocumented)
  static readonly WW: Float64Array;
}

// @public (undocumented)
interface TrigValues {
  // (undocumented)
  c: number;
  // (undocumented)
  radians: number;
  // (undocumented)
  s: number;
}

// @public
class UnionOfConvexClipPlaneSets implements Clipper {
  // (undocumented)
  addConvexSet(toAdd: ConvexClipPlaneSet): void;
  // (undocumented)
  addOutsideZClipSets(invisible: boolean, zLow?: number, zHigh?: number): void;
  // (undocumented)
  announceClippedArcIntervals(arc: Arc3d, announce?: AnnounceNumberNumberCurvePrimitive): boolean;
  announceClippedSegmentIntervals(f0: number, f1: number, pointA: Point3d, pointB: Point3d, announce?: (fraction0: number, fraction1: number) => void): boolean;
  appendIntervalsFromSegment(segment: LineSegment3d, intervals: Segment1d[]): void;
  classifyPointContainment(points: Point3d[], onIsOutside: boolean): number;
  // (undocumented)
  clone(result?: UnionOfConvexClipPlaneSets): UnionOfConvexClipPlaneSets;
  // (undocumented)
  readonly convexSets: ConvexClipPlaneSet[];
  // (undocumented)
  static createConvexSets(convexSets: ConvexClipPlaneSet[], result?: UnionOfConvexClipPlaneSets): UnionOfConvexClipPlaneSets;
  // (undocumented)
  static createEmpty(result?: UnionOfConvexClipPlaneSets): UnionOfConvexClipPlaneSets;
  // (undocumented)
  static fromJSON(json: any, result?: UnionOfConvexClipPlaneSets): UnionOfConvexClipPlaneSets;
  getRangeOfAlignedPlanes(transform?: Transform, result?: Range3d): Range3d | undefined;
  // (undocumented)
  getRayIntersection(point: Point3d, direction: Vector3d): number | undefined;
  // (undocumented)
  isAlmostEqual(other: UnionOfConvexClipPlaneSets): boolean;
  isAnyPointInOrOnFromSegment(segment: LineSegment3d): boolean;
  // (undocumented)
  isPointInside(point: Point3d): boolean;
  // (undocumented)
  isPointOnOrInside(point: Point3d, tolerance: number): boolean;
  // (undocumented)
  isSphereInside(point: Point3d, radius: number): boolean;
  // (undocumented)
  multiplyPlanesByMatrix(matrix: Matrix4d): void;
  polygonClip(input: Point3d[], output: Point3d[][]): void;
  // (undocumented)
  setInvisible(invisible: boolean): void;
  // (undocumented)
  testRayIntersect(point: Point3d, direction: Vector3d): boolean;
  // (undocumented)
  toJSON(): any;
  // (undocumented)
  transformInPlace(transform: Transform): void;
}

// @public
class UnionRegion extends CurveCollection {
  constructor();
  // (undocumented)
  protected _children: Array<ParityRegion | Loop>;
  // (undocumented)
  announceToCurveProcessor(processor: RecursiveCurveProcessor, indexInParent?: number): void;
  // (undocumented)
  readonly children: Array<ParityRegion | Loop>;
  // (undocumented)
  cloneEmptyPeer(): UnionRegion;
  // (undocumented)
  cloneStroked(options?: StrokeOptions): UnionRegion;
  // (undocumented)
  static create(...data: Array<ParityRegion | Loop>): UnionRegion;
  // (undocumented)
  dgnBoundaryType(): number;
  // (undocumented)
  dispatchToGeometryHandler(handler: GeometryHandler): any;
  // (undocumented)
  getChild(i: number): Loop | ParityRegion | undefined;
  // (undocumented)
  isSameGeometryClass(other: GeometryQuery): boolean;
  // (undocumented)
  tryAddChild(child: AnyCurve): boolean;
}

// @public
class UnivariateBezier extends BezierCoffs {
  constructor(data: number | Float64Array | number[]);
  addSquaredSquaredBezier(coffA: Float64Array, scale: number): boolean;
  allocateOrder(order: number): void;
  basisFunctions(u: number, result?: Float64Array): Float64Array;
  clone(compressToMinimalAllocation?: boolean): UnivariateBezier;
  static create(other: BezierCoffs): UnivariateBezier;
  static createArraySubset(coffs: number[] | Float64Array, index0: number, order: number, result?: UnivariateBezier): UnivariateBezier;
  static createCoffs(data: number | number[] | Float64Array): UnivariateBezier;
  static createProduct(bezierA: BezierCoffs, bezierB: BezierCoffs): UnivariateBezier;
  deflateLeft(): void;
  deflateRight(): void;
  deflateRoot(root: number): number;
  // (undocumented)
  static deflateRoots01(bezier: UnivariateBezier): number[] | undefined;
  evaluate(u: number): number;
  // (undocumented)
  readonly order: number;
  runNewton(startFraction: number, tolerance?: number): number | undefined;
  sumBasisFunctionDerivatives(u: number, polygon: Float64Array, blockSize: number, result?: Float64Array): Float64Array;
  sumBasisFunctions(u: number, polygon: Float64Array, blockSize: number, result?: Float64Array): Float64Array;
}

// @public
enum UVSelect {
  // (undocumented)
  uDirection = 0,
  // (undocumented)
  VDirection = 1
}

// @public
interface UVSurface {
  uvFractionToPoint(uFraction: number, vFraction: number, result?: Point3d): Point3d;
  uvFractionToPointAndTangents(uFraction: number, vFraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
}

// @public
interface UVSurfaceIsoParametricDistance {
  maxIsoParametricDistance(): Vector2d;
}

// @public
class UVSurfaceOps {
  static createLinestringOnUVLine(surface: UVSurface, u0: number, v0: number, u1: number, v1: number, numEdge: number, saveUV?: boolean, saveFraction?: boolean): LineString3d;
}

// @public
class Vector2d extends XY, implements BeJSONFunctions {
  constructor(x?: number, y?: number);
  angleTo(vectorB: XAndY): Angle;
  // (undocumented)
  clone(): Vector2d;
  // (undocumented)
  static create(x?: number, y?: number, result?: Vector2d): Vector2d;
  static createFrom(data: XAndY | Float64Array, result?: Vector2d): Vector2d;
  static createOffsetBisector(unitPerpA: Vector2d, unitPerpB: Vector2d, offset: number): Vector2d | undefined;
  // (undocumented)
  static createPolar(r: number, theta: Angle): Vector2d;
  // (undocumented)
  static createStartEnd(point0: XAndY, point1: XAndY, result?: Vector2d): Vector2d;
  // (undocumented)
  static createZero(result?: Vector2d): Vector2d;
  crossProduct(vectorB: XAndY): number;
  dotProduct(vectorB: XAndY): number;
  dotProductStartEnd(pointA: XAndY, pointB: XAndY): number;
  fractionOfProjectionToVector(target: Vector2d, defaultFraction?: number): number;
  // (undocumented)
  static fromJSON(json?: XYProps): Vector2d;
  interpolate(fraction: number, right: Vector2d, result?: Vector2d): Vector2d;
  // (undocumented)
  isParallelTo(other: Vector2d, oppositeIsParallel?: boolean): boolean;
  // (undocumented)
  isPerpendicularTo(other: Vector2d): boolean;
  minus(vector: XAndY, result?: Vector2d): Vector2d;
  negate(result?: Vector2d): Vector2d;
  // (undocumented)
  normalize(result?: Vector2d): Vector2d | undefined;
  plus(vector: XAndY, result?: Vector2d): Vector2d;
  plus2Scaled(vectorA: XAndY, scalarA: number, vectorB: XAndY, scalarB: number, result?: Vector2d): Vector2d;
  plus3Scaled(vectorA: XAndY, scalarA: number, vectorB: XAndY, scalarB: number, vectorC: XAndY, scalarC: number, result?: Vector2d): Vector2d;
  plusScaled(vector: XAndY, scaleFactor: number, result?: Vector2d): Vector2d;
  // (undocumented)
  rotate90CCWXY(result?: Vector2d): Vector2d;
  // (undocumented)
  rotate90CWXY(result?: Vector2d): Vector2d;
  // (undocumented)
  rotateXY(angle: Angle, result?: Vector2d): Vector2d;
  // (undocumented)
  safeDivideOrNull(denominator: number, result?: Vector2d): Vector2d | undefined;
  scale(scale: number, result?: Vector2d): Vector2d;
  scaleToLength(length: number, result?: Vector2d): Vector2d;
  // (undocumented)
  unitPerpendicularXY(result?: Vector2d): Vector2d;
  // (undocumented)
  static unitX(scale?: number): Vector2d;
  // (undocumented)
  static unitY(scale?: number): Vector2d;
}

// @public
class Vector3d extends XYZ {
  constructor(x?: number, y?: number, z?: number);
  addCrossProductToTargetsInPlace(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): void;
  // (undocumented)
  angleTo(vectorB: Vector3d): Angle;
  // (undocumented)
  angleToXY(vectorB: Vector3d): Angle;
  clone(result?: Vector3d): Vector3d;
  static create(x?: number, y?: number, z?: number, result?: Vector3d): Vector3d;
  static createAdd2Scaled(vectorA: XYAndZ, scaleA: number, vectorB: XYAndZ, scaleB: number, result?: Vector3d): Vector3d;
  static createAdd2ScaledXYZ(ax: number, ay: number, az: number, scaleA: number, bx: number, by: number, bz: number, scaleB: number, result?: Vector3d): Vector3d;
  // (undocumented)
  static createAdd3Scaled(vectorA: XYAndZ, scaleA: number, vectorB: XYAndZ, scaleB: number, vectorC: XYAndZ, scaleC: number, result?: Vector3d): Vector3d;
  static createCrossProduct(ux: number, uy: number, uz: number, vx: number, vy: number, vz: number, result?: Vector3d): Vector3d;
  static createCrossProductToPoints(origin: XYAndZ, pointA: XYAndZ, pointB: XYAndZ, result?: Vector3d): Vector3d;
  static createFrom(data: XYAndZ | XAndY | Float64Array, result?: Vector3d): Vector3d;
  static createPolar(r: number, theta: Angle, z?: number): Vector3d;
  static createRotateVectorAroundVector(vector: Vector3d, axis: Vector3d, angle?: Angle): Vector3d | undefined;
  static createSpherical(r: number, theta: Angle, phi: Angle): Vector3d;
  static createStartEnd(start: XYAndZ, end: XYAndZ, result?: Vector3d): Vector3d;
  // (undocumented)
  static createStartEndXYZXYZ(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, result?: Vector3d): Vector3d;
  static createZero(result?: Vector3d): Vector3d;
  // (undocumented)
  crossProduct(vectorB: Vector3d, result?: Vector3d): Vector3d;
  crossProductMagnitude(vectorB: XYAndZ): number;
  crossProductMagnitudeSquared(vectorB: XYAndZ): number;
  crossProductStartEnd(pointA: Point3d, pointB: Point3d, result?: Vector3d): Vector3d;
  crossProductStartEndXY(pointA: Point3d, pointB: Point3d): number;
  crossProductXY(vectorB: Vector3d): number;
  crossProductXYZ(x: number, y: number, z: number, result?: Vector3d): Vector3d;
  // (undocumented)
  dotProduct(vectorB: XYAndZ): number;
  dotProductStart3dEnd4d(pointA: Point3d, pointB: Point4d): number;
  // (undocumented)
  dotProductStartEnd(pointA: XYAndZ, pointB: XYAndZ): number;
  dotProductStartEndXYZ(pointA: Point3d, x: number, y: number, z: number): number;
  dotProductStartEndXYZW(pointA: Point3d, x: number, y: number, z: number, w: number): number;
  dotProductXY(vectorB: Vector3d): number;
  dotProductXYZ(x: number, y: number, z?: number): number;
  fractionOfProjectionToVector(target: Vector3d, defaultFraction?: number): number;
  // (undocumented)
  static fromJSON(json?: XYZProps): Vector3d;
  // (undocumented)
  interpolate(fraction: number, right: Vector3d, result?: Vector3d): Vector3d;
  isParallelTo(other: Vector3d, oppositeIsParallel?: boolean, returnValueIfAnInputIsZeroLength?: boolean): boolean;
  isPerpendicularTo(other: Vector3d, returnValueIfAnInputIsZeroLength?: boolean): boolean;
  // (undocumented)
  minus(vector: XYAndZ, result?: Vector3d): Vector3d;
  negate(result?: Vector3d): Vector3d;
  normalize(result?: Vector3d): Vector3d | undefined;
  normalizeInPlace(): boolean;
  // (undocumented)
  normalizeWithDefault(x: number, y: number, z: number, result?: Vector3d): Vector3d;
  normalizeWithLength: {
    mag: number;
    v: Vector3d | undefined;
  }
  // (undocumented)
  planarAngleTo(vector: Vector3d, planeNormal: Vector3d): Angle;
  // (undocumented)
  planarRadiansTo(vector: Vector3d, planeNormal: Vector3d): number;
  // (undocumented)
  plus(vector: XYAndZ, result?: Vector3d): Vector3d;
  plus2Scaled(vectorA: XYAndZ, scalarA: number, vectorB: XYAndZ, scalarB: number, result?: Vector3d): Vector3d;
  plus3Scaled(vectorA: XYAndZ, scalarA: number, vectorB: XYAndZ, scalarB: number, vectorC: XYAndZ, scalarC: number, result?: Vector3d): Vector3d;
  plusScaled(vector: XYAndZ, scaleFactor: number, result?: Vector3d): Vector3d;
  // (undocumented)
  rotate90Around(axis: Vector3d, result?: Vector3d): Vector3d | undefined;
  rotate90CCWXY(result?: Vector3d): Vector3d;
  // (undocumented)
  rotate90Towards(target: Vector3d, result?: Vector3d): Vector3d | undefined;
  // (undocumented)
  rotateXY(angle: Angle, result?: Vector3d): Vector3d;
  safeDivideOrNull(denominator: number, result?: Vector3d): Vector3d | undefined;
  scale(scale: number, result?: Vector3d): Vector3d;
  // (undocumented)
  scaleToLength(length: number, result?: Vector3d): Vector3d;
  setStartEnd(point0: XYAndZ, point1: XYAndZ): void;
  // (undocumented)
  signedAngleTo(vector1: Vector3d, vectorW: Vector3d): Angle;
  // (undocumented)
  signedRadiansTo(vector1: Vector3d, vectorW: Vector3d): number;
  // (undocumented)
  sizedCrossProduct(vectorB: Vector3d, productLength: number, result?: Vector3d): Vector3d | undefined;
  tripleProduct(vectorB: Vector3d, vectorC: Vector3d): number;
  // (undocumented)
  tryNormalizeInPlace(smallestMagnitude?: number): boolean;
  // (undocumented)
  unitCrossProduct(vectorB: Vector3d, result?: Vector3d): Vector3d | undefined;
  // (undocumented)
  unitCrossProductWithDefault(vectorB: Vector3d, x: number, y: number, z: number, result?: Vector3d): Vector3d;
  // (undocumented)
  unitPerpendicularXY(result?: Vector3d): Vector3d;
  static unitX(scale?: number): Vector3d;
  static unitY(scale?: number): Vector3d;
  static unitZ(scale?: number): Vector3d;
}

// @public (undocumented)
class Vector3dArray {
  // (undocumented)
  static cloneVector3dArray(data: XYAndZ[]): Vector3d[];
  // (undocumented)
  static isAlmostEqual(dataA: undefined | Vector3d[], dataB: undefined | Vector3d[]): boolean;
}

// @public (undocumented)
enum WeightStyle {
  UnWeighted = 0,
  WeightsAlreadyAppliedToCoordinates = 1,
  WeightsSeparateFromCoordinates = 2
}

// @public (undocumented)
interface WritableLowAndHighXY {
  // (undocumented)
  high: WritableXAndY;
  // (undocumented)
  low: WritableXAndY;
}

// @public (undocumented)
interface WritableLowAndHighXYZ {
  // (undocumented)
  high: WritableXYAndZ;
  // (undocumented)
  low: WritableXYAndZ;
}

// @public (undocumented)
interface WritableXAndY {
  // (undocumented)
  x: number;
  // (undocumented)
  y: number;
}

// @public (undocumented)
interface WritableXYAndZ extends XAndY, WriteableHasZ {
}

// @public (undocumented)
interface WriteableHasZ {
  // (undocumented)
  z: number;
}

// @public
class XY implements XAndY {
  protected constructor(x?: number, y?: number);
  static crossProductToPoints(origin: XAndY, targetA: XAndY, targetB: XAndY): number;
  distance(other: XAndY): number;
  distanceSquared(other: XAndY): number;
  // (undocumented)
  freeze(): void;
  isAlmostEqual(other: XAndY, tol?: number): boolean;
  // (undocumented)
  isAlmostEqualMetric(other: XAndY): boolean;
  isAlmostEqualXY(x: number, y: number, tol?: number): boolean;
  // (undocumented)
  readonly isAlmostZero: boolean;
  // (undocumented)
  isExactEqual(other: XAndY): boolean;
  magnitude(): number;
  magnitudeSquared(): number;
  maxAbs(): number;
  maxDiff(other: XAndY): number;
  set(x?: number, y?: number): void;
  setFrom(other?: XAndY): void;
  setFromJSON(json?: XYProps): void;
  setZero(): void;
  toJSON(): XYProps;
  // (undocumented)
  toJSONXY(): XYProps;
  unitVectorTo(target: XAndY, result?: Vector2d): Vector2d | undefined;
  vectorTo(other: XAndY, result?: Vector2d): Vector2d;
  x: number;
  y: number;
}

// @public
class XYZ implements XYAndZ {
  protected constructor(x?: number, y?: number, z?: number);
  addInPlace(other: XYAndZ): void;
  addScaledInPlace(other: XYAndZ, scale: number): void;
  at(index: number): number;
  cloneAsPoint3d(): Point3d;
  distance(other: XYAndZ): number;
  distanceSquared(other: XYAndZ): number;
  distanceSquaredXY(other: XAndY): number;
  distanceXY(other: XAndY): number;
  freeze(): void;
  static hasZ(arg: any): arg is HasZ;
  indexOfMaxAbs(): number;
  isAlmostEqual(other: XYAndZ, tol?: number): boolean;
  isAlmostEqualMetric(other: XYAndZ): boolean;
  isAlmostEqualXY(other: XAndY, tol?: number): boolean;
  isAlmostEqualXYZ(x: number, y: number, z: number, tol?: number): boolean;
  readonly isAlmostZero: boolean;
  isExactEqual(other: XYAndZ): boolean;
  static isXAndY(arg: any): arg is XAndY;
  static isXYAndZ(arg: any): arg is XYAndZ;
  magnitude(): number;
  magnitudeSquared(): number;
  magnitudeSquaredXY(): number;
  magnitudeXY(): number;
  maxAbs(): number;
  maxDiff(other: XYAndZ): number;
  scaledVectorTo(other: XYAndZ, scale: number, result?: Vector3d): Vector3d;
  scaleInPlace(scale: number): void;
  set(x?: number, y?: number, z?: number): void;
  setFrom(other: Float64Array | XAndY | XYAndZ): void;
  setFromJSON(json?: XYZProps): void;
  setFromPoint3d(other: Point3d): void;
  setFromVector3d(other: Vector3d): void;
  setZero(): void;
  toFloat64Array(): Float64Array;
  toJSON(): XYZProps;
  // (undocumented)
  toJSONXYZ(): XYZProps;
  unitVectorTo(target: XYAndZ, result?: Vector3d): Vector3d | undefined;
  vectorTo(other: XYAndZ, result?: Vector3d): Vector3d;
  // (undocumented)
  x: number;
  // (undocumented)
  y: number;
  // (undocumented)
  z: number;
}

// @public
class YawPitchRollAngles {
  constructor(yaw?: Angle, pitch?: Angle, roll?: Angle);
  clone(): YawPitchRollAngles;
  static createDegrees(yawDegrees: number, pitchDegrees: number, rollDegrees: number): YawPitchRollAngles;
  static createFromMatrix3d(matrix: Matrix3d, result?: YawPitchRollAngles): YawPitchRollAngles | undefined;
  static createRadians(yawRadians: number, pitchRadians: number, rollRadians: number): YawPitchRollAngles;
  freeze(): void;
  // (undocumented)
  static fromJSON(json?: YawPitchRollProps): YawPitchRollAngles;
  isAlmostEqual(other: YawPitchRollAngles): boolean;
  // (undocumented)
  isIdentity(allowPeriodShift?: boolean): boolean;
  maxAbsDegrees(): number;
  // (undocumented)
  maxAbsRadians(): number;
  maxDiffRadians(other: YawPitchRollAngles): number;
  // (undocumented)
  pitch: Angle;
  // (undocumented)
  roll: Angle;
  setFrom(other: YawPitchRollAngles): void;
  // (undocumented)
  setFromJSON(json?: YawPitchRollProps): void;
  sumSquaredDegrees(): number;
  sumSquaredRadians(): number;
  toJSON(): YawPitchRollProps;
  toMatrix3d(result?: Matrix3d): Matrix3d;
  static tryFromTransform: {
    angles: YawPitchRollAngles | undefined;
    origin: Point3d;
  }
  // (undocumented)
  yaw: Angle;
}

// @public
interface YawPitchRollProps {
  // (undocumented)
  pitch?: AngleProps;
  // (undocumented)
  roll?: AngleProps;
  // (undocumented)
  yaw?: AngleProps;
}

// WARNING: Unsupported export: OptionalGrowableFloat64Array
// WARNING: Unsupported export: BlockComparisonFunction
// WARNING: Unsupported export: HasZ
// WARNING: Unsupported export: XAndY
// WARNING: Unsupported export: XYAndZ
// WARNING: Unsupported export: LowAndHighXY
// WARNING: Unsupported export: LowAndHighXYZ
// WARNING: Unsupported export: XYZProps
// WARNING: Unsupported export: XYProps
// WARNING: Unsupported export: Matrix3dProps
// WARNING: Unsupported export: TransformProps
// WARNING: Unsupported export: Range3dProps
// WARNING: Unsupported export: Range2dProps
// WARNING: Unsupported export: Range1dProps
// WARNING: Unsupported export: AngleProps
// WARNING: Unsupported export: AngleSweepProps
// WARNING: Unsupported export: Point4dProps
// WARNING: Unsupported export: Matrix4dProps
// WARNING: Unsupported export: AnyCurve
// WARNING: Unsupported export: AnyRegion
// WARNING: Unsupported export: AnnounceNumberNumberCurvePrimitive
// WARNING: Unsupported export: AnnounceNumberNumber
// WARNING: Unsupported export: AnnounceCurvePrimitive
// WARNING: Unsupported export: CurvePrimitiveMutator
// WARNING: Unsupported export: NodeFunction
// WARNING: Unsupported export: NodeToNumberFunction
// WARNING: Unsupported export: HalfEdgeToBooleanFunction
// WARNING: Unsupported export: HalfEdgeAndMaskToBooleanFunction
// WARNING: Unsupported export: GraphNodeFunction
// (No @packagedocumentation comment for this package)
