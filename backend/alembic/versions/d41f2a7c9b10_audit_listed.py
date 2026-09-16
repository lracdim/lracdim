"""audit listed flag

Revision ID: d41f2a7c9b10
Revises: c0a23653d173
Create Date: 2026-09-16
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'd41f2a7c9b10'
down_revision = 'c0a23653d173'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('audits', schema=None) as batch_op:
        batch_op.add_column(sa.Column('listed', sa.Integer(), nullable=False, server_default='1'))
        batch_op.create_index(batch_op.f('ix_audits_listed'), ['listed'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('audits', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_audits_listed'))
        batch_op.drop_column('listed')
