from pydantic import BaseModel, Field
from typing import List, Optional

class CartItemSchema(BaseModel):
    id: str
    name: str
    brand: str
    price: float
    qty: int
    rx: bool

class OrderCreate(BaseModel):
    items: List[CartItemSchema]
    totalPrice: float
    shippingAddress: str
    paymentMethod: str
    prescriptionUrl: Optional[str] = None

class OrderResponse(BaseModel):
    id: str
    user_email: str
    items: List[CartItemSchema]
    totalPrice: float
    shippingAddress: str
    paymentMethod: str
    prescriptionUrl: Optional[str] = None
    status: str
    date: str


