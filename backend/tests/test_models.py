import uuid

from app.models import Command, CommandPointMapping, Dashboard, DataPoint, Device, Product, Rule


class TestProductModel:
    async def test_create_product(self, db):
        product = Product(
            id=uuid.uuid4(),
            name="温湿度传感器",
            model="TH-100",
            protocol="modbus_rtu",
            tags=["温湿度", "Modbus"],
        )
        db.add(product)
        await db.commit()
        assert product.name == "温湿度传感器"
        assert product.status == "draft"
        assert "温湿度" in product.tags

    async def test_product_with_data_points(self, db):
        product = Product(
            id=uuid.uuid4(),
            name="电表",
            model="EM-200",
            protocol="modbus_tcp",
        )
        db.add(product)
        await db.flush()

        dp1 = DataPoint(
            product_id=product.id,
            identifier="voltage_a",
            name="A相电压",
            data_type="float32",
            unit="V",
            register="40001",
            range_min=0,
            range_max=300,
        )
        db.add(dp1)
        await db.commit()
        await db.refresh(product)

        # 用显式查询验证关系
        from sqlalchemy import select
        stmt = select(DataPoint).where(DataPoint.product_id == product.id)
        result = await db.execute(stmt)
        points = result.scalars().all()
        assert len(points) == 1
        assert points[0].identifier == "voltage_a"

    async def test_product_with_commands(self, db):
        product = Product(
            id=uuid.uuid4(),
            name="执行器",
            model="ACT-001",
            protocol="modbus_rtu",
        )
        db.add(product)
        await db.flush()

        dp = DataPoint(
            product_id=product.id,
            identifier="target_temp",
            name="目标温度",
            data_type="int16",
            unit="℃",
            register="40010",
            access="RW",
        )
        db.add(dp)
        await db.flush()

        cmd = Command(
            product_id=product.id,
            identifier="set_temperature",
            name="设置温度",
            method="06",
            parameters=[{"name": "value", "type": "int16", "required": True}],
        )
        db.add(cmd)
        await db.flush()

        mapping = CommandPointMapping(
            command_id=cmd.id,
            point_id=dp.id,
            relation="WRITE_TO",
        )
        db.add(mapping)
        await db.commit()

        # 用显式查询验证
        from sqlalchemy import select
        stmt = select(CommandPointMapping).where(CommandPointMapping.command_id == cmd.id)
        result = await db.execute(stmt)
        mappings = result.scalars().all()
        assert len(mappings) == 1
        assert mappings[0].relation == "WRITE_TO"


class TestDeviceModel:
    async def test_create_device(self, db):
        product = Product(
            id=uuid.uuid4(),
            name="传感器",
            model="S-001",
            protocol="mqtt",
        )
        db.add(product)
        await db.flush()

        device = Device(
            product_id=product.id,
            name="1号车间传感器",
            device_id="sensor-workshop-01",
            secret="secret123",
        )
        db.add(device)
        await db.commit()
        assert device.device_id == "sensor-workshop-01"
        assert device.status == "offline"


class TestRuleModel:
    async def test_create_rule(self, db):
        rule = Rule(
            id=uuid.uuid4(),
            name="高温告警",
            rule_type="alert",
            trigger={"metric": "temperature", "operator": "gt", "value": 80},
            actions=[{"type": "notify", "channels": ["sms"]}],
            ai_generated=True,
            ai_prompt="温度超过80度报警",
        )
        db.add(rule)
        await db.commit()
        assert rule.name == "高温告警"
        assert rule.ai_generated is True


class TestDashboardModel:
    async def test_create_dashboard(self, db):
        dash = Dashboard(
            id=uuid.uuid4(),
            name="环境监控大屏",
            layout=[
                {"type": "gauge", "title": "温度", "position": {"x": 0, "y": 0, "w": 4, "h": 3}},
            ],
            ai_generated=True,
        )
        db.add(dash)
        await db.commit()
        assert dash.name == "环境监控大屏"
        assert len(dash.layout) == 1
