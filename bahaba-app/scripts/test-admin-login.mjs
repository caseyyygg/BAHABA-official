import { chromium, expect } from '@playwright/test';
const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
for(const [email,password] of [['miguel.torres@bahaba.ph','Bahaba@2026'],['elena.villareal@malabon.gov.ph','Concepcion@2026']]){
 const p=await b.newPage();await p.goto('http://localhost:8080',{waitUntil:'domcontentloaded'});await p.locator('#login-email').fill(email);await p.locator('#login-password').fill(password);await p.locator('#auth-login button[type=submit]').click();await expect(p.locator('#app-shell')).toHaveClass(/active/);await expect(p.locator('#login-screen')).toBeHidden();console.log('PASS '+email);await p.close();
}
const p=await b.newPage();await p.goto('http://localhost:8080',{waitUntil:'domcontentloaded'});await p.locator('#login-email').fill('miguel.torres@bahaba.ph');await p.locator('#login-password').fill('wrong-password');await p.locator('#auth-login button[type=submit]').click();await expect(p.locator('#login-alert')).toContainText('Incorrect email or password');await expect(p.locator('#login-screen')).toBeVisible();console.log('PASS invalid password rejected');
}finally{await b.close()}
