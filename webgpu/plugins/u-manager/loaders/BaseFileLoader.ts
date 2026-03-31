import { FileLoader as FileLoaderClass, Loader } from 'three/webgpu';

export class BaseFileLoader extends FileLoaderClass {
  constructor(loader: Loader<any, any>) {
    super();
    this.manager = loader.manager;
    this.setPath(loader.path);
    this.setResponseType('json');
    this.setRequestHeader(loader.requestHeader);
    this.setWithCredentials(loader.withCredentials);
  }

  async loadAsync<T = any>(url: string): Promise<T> {
    return super.loadAsync(url) as Promise<T>;
  }
}
