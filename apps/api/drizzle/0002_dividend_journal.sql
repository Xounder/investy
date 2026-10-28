-- Add the distinct cash-income journal event without rewriting historical JCP rows.
ALTER TYPE "transaction_type" ADD VALUE IF NOT EXISTS 'dividend' BEFORE 'jcp';
