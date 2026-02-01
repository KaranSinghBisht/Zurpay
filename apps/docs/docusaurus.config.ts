import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const ADMIN_URL = process.env.ADMIN_URL || 'http://localhost:3000';
const EMPLOYEE_URL = process.env.EMPLOYEE_URL || 'http://localhost:3002';

const config: Config = {
  title: 'Zurpay',
  tagline: 'Confidential payroll on Solana — amounts encrypted, claims gated by ZK',
  favicon: 'img/favicon.svg',

  future: {
    v4: true,
  },

  url: 'https://docs.zurpay.xyz',
  baseUrl: '/',

  organizationName: 'zurpay',
  projectName: 'zurpay',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/', // Docs at root
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/zurpay/zurpay/tree/main/apps/docs/',
        },
        blog: false, // Disable blog
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/zurpay-social-card.png',
    colorMode: {
      defaultMode: 'light',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Zurpay',
      logo: {
        alt: 'Zurpay Logo',
        src: 'img/logo.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: ADMIN_URL,
          label: 'Admin Dashboard',
          position: 'right',
        },
        {
          href: EMPLOYEE_URL,
          label: 'Employee Portal',
          position: 'right',
        },
        {
          href: 'https://github.com/zurpay/zurpay',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Introduction',
              to: '/',
            },
            {
              label: 'How It Works',
              to: '/how-it-works',
            },
            {
              label: 'User Guide',
              to: '/user-guide/admin-setup',
            },
          ],
        },
        {
          title: 'Apps',
          items: [
            {
              label: 'Admin Dashboard',
              href: ADMIN_URL,
            },
            {
              label: 'Employee Portal',
              href: EMPLOYEE_URL,
            },
            {
              label: 'Solana Explorer',
              href: 'https://explorer.solana.com/?cluster=devnet',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/zurpay/zurpay',
            },
            {
              label: 'Twitter',
              href: 'https://twitter.com/zurpay',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Zurpay. Built for Solana Privacy Hackathon 2026.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'solidity', 'rust', 'toml'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
