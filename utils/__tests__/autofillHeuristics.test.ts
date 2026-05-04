/**
 * 自动填充启发式测试
 *
 * 运行方式：
 * 1. npx tsc --module commonjs --target ES2020 --moduleResolution node --lib ES2020,DOM --outDir /tmp/keeper-autofill-test-cjs utils/autofillHeuristics.ts utils/__tests__/autofillHeuristics.test.ts
 * 2. node /tmp/keeper-autofill-test-cjs/__tests__/autofillHeuristics.test.js
 */

import {
  type FieldFingerprintLike,
  getAutofillMatchingHostnames,
  getAutofillMatchingHostnamesForUrls,
  get163CredentialFieldRole,
  is163AutofillContext,
  is163LoginHost,
  pick163CredentialFields,
} from '../autofillHeuristics';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }

  console.log(`✓ ${message}`);
}

function runTests(): void {
  console.log('Starting autofill heuristics tests...\n');

  assert(is163LoginHost('mail.163.com'), 'matches mail.163.com as a supported 163 login host');
  assert(is163LoginHost('email.163.com'), 'matches email.163.com as a supported 163 login host');
  assert(!is163LoginHost('mail.qq.com'), 'does not match unrelated login hosts');
  assert(
    is163AutofillContext('https://mail.163.com/'),
    'matches top-level mail.163.com page as a 163 autofill context',
  );
  assert(
    is163AutofillContext('https://email.163.com/'),
    'matches top-level email.163.com page as a 163 autofill context',
  );
  assert(
    is163AutofillContext(
      'https://dl.reg.163.com/webzj/v1.0.1/pub/index_dl2_new.html?pkid=CvViHzl&product=mail163',
    ),
    'matches mail163 URS iframe as a 163 autofill context',
  );
  assert(
    !is163AutofillContext(
      'https://dl.reg.163.com/webzj/v1.0.1/pub/index_dl2_new.html?pkid=CvViHzl&product=other',
    ),
    'does not match non-mail163 URS iframes',
  );
  assert(
    !is163AutofillContext('https://mail.qq.com/'),
    'does not match unrelated pages as 163 autofill contexts',
  );
  assert(
    getAutofillMatchingHostnames('https://mail.163.com/').includes('mail.163.com'),
    'uses top-level 163 host directly for bookmark matching',
  );
  assert(
    getAutofillMatchingHostnames(
      'https://dl.reg.163.com/webzj/v1.0.1/pub/index_dl2_new.html?pkid=CvViHzl&product=mail163',
    ).length === 1 && getAutofillMatchingHostnames(
      'https://dl.reg.163.com/webzj/v1.0.1/pub/index_dl2_new.html?pkid=CvViHzl&product=mail163',
    )[0] === 'mail.163.com',
    'treats mail163 URS iframe as only mail.163.com for bookmark matching',
  );
  assert(
    getAutofillMatchingHostnamesForUrls([
      'about:blank',
      'https://dl.reg.163.com/webzj/v1.0.1/pub/index_dl2_new.html?pkid=CvViHzl&product=mail163',
    ]).length === 1 && getAutofillMatchingHostnamesForUrls([
      'about:blank',
      'https://dl.reg.163.com/webzj/v1.0.1/pub/index_dl2_new.html?pkid=CvViHzl&product=mail163',
    ])[0] === 'mail.163.com',
    'merges multiple candidate URLs without introducing cross-site 163 aliases',
  );

  assert(
    get163CredentialFieldRole({
      id: 'auto-id-1777793519172',
      name: 'email',
      type: 'text',
      dataLoginName: 'loginEmail',
    }) === 'username',
    'matches loginEmail field as the 163 username field',
  );
  assert(
    get163CredentialFieldRole({
      id: 'auto-id-1777793519175',
      name: 'password',
      type: 'password',
      dataLoginName: 'loginPassword',
    }) === 'password',
    'matches loginPassword field as the 163 password field',
  );
  assert(
    get163CredentialFieldRole({
      id: 'pwdtext',
      name: '',
      type: 'text',
      dataLoginName: '',
    }) === 'passwordProxy',
    'matches pwdtext as the 163 visible password proxy field',
  );
  assert(
    get163CredentialFieldRole({
      id: 'switchAccountLogin',
      name: '',
      type: '',
      dataLoginName: '',
    }) === null,
    'does not treat the QR-card password switch as a credential field',
  );
  assert(
    get163CredentialFieldRole({
      id: 'lbNormal',
      name: '',
      type: '',
      dataLoginName: '',
    }) === null,
    'does not treat the account-login tab switch as a credential field',
  );

  const sampleFields: FieldFingerprintLike[] = [
    { id: 'loginBtn', name: '', type: 'submit', dataLoginName: '' },
    { id: 'auto-id-1777793519172', name: 'email', type: 'text', dataLoginName: 'loginEmail' },
    { id: 'pwdtext', name: '', type: 'text', dataLoginName: '' },
    { id: 'auto-id-1777793519175', name: 'password', type: 'password', dataLoginName: 'loginPassword' },
  ];
  const pickedFields = pick163CredentialFields(sampleFields);
  assert(
    pickedFields.usernameField?.id === 'auto-id-1777793519172',
    'picks username field from the current 163 document without relying on container ids',
  );
  assert(
    pickedFields.passwordProxyField?.id === 'pwdtext',
    'picks pwdtext as the password proxy field from the current 163 document',
  );
  assert(
    pickedFields.passwordField?.id === 'auto-id-1777793519175',
    'picks loginPassword as the real password field from the current 163 document',
  );

  const passwordOnlyFields: FieldFingerprintLike[] = [
    { id: 'pwdtext', name: '', type: 'text', dataLoginName: '' },
    { id: 'auto-id-1777793519175', name: 'password', type: 'password', dataLoginName: 'loginPassword' },
  ];
  const pickedPasswordOnlyFields = pick163CredentialFields(passwordOnlyFields);
  assert(
    pickedPasswordOnlyFields.usernameField === null,
    'keeps username field empty in the 163 password-only stage',
  );
  assert(
    pickedPasswordOnlyFields.passwordProxyField?.id === 'pwdtext',
    'still picks pwdtext in the 163 password-only stage',
  );
  assert(
    pickedPasswordOnlyFields.passwordField?.id === 'auto-id-1777793519175',
    'still picks the real password field in the 163 password-only stage',
  );

  console.log('\n✅ All autofill heuristics tests passed!');
}

runTests();
