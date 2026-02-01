import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    'how-it-works',
    {
      type: 'category',
      label: 'User Guide',
      items: [
        'user-guide/admin-setup',
        'user-guide/create-payrun',
        'user-guide/employee-claims',
        'user-guide/payment-requests',
      ],
    },
    {
      type: 'category',
      label: 'Technical',
      items: [
        'technical/architecture',
        'technical/smart-contracts',
        'technical/zk-circuit',
        'technical/api-reference',
      ],
    },
    {
      type: 'category',
      label: 'Resources',
      items: ['resources/program-ids', 'resources/trust-model'],
    },
    'disclaimer',
  ],
};

export default sidebars;
