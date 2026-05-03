import base64
import binascii
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from html import escape

from ..core.database import get_db
from ..core.security import get_current_user, require_role
from .models import (
    Order,
    OrderItem,
    CartItem,
    OnlineOrder,
    OrderType,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    PrescriptionReviewStatus,
)
from ..inventory.models import Medicine, Inventory
from .schemas import (
    OrderCreate,
    OrderOut,
    OrderItemAdd,
    OrderItemOut,
    OrderStatusPatch,
    PrescriptionReviewPatch,
    PrescriptionUploadOut,
    PrescriptionUploadRequest,
    CartItemAdd,
    CartItemPatch,
    CartItemOut,
    CartMedicineOut,
    CheckoutRequest,
)
from .service import complete_order, add_item_to_order

router = APIRouter(tags=["orders"])

ALLOWED_PRESCRIPTION_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_PRESCRIPTION_BYTES = 2 * 1024 * 1024


def _initial_payment_status(method: PaymentMethod) -> PaymentStatus:
    """Demo payment gateway behavior: online methods are captured during checkout."""
    if method in (PaymentMethod.upi, PaymentMethod.card):
        return PaymentStatus.paid
    return PaymentStatus.pending


def _active_stock_subquery():
    from datetime import date

    return (
        select(
            Inventory.medicine_id.label("medicine_id"),
            func.sum(Inventory.quantity_available).label("stock_available"),
            func.min(Inventory.selling_price).label("selling_price"),
        )
        .where(
            Inventory.quantity_available > 0,
            Inventory.expiry_date > date.today(),
        )
        .group_by(Inventory.medicine_id)
        .subquery()
    )


def _to_cart_item_out(
    item: CartItem, medicine: Medicine, selling_price, stock_available
) -> CartItemOut:
    med = CartMedicineOut(
        id=medicine.id,
        name=medicine.name,
        brand=medicine.brand,
        category=medicine.category,
        prescription_required=medicine.prescription_required,
        gst_rate=medicine.gst_rate,
        selling_price=selling_price,
        stock_available=int(stock_available or 0),
    )
    return CartItemOut(
        id=item.id,
        user_id=item.user_id,
        medicine_id=item.medicine_id,
        quantity=item.quantity,
        medicine=med,
    )


async def _get_cart_item_with_metrics(
    db: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID
) -> CartItemOut:
    stock_sq = _active_stock_subquery()
    result = await db.execute(
        select(
            CartItem,
            Medicine,
            stock_sq.c.selling_price,
            func.coalesce(stock_sq.c.stock_available, 0).label("stock_available"),
        )
        .join(Medicine, Medicine.id == CartItem.medicine_id)
        .outerjoin(stock_sq, stock_sq.c.medicine_id == CartItem.medicine_id)
        .where(CartItem.id == item_id, CartItem.user_id == user_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Cart item not found")
    return _to_cart_item_out(*row)


async def _get_order_with_relations(
    db: AsyncSession, order_id: uuid.UUID
) -> Order | None:
    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.items).selectinload(OrderItem.medicine),
            selectinload(Order.online_order),
        )
        .where(Order.id == order_id)
    )
    return result.scalar_one_or_none()


async def _cart_requires_prescription(
    db: AsyncSession, cart_items: list[CartItem]
) -> bool:
    medicine_ids = [item.medicine_id for item in cart_items]
    if not medicine_ids:
        return False
    result = await db.execute(
        select(func.count(Medicine.id)).where(
            Medicine.id.in_(medicine_ids),
            Medicine.prescription_required.is_(True),
        )
    )
    return int(result.scalar_one() or 0) > 0


async def _calculate_order_totals(db: AsyncSession, order_id: uuid.UUID) -> None:
    rows_result = await db.execute(
        select(OrderItem, Medicine)
        .join(Medicine, Medicine.id == OrderItem.medicine_id)
        .where(OrderItem.order_id == order_id)
    )
    total = 0
    tax_total = 0
    for item, medicine in rows_result.all():
        line_total = item.unit_price * item.quantity
        total += line_total
        tax_total += line_total * medicine.gst_rate / 100

    order_result = await db.execute(select(Order).where(Order.id == order_id))
    order = order_result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order.total_amount = total
    order.tax_amount = tax_total


def _safe(value: str | None) -> str:
    if not value:
        return "-"
    return escape(str(value))


def _money(value) -> str:
    return f"Rs {float(value or 0):,.2f}"


def _enum_value(value) -> str:
    return str(getattr(value, "value", value) or "-")


def _pretty_label(value) -> str:
    return _enum_value(value).replace("_", " ").title()


def _invoice_html(order: Order, rows: list[tuple[OrderItem, Medicine]]) -> str:
    payment = _enum_value(order.payment_method).upper()
    online = getattr(order, "online_order", None)
    online_payment_status = getattr(online, "payment_status", None)
    payment_status = (
        _enum_value(online_payment_status)
        if online_payment_status
        else ("paid" if order.type == OrderType.offline else "pending")
    )
    prescription_status = (
        getattr(online, "prescription_status", None)
        if online
        else PrescriptionReviewStatus.not_required.value
    )
    customer_address = order.customer_address
    if not customer_address and online and getattr(online, "delivery_address", None):
        delivery = getattr(online, "delivery_address") or {}
        customer_address = ", ".join(
            str(delivery.get(key, "")).strip()
            for key in ("line1", "line2", "city", "state", "pincode")
            if str(delivery.get(key, "")).strip()
        )

    generated_at = order.created_at.strftime("%d %b %Y, %I:%M %p")
    invoice_no = str(order.id)[:8].upper()
    grand_total = order.total_amount + order.tax_amount

    item_rows = "".join(
        f"""
        <tr>
          <td class="item-cell">
            <div class="item-name">{_safe(medicine.name)}</div>
            <div class="item-meta">{_safe(medicine.composition)}</div>
          </td>
          <td>
            <div>{_safe(medicine.brand)}</div>
            <div class="item-meta">{_safe(medicine.category)}</div>
          </td>
          <td class="num">{item.quantity}</td>
          <td class="num">{_money(item.unit_price)}</td>
          <td class="num">{float(medicine.gst_rate):.2f}%</td>
          <td class="num">{_money((item.unit_price * item.quantity) * medicine.gst_rate / 100)}</td>
          <td class="num strong">{_money((item.unit_price * item.quantity) + ((item.unit_price * item.quantity) * medicine.gst_rate / 100))}</td>
        </tr>
        """
        for item, medicine in rows
    )

    return f"""
    <html>
      <head>
        <style>
          @page {{ size: A4; margin: 18mm 16mm; }}
          * {{ box-sizing: border-box; }}
          body {{
            margin: 0;
            background: #f5faf8;
            color: #13251f;
            font-family: Helvetica, Arial, sans-serif;
            font-size: 11px;
            line-height: 1.45;
          }}
          .sheet {{
            background: #ffffff;
            border: 1px solid #dce9e4;
            border-radius: 18px;
            overflow: hidden;
          }}
          .masthead {{
            width: 100%;
            border-collapse: collapse;
            background: #0c352e;
            color: #ffffff;
          }}
          .masthead td {{ padding: 24px 28px; vertical-align: top; }}
          .brand {{ font-size: 27px; font-weight: 800; letter-spacing: -0.8px; }}
          .brand-kicker {{ color: #9ee3cf; font-size: 10px; letter-spacing: 2.8px; text-transform: uppercase; }}
          .brand-sub {{ color: #c9eee2; font-size: 10px; margin-top: 7px; }}
          .invoice-title {{ font-size: 21px; font-weight: 800; letter-spacing: 0.4px; text-align: right; }}
          .invoice-meta {{ color: #c9eee2; font-size: 10px; margin-top: 4px; text-align: right; }}
          .pill {{
            border-radius: 999px;
            color: #074232;
            background: #c7f6df;
            font-size: 9px;
            font-weight: 800;
            letter-spacing: 0.6px;
            margin-top: 10px;
            padding: 6px 10px;
            text-align: center;
            text-transform: uppercase;
            width: 168px;
          }}
          .section {{ padding: 20px 24px 0; }}
          .cards {{ width: 100%; border-collapse: separate; border-spacing: 0 0; }}
          .cards td {{ vertical-align: top; width: 50%; }}
          .card {{
            border: 1px solid #dce9e4;
            border-radius: 14px;
            min-height: 116px;
            padding: 14px;
          }}
          .card-gap {{ width: 12px !important; border: 0 !important; padding: 0; }}
          .eyebrow {{
            color: #0f766e;
            font-size: 9px;
            font-weight: 800;
            letter-spacing: 1.8px;
            margin-bottom: 8px;
            text-transform: uppercase;
          }}
          .line {{ margin: 3px 0; }}
          .label {{ color: #66756f; font-weight: 700; }}
          .muted {{ color: #66756f; }}
          .report-strip {{
            background: #effaf6;
            border-bottom: 1px solid #dce9e4;
            border-top: 1px solid #dce9e4;
            margin-top: 18px;
            padding: 10px 24px;
          }}
          .report-strip table {{ width: 100%; border-collapse: collapse; }}
          .report-strip td {{ color: #49635b; font-size: 10px; padding: 2px 0; }}
          .report-strip strong {{ color: #102a24; }}
          .items {{
            border-collapse: collapse;
            table-layout: fixed;
            width: 100%;
          }}
          .items th {{
            background: #102a24;
            color: #d8fff0;
            font-size: 8.5px;
            font-weight: 800;
            letter-spacing: 0.8px;
            padding: 10px 8px;
            text-align: left;
            text-transform: uppercase;
          }}
          .items td {{
            border-bottom: 1px solid #e7efec;
            color: #172d27;
            padding: 11px 8px;
            vertical-align: top;
          }}
          .items tr:nth-child(even) td {{ background: #fbfefd; }}
          .item-name {{ color: #0c352e; font-size: 12px; font-weight: 800; }}
          .item-meta {{ color: #6c7d76; font-size: 9px; margin-top: 2px; }}
          .num {{ text-align: right; white-space: nowrap; }}
          .strong {{ font-weight: 800; }}
          .totals-layout {{ width: 100%; border-collapse: collapse; margin-top: 18px; }}
          .totals-layout td {{ vertical-align: top; }}
          .care-note {{
            background: #f7fbfa;
            border: 1px dashed #bfd8cf;
            border-radius: 14px;
            color: #49635b;
            padding: 13px 14px;
            width: 58%;
          }}
          .summary {{
            border: 1px solid #c9ded6;
            border-radius: 16px;
            margin-left: 18px;
            overflow: hidden;
            width: 42%;
          }}
          .summary table {{ width: 100%; border-collapse: collapse; }}
          .summary td {{ border-bottom: 1px solid #e4efeb; padding: 9px 12px; }}
          .summary .grand td {{
            background: #0c352e;
            border-bottom: 0;
            color: #ffffff;
            font-size: 14px;
            font-weight: 800;
          }}
          .footer {{
            border-top: 1px solid #dce9e4;
            color: #6c7d76;
            font-size: 9px;
            margin-top: 20px;
            padding: 13px 24px 18px;
          }}
          .footer table {{ width: 100%; border-collapse: collapse; }}
          .right {{ text-align: right; }}
        </style>
      </head>
      <body>
        <div class="sheet">
          <table class="masthead">
            <tr>
              <td>
                <div class="brand-kicker">Care-first Pharmacy</div>
                <div class="brand">MedStore</div>
                <div class="brand-sub">123 Health Avenue, Mumbai · support@medstore.local</div>
                <div class="brand-sub">GSTIN: 27AAECM0000A1Z5 · DL No: MH-MED-2026</div>
              </td>
              <td class="right">
                <div class="invoice-title">PHARMACY TAX INVOICE</div>
                <div class="invoice-meta">Invoice No. #{invoice_no}</div>
                <div class="invoice-meta">Generated {generated_at}</div>
                <div class="pill">{payment} · {payment_status.upper()}</div>
              </td>
            </tr>
          </table>

          <div class="section">
            <table class="cards">
              <tr>
                <td>
                  <div class="card">
                    <div class="eyebrow">Bill To</div>
                    <div class="line"><span class="label">Customer:</span> {_safe(order.customer_name or "Walk-in Customer")}</div>
                    <div class="line"><span class="label">Phone:</span> {_safe(order.customer_phone)}</div>
                    <div class="line"><span class="label">Address:</span> {_safe(customer_address)}</div>
                  </div>
                </td>
                <td class="card-gap"></td>
                <td>
                  <div class="card">
                    <div class="eyebrow">Clinical Context</div>
                    <div class="line"><span class="label">Prescribed By:</span> {_safe(order.doctor_name)}</div>
                    <div class="line"><span class="label">Doctor Reg.:</span> {_safe(order.doctor_registration)}</div>
                    <div class="line"><span class="label">Rx Review:</span> {_safe(_pretty_label(prescription_status))}</div>
                    <div class="line"><span class="label">Notes:</span> {_safe(order.prescription_notes)}</div>
                  </div>
                </td>
              </tr>
            </table>
          </div>

          <div class="report-strip">
            <table>
              <tr>
                <td><strong>Order Type:</strong> {_safe(_pretty_label(order.type))}</td>
                <td><strong>Order Status:</strong> {_safe(_pretty_label(order.status))}</td>
                <td><strong>Payment Method:</strong> {_safe(payment)}</td>
                <td class="right"><strong>Payment Status:</strong> {_safe(_pretty_label(payment_status))}</td>
              </tr>
            </table>
          </div>

          <div class="section">
            <table class="items">
              <colgroup>
                <col style="width: 31%;" />
                <col style="width: 17%;" />
                <col style="width: 7%;" />
                <col style="width: 13%;" />
                <col style="width: 9%;" />
                <col style="width: 11%;" />
                <col style="width: 12%;" />
              </colgroup>
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Brand / Category</th>
                  <th class="num">Qty</th>
                  <th class="num">Rate</th>
                  <th class="num">GST %</th>
                  <th class="num">Tax</th>
                  <th class="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {item_rows}
              </tbody>
            </table>

            <table class="totals-layout">
              <tr>
                <td class="care-note">
                  <div class="eyebrow">Pharmacy Note</div>
                  This invoice is generated from the MedStore billing system. Please retain it
                  for medicine purchase records, prescription validation and return-policy
                  reference. Verify dosage and directions with the prescribing doctor.
                </td>
                <td>
                  <div class="summary">
                    <table>
                      <tr>
                        <td>Taxable Subtotal</td>
                        <td class="num strong">{_money(order.total_amount)}</td>
                      </tr>
                      <tr>
                        <td>GST / Tax</td>
                        <td class="num strong">{_money(order.tax_amount)}</td>
                      </tr>
                      <tr class="grand">
                        <td>Total Payable</td>
                        <td class="num">{_money(grand_total)}</td>
                      </tr>
                    </table>
                  </div>
                </td>
              </tr>
            </table>
          </div>

          <div class="footer">
            <table>
              <tr>
                <td>Computer generated invoice. No physical signature required.</td>
                <td class="right">Thank you for choosing MedStore.</td>
              </tr>
            </table>
          </div>
        </div>
      </body>
    </html>
    """


def _pdf_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _pdf_text_width(text: str, size: int, font: str = "F1") -> float:
    factor = 0.58 if font == "F2" else 0.52
    return len(text) * size * factor


def _pdf_trim_to_width(text: str, size: int, max_width: float, font: str = "F1") -> str:
    value = str(text or "-")
    if _pdf_text_width(value, size, font) <= max_width:
        return value

    ellipsis = "..."
    trimmed = value
    while trimmed and _pdf_text_width(trimmed + ellipsis, size, font) > max_width:
        trimmed = trimmed[:-1]
    return (trimmed.rstrip() + ellipsis) if trimmed else ellipsis


def _pdf_wrap(text: str | None, max_chars: int) -> list[str]:
    value = str(text or "-")
    words = value.split()
    if not words:
        return ["-"]

    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) <= max_chars:
            current = candidate
            continue
        if current:
            lines.append(current)
        current = word[:max_chars]
    if current:
        lines.append(current)
    return lines[:3]


def _pdf_wrap_to_width(
    text: str | None,
    size: int,
    max_width: float,
    *,
    font: str = "F1",
    max_lines: int = 2,
) -> list[str]:
    words = str(text or "-").split()
    if not words:
        return ["-"]

    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if _pdf_text_width(candidate, size, font) <= max_width:
            current = candidate
            continue

        if current:
            lines.append(current)
            current = word
        else:
            current = _pdf_trim_to_width(word, size, max_width, font)

        if len(lines) >= max_lines:
            break

    if current and len(lines) < max_lines:
        lines.append(current)

    return lines or ["-"]


class _PdfCanvas:
    def __init__(self) -> None:
        self.ops: list[str] = []

    def fill(self, color: tuple[float, float, float]) -> None:
        self.ops.append(f"{color[0]:.3f} {color[1]:.3f} {color[2]:.3f} rg")

    def stroke(self, color: tuple[float, float, float]) -> None:
        self.ops.append(f"{color[0]:.3f} {color[1]:.3f} {color[2]:.3f} RG")

    def line_width(self, width: float) -> None:
        self.ops.append(f"{width:.2f} w")

    def rect(
        self,
        x: float,
        y: float,
        w: float,
        h: float,
        *,
        fill: tuple[float, float, float] | None = None,
        stroke: tuple[float, float, float] | None = None,
    ) -> None:
        if fill:
            self.fill(fill)
        if stroke:
            self.stroke(stroke)
            self.line_width(0.8)
        op = "B" if fill and stroke else "f" if fill else "S"
        self.ops.append(f"{x:.2f} {y:.2f} {w:.2f} {h:.2f} re {op}")

    def line(
        self,
        x1: float,
        y1: float,
        x2: float,
        y2: float,
        color: tuple[float, float, float],
        width: float = 0.8,
    ) -> None:
        self.stroke(color)
        self.line_width(width)
        self.ops.append(f"{x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S")

    def text(
        self,
        x: float,
        y: float,
        value: str,
        *,
        size: int = 10,
        font: str = "F1",
        color: tuple[float, float, float] = (0.09, 0.12, 0.18),
    ) -> None:
        self.fill(color)
        self.ops.append(
            f"BT /{font} {size} Tf 1 0 0 1 {x:.2f} {y:.2f} Tm ({_pdf_escape(value)}) Tj ET"
        )

    def fit_text(
        self,
        x: float,
        y: float,
        value: str,
        max_width: float,
        *,
        size: int = 10,
        font: str = "F1",
        color: tuple[float, float, float] = (0.09, 0.12, 0.18),
    ) -> None:
        self.text(
            x,
            y,
            _pdf_trim_to_width(value, size, max_width, font),
            size=size,
            font=font,
            color=color,
        )

    def right_text(
        self,
        x_right: float,
        y: float,
        value: str,
        *,
        size: int = 10,
        font: str = "F1",
        color: tuple[float, float, float] = (0.09, 0.12, 0.18),
    ) -> None:
        width = _pdf_text_width(value, size, font)
        self.text(
            x_right - width,
            y,
            value,
            size=size,
            font=font,
            color=color,
        )

    def right_fit_text(
        self,
        x_right: float,
        y: float,
        value: str,
        max_width: float,
        *,
        size: int = 10,
        font: str = "F1",
        color: tuple[float, float, float] = (0.09, 0.12, 0.18),
    ) -> None:
        fitted = _pdf_trim_to_width(value, size, max_width, font)
        self.right_text(x_right, y, fitted, size=size, font=font, color=color)

    def text_lines(
        self,
        x: float,
        y: float,
        lines: list[str],
        *,
        line_gap: float = 11,
        size: int = 10,
        font: str = "F1",
        color: tuple[float, float, float] = (0.09, 0.12, 0.18),
    ) -> None:
        for index, line in enumerate(lines):
            self.text(x, y - (index * line_gap), line, size=size, font=font, color=color)


def _fallback_invoice_pdf(order: Order, rows: list[tuple[OrderItem, Medicine]]) -> bytes:
    canvas = _PdfCanvas()
    page_w = 595
    page_h = 842
    margin = 36
    slate = (0.07, 0.18, 0.23)
    ink = (0.09, 0.12, 0.18)
    muted = (0.41, 0.47, 0.55)
    border = (0.84, 0.87, 0.91)
    pale = (0.94, 0.97, 0.98)
    accent = (0.09, 0.47, 0.56)
    success_bg = (0.88, 0.97, 0.93)
    success_fg = (0.07, 0.38, 0.24)
    online_payment_status = getattr(order.online_order, "payment_status", None)
    payment_status = (
        getattr(online_payment_status, "value", online_payment_status)
        or ("paid" if order.type == OrderType.offline else "pending")
    )
    content_w = page_w - margin * 2
    header_y = 756
    header_h = 58
    header_right = page_w - margin - 18
    header_right_w = 185
    payment_method = (order.payment_method or "cash").upper()
    payment_label = f"{payment_status.upper()}: {payment_method}"

    canvas.rect(0, 0, page_w, page_h, fill=(0.98, 0.99, 1.0))
    canvas.rect(margin, header_y, content_w, header_h, fill=slate)
    canvas.rect(margin, header_y, 8, header_h, fill=accent)
    canvas.text(54, 790, "MedStore", size=22, font="F2", color=(1, 1, 1))
    canvas.fit_text(55, 774, "Pharmacy Billing & Retail Care", 230, size=9, color=(0.75, 0.85, 0.88))
    canvas.fit_text(
        55,
        762,
        "123 Health Avenue, Mumbai | support@medstore.local",
        290,
        size=8,
        color=(0.75, 0.85, 0.88),
    )
    canvas.right_fit_text(
        header_right,
        792,
        "TAX INVOICE",
        header_right_w,
        size=15,
        font="F2",
        color=(1, 1, 1),
    )
    canvas.right_fit_text(
        header_right,
        776,
        f"#{str(order.id)[:8].upper()}",
        header_right_w,
        size=10,
        font="F2",
        color=(0.86, 0.94, 0.96),
    )
    canvas.right_fit_text(
        header_right,
        763,
        order.created_at.strftime("%d %b %Y, %I:%M %p"),
        header_right_w,
        size=8,
        color=(0.86, 0.94, 0.96),
    )

    canvas.rect(page_w - margin - 122, 724, 122, 22, fill=success_bg)
    canvas.right_fit_text(
        page_w - margin - 9,
        731,
        payment_label,
        105,
        size=9,
        font="F2",
        color=success_fg,
    )
    canvas.fit_text(margin, 731, f"Order Type: {order.type.value.upper()}", 130, size=9, font="F2", color=muted)
    canvas.fit_text(168, 731, f"Status: {order.status.value.upper()}", 160, size=9, font="F2", color=muted)

    panel_y = 628
    panel_h = 78
    gap = 14
    panel_w = (content_w - gap) / 2
    canvas.rect(margin, panel_y, panel_w, panel_h, fill=(1, 1, 1), stroke=border)
    canvas.rect(margin + panel_w + gap, panel_y, panel_w, panel_h, fill=(1, 1, 1), stroke=border)
    canvas.text(50, 686, "CUSTOMER", size=9, font="F2", color=accent)
    canvas.text(50 + panel_w + gap, 686, "PRESCRIPTION", size=9, font="F2", color=accent)

    customer_lines = [
        f"Name: {order.customer_name or '-'}",
        f"Phone: {order.customer_phone or '-'}",
        f"Address: {' '.join(_pdf_wrap(order.customer_address, 42))}",
    ]
    prescription_lines = [
        f"Doctor: {order.doctor_name or '-'}",
        f"Reg No: {order.doctor_registration or '-'}",
        f"Notes: {' '.join(_pdf_wrap(order.prescription_notes, 40))}",
    ]
    for i, line in enumerate(customer_lines):
        canvas.fit_text(50, 666 - i * 16, line, panel_w - 28, size=9, color=ink)
    for i, line in enumerate(prescription_lines):
        canvas.fit_text(50 + panel_w + gap, 666 - i * 16, line, panel_w - 28, size=9, color=ink)

    table_top = 596
    row_h = 46
    canvas.rect(margin, table_top - 24, content_w, 24, fill=pale, stroke=border)
    columns: list[tuple[str, float, float, str]] = [
        ("Item", 50, 220, "left"),
        ("Brand", 285, 78, "left"),
        ("Qty", 395, 32, "right"),
        ("GST", 438, 34, "right"),
        ("Rate", 496, 64, "right"),
        ("Amount", page_w - margin, 74, "right"),
    ]
    for label, x, width, align in columns:
        if align == "right":
            canvas.right_fit_text(x, table_top - 15, label.upper(), width, size=8, font="F2", color=(0.22, 0.31, 0.36))
        else:
            canvas.fit_text(x, table_top - 15, label.upper(), width, size=8, font="F2", color=(0.22, 0.31, 0.36))

    y = table_top - 52
    max_rows = 7
    for index, (item, medicine) in enumerate(rows[:max_rows]):
        if index % 2 == 0:
            canvas.rect(margin, y - 10, content_w, row_h, fill=(1, 1, 1))
        else:
            canvas.rect(margin, y - 10, content_w, row_h, fill=(0.98, 0.99, 1.0))
        canvas.line(margin, y - 11, page_w - margin, y - 11, border, 0.5)
        name_lines = _pdf_wrap_to_width(
            medicine.name, 9, 220, font="F2", max_lines=2
        )
        canvas.text_lines(
            50,
            y + 8,
            name_lines,
            line_gap=12,
            size=9,
            font="F2",
            color=ink,
        )
        composition = medicine.composition or medicine.category or ""
        if composition:
            composition_y = y + 8 - (len(name_lines) * 12)
            composition_lines = _pdf_wrap_to_width(
                composition, 7, 220, max_lines=1
            )
            canvas.text_lines(
                50,
                composition_y,
                composition_lines,
                line_gap=9,
                size=7,
                color=muted,
            )
        brand_lines = _pdf_wrap_to_width(medicine.brand or "-", 9, 78, max_lines=2)
        canvas.text_lines(285, y + 4, brand_lines, line_gap=11, size=9, color=ink)
        line_total = item.unit_price * item.quantity
        line_tax = line_total * medicine.gst_rate / 100
        canvas.right_fit_text(395, y + 1, str(item.quantity), 32, size=9, color=ink)
        canvas.right_fit_text(438, y + 1, f"{medicine.gst_rate:.0f}%", 34, size=9, color=ink)
        canvas.right_fit_text(496, y + 1, f"Rs {item.unit_price:.2f}", 64, size=9, color=ink)
        canvas.right_fit_text(page_w - margin, y + 1, f"Rs {(line_total + line_tax):.2f}", 74, size=9, font="F2", color=ink)
        y -= row_h

    if len(rows) > max_rows:
        canvas.fit_text(50, y + 4, f"+ {len(rows) - max_rows} more item(s)", 200, size=8, font="F2", color=muted)
        y -= row_h

    summary_y = 126
    summary_x = 350
    summary_w = 209
    summary_h = 110
    canvas.rect(summary_x, summary_y, summary_w, summary_h, fill=(1, 1, 1), stroke=border)
    canvas.text(summary_x + 14, summary_y + 84, "BILL SUMMARY", size=9, font="F2", color=accent)
    canvas.text(summary_x + 14, summary_y + 62, "Subtotal", size=9, color=muted)
    canvas.right_fit_text(summary_x + summary_w - 14, summary_y + 62, f"Rs {order.total_amount:.2f}", 95, size=9, color=ink)
    canvas.text(summary_x + 14, summary_y + 42, "GST / Tax", size=9, color=muted)
    canvas.right_fit_text(summary_x + summary_w - 14, summary_y + 42, f"Rs {order.tax_amount:.2f}", 95, size=9, color=ink)
    canvas.line(summary_x + 14, summary_y + 32, summary_x + summary_w - 14, summary_y + 32, border, 0.8)
    canvas.text(summary_x + 14, summary_y + 14, "Total Payable", size=11, font="F2", color=ink)
    canvas.right_fit_text(
        summary_x + summary_w - 14,
        summary_y + 14,
        f"Rs {(order.total_amount + order.tax_amount):.2f}",
        100,
        size=12,
        font="F2",
        color=ink,
    )

    canvas.text(margin, 173, "Payment Method", size=8, font="F2", color=muted)
    canvas.fit_text(margin, 155, payment_method, 170, size=15, font="F2", color=accent)
    canvas.fit_text(margin, 141, f"Status: {payment_status.upper()}", 180, size=8, font="F2", color=muted)
    canvas.text(margin, 124, "This is a computer generated invoice.", size=8, color=muted)
    canvas.text(margin, 110, "Please retain it for pharmacy sale records and return policy reference.", size=8, color=muted)
    canvas.line(margin, 88, page_w - margin, 88, border, 0.8)
    canvas.text(margin, 70, "MedStore", size=9, font="F2", color=slate)
    canvas.right_text(page_w - margin, 70, "Thank you for your purchase", size=9, color=muted)

    stream = ("\n".join(canvas.ops) + "\n").encode("latin-1", errors="replace")

    objects = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 6 0 R >> >> /Contents 5 0 R >>\nendobj\n",
        b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        f"5 0 obj\n<< /Length {len(stream)} >>\nstream\n".encode("latin-1")
        + stream
        + b"endstream\nendobj\n",
        b"6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n",
    ]

    header = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    body = bytearray(header)
    offsets = [0]

    for obj in objects:
        offsets.append(len(body))
        body.extend(obj)

    xref_start = len(body)
    body.extend(f"xref\n0 {len(objects) + 1}\n".encode("latin-1"))
    body.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        body.extend(f"{offset:010d} 00000 n \n".encode("latin-1"))

    body.extend(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_start}\n%%EOF"
        ).encode("latin-1")
    )
    return bytes(body)


# ── Orders ────────────────────────────────────────────────────────────────────

@router.post("/prescriptions/upload", response_model=PrescriptionUploadOut)
async def upload_prescription(
    body: PrescriptionUploadRequest,
    current_user: dict = Depends(get_current_user),
):
    content_type = body.content_type.lower().split(";")[0].strip()
    extension = ALLOWED_PRESCRIPTION_TYPES.get(content_type)
    if not extension:
        raise HTTPException(
            status_code=400,
            detail="Upload a PDF, JPG, PNG, or WEBP prescription.",
        )

    try:
        file_bytes = base64.b64decode(body.data_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="Invalid prescription file data")

    if not file_bytes:
        raise HTTPException(status_code=400, detail="Prescription file is empty")
    if len(file_bytes) > MAX_PRESCRIPTION_BYTES:
        raise HTTPException(status_code=400, detail="Prescription must be under 2 MB")

    return PrescriptionUploadOut(
        prescription_url=f"data:{content_type};base64,{body.data_base64}",
        filename=body.filename,
        content_type=content_type,
        size_bytes=len(file_bytes),
    )

@router.post("/orders", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
async def create_order(
    body: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role("admin", "staff", "customer")),
):
    order = Order(
        id=uuid.uuid4(),
        type=body.type,
        user_id=uuid.UUID(current_user["sub"]),
        status=OrderStatus.pending,
        customer_name=body.customer_name,
        customer_phone=body.customer_phone,
        customer_address=body.customer_address,
        doctor_name=body.doctor_name,
        doctor_registration=body.doctor_registration,
        prescription_notes=body.prescription_notes,
        payment_method=body.payment_method.value,
    )
    db.add(order)
    await db.flush()

    if body.type == OrderType.online:
        online = OnlineOrder(
            order_id=order.id,
            payment_status=_initial_payment_status(body.payment_method),
            delivery_address=body.delivery_address,
            prescription_url=body.prescription_url,
            prescription_required=bool(body.prescription_url),
            prescription_status=(
                PrescriptionReviewStatus.pending_review.value
                if body.prescription_url
                else PrescriptionReviewStatus.not_required.value
            ),
        )
        db.add(online)

    await db.commit()
    loaded = await _get_order_with_relations(db, order.id)
    if not loaded:
        raise HTTPException(status_code=404, detail="Order not found")
    return loaded


@router.get("/orders", response_model=list[OrderOut])
async def list_orders(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    stmt = select(Order).options(
        selectinload(Order.items).selectinload(OrderItem.medicine),
        selectinload(Order.online_order),
    )
    if current_user.get("role") not in ("admin", "staff"):
        stmt = stmt.where(Order.user_id == uuid.UUID(current_user["sub"]))
    stmt = stmt.order_by(Order.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/orders/{order_id}", response_model=OrderOut)
async def get_order(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    order = await _get_order_with_relations(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if current_user.get("role") not in ("admin", "staff"):
        if order.user_id != uuid.UUID(current_user["sub"]):
            raise HTTPException(status_code=403, detail="Access denied")
    return order


@router.get("/orders/{order_id}/invoice.pdf")
async def get_order_invoice_pdf(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    order = await _get_order_with_relations(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if current_user.get("role") not in ("admin", "staff"):
        if order.user_id != uuid.UUID(current_user["sub"]):
            raise HTTPException(status_code=403, detail="Access denied")

    item_rows_result = await db.execute(
        select(OrderItem, Medicine)
        .join(Medicine, Medicine.id == OrderItem.medicine_id)
        .where(OrderItem.order_id == order_id)
    )
    rows = item_rows_result.all()
    if not rows:
        raise HTTPException(status_code=400, detail="Cannot generate invoice without order items")

    html_doc = _invoice_html(order, rows)
    try:
        from weasyprint import HTML

        pdf_bytes = HTML(string=html_doc).write_pdf()
    except Exception:
        pdf_bytes = _fallback_invoice_pdf(order, rows)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="invoice-{str(order.id)[:8]}.pdf"',
        },
    )


@router.patch("/orders/{order_id}/status", response_model=OrderOut)
async def update_order_status(
    order_id: uuid.UUID,
    body: OrderStatusPatch,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role("admin", "staff")),
):
    order = await _get_order_with_relations(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order.status = body.status
    await db.commit()
    loaded = await _get_order_with_relations(db, order_id)
    if not loaded:
        raise HTTPException(status_code=404, detail="Order not found")
    return loaded


@router.patch("/orders/{order_id}/prescription-review", response_model=OrderOut)
async def review_prescription(
    order_id: uuid.UUID,
    body: PrescriptionReviewPatch,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role("admin", "staff")),
):
    order = await _get_order_with_relations(db, order_id)
    if not order or not order.online_order:
        raise HTTPException(status_code=404, detail="Online order not found")

    online = order.online_order
    if not online.prescription_required:
        raise HTTPException(status_code=400, detail="This order does not require prescription review")
    if not online.prescription_url:
        raise HTTPException(status_code=400, detail="Prescription file is missing")
    if body.status == PrescriptionReviewStatus.not_required:
        raise HTTPException(status_code=400, detail="Review status must be approved or rejected")

    online.prescription_status = body.status.value
    online.prescription_review_notes = body.notes
    online.prescription_reviewed_at = datetime.now(timezone.utc)
    online.prescription_reviewed_by = uuid.UUID(current_user["sub"])

    if body.status == PrescriptionReviewStatus.rejected:
        order.status = OrderStatus.cancelled
        await db.commit()
    elif body.status == PrescriptionReviewStatus.approved:
        if order.status == OrderStatus.pending:
            try:
                await complete_order(db, order_id)
            except ValueError as exc:
                await db.rollback()
                online.prescription_status = PrescriptionReviewStatus.pending_review.value
                online.prescription_review_notes = f"Approval blocked: {exc}"
                await db.commit()
                raise HTTPException(status_code=400, detail=str(exc))
        else:
            await db.commit()
    else:
        await db.commit()

    loaded = await _get_order_with_relations(db, order_id)
    if not loaded:
        raise HTTPException(status_code=404, detail="Order not found")
    return loaded


# ── Order Items ───────────────────────────────────────────────────────────────

@router.post(
    "/orders/{order_id}/items",
    response_model=OrderItemOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_order_item(
    order_id: uuid.UUID,
    body: OrderItemAdd,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role("admin", "staff", "customer")),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if current_user.get("role") not in ("admin", "staff"):
        if order.user_id != uuid.UUID(current_user["sub"]):
            raise HTTPException(status_code=403, detail="Access denied")

    if order.status != OrderStatus.pending:
        raise HTTPException(status_code=400, detail="Cannot add items to a non-pending order")

    try:
        item = await add_item_to_order(db, order_id, body.medicine_id, body.quantity)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    loaded_item_result = await db.execute(
        select(OrderItem)
        .options(selectinload(OrderItem.medicine))
        .where(OrderItem.id == item.id)
    )
    return loaded_item_result.scalar_one()


@router.post("/orders/{order_id}/complete", response_model=OrderOut)
async def complete_order_endpoint(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role("admin", "staff", "customer")),
):
    order = await _get_order_with_relations(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if current_user.get("role") not in ("admin", "staff"):
        if order.user_id != uuid.UUID(current_user["sub"]):
            raise HTTPException(status_code=403, detail="Access denied")

    try:
        await complete_order(db, order_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    loaded = await _get_order_with_relations(db, order_id)
    if not loaded:
        raise HTTPException(status_code=404, detail="Order not found")
    return loaded


# ── Cart ──────────────────────────────────────────────────────────────────────

@router.get("/cart", response_model=list[CartItemOut])
async def get_cart(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = uuid.UUID(current_user["sub"])
    stock_sq = _active_stock_subquery()
    result = await db.execute(
        select(
            CartItem,
            Medicine,
            stock_sq.c.selling_price,
            func.coalesce(stock_sq.c.stock_available, 0).label("stock_available"),
        )
        .join(Medicine, Medicine.id == CartItem.medicine_id)
        .outerjoin(stock_sq, stock_sq.c.medicine_id == CartItem.medicine_id)
        .where(CartItem.user_id == user_id)
    )
    return [_to_cart_item_out(*row) for row in result.all()]


@router.post("/cart/items", response_model=CartItemOut, status_code=status.HTTP_201_CREATED)
async def add_cart_item(
    body: CartItemAdd,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = uuid.UUID(current_user["sub"])
    if body.quantity < 1:
        raise HTTPException(status_code=400, detail="Quantity must be at least 1")

    med_result = await db.execute(select(Medicine).where(Medicine.id == body.medicine_id))
    medicine = med_result.scalar_one_or_none()
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")

    stock_result = await db.execute(
        select(func.coalesce(func.sum(Inventory.quantity_available), 0)).where(
            Inventory.medicine_id == body.medicine_id,
            Inventory.quantity_available > 0,
            Inventory.expiry_date > func.current_date(),
        )
    )
    if int(stock_result.scalar_one() or 0) <= 0:
        raise HTTPException(status_code=400, detail="Medicine is out of stock")

    # Check if item already exists in cart
    result = await db.execute(
        select(CartItem).where(
            CartItem.user_id == user_id,
            CartItem.medicine_id == body.medicine_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.quantity += body.quantity
        await db.commit()
        return await _get_cart_item_with_metrics(db, user_id, existing.id)

    cart_item = CartItem(
        id=uuid.uuid4(),
        user_id=user_id,
        medicine_id=body.medicine_id,
        quantity=body.quantity,
    )
    db.add(cart_item)
    await db.commit()
    return await _get_cart_item_with_metrics(db, user_id, cart_item.id)


@router.patch("/cart/items/{item_id}", response_model=CartItemOut)
async def update_cart_item(
    item_id: uuid.UUID,
    body: CartItemPatch,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if body.quantity < 1:
        raise HTTPException(status_code=400, detail="Quantity must be at least 1")

    user_id = uuid.UUID(current_user["sub"])
    result = await db.execute(
        select(CartItem).where(CartItem.id == item_id, CartItem.user_id == user_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Cart item not found")
    item.quantity = body.quantity
    await db.commit()
    return await _get_cart_item_with_metrics(db, user_id, item.id)


@router.delete("/cart/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cart_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = uuid.UUID(current_user["sub"])
    result = await db.execute(
        select(CartItem).where(CartItem.id == item_id, CartItem.user_id == user_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Cart item not found")
    await db.delete(item)
    await db.commit()


# ── Checkout ──────────────────────────────────────────────────────────────────

@router.post("/checkout", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
async def checkout(
    body: CheckoutRequest | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Convert current cart into an online order and deduct stock (FIFO)."""
    body = body or CheckoutRequest()
    user_id = uuid.UUID(current_user["sub"])

    cart_result = await db.execute(
        select(CartItem).where(CartItem.user_id == user_id)
    )
    cart_items = cart_result.scalars().all()
    if not cart_items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    requires_prescription = await _cart_requires_prescription(db, cart_items)
    if requires_prescription and not body.prescription_url:
        raise HTTPException(
            status_code=400,
            detail="Prescription upload is required for one or more medicines in this cart",
        )

    # Create the order
    order = Order(
        id=uuid.uuid4(),
        type=OrderType.online,
        user_id=user_id,
        status=OrderStatus.pending,
        customer_name=body.customer_name,
        customer_phone=body.customer_phone,
        customer_address=body.customer_address,
        doctor_name=body.doctor_name,
        doctor_registration=body.doctor_registration,
        prescription_notes=body.prescription_notes,
        payment_method=body.payment_method.value,
    )
    db.add(order)
    await db.flush()

    online = OnlineOrder(
        order_id=order.id,
        payment_status=_initial_payment_status(body.payment_method),
        delivery_address=body.delivery_address,
        prescription_url=body.prescription_url,
        prescription_required=requires_prescription,
        prescription_status=(
            PrescriptionReviewStatus.pending_review.value
            if requires_prescription
            else PrescriptionReviewStatus.not_required.value
        ),
    )
    db.add(online)
    await db.flush()

    # Add all cart items to order (FIFO batch selection)
    for ci in cart_items:
        try:
            await add_item_to_order(db, order.id, ci.medicine_id, ci.quantity)
        except ValueError as exc:
            await db.rollback()
            raise HTTPException(status_code=400, detail=str(exc))

    if requires_prescription:
        await _calculate_order_totals(db, order.id)
    else:
        # Complete immediately only when pharmacist review is not required.
        try:
            await complete_order(db, order.id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    # Clear cart
    for ci in cart_items:
        await db.delete(ci)
    await db.commit()

    loaded = await _get_order_with_relations(db, order.id)
    if not loaded:
        raise HTTPException(status_code=404, detail="Order not found")
    return loaded
