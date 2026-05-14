"""
WebSocket and telemetry API endpoints for real-time device data.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/ws", tags=["websocket"])

active_connections: dict[str, WebSocket] = {}


@router.websocket("/telemetry/{device_id}")
async def telemetry_websocket(websocket: WebSocket, device_id: str):
    """WebSocket endpoint for real-time device telemetry streaming.

    Clients connect to receive live data updates for a specific device.
    """
    await websocket.accept()
    active_connections[device_id] = websocket
    logger.info("ws_connected", device_id=device_id)

    try:
        while True:
            data = await websocket.receive_text()
            # In production: parse incoming telemetry and broadcast to subscribers
            logger.info("ws_message", device_id=device_id, data_preview=data[:100])
    except WebSocketDisconnect:
        logger.info("ws_disconnected", device_id=device_id)
    finally:
        active_connections.pop(device_id, None)


async def broadcast_telemetry(device_id: str, payload: dict) -> None:
    """Send telemetry data to an actively connected device WebSocket client."""
    ws = active_connections.get(device_id)
    if ws:
        import json
        await ws.send_text(json.dumps(payload, default=str))
