import puppeteer from 'puppeteer';

const BASE = 'https://crearcocrm.socialmindcrm.com';
const OUT = '/var/www/crearco/web/screenshots';
const PWD = 'Screenshot2026!';

const ROLES = [
    {
        name: 'admin',
        email: 'civancorral@gmail.com',
        pages: [
            { name: 'dashboard', url: '/dashboard' },
            { name: 'clientes', url: '/clientes' },
            { name: 'clientes-crear', url: '/clientes/create' },
            { name: 'citas', url: '/citas' },
            { name: 'whatsapp-inbox', url: '/whatsapp/inbox' },
            { name: 'whatsapp-sessions', url: '/whatsapp/sessions' },
            { name: 'whatsapp-templates', url: '/whatsapp/templates' },
            { name: 'whatsapp-config', url: '/whatsapp/config/chatbot' },
            { name: 'reportes', url: '/reportes' },
            { name: 'metas', url: '/metas' },
            { name: 'usuarios', url: '/usuarios' },
            { name: 'sucursales', url: '/sucursales' },
            { name: 'importar', url: '/importar' },
        ]
    },
    {
        name: 'supervisor',
        email: 'carlos@crearco.com',
        pages: [
            { name: 'dashboard', url: '/dashboard' },
            { name: 'clientes', url: '/clientes' },
            { name: 'reportes', url: '/reportes' },
            { name: 'metas', url: '/metas' },
        ]
    },
    {
        name: 'ventas',
        email: 'fernando@crearco.com',
        pages: [
            { name: 'dashboard', url: '/dashboard' },
            { name: 'clientes', url: '/clientes' },
            { name: 'clientes-crear', url: '/clientes/create' },
            { name: 'whatsapp-inbox', url: '/whatsapp/inbox' },
        ]
    },
    {
        name: 'posventa',
        email: 'maria@crearco.com',
        pages: [
            { name: 'dashboard', url: '/dashboard' },
            { name: 'clientes', url: '/clientes' },
            { name: 'whatsapp-inbox', url: '/whatsapp/inbox' },
        ]
    },
    {
        name: 'cobrador',
        email: 'ricardo@crearco.com',
        pages: [
            { name: 'dashboard', url: '/dashboard' },
            { name: 'clientes', url: '/clientes' },
            { name: 'whatsapp-inbox', url: '/whatsapp/inbox' },
        ]
    }
];

async function login(page, email) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('input[name="email"]', { timeout: 10000 });
    await page.type('input[name="email"]', email, { delay: 30 });
    await page.type('input[name="password"]', PWD, { delay: 30 });

    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
        page.click('button[type="submit"]')
    ]);

    // Wait for page to settle
    await new Promise(r => setTimeout(r, 2000));
}

async function screenshot(page, path) {
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path, fullPage: true });
}

async function run() {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors', '--disable-gpu'],
        defaultViewport: { width: 1440, height: 900 },
        protocolTimeout: 60000
    });

    // Login page
    const loginPage = await browser.newPage();
    await loginPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1500));
    await loginPage.screenshot({ path: `${OUT}/login.png`, fullPage: true });
    console.log('login page OK');
    await loginPage.close();

    for (const role of ROLES) {
        console.log(`\n=== ${role.name.toUpperCase()} ===`);
        const ctx = await browser.createBrowserContext();
        const page = await ctx.newPage();

        try {
            await login(page, role.email);
            console.log('  Logged in');
        } catch (e) {
            console.log(`  Login FAIL: ${e.message.slice(0, 80)}`);
            await page.screenshot({ path: `${OUT}/${role.name}-login-fail.png`, fullPage: true }).catch(() => {});
            await page.close();
            continue;
        }

        // Sidebar
        try {
            const sidebar = await page.$('aside');
            if (sidebar) {
                await sidebar.screenshot({ path: `${OUT}/${role.name}-sidebar.png` });
                console.log('  sidebar OK');
            }
        } catch(e) {}

        // Pages
        for (const pg of role.pages) {
            try {
                await page.goto(`${BASE}${pg.url}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await screenshot(page, `${OUT}/${role.name}-${pg.name}.png`);
                console.log(`  ${pg.name} OK`);
            } catch (e) {
                console.log(`  ${pg.name} FAIL: ${e.message.slice(0, 60)}`);
            }
        }

        // Client detail for admin
        if (role.name === 'admin') {
            try {
                await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await new Promise(r => setTimeout(r, 2000));
                const link = await page.evaluate(() => {
                    const a = document.querySelector('table a[href*="clientes/"]');
                    return a ? a.href : null;
                });
                if (link) {
                    await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await screenshot(page, `${OUT}/admin-cliente-detalle.png`);
                    console.log('  cliente-detalle OK');

                    // Seguimiento page
                    const segLink = await page.evaluate(() => {
                        const a = document.querySelector('a[href*="seguimiento"]');
                        return a ? a.href : null;
                    });
                    if (segLink) {
                        await page.goto(segLink, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        await screenshot(page, `${OUT}/admin-seguimiento.png`);
                        console.log('  seguimiento OK');
                    }
                }
            } catch(e) {
                console.log(`  cliente-detalle FAIL: ${e.message.slice(0, 60)}`);
            }
        }

        await page.close();
        await ctx.close();
    }

    await browser.close();
    console.log('\nDone!');
}

run().catch(e => { console.error(e); process.exit(1); });
