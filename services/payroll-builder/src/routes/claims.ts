import { Router } from 'express';
import { getClaimPackageByToken, getTokenStatus, markTokenUsed } from '../payrun-builder';
import { verifyClaimTransaction } from '../claim-verifier';

const router = Router();

router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const claimPackage = await getClaimPackageByToken(token);

    if (claimPackage) {
      return res.json(claimPackage);
    }

    const status = await getTokenStatus(token);

    if (!status.exists) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    if (status.used) {
      return res.status(410).json({ error: 'Claim already used' });
    }

    if (status.expired) {
      return res.status(410).json({ error: 'Claim expired' });
    }

    return res.status(404).json({ error: 'Claim not found' });
  } catch (error) {
    console.error('Get claim package error:', error);
    return res.status(500).json({ error: 'Failed to get claim package' });
  }
});

router.post('/:token/mark-used', async (req, res) => {
  try {
    const { token } = req.params;
    const { txSignature } = req.body;

    if (!txSignature) {
      return res.status(400).json({ error: 'Missing txSignature' });
    }

    const claimPackage = await getClaimPackageByToken(token);
    if (!claimPackage) {
      const status = await getTokenStatus(token);
      if (!status.exists) {
        return res.status(404).json({ error: 'Claim not found' });
      }
      if (status.used) {
        return res.status(410).json({ error: 'Claim already used' });
      }
      if (status.expired) {
        return res.status(410).json({ error: 'Claim expired' });
      }
      return res.status(404).json({ error: 'Claim not found' });
    }

    const isValid = await verifyClaimTransaction(txSignature, claimPackage);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid claim transaction' });
    }

    const success = await markTokenUsed(token);
    if (success) {
      return res.json({ success: true });
    }

    return res.status(404).json({ error: 'Token not found' });
  } catch (error) {
    console.error('Mark claim used error:', error);
    return res.status(500).json({ error: 'Failed to mark token used' });
  }
});

export default router;
