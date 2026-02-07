from fastapi import FastAPI, HTTPException
from app.services.payment import PaymentService
from app.services.refund import RefundService
from app.schemas import PaymentRequest, RefundRequest

app = FastAPI()

payment_service = PaymentService()
refund_service = RefundService()


@app.post("/payments")
async def create_payment(request: PaymentRequest):
    try:
        payment = await payment_service.create_payment(
            amount=request.amount,
            currency=request.currency,
            customer_id=request.customer_id,
            idempotency_key=request.idempotency_key
        )
        return {"payment_id": payment.id, "status": payment.status}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/payments/{payment_id}/refund")
async def refund_payment(payment_id: str, request: RefundRequest):
    try:
        refund = await refund_service.process_refund(
            payment_id=payment_id,
            amount=request.amount,
            reason=request.reason
        )
        return {"refund_id": refund.id, "status": refund.status}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/payments/{payment_id}")
async def get_payment(payment_id: str):
    payment = await payment_service.get_payment(payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    return payment.to_dict()
