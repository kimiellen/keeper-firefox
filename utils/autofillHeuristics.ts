export function is163LoginHost(hostname: string): boolean {
  return hostname === 'mail.163.com' || hostname === 'email.163.com';
}

function getNvidiaHostnames(url: URL): string[] {
  const hostname = url.hostname.toLowerCase();
  const pathname = url.pathname.toLowerCase();

  if (hostname === 'login-pipl.nvgs.nvidia.cn' && pathname === '/v1/login/identifier') {
    return ['login-pipl.nvgs.nvidia.cn', 'www.nvidia.cn'];
  }

  return [];
}

function getQqMailHostnames(url: URL): string[] {
  const hostname = url.hostname.toLowerCase();

  if (hostname === 'mail.qq.com' || hostname === 'wx.mail.qq.com') {
    return ['mail.qq.com', 'wx.mail.qq.com'];
  }

  if (hostname === 'xui.ptlogin2.qq.com' && url.pathname.toLowerCase() === '/cgi-bin/xlogin') {
    const appId = url.searchParams.get('appid') ?? '';
    const serviceUrl = url.searchParams.get('s_url') ?? '';

    if (appId === '716027609') {
      return ['mail.qq.com', 'wx.mail.qq.com'];
    }

    try {
      const parsedServiceUrl = new URL(serviceUrl);
      if (parsedServiceUrl.hostname.toLowerCase() === 'wx.mail.qq.com') {
        return ['mail.qq.com', 'wx.mail.qq.com'];
      }
    } catch {
      // ignore invalid nested URLs from unrelated ptlogin flows
    }
  }

  return [];
}

export function is163AutofillContext(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (is163LoginHost(hostname)) {
      return true;
    }

    const pathname = parsed.pathname.toLowerCase();
    const product = parsed.searchParams.get('product')?.toLowerCase() ?? '';
    return hostname === 'dl.reg.163.com' && pathname.includes('/webzj/') && product === 'mail163';
  } catch {
    return false;
  }
}

export function getAutofillMatchingHostnames(url: string): string[] {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname) {
      return [];
    }

    const qqMailHostnames = getQqMailHostnames(parsed);
    if (qqMailHostnames.length > 0) {
      return qqMailHostnames;
    }

    const nvidiaHostnames = getNvidiaHostnames(parsed);
    if (nvidiaHostnames.length > 0) {
      return nvidiaHostnames;
    }

    if (hostname === 'dl.reg.163.com') {
      const pathname = parsed.pathname.toLowerCase();
      const product = parsed.searchParams.get('product')?.toLowerCase() ?? '';
      if (pathname.includes('/webzj/') && product === 'mail163') {
        return ['mail.163.com'];
      }
    }

    return [hostname];
  } catch {
    return [];
  }
}

export function getAutofillMatchingHostnamesForUrls(urls: string[]): string[] {
  const hostnames = new Set<string>();

  for (const url of urls) {
    for (const hostname of getAutofillMatchingHostnames(url)) {
      hostnames.add(hostname);
    }
  }

  return Array.from(hostnames);
}

export interface FieldFingerprintLike {
  id?: string | null;
  name?: string | null;
  type?: string | null;
  dataLoginName?: string | null;
}

export interface Picked163CredentialFields<TField extends FieldFingerprintLike> {
  usernameField: TField | null;
  passwordField: TField | null;
  passwordProxyField: TField | null;
}

export function get163CredentialFieldRole(field: FieldFingerprintLike): 'username' | 'password' | 'passwordProxy' | null {
  const normalizedId = field.id?.toLowerCase() ?? '';
  const normalizedName = field.name?.toLowerCase() ?? '';
  const normalizedType = field.type?.toLowerCase() ?? '';
  const normalizedDataLoginName = field.dataLoginName?.toLowerCase() ?? '';

  if (normalizedName === 'email' && normalizedDataLoginName === 'loginemail' && normalizedType === 'text') {
    return 'username';
  }

  if (normalizedId === 'pwdtext') {
    return 'passwordProxy';
  }

  if (normalizedName === 'password' && normalizedDataLoginName === 'loginpassword' && normalizedType === 'password') {
    return 'password';
  }

  return null;
}

export function pick163CredentialFields<TField extends FieldFingerprintLike>(
  fields: TField[],
): Picked163CredentialFields<TField> {
  let usernameField: TField | null = null;
  let passwordField: TField | null = null;
  let passwordProxyField: TField | null = null;

  for (const field of fields) {
    const role = get163CredentialFieldRole(field);
    if (role === 'username') {
      usernameField = field;
    } else if (role === 'password') {
      passwordField = field;
    } else if (role === 'passwordProxy') {
      passwordProxyField = field;
    }
  }

  return { usernameField, passwordField, passwordProxyField };
}
