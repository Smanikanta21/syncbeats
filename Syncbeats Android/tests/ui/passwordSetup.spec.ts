import { expect, test } from '@playwright/test';
import { installBackend } from './backend';

for (const mode of ['sign in', 'register', 'forgot password', 'account']) {
  test(`password setup from ${mode} uses the emailed code and enters the room`, async ({ page }) => {
    const signedIn = mode === 'account';
    await installBackend(page, signedIn);
    const email = 'listener@example.test';
    const password = 'new-fixture-password';
    let passwordSet = false;
    let resendCount = 0;
    await page.route('https://api.syncbeats.in/auth/**', async route => {
      const request = route.request();
      if (request.method() !== 'POST') return route.fallback();
      const path = new URL(request.url()).pathname;
      const body = request.postDataJSON();
      if (path === '/auth/password/forgot') {
        expect(body).toEqual({ email });
        resendCount++;
      } else if (path === '/auth/password/reset') {
        expect(body.email).toBe(email);
        expect(body.password).toBe(password);
        if (body.otp !== '123456') return route.fulfill({ status: 400, json: { error: 'Invalid or expired OTP' } });
        passwordSet = true;
      } else if (path === '/auth/login' || path === '/auth/register') {
        if (passwordSet) {
          expect(path).toBe('/auth/login');
          expect(body.password).toBe(password);
          return route.fallback();
        }
        return route.fulfill({ status: 400, json: { error: 'GOOGLE_AUTH_SETUP_PASSWORD: Check your email.' } });
      } else return route.fallback();
      return route.fulfill({ json: { ok: true } });
    });

    await page.goto(signedIn ? '/room' : '/');
    if (signedIn) {
      await page.getByRole('button', { name: 'Set or reset password' }).click();
      await expect(page.getByText('Set your account password')).toBeVisible();
      await page.getByRole('button', { name: 'Send code', exact: true }).click();
    } else if (mode === 'forgot password') {
      await page.getByRole('link', { name: 'Forgot your password?' }).click();
      await expect(page.getByText('Reset your password')).toBeVisible();
      await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
      await page.getByRole('button', { name: 'Send code', exact: true }).click();
    } else {
      if (mode === 'register') {
        await page.getByRole('button', { name: /New here/ }).click();
        await page.getByLabel('Name', { exact: true }).fill('Listener');
      }
      await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
      await page.getByLabel('Password', { exact: true }).fill('previous-attempt');
      await page.getByRole('button', { name: mode === 'register' ? 'Create account' : 'Sign in', exact: true }).click();
      await expect(page.getByText('Set up your password', { exact: true })).toBeVisible();
    }
    await expect(page.getByLabel('Email code')).toBeVisible();
    const initialSendCount = mode === 'forgot password' || signedIn ? 1 : 0;
    expect(resendCount).toBe(initialSendCount);
    await page.getByLabel('Email code').fill('111111');
    await page.getByLabel('New password').fill(password);
    await page.getByLabel('Confirm password').fill(password);
    await page.getByRole('button', { name: signedIn ? 'Save password' : 'Set password and sign in' }).click();
    await expect(page.getByText('Invalid or expired OTP')).toBeVisible();
    await page.getByRole('button', { name: 'Send a new code' }).click();
    await expect(page.getByLabel('Email code')).toHaveValue('');
    expect(resendCount).toBe(initialSendCount + 1);
    await page.getByLabel('Email code').fill('123456');
    await page.getByRole('button', { name: signedIn ? 'Save password' : 'Set password and sign in' }).click();
    if (signedIn) {
      await expect(page.getByText('Your password is set')).toBeVisible();
      await page.getByRole('button', { name: 'Done' }).click();
      await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    } else {
      await expect(page.getByText('Room 123456', { exact: true })).toBeVisible();
    }
  });
}
