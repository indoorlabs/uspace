import { Color, type ColorRepresentation } from 'three';
import { color, mix, pow, sin, time, uv, mx_noise_float } from 'three/tsl';

export class TSLEffects {
  static flow(
    parameters: {
      baseColor?: ColorRepresentation;
      flowColor?: ColorRepresentation;
      speed?: number;
      scale?: number;
      intensity?: number;
    } = {},
  ) {
    const { baseColor = 0xffffff, flowColor = 0x00ff00, speed = 1.0, scale = 3.0, intensity = 4.0 } = parameters;

    const baseColorNode = color(new Color(baseColor));
    const flowColorNode = color(new Color(flowColor));

    // Assume the mesh is regular
    // uv().x runs along the length of the mesh
    const flow = uv().x.mul(scale).sub(time.mul(speed));

    // Create a smooth wave pattern: slightly sharper peaks
    // sin(x) -> [-1, 1]
    // (sin(x) + 1) / 2 -> [0, 1]
    // pow(..., intensity) -> narrow the highlight
    const pattern = pow(sin(flow).add(1).mul(0.5), intensity);

    return mix(baseColorNode, flowColorNode, pattern);
  }

  static breathe(
    parameters: {
      baseColor?: ColorRepresentation;
      breathColor?: ColorRepresentation;
      speed?: number;
      intensity?: number;
    } = {},
  ) {
    const { baseColor = 0xffffff, breathColor = 0x00ff00, speed = 1.0, intensity = 2.0 } = parameters;

    const baseColorNode = color(new Color(baseColor));
    const breathColorNode = color(new Color(breathColor));

    // sin(x) -> [-1, 1]
    // (sin(x) + 1) / 2 -> [0, 1]
    const osc = sin(time.mul(speed)).add(1).mul(0.5);

    // Apply intensity to make the "breath" more or less sharp
    const pattern = pow(osc, intensity);

    return mix(baseColorNode, breathColorNode, pattern);
  }

  static fluid(
    parameters: {
      baseColor?: ColorRepresentation;
      flowColor?: ColorRepresentation;
      speed?: number;
      scale?: number;
      intensity?: number;
      distortion?: number;
    } = {},
  ) {
    const {
      baseColor = 0xffffff,
      flowColor = 0x0000ff,
      speed = 1.0,
      scale = 1.0,
      intensity = 1.0,
      distortion = 0.5,
    } = parameters;

    const baseColorNode = color(new Color(baseColor));
    const flowColorNode = color(new Color(flowColor));

    // UV coordinates scaled
    const uvNode = uv().mul(scale);

    // Animate the noise with time
    const timeNode = time.mul(speed);

    // Distort UVs using noise
    const noiseNode = mx_noise_float(uvNode.add(timeNode), 1.0, 0.0);
    const distortedUV = uvNode.add(noiseNode.mul(distortion));

    // Create a pattern based on the distorted UVs
    const pattern = mx_noise_float(distortedUV, 1.0, 0.0).add(1.0).mul(0.5); // 0..1

    // Sharpen the pattern
    const fluidPattern = pow(pattern, intensity);

    return mix(baseColorNode, flowColorNode, fluidPattern);
  }
}
