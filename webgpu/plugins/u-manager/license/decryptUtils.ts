import NodeRSA from 'node-rsa';
import type { ILicense, ITreeData } from '../types';

const debugKey =
  'NJHgNB1HDTrHTJc4ERFCBRVBB5HOBEDCjRLChRDIdn8K7EUJD,Vm4C6vC8BpZ6n6G,hxOjYZ{,wYhnJize2rlm9m,6bUcRVbP6sjNbKU8juOWUpukkcV6Cw,Bk2io7{YWJcPnG{1o3GUTpnO:z{kCYHL14HjO8noH1sp[J78k3Y3IcbOSSk97evccx0MdW2uR0f5qhZFQV8e2JCRxxJEBRBC';

// 使用debugKey解密
export function decryptWithDebugKey(license: ILicense): ITreeData[] {
  return decryptWithKey(license, decodeString(debugKey));
}

// 解密
export function decryptWithKey(license: ILicense, key: string): ITreeData[] {
  const { content, sign } = license;

  const nodeRsa = new NodeRSA(key, 'pkcs8-public', {
    environment: 'browser',
    signingScheme: 'pkcs1-md5',
    encryptionScheme: 'pkcs1',
  });

  // @ts-ignore
  const verified = nodeRsa.verify(content, sign, 'utf8', 'base64');

  if (!verified) {
    throw new Error('u-space: license verify failed');
  }

  const rawContent = decryptInternal(content, nodeRsa);

  return JSON.parse(rawContent);
}

function decryptInternal(content: string, nodeRsa: NodeRSA) {
  const headerLen = content.charCodeAt(0);
  const header = content.substring(1, headerLen);
  const body = content.substring(headerLen);
  const chucks = parseHeader(header);

  let res = '';

  for (const chuck of chucks) {
    const data = body.substring(chuck.start, chuck.end);
    let decryptedData;

    if (chuck.encrypt) {
      decryptedData = nodeRsa.decryptPublic(data, 'utf8');
    } else {
      decryptedData = decodeString(data);
    }
    res += decryptedData;
  }
  return res;
}

function parseHeader(header: string) {
  const bytes = decodeToBytes(header);
  const dataView = new DataView(bytes.buffer);

  const version = dataView.getInt16(0);

  if (version === 1) {
    return parseHeaderV1(bytes.buffer);
  } else {
    throw new Error(`u-space: content version error, version=${version}`);
  }
}

function parseHeaderV1(arrayBuffer: ArrayBuffer) {
  const dataView = new DataView(arrayBuffer);

  let offset = 2;

  const chuckCount = dataView.getInt16(offset);

  offset += 2;

  const chucks = [];

  for (let i = 0; i < chuckCount; i++) {
    const index = dataView.getInt16(offset);

    offset += 2;

    const encrypt = dataView.getInt16(offset);

    offset += 2;

    const start = dataView.getInt32(offset);

    offset += 4;

    const end = dataView.getInt32(offset);

    offset += 4;

    const chuck = {
      index,
      encrypt: encrypt > 0,
      start,
      end,
    };

    chucks.push(chuck);
  }

  chucks.sort((a, b) => {
    return a.index <= b.index ? -1 : 1;
  });

  return chucks;
}

const _base64KeyStr = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

export function decodeToBytes(input: string) {
  const output = [];
  let chr1, chr2, chr3;
  let enc1, enc2, enc3, enc4;
  let i = 0;

  input = input.replace(/[^A-Za-z0-9+/=]/g, '');

  while (i < input.length) {
    enc1 = _base64KeyStr.indexOf(input.charAt(i++));
    enc2 = _base64KeyStr.indexOf(input.charAt(i++));
    enc3 = _base64KeyStr.indexOf(input.charAt(i++));
    enc4 = _base64KeyStr.indexOf(input.charAt(i++));

    chr1 = (enc1 << 2) | (enc2 >> 4);
    chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    chr3 = ((enc3 & 3) << 6) | enc4;

    // output += String.fromCharCode(chr1);
    output.push(chr1);

    if (enc3 !== 64) {
      // output += String.fromCharCode(chr2);
      output.push(chr2);
    }
    if (enc4 !== 64) {
      // output += String.fromCharCode(chr3);
      output.push(chr3);
    }
  }

  return new Int8Array(output);
}

export function decodeString(encodedStr: string) {
  let decoded = '';

  for (let i = 0; i < encodedStr.length; i++) {
    const encodedCharCode = encodedStr.charCodeAt(i);
    const decodedCharCode = encodedCharCode - 1; // 将转码后的值减1还原为原始字符的Unicode编码
    decoded += String.fromCharCode(decodedCharCode);
  }
  return decoded;
}
