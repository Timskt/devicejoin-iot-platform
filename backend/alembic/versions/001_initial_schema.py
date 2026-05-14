"""initial schema

Revision ID: 001
Revises: None
Create Date: 2026-05-15

This is the initial database schema for DeviceJoin IoT Platform.
Run: alembic upgrade head (requires PostgreSQL running)
"""

revision = "001"
down_revision = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSON


def upgrade() -> None:
    op.create_table(
        "products",
        sa.Column("id", UUID(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("manufacturer", sa.String(200)),
        sa.Column("protocol", sa.String(50), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("tags", JSON(), default=[]),
        sa.Column("status", sa.String(20), default="draft"),
        sa.Column("source_documents", JSON(), default=[]),
        sa.Column("ai_confidence", sa.Float()),
        sa.Column("created_at", sa.DateTime()),
        sa.Column("updated_at", sa.DateTime()),
    )
    op.create_index("ix_products_name", "products", ["name"])

    op.create_table(
        "data_points",
        sa.Column("id", UUID(), primary_key=True),
        sa.Column("product_id", UUID(), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("identifier", sa.String(100), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("category", sa.String(50)),
        sa.Column("register", sa.String(50)),
        sa.Column("data_type", sa.String(20), nullable=False),
        sa.Column("unit", sa.String(20)),
        sa.Column("access", sa.String(10), default="R"),
        sa.Column("scale", sa.Float(), default=1.0),
        sa.Column("offset", sa.Float(), default=0.0),
        sa.Column("precision", sa.Integer(), default=1),
        sa.Column("range_min", sa.Float()),
        sa.Column("range_max", sa.Float()),
        sa.Column("enum_values", JSON()),
        sa.Column("ai_confidence", sa.String(20), default="unknown"),
        sa.Column("ai_reasoning", sa.Text()),
        sa.Column("needs_review", sa.Boolean(), default=False),
        sa.Column("created_at", sa.DateTime()),
        sa.Column("updated_at", sa.DateTime()),
    )
    op.create_index("ix_dp_product_id", "data_points", ["product_id"])
    op.create_index("ix_dp_product_identifier", "data_points", ["product_id", "identifier"], unique=True)

    op.create_table(
        "commands",
        sa.Column("id", UUID(), primary_key=True),
        sa.Column("product_id", UUID(), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("identifier", sa.String(100), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("method", sa.String(20)),
        sa.Column("parameters", JSON(), default=[]),
        sa.Column("response_schema", JSON()),
        sa.Column("timeout_ms", sa.Integer(), default=5000),
        sa.Column("ai_confidence", sa.String(20), default="unknown"),
        sa.Column("needs_review", sa.Boolean(), default=False),
        sa.Column("created_at", sa.DateTime()),
        sa.Column("updated_at", sa.DateTime()),
    )
    op.create_index("ix_cmd_product_id", "commands", ["product_id"])

    op.create_table(
        "command_point_mappings",
        sa.Column("id", UUID(), primary_key=True),
        sa.Column("command_id", UUID(), sa.ForeignKey("commands.id", ondelete="CASCADE"), nullable=False),
        sa.Column("point_id", UUID(), sa.ForeignKey("data_points.id", ondelete="CASCADE"), nullable=False),
        sa.Column("relation", sa.String(20), nullable=False),
    )

    op.create_table(
        "devices",
        sa.Column("id", UUID(), primary_key=True),
        sa.Column("product_id", UUID(), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("device_id", sa.String(100), nullable=False, unique=True),
        sa.Column("secret", sa.String(200)),
        sa.Column("status", sa.String(20), default="offline"),
        sa.Column("connection_info", JSON()),
        sa.Column("last_online_at", sa.DateTime()),
        sa.Column("metadata", JSON()),
        sa.Column("created_at", sa.DateTime()),
        sa.Column("updated_at", sa.DateTime()),
    )
    op.create_index("ix_dev_product_id", "devices", ["product_id"])
    op.create_index("ix_dev_device_id", "devices", ["device_id"], unique=True)

    op.create_table(
        "telemetries",
        sa.Column("id", UUID(), primary_key=True),
        sa.Column("device_id", UUID(), sa.ForeignKey("devices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("point_id", UUID(), sa.ForeignKey("data_points.id"), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("raw_value", sa.String()),
        sa.Column("quality", sa.Integer(), default=0),
        sa.Column("reported_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_tel_device_id", "telemetries", ["device_id"])
    op.create_index("ix_tel_reported_at", "telemetries", ["reported_at"])

    op.create_table(
        "rules",
        sa.Column("id", UUID(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("rule_type", sa.String(20), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("trigger", JSON(), nullable=False),
        sa.Column("actions", JSON(), nullable=False),
        sa.Column("enabled", sa.Boolean(), default=True),
        sa.Column("scope", JSON()),
        sa.Column("ai_generated", sa.Boolean(), default=False),
        sa.Column("ai_prompt", sa.Text()),
        sa.Column("created_at", sa.DateTime()),
        sa.Column("updated_at", sa.DateTime()),
    )

    op.create_table(
        "dashboards",
        sa.Column("id", UUID(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("layout", JSON(), nullable=False),
        sa.Column("ai_generated", sa.Boolean(), default=False),
        sa.Column("ai_prompt", sa.Text()),
        sa.Column("created_at", sa.DateTime()),
        sa.Column("updated_at", sa.DateTime()),
    )

    op.create_table(
        "ai_parse_sessions",
        sa.Column("id", UUID(), primary_key=True),
        sa.Column("status", sa.String(20), default="uploaded"),
        sa.Column("uploaded_files", JSON(), default=[]),
        sa.Column("raw_analysis", JSON()),
        sa.Column("confirmed_product_id", UUID(), sa.ForeignKey("products.id"), nullable=True),
        sa.Column("chat_history", JSON(), default=[]),
        sa.Column("created_at", sa.DateTime()),
        sa.Column("updated_at", sa.DateTime()),
    )

    op.create_table(
        "knowledge_entries",
        sa.Column("id", UUID(), primary_key=True),
        sa.Column("product_id", UUID(), sa.ForeignKey("products.id"), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_type", sa.String(50)),
        sa.Column("embedding", sa.String()),
        sa.Column("metadata", JSON()),
        sa.Column("created_at", sa.DateTime()),
    )


def downgrade() -> None:
    op.drop_table("knowledge_entries")
    op.drop_table("ai_parse_sessions")
    op.drop_table("dashboards")
    op.drop_table("rules")
    op.drop_table("telemetries")
    op.drop_table("devices")
    op.drop_table("command_point_mappings")
    op.drop_table("commands")
    op.drop_table("data_points")
    op.drop_table("products")
