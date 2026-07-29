-- Manual offline payment methods (admin-recorded). Online payme/click/mock unchanged.
ALTER TYPE "payment_provider" ADD VALUE IF NOT EXISTS 'card';
ALTER TYPE "payment_provider" ADD VALUE IF NOT EXISTS 'transfer';
ALTER TYPE "payment_provider" ADD VALUE IF NOT EXISTS 'terminal';
