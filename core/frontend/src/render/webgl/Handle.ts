/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module WebGL */

import { assert, IDisposable } from "@bentley/bentleyjs-core";
import { GL } from "./GL";
import { QParams3d, QParams2d } from "@bentley/imodeljs-common";
import { Matrix3, Matrix4 } from "./Matrix";
import { System } from "./System";
import { Point3d } from "@bentley/geometry-core";

export type BufferData = number | Int8Array | Int16Array | Int32Array | Uint8Array | Uint16Array | Uint32Array | Uint8ClampedArray | Float32Array | Float64Array | DataView | ArrayBuffer;

/**
 * A handle to a WebGLBuffer, such as a vertex or index buffer.
 * The WebGLBuffer is allocated by the constructor and should be freed by a call to dispose().
 */
export class BufferHandle implements IDisposable {
  private _glBuffer?: WebGLBuffer;
  private _bytesUsed = 0;

  /** Allocates the WebGLBuffer using the supplied context. Free the WebGLBuffer using dispose() */
  public constructor() {
    const glBuffer = System.instance.context.createBuffer();

    // gl.createBuffer() returns WebGLBuffer | null...
    if (null !== glBuffer) {
      this._glBuffer = glBuffer;
    } else {
      this._glBuffer = undefined;
    }

    assert(!this.isDisposed);
  }

  public get isDisposed(): boolean { return this._glBuffer === undefined; }
  public get bytesUsed(): number { return this._bytesUsed; }

  /** Frees the WebGL buffer */
  public dispose(): void {
    if (!this.isDisposed) {
      System.instance.context.deleteBuffer(this._glBuffer!);
      this._glBuffer = undefined;
    }
  }

  /** Binds this buffer to the specified target */
  public bind(target: GL.Buffer.Target): void {
    if (undefined !== this._glBuffer) {
      System.instance.context.bindBuffer(target, this._glBuffer);
    }
  }

  /** Sets the specified target to be bound to no buffer */
  public static unbind(target: GL.Buffer.Target): void { System.instance.context.bindBuffer(target, null); }

  /** Binds this buffer to the specified target and sets the buffer's data store. */
  public bindData(target: GL.Buffer.Target, data: BufferSource, usage: GL.Buffer.Usage = GL.Buffer.Usage.StaticDraw): void {
    this.bind(target);
    System.instance.context.bufferData(target, data, usage);
    BufferHandle.unbind(target);
    this._bytesUsed = data.byteLength;
  }

  /** Creates a BufferHandle and binds its data */
  public static createBuffer(target: GL.Buffer.Target, data: BufferSource, usage: GL.Buffer.Usage = GL.Buffer.Usage.StaticDraw): BufferHandle | undefined {
    const handle = new BufferHandle();
    if (handle.isDisposed) {
      return undefined;
    }

    handle!.bindData(target, data, usage);
    return handle;
  }
  /** Creates a BufferHandle and binds its data */
  public static createArrayBuffer(data: BufferSource, usage: GL.Buffer.Usage = GL.Buffer.Usage.StaticDraw) {
    return BufferHandle.createBuffer(GL.Buffer.Target.ArrayBuffer, data, usage);
  }

  public isBound(binding: GL.Buffer.Binding) { return System.instance.context.getParameter(binding) === this._glBuffer; }
}

function setScale(index: number, value: number, array: Float32Array) {
  array[index] = 0.0 !== value ? 1.0 / value : value;
}

/**
 * Converts 2d quantization parameters to a format appropriate for submittal to the GPU.
 * params[0] = origin.x
 * params[1] = origin.y
 * params[2] = scale.x
 * params[3] = scale.y
 */
export function qparams2dToArray(params: QParams2d): Float32Array {
  const arr = new Float32Array(4);

  arr[0] = params.origin.x;
  arr[1] = params.origin.y;
  setScale(2, params.scale.x, arr);
  setScale(3, params.scale.y, arr);

  return arr;
}

export function qorigin3dToArray(qorigin: Point3d): Float32Array {
  const origin = new Float32Array(3);
  origin[0] = qorigin.x;
  origin[1] = qorigin.y;
  origin[2] = qorigin.z;
  return origin;
}

export function qscale3dToArray(qscale: Point3d): Float32Array {
  const scale = new Float32Array(3);
  setScale(0, qscale.x, scale);
  setScale(1, qscale.y, scale);
  setScale(2, qscale.z, scale);
  return scale;
}

/** Converts 3d quantization params to a pair of Float32Arrays */
export function qparams3dToArray(params: QParams3d): { origin: Float32Array, scale: Float32Array } {
  const origin = qorigin3dToArray(params.origin);
  const scale = qscale3dToArray(params.scale);
  return { origin, scale };
}

/** A handle to a WebGLBuffer intended to hold quantized 2d points */
export class QBufferHandle2d extends BufferHandle {
  public readonly params: Float32Array;

  public constructor(params: QParams2d) {
    super();
    this.params = qparams2dToArray(params);
  }

  public static create(params: QParams2d, data: Uint16Array): QBufferHandle2d | undefined {
    const handle = new QBufferHandle2d(params);
    if (handle.isDisposed) {
      return undefined;
    }

    handle.bindData(GL.Buffer.Target.ArrayBuffer, data);
    return handle;
  }
}

/* A handle to a WebGLBuffer intended to hold quantized 3d points */
export class QBufferHandle3d extends BufferHandle {
  /** The quantization origin in x, y, and z */
  public readonly origin: Float32Array;
  /** The quantization scale in x, y, and z */
  public readonly scale: Float32Array;

  public constructor(params: QParams3d) {
    super();
    this.origin = qorigin3dToArray(params.origin);
    this.scale = qscale3dToArray(params.scale);
  }

  public static create(params: QParams3d, data: Uint16Array): QBufferHandle3d | undefined {
    const handle = new QBufferHandle3d(params);
    if (handle.isDisposed) {
      return undefined;
    }

    handle.bindData(GL.Buffer.Target.ArrayBuffer, data);
    return handle;
  }
}

/** A handle to the location of an attribute within a shader program */
export class AttributeHandle {
  private readonly _glId: number;

  private constructor(glId: number) { this._glId = glId; }

  public static create(program: WebGLProgram, name: string, required: boolean = false): AttributeHandle | undefined {
    const glId = System.instance.context.getAttribLocation(program, name);
    if (-1 === glId) {
      assert(!required, "getAttribLocation failed for " + name);
      return undefined;
    }

    return new AttributeHandle(glId);
  }

  public setVertexAttribPointer(size: number, type: number, normalized: boolean, stride: number, offset: number) {
    System.instance.context.vertexAttribPointer(this._glId, size, type, normalized, stride, offset);
  }

  public enableVertexAttribArray(instanced = false): void { System.instance.enableVertexAttribArray(this._glId, instanced); }

  public enableArray(buffer: BufferHandle, size: number, type: GL.DataType, normalized: boolean, stride: number, offset: number, instanced = false): void {
    buffer.bind(GL.Buffer.Target.ArrayBuffer);
    this.setVertexAttribPointer(size, type, normalized, stride, offset);
    this.enableVertexAttribArray(instanced);
    BufferHandle.unbind(GL.Buffer.Target.ArrayBuffer);
  }
}

const enum DataType {
  Undefined,
  Mat3,
  Mat4,
  Float,
  FloatArray,
  Vec2,
  Vec3,
  Vec4,
  Int,
}

/** A handle to the location of a uniform within a shader program */
export class UniformHandle {
  private readonly _location: WebGLUniformLocation;
  private _type: DataType = DataType.Undefined;
  private readonly _data: number[] = [];

  private constructor(location: WebGLUniformLocation) { this._location = location; }

  public static create(program: WebGLProgram, name: string, required: boolean = true): UniformHandle | undefined {
    const location = System.instance.context.getUniformLocation(program, name);
    if (null === location) {
      assert(!required, "getUniformLocation failed for " + name);
      return undefined;
    }

    return new UniformHandle(location);
  }

  private updateData(type: DataType, data: Float32Array | number[]): boolean {
    assert(DataType.Undefined !== type && DataType.Int !== type && DataType.Float !== type);

    let updated = this._type !== type;
    if (updated) {
      this._type = type;
      if (this._data.length !== data.length)
        this._data.length = data.length;
    }

    for (let i = 0; i < data.length; i++) {
      const datum = data[i];
      updated = updated || this._data[i] !== datum;
      this._data[i] = datum;
    }

    return updated;
  }

  private updateDatum(type: DataType, datum: number): boolean {
    assert(DataType.Int === type || DataType.Float === type);

    // NB: Yes, calling data.length without actually changing the length shows up as a significant performance bottleneck...
    if (this._data.length !== 1)
      this._data.length = 1;

    const updated = this._type !== type || this._data[0] !== datum;
    this._type = type;
    this._data[0] = datum;

    return updated;
  }

  public setMatrix3(mat: Matrix3) {
    if (this.updateData(DataType.Mat3, mat.data))
      System.instance.context.uniformMatrix3fv(this._location, false, mat.data);
  }

  public setMatrix4(mat: Matrix4) {
    if (this.updateData(DataType.Mat4, mat.data))
      System.instance.context.uniformMatrix4fv(this._location, false, mat.data);
  }

  public setUniform1fv(data: Float32Array | number[]) {
    if (this.updateData(DataType.FloatArray, data))
      System.instance.context.uniform1fv(this._location, data);
  }

  public setUniform2fv(data: Float32Array | number[]) {
    if (this.updateData(DataType.Vec2, data))
      System.instance.context.uniform2fv(this._location, data);
  }

  public setUniform3fv(data: Float32Array | number[]) {
    if (this.updateData(DataType.Vec3, data))
      System.instance.context.uniform3fv(this._location, data);
  }

  public setUniform4fv(data: Float32Array | number[]) {
    if (this.updateData(DataType.Vec4, data))
      System.instance.context.uniform4fv(this._location, data);
  }

  public setUniform1i(data: number) {
    if (this.updateDatum(DataType.Int, data))
      System.instance.context.uniform1i(this._location, data);
  }

  public setUniform1f(data: number) {
    if (this.updateDatum(DataType.Float, data))
      System.instance.context.uniform1f(this._location, data);
  }
}
