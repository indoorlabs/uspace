import { Loader, LoadingManager } from 'three/webgpu';
import { PROPERTIES_DATA_FILE_PATH } from '../constants';
import { BaseFileLoader } from './BaseFileLoader';

export class PropertiesLoader extends Loader {
  constructor() {
    super();
    this.manager = new LoadingManager();
  }

  async loadAsync() {
    const loader = new BaseFileLoader(this);
    const propertiesData = await loader.loadAsync<IProperties[]>(PROPERTIES_DATA_FILE_PATH);
    return propertiesData;
  }
}

export interface IProperties {
  modelId: string;
  group: string;
  key: string;
  value: string | null;
  label: string | null;
}
